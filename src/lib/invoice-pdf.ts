import jsPDF from "jspdf";

export interface InvoiceData {
  referenceNumber: string;
  studentName: string;
  studentIdCode?: string | null;
  studentPhone?: string | null;
  courseTitle: string;
  amountPiastres: number;
  status: "success" | "failed";
  gatewayName?: string | null;
  createdAt: string; // ISO
  platformName?: string;
}

// -------- Arabic font caching --------
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

function rtl(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  align: "right" | "left" | "center",
) {
  doc.text(text, x, y, { align, isInputRtl: true } as any);
}

/**
 * Generate a print-ready A5-landscape invoice PDF and trigger download.
 * Uses jsPDF (bundled from Phase 28). If Arabic-font fetch fails,
 * falls back to the built-in Helvetica so the invoice still renders.
 */
export async function generateInvoicePdf(data: InvoiceData) {
  let hasArabic = false;
  try {
    await loadArabicFonts();
    hasArabic = true;
  } catch {
    hasArabic = false;
  }

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a5" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  if (hasArabic && cachedRegular && cachedBold) {
    doc.addFileToVFS("Amiri-Regular.ttf", cachedRegular);
    doc.addFileToVFS("Amiri-Bold.ttf", cachedBold);
    doc.addFont("Amiri-Regular.ttf", "Amiri", "normal");
    doc.addFont("Amiri-Bold.ttf", "Amiri", "bold");
    doc.setFont("Amiri", "normal");
  } else {
    doc.setFont("helvetica", "normal");
  }

  // Border
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.6);
  doc.roundedRect(6, 6, W - 12, H - 12, 3, 3, "S");

  // Header band
  doc.setFillColor(15, 23, 42);
  doc.rect(6, 6, W - 12, 22, "F");

  try {
    const logo = await loadImage("/logo.png");
    if (logo) {
      const targetH = 14;
      const ratio = logo.width / logo.height || 1;
      const targetW = targetH * ratio;
      doc.addImage(logo, "PNG", 10, 10, targetW, targetH);
    }
  } catch {
    /* ignore */
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  rtl(doc, "فاتورة", W - 12, 17, "right");
  doc.setFontSize(10);
  rtl(doc, data.platformName ?? "منصة منى كامل", W - 12, 24, "right");

  // Meta strip
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9);
  const metaY = 36;
  rtl(doc, "رقم الفاتورة", W - 12, metaY, "right");
  doc.setFont(hasArabic ? "Amiri" : "helvetica", "bold");
  doc.setFontSize(11);
  rtl(doc, data.referenceNumber, W - 12, metaY + 6, "right");
  doc.setFont(hasArabic ? "Amiri" : "helvetica", "normal");
  doc.setFontSize(9);

  rtl(doc, "التاريخ", 12, metaY, "left");
  doc.setFont(hasArabic ? "Amiri" : "helvetica", "bold");
  doc.setFontSize(11);
  const d = new Date(data.createdAt);
  const dateStr = d.toLocaleString("ar-EG", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  rtl(doc, dateStr, 12, metaY + 6, "left");
  doc.setFont(hasArabic ? "Amiri" : "helvetica", "normal");

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(12, metaY + 12, W - 12, metaY + 12);

  // Details rows
  const rows: Array<[string, string]> = [
    ["اسم الطالب", data.studentName || "—"],
    ["رقم الهاتف", data.studentPhone || "—"],
    ["رقم الطالب", data.studentIdCode || "—"],
    ["الدورة", data.courseTitle || "—"],
    ["طريقة الدفع", data.gatewayName || "المحفظة الإلكترونية"],
    ["الحالة", data.status === "success" ? "ناجحة" : "فاشلة"],
  ];

  let y = metaY + 20;
  doc.setFontSize(10);
  for (const [label, value] of rows) {
    doc.setTextColor(100, 116, 139);
    rtl(doc, label, W - 12, y, "right");
    doc.setTextColor(15, 23, 42);
    doc.setFont(hasArabic ? "Amiri" : "helvetica", "bold");
    rtl(doc, value, W - 60, y, "right");
    doc.setFont(hasArabic ? "Amiri" : "helvetica", "normal");
    y += 8;
  }

  // Amount box
  const boxY = H - 42;
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(12, boxY, W - 24, 22, 2, 2, "F");
  doc.setTextColor(148, 163, 184);
  doc.setFontSize(9);
  rtl(doc, "الإجمالي المدفوع", W - 16, boxY + 8, "right");
  doc.setTextColor(255, 255, 255);
  doc.setFont(hasArabic ? "Amiri" : "helvetica", "bold");
  doc.setFontSize(18);
  const egp = (data.amountPiastres / 100).toLocaleString("ar-EG", {
    minimumFractionDigits: data.amountPiastres % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  rtl(doc, `${egp} ج.م`, W - 16, boxY + 17, "right");

  // Footer
  doc.setFont(hasArabic ? "Amiri" : "helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(8);
  rtl(
    doc,
    "هذه الفاتورة مُولّدة إلكترونيًا ولا تحتاج إلى ختم أو توقيع.",
    W / 2,
    H - 10,
    "center",
  );

  doc.save(`invoice-${data.referenceNumber}.pdf`);
}
