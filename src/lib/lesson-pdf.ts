import jsPDF from "jspdf";
import { registerAmiri } from "@/lib/pdf-fonts";

/** A parsed line of the simple markdown the assistant writes. */
export type OutlineLine =
  | { kind: "h1" | "h2" | "h3" | "p"; text: string }
  | { kind: "bullet"; text: string; marker: string }
  | { kind: "gap" };

const stripInline = (s: string) =>
  s
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(^|\s)[*_](\S.*?\S|\S)[*_](?=\s|$)/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();

/** Parse headings (#, ##, ###), bullets (-, *, •), numbered items and paragraphs. */
export function parseOutline(md: string): OutlineLine[] {
  const out: OutlineLine[] = [];
  for (const raw of String(md ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      if (out.length && out[out.length - 1].kind !== "gap") out.push({ kind: "gap" });
      continue;
    }
    let m: RegExpExecArray | null;
    if ((m = /^(#{1,3})\s+(.*)$/.exec(line))) {
      out.push({ kind: (["h1", "h2", "h3"] as const)[m[1].length - 1], text: stripInline(m[2]) });
    } else if ((m = /^[-*•]\s+(.*)$/.exec(line))) {
      out.push({ kind: "bullet", marker: "•", text: stripInline(m[1]) });
    } else if ((m = /^(\d+)[.)]\s+(.*)$/.exec(line))) {
      out.push({ kind: "bullet", marker: `${m[1]}.`, text: stripInline(m[2]) });
    } else {
      out.push({ kind: "p", text: stripInline(line) });
    }
  }
  while (out.length && out[out.length - 1].kind === "gap") out.pop();
  return out;
}

const PLATFORM = "منصة الأستاذة منى كامل";
const MARGIN = 18; // mm

/**
 * A4 portrait, right-aligned Arabic (Amiri). Title 20pt bold, H2 14pt bold,
 * body 11pt, 18 mm margins, footer "منصة الأستاذة منى كامل — {page}/{pages}".
 */
export async function buildLessonPdf(input: { title: string; outline_markdown: string }): Promise<Blob> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const hasArabic = await registerAmiri(doc);
  const font = hasArabic ? "Amiri" : "helvetica";
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const right = W - MARGIN;
  const maxW = W - MARGIN * 2;
  const bottom = H - MARGIN - 8;
  let y = MARGIN;

  const write = (text: string, size: number, bold: boolean, x = right, width = maxW, gapAfter = 0) => {
    doc.setFont(font, bold ? "bold" : "normal");
    doc.setFontSize(size);
    const lh = size * 0.3528 * 1.55; // pt → mm, 1.55 line height
    for (const ln of doc.splitTextToSize(text, width) as string[]) {
      if (y + lh > bottom) {
        doc.addPage();
        y = MARGIN;
      }
      y += lh;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      doc.text(ln, x, y, { align: "right", isInputRtl: true } as any);
    }
    y += gapAfter;
  };

  // Title + rule
  write(input.title, 20, true, right, maxW, 3);
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, right, y);
  y += 6;

  for (const item of parseOutline(input.outline_markdown)) {
    if (item.kind === "gap") y += 2;
    else if (item.kind === "h1") write(item.text, 16, true, right, maxW, 2);
    else if (item.kind === "h2") {
      y += 2;
      write(item.text, 14, true, right, maxW, 1.5);
    } else if (item.kind === "h3") write(item.text, 12, true, right, maxW, 1);
    else if (item.kind === "bullet") {
      doc.setFont(font, "normal");
      doc.setFontSize(11);
      const startY = y;
      write(item.text, 11, false, right - 6, maxW - 6, 1);
      // marker on the first line, in the right gutter
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      doc.text(item.marker, right, startY + 11 * 0.3528 * 1.55, { align: "right" } as any);
    } else write(item.text, 11, false, right, maxW, 1.5);
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont(font, "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    doc.text(`${PLATFORM} — ${i}/${pages}`, W / 2, H - MARGIN / 2, { align: "center", isInputRtl: true } as any);
    doc.setTextColor(0, 0, 0);
  }
  return doc.output("blob");
}

/** Safe storage file name: keeps Arabic letters, digits and dashes. */
export function pdfFileName(title: string): string {
  const base = title
    .trim()
    .replace(/[\\/:*?"<>|#%{}^~[\]`]+/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return `${base || "lesson"}.pdf`;
}
