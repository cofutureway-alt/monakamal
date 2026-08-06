import jsPDF from "jspdf";
import { formatEGP, BookOrderFull } from "./book-orders-management-api";

// Reuse the Arabic-font cache pattern from invoice-pdf.ts (separate cache OK).
let cachedRegular: string | null = null;
let cachedBold: string | null = null;

async function fetchAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk)),
    );
  }
  return btoa(binary);
}

async function loadArabicFonts() {
  if (cachedRegular && cachedBold) return;
  const [reg, bold] = await Promise.all([
    fetchAsBase64(
      "https://cdn.jsdelivr.net/npm/@fontsource/amiri@5.0.0/files/amiri-arabic-400-normal.woff",
    ),
    fetchAsBase64(
      "https://cdn.jsdelivr.net/npm/@fontsource/amiri@5.0.0/files/amiri-arabic-700-normal.woff",
    ),
  ]);
  cachedRegular = reg;
  cachedBold = bold;
}

async function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function rtl(doc: jsPDF, text: string, x: number, y: number, align: "right" | "left" | "center") {
  doc.text(text, x, y, { align, isInputRtl: true } as any);
}

export async function generateOrderSlipPdf(order: BookOrderFull) {
  let hasArabic = false;
  try {
    await loadArabicFonts();
    hasArabic = true;
  } catch {
    hasArabic = false;
  }

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const font = hasArabic ? "Amiri" : "helvetica";

  if (hasArabic && cachedRegular && cachedBold) {
    doc.addFileToVFS("Amiri-Regular.ttf", cachedRegular);
    doc.addFileToVFS("Amiri-Bold.ttf", cachedBold);
    doc.addFont("Amiri-Regular.ttf", "Amiri", "normal");
    doc.addFont("Amiri-Bold.ttf", "Amiri", "bold");
  }
  doc.setFont(font, "normal");

  // Outer frame
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.6);
  doc.roundedRect(8, 8, W - 16, H - 16, 3, 3, "S");

  // Header band
  doc.setFillColor(15, 23, 42);
  doc.rect(8, 8, W - 16, 26, "F");

  try {
    const logo = await loadImage("/logo.png");
    if (logo) {
      const targetH = 18;
      const ratio = logo.width / logo.height || 1;
      doc.addImage(logo, "PNG", 12, 12, targetH * ratio, targetH);
    }
  } catch {
    /* ignore */
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont(font, "bold");
  rtl(doc, "بيان طلب كتب", W - 12, 20, "right");
  doc.setFontSize(11);
  doc.setFont(font, "normal");
  rtl(doc, "منصة منى كامل", W - 12, 28, "right");

  // Meta strip
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9);
  const metaY = 44;
  rtl(doc, "رقم الطلب", W - 12, metaY, "right");
  doc.setFont(font, "bold");
  doc.setFontSize(12);
  rtl(doc, order.order_number, W - 12, metaY + 6, "right");
  doc.setFont(font, "normal");
  doc.setFontSize(9);

  const created = new Date(order.created_at).toLocaleString("ar-EG", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  rtl(doc, "تاريخ الطلب", 12, metaY, "left");
  doc.setFont(font, "bold");
  doc.setFontSize(11);
  rtl(doc, created, 12, metaY + 6, "left");
  doc.setFont(font, "normal");

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(12, metaY + 12, W - 12, metaY + 12);

  // Student + shipping block
  let y = metaY + 20;
  doc.setFontSize(11);
  doc.setFont(font, "bold");
  rtl(doc, "بيانات الطالب", W - 12, y, "right");
  y += 6;
  doc.setFontSize(10);
  doc.setFont(font, "normal");
  const studentRows: Array<[string, string]> = [
    ["الاسم", order.student.full_name || "—"],
    ["رقم الطالب", order.student.student_id_code || "—"],
    ["رقم الهاتف", order.student.phone || "—"],
  ];
  for (const [k, v] of studentRows) {
    doc.setTextColor(100, 116, 139);
    rtl(doc, k, W - 12, y, "right");
    doc.setTextColor(15, 23, 42);
    doc.setFont(font, "bold");
    rtl(doc, v, W - 45, y, "right");
    doc.setFont(font, "normal");
    y += 6;
  }

  if (order.has_physical_items && order.shipping_address) {
    y += 3;
    doc.setFontSize(11);
    doc.setFont(font, "bold");
    rtl(doc, "عنوان الشحن", W - 12, y, "right");
    y += 6;
    doc.setFontSize(10);
    doc.setFont(font, "normal");
    const a = order.shipping_address;
    const addrRows: Array<[string, string]> = [
      ["المستلم", a.full_name || order.student.full_name || "—"],
      ["الهاتف", a.phone || order.student.phone || "—"],
      ["المدينة", a.city || order.shipping_zone_name || "—"],
      ["العنوان", a.street || "—"],
    ];
    if (a.notes) addrRows.push(["ملاحظات", a.notes]);
    for (const [k, v] of addrRows) {
      doc.setTextColor(100, 116, 139);
      rtl(doc, k, W - 12, y, "right");
      doc.setTextColor(15, 23, 42);
      doc.setFont(font, "bold");
      const wrapped = doc.splitTextToSize(v, W - 60) as string[];
      rtl(doc, wrapped[0], W - 45, y, "right");
      if (wrapped.length > 1) {
        for (let i = 1; i < wrapped.length; i++) {
          y += 5;
          rtl(doc, wrapped[i], W - 45, y, "right");
        }
      }
      doc.setFont(font, "normal");
      y += 6;
    }
  }

  // Items table
  y += 4;
  doc.setDrawColor(226, 232, 240);
  doc.line(12, y, W - 12, y);
  y += 6;

  doc.setFontSize(11);
  doc.setFont(font, "bold");
  rtl(doc, "المنتجات", W - 12, y, "right");
  y += 6;

  // Column header row
  doc.setFillColor(241, 245, 249);
  doc.rect(12, y - 4, W - 24, 8, "F");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  rtl(doc, "الكتاب", W - 14, y + 1, "right");
  rtl(doc, "النوع", 105, y + 1, "center");
  rtl(doc, "الكمية", 75, y + 1, "center");
  rtl(doc, "السعر", 45, y + 1, "center");
  rtl(doc, "الإجمالي", 14, y + 1, "left");
  y += 8;
  doc.setFont(font, "normal");
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10);

  for (const it of order.items) {
    const line = it.unit_price_piastres * it.quantity;
    const title = doc.splitTextToSize(it.title, 90) as string[];
    rtl(doc, title[0], W - 14, y, "right");
    rtl(doc, it.book_type === "physical" ? "مطبوع" : "رقمي", 105, y, "center");
    rtl(doc, String(it.quantity), 75, y, "center");
    rtl(doc, formatEGP(it.unit_price_piastres), 45, y, "center");
    rtl(doc, formatEGP(line), 14, y, "left");
    y += 6;
    for (let i = 1; i < title.length; i++) {
      rtl(doc, title[i], W - 14, y, "right");
      y += 5;
    }
    doc.setDrawColor(241, 245, 249);
    doc.line(12, y - 2, W - 12, y - 2);
  }

  // Totals
  y += 4;
  const totals: Array<[string, string]> = [
    ["إجمالي المنتجات", formatEGP(order.items_subtotal_piastres)],
  ];
  if (order.has_physical_items) totals.push(["الشحن", formatEGP(order.shipping_cost_piastres)]);
  doc.setFontSize(10);
  for (const [k, v] of totals) {
    doc.setTextColor(100, 116, 139);
    rtl(doc, k, W - 14, y, "right");
    doc.setTextColor(15, 23, 42);
    rtl(doc, v, 14, y, "left");
    y += 6;
  }

  // Grand total box
  y += 2;
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(12, y, W - 24, 16, 2, 2, "F");
  doc.setTextColor(148, 163, 184);
  doc.setFontSize(10);
  rtl(doc, "الإجمالي المدفوع", W - 16, y + 6, "right");
  doc.setTextColor(255, 255, 255);
  doc.setFont(font, "bold");
  doc.setFontSize(15);
  rtl(doc, formatEGP(order.total_piastres), 16, y + 11, "left");
  doc.setFont(font, "normal");
  y += 22;

  // Payment method
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(9);
  rtl(doc, "طريقة الدفع", W - 14, y, "right");
  doc.setTextColor(15, 23, 42);
  doc.setFont(font, "bold");
  rtl(doc, order.gateway_display_name, 14, y, "left");
  doc.setFont(font, "normal");
  y += 10;

  // Packing / courier notes area
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.4);
  doc.roundedRect(12, y, W - 24, 30, 2, 2, "S");
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(9);
  rtl(doc, "ملاحظات التغليف / شركة الشحن", W - 16, y + 6, "right");
  y += 34;

  // Footer
  doc.setTextColor(148, 163, 184);
  doc.setFontSize(8);
  rtl(
    doc,
    "بيان طلب مُولّد إلكترونيًا من منصة منى كامل.",
    W / 2,
    H - 12,
    "center",
  );

  doc.save(`order-${order.order_number}.pdf`);
}
