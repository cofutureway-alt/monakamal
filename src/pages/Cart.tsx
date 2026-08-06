import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  ArrowLeft,
  Cloud,
  Package,
  BookOpen,
  Loader2,
  Truck,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useCart } from "@/hooks/use-cart";
import { useAuth } from "@/contexts/AuthContext";
import { formatPiastres, getEffectivePrice } from "@/lib/money";
import { useSignedUrl } from "@/hooks/use-signed-url";

function CoverImg({ path, title }: { path: string | null; title: string }) {
  const url = useSignedUrl("book-assets", path);
  return (
    <div className="w-20 h-28 sm:w-24 sm:h-32 rounded-lg overflow-hidden bg-accent border border-border flex items-center justify-center shrink-0">
      {url ? <img src={url} alt={title} className="w-full h-full object-cover" /> : <BookOpen className="w-6 h-6 text-muted-foreground" />}
    </div>
  );
}

export default function Cart() {
  const { user } = useAuth();
  const { items, loading, updateQuantity, removeItem } = useCart();
  const [now] = useState(new Date());

  useEffect(() => {
    document.title = "سلة المذكرات والكتب — منصة الأستاذة منى كامل";
  }, []);

  const lines = useMemo(
    () =>
      items.map((it) => {
        const eff = getEffectivePrice(
          it.book.price_piastres,
          it.book.discount_price_piastres,
          it.book.discount_expires_at,
          now
        );
        return { ...it, eff, subtotal: eff.amount * it.quantity };
      }),
    [items, now]
  );

  const subtotal = lines.reduce((a, b) => a + b.subtotal, 0);
  const hasPhysical = lines.some((l) => l.book.book_type === "physical");

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Navbar />
      <div className="container mx-auto px-4 pt-24 pb-16">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-6 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <ShoppingCart className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">سلة الكتب</h1>
            <p className="text-sm text-muted-foreground">راجع كتبك قبل إتمام الشراء</p>
          </div>
        </motion.div>

        {!user ? (
          <Card className="p-10 text-center">
            <p className="text-muted-foreground mb-4">سجّل الدخول لعرض سلتك</p>
            <Link to="/login"><Button>تسجيل الدخول</Button></Link>
          </Card>
        ) : loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : lines.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-accent mx-auto mb-4 flex items-center justify-center">
              <ShoppingCart className="w-7 h-7 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-bold mb-2">سلتك فارغة</h3>
            <p className="text-sm text-muted-foreground mb-6">تصفّح مجموعة الكتب وأضف ما يعجبك.</p>
            <Link to="/books">
              <Button className="gap-2">
                <ArrowLeft className="w-4 h-4" />
                تصفّح الكتب
              </Button>
            </Link>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-3">
              <AnimatePresence initial={false}>
                {lines.map((l) => (
                  <motion.div
                    key={l.id}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 40 }}
                    transition={{ duration: 0.22 }}
                  >
                    <Card className="p-4 flex gap-4">
                      <CoverImg path={l.book.cover_image_url} title={l.book.title} />
                      <div className="flex-1 min-w-0 flex flex-col">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-0">
                            <h3 className="font-bold truncate">{l.book.title}</h3>
                            {l.book.author && <p className="text-xs text-muted-foreground">{l.book.author}</p>}
                            <div className="mt-2 flex flex-wrap gap-2">
                              {l.book.book_type === "digital" ? (
                                <Badge variant="secondary" className="gap-1"><Cloud className="w-3 h-3" />رقمي</Badge>
                              ) : (
                                <Badge className="gap-1"><Package className="w-3 h-3" />مطبوع</Badge>
                              )}
                              {l.eff.discountActive && (
                                <Badge variant="outline" className="text-emerald-600 border-emerald-500/40">خصم فعّال</Badge>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => removeItem(l.id)}
                            aria-label="حذف"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>

                        <div className="mt-auto pt-4 flex items-end justify-between gap-3 flex-wrap">
                          {l.book.book_type === "physical" ? (
                            <div className="inline-flex items-center rounded-full border border-border">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="rounded-full h-8 w-8"
                                onClick={() => updateQuantity(l.id, l.quantity - 1)}
                                disabled={l.quantity <= 1}
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </Button>
                              <motion.span key={l.quantity} initial={{ scale: 0.85 }} animate={{ scale: 1 }} className="min-w-[28px] text-center text-sm font-bold">
                                {l.quantity}
                              </motion.span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="rounded-full h-8 w-8"
                                onClick={() => updateQuantity(l.id, l.quantity + 1)}
                                disabled={l.book.stock_quantity !== null && l.quantity >= (l.book.stock_quantity ?? 0)}
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">نسخة رقمية واحدة</span>
                          )}
                          <div className="text-left">
                            <div className="text-xs text-muted-foreground">
                              {formatPiastres(l.eff.amount)} × {l.quantity}
                            </div>
                            <div className="text-lg font-bold text-primary">{formatPiastres(l.subtotal)}</div>
                            {l.eff.discountActive && (
                              <div className="text-xs text-muted-foreground line-through">
                                {formatPiastres((l.eff.originalAmount ?? 0) * l.quantity)}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="lg:col-span-1">
              <Card className="p-5 sticky top-24 space-y-4">
                <h3 className="font-bold text-lg">ملخّص الطلب</h3>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">عدد الكتب</span>
                  <span className="font-semibold">{lines.reduce((a, b) => a + b.quantity, 0)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">الإجمالي الفرعي</span>
                  <span className="font-semibold">{formatPiastres(subtotal)}</span>
                </div>

                {hasPhysical && (
                  <div className="flex items-start gap-2 rounded-lg bg-accent p-3 text-xs text-muted-foreground">
                    <Truck className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>سيتم حساب تكلفة الشحن في صفحة إتمام الشراء.</span>
                  </div>
                )}

                <div className="border-t border-border pt-4 flex justify-between items-baseline">
                  <span className="font-bold">الإجمالي</span>
                  <span className="text-2xl font-bold text-primary">{formatPiastres(subtotal)}</span>
                </div>

                <Link to="/checkout" className="block w-full">
                  <Button className="w-full" size="lg">إتمام الشراء</Button>
                </Link>

                <Link to="/books" className="block text-center text-xs text-muted-foreground hover:text-foreground">
                  متابعة التصفّح
                </Link>
              </Card>
            </motion.div>
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}
