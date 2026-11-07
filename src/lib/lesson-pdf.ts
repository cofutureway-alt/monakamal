import jsPDF from "jspdf";

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

// A4 at 150 DPI. jsPDF's own Arabic support (presentation forms) breaks letter
// joining, so each page is drawn on a canvas — the browser shapes Arabic
// correctly — and embedded as an image. Trade-off: text is not selectable.
const DPI = 150;
const PAGE_W = Math.round((210 / 25.4) * DPI); // 1240
const PAGE_H = Math.round((297 / 25.4) * DPI); // 1754
const MARGIN = Math.round((18 / 25.4) * DPI); // 18 mm
const pt = (n: number) => (n * DPI) / 72;
const FONT = "'IBM Plex Sans Arabic', Tajawal, sans-serif";

const STYLE = {
  title: { size: pt(20), weight: 700, color: "#0f172a", gap: pt(6) },
  h1: { size: pt(16), weight: 700, color: "#0f172a", gap: pt(4) },
  h2: { size: pt(14), weight: 700, color: "#0f172a", gap: pt(3) },
  h3: { size: pt(12), weight: 700, color: "#1e293b", gap: pt(2) },
  body: { size: pt(11), weight: 400, color: "#1e293b", gap: pt(3) },
  footer: { size: pt(9), weight: 400, color: "#64748b", gap: 0 },
} as const;
type StyleKey = keyof typeof STYLE;

class Pager {
  pages: HTMLCanvasElement[] = [];
  ctx!: CanvasRenderingContext2D;
  y = MARGIN;
  readonly bottom = PAGE_H - MARGIN - pt(16);

  constructor() {
    this.newPage();
  }

  newPage() {
    const c = document.createElement("canvas");
    c.width = PAGE_W;
    c.height = PAGE_H;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);
    ctx.direction = "rtl";
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    this.pages.push(c);
    this.ctx = ctx;
    this.y = MARGIN;
  }

  font(k: StyleKey) {
    const st = STYLE[k];
    this.ctx.font = `${st.weight} ${st.size}px ${FONT}`;
    this.ctx.fillStyle = st.color;
    return st;
  }

  /** Greedy word wrap using the browser's own (shaped) text metrics. */
  wrap(text: string, maxW: number): string[] {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (line && this.ctx.measureText(next).width > maxW) {
        lines.push(line);
        line = w;
      } else line = next;
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  }

  /** Writes wrapped text; returns the baseline of the first line. */
  write(k: StyleKey, text: string, opts: { indent?: number; gapBefore?: number } = {}): number {
    const st = this.font(k);
    const lh = st.size * 1.6;
    const right = PAGE_W - MARGIN - (opts.indent ?? 0);
    const lines = this.wrap(text, PAGE_W - MARGIN * 2 - (opts.indent ?? 0));
    this.y += opts.gapBefore ?? 0;
    let first = -1;
    for (const ln of lines) {
      if (this.y + lh > this.bottom) {
        this.newPage();
        this.font(k);
      }
      this.y += lh;
      const base = this.y - lh * 0.3;
      if (first < 0) first = base;
      this.ctx.fillText(ln, right, base);
    }
    this.y += st.gap;
    return first;
  }
}

/**
 * A4 portrait, right-aligned Arabic. Title 20pt bold, H2 14pt bold, body 11pt,
 * 18 mm margins, footer "منصة الأستاذة منى كامل — {page}/{pages}".
 */
export async function buildLessonPdf(input: { title: string; outline_markdown: string }): Promise<Blob> {
  // Make sure the Arabic web font is ready before measuring / drawing.
  try {
    await Promise.all([
      document.fonts.load(`400 ${pt(11)}px 'IBM Plex Sans Arabic'`, "ابت"),
      document.fonts.load(`700 ${pt(20)}px 'IBM Plex Sans Arabic'`, "ابت"),
    ]);
  } catch {
    // fall back to whatever Arabic font the system has
  }

  const p = new Pager();
  p.write("title", input.title);
  p.ctx.strokeStyle = "#0f172a";
  p.ctx.lineWidth = 3;
  p.ctx.beginPath();
  p.ctx.moveTo(MARGIN, p.y);
  p.ctx.lineTo(PAGE_W - MARGIN, p.y);
  p.ctx.stroke();
  p.y += pt(10);

  for (const item of parseOutline(input.outline_markdown)) {
    if (item.kind === "gap") p.y += pt(3);
    else if (item.kind === "h1") p.write("h1", item.text, { gapBefore: pt(2) });
    else if (item.kind === "h2") p.write("h2", item.text, { gapBefore: pt(4) });
    else if (item.kind === "h3") p.write("h3", item.text, { gapBefore: pt(2) });
    else if (item.kind === "bullet") {
      const indent = pt(16);
      const base = p.write("body", item.text, { indent });
      p.font("body");
      p.ctx.fillText(item.marker, PAGE_W - MARGIN, base);
    } else p.write("body", item.text);
  }

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const total = p.pages.length;
  p.pages.forEach((canvas, i) => {
    const ctx = canvas.getContext("2d")!;
    const st = STYLE.footer;
    ctx.font = `${st.weight} ${st.size}px ${FONT}`;
    ctx.fillStyle = st.color;
    ctx.direction = "rtl";
    ctx.textAlign = "center";
    ctx.fillText(`${PLATFORM} — ${i + 1}/${total}`, PAGE_W / 2, PAGE_H - MARGIN / 2);
    if (i > 0) doc.addPage();
    doc.addImage(canvas.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, 210, 297, undefined, "FAST");
  });
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
