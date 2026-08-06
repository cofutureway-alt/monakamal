import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ShoppingCart,
  Truck,
  Wallet as WalletIcon,
  Banknote,
  Upload,
  Loader2,
  ArrowLeft,
  MapPin,
  Package,
  Cloud,
  CheckCircle2,
  Info,
  Lock,
  User,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "@/hooks/use-toast";
import { useCart } from "@/hooks/use-cart";
import { useAuth } from "@/contexts/AuthContext";
import { formatPiastres, getEffectivePrice } from "@/lib/money";
import { getEffectiveShippingPrice } from "@/lib/shipping";
import { isValidEgPhone, normalizeEgPhone } from "@/lib/phone";
import { supabase } from "@/integrations/supabase/client";
import {
  ManualPaymentMethod,
  METHOD_LABEL,
  listEnabledManualMethods,
  uploadPaymentProof,
  validateProofFile,
} from "@/lib/manual-payment-api";
import { createBookOrder, BookGatewayKey, ShippingAddress } from "@/lib/book-orders-api";

interface ShippingZone {
  id: string;
  name: string;
  shipping_price_piastres: number | null;
}

interface GatewayRow {
  id: string;
  gateway_key: BookGatewayKey;
  display_name: string;
  is_enabled: boolean;
  scope: string;
  type: string;
}

// Only these gateways are supported for book checkout in this phase.
// The rest of the multi-gateway plumbing is scoped for a follow-up.
const SUPPORTED_BOOK_GATEWAYS: BookGatewayKey[] = ["wallet", "cod", "manual"];

