import type jsPDF from "jspdf";

/** Fetch a binary resource as base64 (for jsPDF's virtual file system). */
export async function fetchAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`font ${res.status}`);
  const buf = await res.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

const cache = new Map<string, Promise<string>>();

/** Cached per URL; a failed fetch is evicted so the next call retries. */
export function loadFontBase64(url: string): Promise<string> {
  let p = cache.get(url);
  if (!p) {
    p = fetchAsBase64(url).catch((e) => {
      cache.delete(url);
      throw e;
    });
    cache.set(url, p);
  }
  return p;
}

/** Amiri sources, best first: TrueType (what jsPDF parses natively), then the
 *  WOFF files the invoice PDF has always used. */
const AMIRI_SOURCES = [
  {
    regular: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/amiri/Amiri-Regular.ttf",
    bold: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/amiri/Amiri-Bold.ttf",
  },
  {
    regular: "https://cdn.jsdelivr.net/npm/@fontsource/amiri@5.0.0/files/amiri-arabic-400-normal.woff",
    bold: "https://cdn.jsdelivr.net/npm/@fontsource/amiri@5.0.0/files/amiri-arabic-700-normal.woff",
  },
];

/**
 * Register Amiri (normal + bold) on a jsPDF document.
 * Returns false when no source could be loaded (caller falls back to Helvetica).
 */
export async function registerAmiri(doc: jsPDF): Promise<boolean> {
  for (const src of AMIRI_SOURCES) {
    try {
      const [reg, bold] = await Promise.all([loadFontBase64(src.regular), loadFontBase64(src.bold)]);
      doc.addFileToVFS("Amiri-Regular.ttf", reg);
      doc.addFileToVFS("Amiri-Bold.ttf", bold);
      doc.addFont("Amiri-Regular.ttf", "Amiri", "normal");
      doc.addFont("Amiri-Bold.ttf", "Amiri", "bold");
      doc.setFont("Amiri", "normal");
      return true;
    } catch {
      // try the next source
    }
  }
  return false;
}
