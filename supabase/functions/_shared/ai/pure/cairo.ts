// Cairo wall-clock helpers for the AI tools (dependency-free, DST-safe via Intl).

function offsetMs(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Cairo",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return asUtc - at.getTime();
}

/** "YYYY-MM-DD HH:mm" in Cairo → UTC Date, or null when malformed. */
export function cairoLocalToUtc(local: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(String(local ?? "").trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number) as unknown as number[];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  let ts = naive - offsetMs(new Date(naive));
  ts = naive - offsetMs(new Date(ts));
  const out = new Date(ts);
  return Number.isNaN(out.getTime()) ? null : out;
}

/** Arabic long date/time in Cairo, e.g. "الأحد، 8 نوفمبر 2026 في 8:00 م". */
export function formatCairoAr(value: string | number | Date, withTime = true): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("ar-EG", {
    timeZone: "Africa/Cairo",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(d);
}

/** Start of a reporting period in UTC (Cairo calendar). */
export function periodStart(period: "today" | "7d" | "30d" | "month", now = new Date()): Date {
  const cairoNow = new Date(now.getTime() + offsetMs(now));
  const y = cairoNow.getUTCFullYear();
  const m = cairoNow.getUTCMonth();
  const d = cairoNow.getUTCDate();
  const toUtc = (yy: number, mm: number, dd: number) =>
    cairoLocalToUtc(`${yy}-${String(mm + 1).padStart(2, "0")}-${String(dd).padStart(2, "0")} 00:00`)!;
  if (period === "today") return toUtc(y, m, d);
  if (period === "month") return toUtc(y, m, 1);
  const days = period === "7d" ? 6 : 29;
  const start = new Date(Date.UTC(y, m, d) - days * 86_400_000);
  return toUtc(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
}