export default function Checkout() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { items, loading: cartLoading } = useCart();

  const [zones, setZones] = useState<ShippingZone[]>([]);
  const [defaultShipping, setDefaultShipping] = useState<number>(0);
  const [gateways, setGateways] = useState<GatewayRow[]>([]);
  const [manualMethods, setManualMethods] = useState<ManualPaymentMethod[]>([]);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [loadingSetup, setLoadingSetup] = useState(true);

  // Form state
  const [zoneId, setZoneId] = useState<string>("");
  const [fullName, setFullName] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [street, setStreet] = useState<string>("");
  const [city, setCity] = useState<string>("");
  const [addrNotes, setAddrNotes] = useState<string>("");

  const [gatewayKey, setGatewayKey] = useState<BookGatewayKey | "">("");

  // Manual-only
  const [manualMethodId, setManualMethodId] = useState<string>("");
  const [senderNumber, setSenderNumber] = useState<string>("");
  const [proofFile, setProofFile] = useState<File | null>(null);

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = "إتمام الشراء — منصة الأستاذة منى كامل";
  }, []);

  const lines = useMemo(
    () =>
      items.map((it) => {
        const eff = getEffectivePrice(
          it.book.price_piastres,
          it.book.discount_price_piastres,
          it.book.discount_expires_at,
        );
        return { ...it, eff, subtotal: eff.amount * it.quantity };
      }),
    [items],
  );

  const subtotal = lines.reduce((a, b) => a + b.subtotal, 0);
  const hasPhysical = lines.some((l) => l.book.book_type === "physical");
  const shippingCost = hasPhysical
    ? getEffectiveShippingPrice(
        zones.find((z) => z.id === zoneId) ?? null,
        defaultShipping,
      )
    : 0;
  const total = subtotal + shippingCost;

  // Pre-fill from profile and user
  useEffect(() => {
    if (profile || user) {
      const userFullName = profile?.full_name || (user?.user_metadata as any)?.full_name || "";
      const userPhone =
        profile?.phone_number ||
        user?.phone ||
        (user?.user_metadata as any)?.phone ||
        (user?.user_metadata as any)?.phone_number ||
        "";

      if (userFullName) setFullName(userFullName);
      if (userPhone) setPhone(userPhone);
      if (userPhone && !senderNumber) setSenderNumber(userPhone);
    }
  }, [profile, user]);

  // Load zones, shipping default, gateways, manual methods, wallet
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingSetup(true);
      try {
        const [zonesRes, settingsRes, gwRes, walletRes] = await Promise.all([
          (supabase as any)
            .from("shipping_zones")
            .select("id, name, shipping_price_piastres")
            .order("name"),
          (supabase as any)
            .from("shipping_settings")
            .select("default_shipping_price_piastres")
            .eq("id", 1)
            .maybeSingle(),
          (supabase as any)
            .from("payment_gateways")
            .select("id, gateway_key, display_name, is_enabled, scope, type")
            .in("scope", ["all", "books_only"])
            .eq("is_enabled", true),
          user
            ? (supabase as any)
                .from("wallets")
                .select("balance_piastres")
                .eq("user_id", user.id)
                .maybeSingle()
            : Promise.resolve({ data: null }),
        ]);

        if (cancelled) return;
        setZones((zonesRes.data ?? []) as ShippingZone[]);
        setDefaultShipping(
          Number(settingsRes.data?.default_shipping_price_piastres ?? 0),
        );
        const allGw = ((gwRes.data ?? []) as GatewayRow[]).filter((g) =>
          SUPPORTED_BOOK_GATEWAYS.includes(g.gateway_key),
        );
        setGateways(allGw);
        setWalletBalance(Number(walletRes.data?.balance_piastres ?? 0));

        // Load manual methods only if manual is enabled
        if (allGw.some((g) => g.gateway_key === "manual")) {
          const methods = await listEnabledManualMethods();
          if (!cancelled) setManualMethods(methods);
        }
      } catch (e: any) {
        toast({
          title: "تعذّر تحميل بيانات الشراء",
          description: e?.message,
          variant: "destructive",
        });
      } finally {
        if (!cancelled) setLoadingSetup(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // COD is only relevant when there's at least one physical item
  const availableGateways = useMemo(
    () => gateways.filter((g) => g.gateway_key !== "cod" || hasPhysical),
    [gateways, hasPhysical],
  );

  function validate(): string | null {
    if (lines.length === 0) return "سلة الشراء فارغة";
    for (const l of lines) {
      if (l.book.book_type === "physical") {
        const stock = l.book.stock_quantity ?? 0;
        if (stock <= 0) {
          return `الكتاب "${l.book.title}" نفد من المخزون ولا يمكن شراؤه حالياً`;
        }
        if (l.quantity > stock) {
          return `الكتاب "${l.book.title}" الكمية المطلوبة (${l.quantity}) تتجاوز المخزون المتاح (${stock})`;
        }
      }
    }
    if (hasPhysical) {
      if (!zoneId) return "اختر منطقة الشحن";
      if (!fullName.trim()) return "أدخل الاسم بالكامل";
      if (!isValidEgPhone(phone)) return "رقم الهاتف غير صحيح";
      if (!street.trim()) return "أدخل العنوان";
      if (!city.trim()) return "أدخل المدينة/الحيّ";
    }
    if (!gatewayKey) return "اختر طريقة الدفع";
    if (gatewayKey === "wallet" && walletBalance < total)
      return "رصيد المحفظة غير كافٍ";
    if (gatewayKey === "manual") {
      if (!manualMethodId) return "اختر طريقة التحويل";
      if (!isValidEgPhone(senderNumber)) return "أدخل رقم الهاتف المُرسل منه";
      if (!proofFile) return "أرفق صورة إثبات التحويل";
      const ferr = validateProofFile(proofFile);
      if (ferr) return ferr;
    }
    return null;
  }

  async function handleSubmit() {
    const err = validate();
    if (err) {
      toast({ title: err, variant: "destructive" });
      return;
    }
    if (!user) return;
    setSubmitting(true);
    try {
      let proofPath: string | null = null;
      if (gatewayKey === "manual" && proofFile) {
        proofPath = await uploadPaymentProof(user.id, proofFile);
      }
      const address: ShippingAddress | null = hasPhysical
        ? {
            full_name: fullName.trim(),
            phone: normalizeEgPhone(phone),
            street: street.trim(),
            city: city.trim(),
            notes: addrNotes.trim() || undefined,
          }
        : null;

      const res = await createBookOrder({
        gatewayKey: gatewayKey as BookGatewayKey,
        shippingZoneId: hasPhysical ? zoneId : null,
        shippingAddress: address,
        manualMethodId: gatewayKey === "manual" ? manualMethodId : null,
        manualSenderNumber:
          gatewayKey === "manual" ? normalizeEgPhone(senderNumber) : null,
        manualProofPath: gatewayKey === "manual" ? proofPath : null,
      });

      navigate(`/order-confirmation/${res.order_id}`, { replace: true });
    } catch (e: any) {
      toast({
        title: "فشل إتمام الطلب",
        description: e?.message ?? "حاول مرة أخرى",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <Navbar />
        <div className="container mx-auto px-4 pt-24 pb-16">
          <Card className="p-10 text-center">
            <p className="text-muted-foreground mb-4">سجّل الدخول لإتمام الشراء</p>
            <Link to="/login"><Button>تسجيل الدخول</Button></Link>
          </Card>
        </div>
        <Footer />
      </div>
    );
  }

  if (cartLoading || loadingSetup) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" dir="rtl">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <Navbar />
        <div className="container mx-auto px-4 pt-24 pb-16">
          <Card className="p-12 text-center">
            <ShoppingCart className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <h3 className="text-lg font-bold mb-2">سلتك فارغة</h3>
            <Link to="/books">
              <Button className="gap-2">
                <ArrowLeft className="w-4 h-4" /> تصفّح الكتب
              </Button>
            </Link>
          </Card>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Navbar />
      <div className="container mx-auto px-4 pt-24 pb-16">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex items-center gap-3"
        >
          <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <ShoppingCart className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">إتمام الشراء</h1>
            <p className="text-sm text-muted-foreground">أدخل بيانات الشحن واختر طريقة الدفع</p>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {hasPhysical ? (
              <Card className="p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-primary" />
                  <h2 className="font-bold">عنوان الشحن</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>الاسم بالكامل</Label>
                    <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center justify-between">
                      <span>رقم الهاتف</span>
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Lock className="w-3 h-3 text-primary" /> مسجل بحسابك (غير قابل للتعديل)
                      </span>
                    </Label>
                    <Input
                      inputMode="tel"
                      dir="ltr"
                      value={phone}
                      disabled
                      readOnly
                      className="bg-muted font-mono cursor-not-allowed text-foreground opacity-90"
                      placeholder="01xxxxxxxxx"
                    />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label>المحافظة</Label>
                    <Select value={zoneId} onValueChange={setZoneId}>
                      <SelectTrigger>
                        <SelectValue placeholder="اختر المحافظة" />
                      </SelectTrigger>
                      <SelectContent>
                        {zones.map((z) => {
                          const price = getEffectiveShippingPrice(z, defaultShipping);
                          return (
                            <SelectItem key={z.id} value={z.id}>
                              <span className="flex items-center justify-between gap-3 w-full">
                                <span>{z.name}</span>
                                <span className="text-xs text-muted-foreground">
                                  {formatPiastres(price)}
                                </span>
                              </span>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>المدينة/الحيّ</Label>
                    <Input value={city} onChange={(e) => setCity(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>العنوان بالتفصيل</Label>
                    <Input value={street} onChange={(e) => setStreet(e.target.value)} />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label>ملاحظات (اختياري)</Label>
                    <Textarea
                      value={addrNotes}
                      onChange={(e) => setAddrNotes(e.target.value)}
                      rows={2}
                      placeholder="علامة مميّزة، طابق، توقيت الاستلام…"
                    />
                  </div>
                </div>
              </Card>
            ) : (
              <Card className="p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <User className="w-5 h-5 text-primary" />
                  <h2 className="font-bold">بيانات المشتري</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>الاسم بالكامل</Label>
                    <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="الاسم بالكامل" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center justify-between">
                      <span>رقم الهاتف</span>
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Lock className="w-3 h-3 text-primary" /> مسجل بحسابك (غير قابل للتعديل)
                      </span>
                    </Label>
                    <Input
                      inputMode="tel"
                      dir="ltr"
                      value={phone}
                      disabled
                      readOnly
                      className="bg-muted font-mono cursor-not-allowed text-foreground opacity-90"
                      placeholder="01xxxxxxxxx"
                    />
                  </div>
                </div>
              </Card>
            )}

            <Card className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Banknote className="w-5 h-5 text-primary" />
                <h2 className="font-bold">طريقة الدفع</h2>
              </div>

              {availableGateways.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  لا توجد طرق دفع متاحة حاليًا. تواصل مع الإدارة.
                </p>
              ) : (
                <RadioGroup
                  value={gatewayKey}
                  onValueChange={(v) => setGatewayKey(v as BookGatewayKey)}
                  className="space-y-2"
                >
                  {availableGateways.map((g) => {
                    const isSelected = gatewayKey === g.gateway_key;
                    const disabled =
                      g.gateway_key === "wallet" && walletBalance < total;
                    return (
                      <label
                        key={g.id}
                        htmlFor={`gw-${g.id}`}
                        className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                          isSelected ? "border-primary bg-primary/5" : "border-border"
                        } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
                      >
                        <RadioGroupItem
                          id={`gw-${g.id}`}
                          value={g.gateway_key}
                          disabled={disabled}
                        />
                        <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center">
                          {g.gateway_key === "wallet" ? (
                            <WalletIcon className="w-4 h-4" />
                          ) : g.gateway_key === "cod" ? (
                            <Truck className="w-4 h-4" />
                          ) : (
                            <Banknote className="w-4 h-4" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold">{g.display_name}</div>
                          {g.gateway_key === "wallet" && (
                            <div className="text-xs text-muted-foreground">
                              الرصيد الحالي: {formatPiastres(walletBalance)}
                              {disabled && " — الرصيد لا يكفي"}
                            </div>
                          )}
                          {g.gateway_key === "cod" && (
                            <div className="text-xs text-muted-foreground">
                              ادفع نقدًا للمندوب عند تسليم الطلب
                            </div>
                          )}
                          {g.gateway_key === "manual" && (
                            <div className="text-xs text-muted-foreground">
                              فودافون كاش / إنستاباي — يتطلب مراجعة إدارية
                            </div>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </RadioGroup>
              )}

              {gatewayKey === "manual" && (
                <div className="space-y-4 rounded-lg border border-border p-4">
                  <div className="space-y-1.5">
                    <Label>طريقة التحويل</Label>
                    <Select value={manualMethodId} onValueChange={setManualMethodId}>
                      <SelectTrigger>
                        <SelectValue placeholder="اختر طريقة" />
                      </SelectTrigger>
                      <SelectContent>
                        {manualMethods.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {METHOD_LABEL[m.method_type]} — {m.account_number}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {manualMethodId && (
                      <p className="text-xs text-muted-foreground">
                        حوّل مبلغ <b>{formatPiastres(total)}</b> إلى الحساب أعلاه
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label>رقم الهاتف المُرسل منه</Label>
                    <Input
                      inputMode="tel"
                      dir="ltr"
                      value={senderNumber}
                      onChange={(e) => setSenderNumber(e.target.value)}
                      placeholder="01xxxxxxxxx"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>صورة إثبات التحويل</Label>
                    <div className="flex items-center gap-3">
                      <input
                        id="proof-file"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => document.getElementById("proof-file")?.click()}
                        className="gap-2"
                      >
                        <Upload className="w-4 h-4" />
                        {proofFile ? "تغيير الصورة" : "رفع الصورة"}
                      </Button>
                      {proofFile && (
                        <span className="text-xs text-muted-foreground truncate">
                          {proofFile.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {gatewayKey === "cod" && (
                <div className="flex items-start gap-2 rounded-lg bg-accent p-3 text-xs text-muted-foreground">
                  <Info className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    سيتم تأكيد طلبك فورًا. جهّز مبلغ {formatPiastres(total)} نقدًا للمندوب.
                  </span>
                </div>
              )}
            </Card>
          </div>

          <div className="lg:col-span-1">
            <Card className="p-5 sticky top-24 space-y-4">
              <h3 className="font-bold text-lg">ملخّص الطلب</h3>
              <div className="space-y-2">
                {lines.map((l) => (
                  <div key={l.id} className="flex items-start justify-between gap-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {l.book.book_type === "digital" ? (
                          <Cloud className="w-3 h-3 shrink-0 text-muted-foreground" />
                        ) : (
                          <Package className="w-3 h-3 shrink-0 text-muted-foreground" />
                        )}
                        <span className="truncate">{l.book.title}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        × {l.quantity}
                      </div>
                    </div>
                    <div className="font-semibold shrink-0">
                      {formatPiastres(l.subtotal)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-border pt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">الإجمالي الفرعي</span>
                  <span className="font-semibold">{formatPiastres(subtotal)}</span>
                </div>
                {hasPhysical && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">الشحن</span>
                    <span className="font-semibold">
                      {zoneId ? formatPiastres(shippingCost) : "—"}
                    </span>
                  </div>
                )}
              </div>
              <div className="border-t border-border pt-3 flex justify-between items-baseline">
                <span className="text-sm text-muted-foreground">الإجمالي</span>
                <span className="text-2xl font-bold text-primary">
                  {formatPiastres(total)}
                </span>
              </div>
              <Button
                className="w-full gap-2"
                size="lg"
                disabled={submitting}
                onClick={handleSubmit}
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                تأكيد الطلب
              </Button>
              <Link to="/cart" className="block">
                <Button variant="ghost" className="w-full gap-2">
                  <ArrowLeft className="w-4 h-4" /> العودة إلى السلة
                </Button>
              </Link>
            </Card>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
