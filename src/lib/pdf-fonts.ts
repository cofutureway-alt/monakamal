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
