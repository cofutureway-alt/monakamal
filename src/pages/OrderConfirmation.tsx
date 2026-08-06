import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  Clock,
  Package,
  Cloud,
  Truck,
  Loader2,
  ArrowLeft,
  MapPin,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPiastres } from "@/lib/money";
import { getBookOrderDetail, BookOrderDetail } from "@/lib/book-orders-api";
import { toast } from "@/hooks/use-toast";

const STATUS_META: Record<string, { label: string; tone: string; icon: any }> = {
  pending_payment: { label: "بانتظار الدفع / المراجعة", tone: "text-amber-600", icon: Clock },
  confirmed: { label: "تم تأكيد الطلب", tone: "text-emerald-600", icon: CheckCircle2 },
  shipped: { label: "تم الشحن", tone: "text-blue-600", icon: Truck },
  delivered: { label: "تم التسليم", tone: "text-emerald-600", icon: CheckCircle2 },
  cancelled: { label: "ملغى", tone: "text-destructive", icon: Clock },
};

export default function OrderConfirmation() {
  const { id } = useParams();
  const [order, setOrder] = useState<BookOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "تأكيد الطلب — منصة الأستاذة منى كامل";
    (async () => {
      if (!id) return;
      try {
        const o = await getBookOrderDetail(id);
        setOrder(o);
      } catch (e: any) {
        toast({ title: "تعذّر تحميل الطلب", description: e?.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" dir="rtl">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <Navbar />
        <div className="container mx-auto px-4 pt-24 pb-16">
          <Card className="p-10 text-center">
            <p className="text-muted-foreground mb-4">لم يتم العثور على الطلب</p>
            <Link to="/books"><Button>العودة للمتجر</Button></Link>
          </Card>
        </div>
        <Footer />
      </div>
    );
  }

  const meta = STATUS_META[order.status] ?? STATUS_META.pending_payment;
  const Icon = meta.icon;

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Navbar />
      <div className="container mx-auto px-4 pt-24 pb-16 max-w-3xl">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <Card className="p-8 mb-6 text-center">
            <div className={`w-16 h-16 rounded-2xl bg-accent mx-auto mb-4 flex items-center justify-center ${meta.tone}`}>
              <Icon className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold mb-1">
              {order.status === "confirmed" ? "تم استلام طلبك بنجاح!" : "تم إنشاء طلبك"}
            </h1>
            <p className="text-sm text-muted-foreground mb-3">
              رقم الطلب: <b>{order.order_number}</b>
            </p>
            <Badge variant="secondary" className={meta.tone}>{meta.label}</Badge>
          </Card>
        </motion.div>

        <Card className="p-5 mb-6">
          <h2 className="font-bold mb-4">الكتب المطلوبة</h2>
          <div className="space-y-3">
            {order.items.map((it) => (
              <div key={it.id} className="flex items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  {it.book_type === "digital" ? (
                    <Cloud className="w-4 h-4 text-muted-foreground shrink-0" />
                  ) : (
                    <Package className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                  <span className="truncate">{it.title}</span>
                  <span className="text-xs text-muted-foreground shrink-0">× {it.quantity}</span>
                </div>
                <span className="font-semibold">
                  {formatPiastres(it.unit_price_piastres * it.quantity)}
                </span>
              </div>
            ))}
          </div>
          <div className="border-t border-border mt-4 pt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">الإجمالي الفرعي</span>
              <span className="font-semibold">{formatPiastres(order.items_subtotal_piastres)}</span>
            </div>
            {order.has_physical_items && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">الشحن</span>
                <span className="font-semibold">{formatPiastres(order.shipping_cost_piastres)}</span>
              </div>
            )}
            <div className="flex justify-between items-baseline pt-2 border-t border-border">
              <span className="font-semibold">الإجمالي</span>
              <span className="text-xl font-bold text-primary">{formatPiastres(order.total_piastres)}</span>
            </div>
            <div className="flex justify-between text-xs pt-2">
              <span className="text-muted-foreground">طريقة الدفع</span>
              <span>{order.gateway_display_name}</span>
            </div>
          </div>
        </Card>

        {order.has_physical_items && order.shipping_address && (
          <Card className="p-5 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="w-4 h-4 text-primary" />
              <h2 className="font-bold">عنوان الشحن</h2>
            </div>
            <div className="text-sm space-y-1 text-muted-foreground">
              <div><b className="text-foreground">{order.shipping_address.full_name}</b></div>
              <div dir="ltr" className="text-right">{order.shipping_address.phone}</div>
              <div>
                {order.shipping_zone_name && <>{order.shipping_zone_name} — </>}
                {order.shipping_address.city}
              </div>
              <div>{order.shipping_address.street}</div>
              {order.shipping_address.notes && <div>ملاحظات: {order.shipping_address.notes}</div>}
            </div>
          </Card>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <Link to="/books" className="flex-1">
            <Button variant="outline" className="w-full gap-2">
              <ArrowLeft className="w-4 h-4" /> متابعة التسوّق
            </Button>
          </Link>
          <Link to="/student" className="flex-1">
            <Button className="w-full">لوحتي</Button>
          </Link>
        </div>
      </div>
      <Footer />
    </div>
  );
}
