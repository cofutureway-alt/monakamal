/**
 * Cairo-time helpers. All storage is UTC; all display is Africa/Cairo.
 * Never trust the browser clock for unlocking — RPCs return `server_now`.
 */
export const CAIRO_TIME_ZONE = "Africa/Cairo";
const LOCALE = "ar-EG";

export type CairoFormat =
  | "date"        // ٧ نوفمبر ٢٠٢٦
  | "time"        // ٨:٠٠ م
  | "datetime"    // ٧ نوفمبر ٢٠٢٦، ٨:٠٠ م
  | "weekday"     // السبت
  | "short"       // ٧ نوفمبر
  | "monthYear"   // نوفمبر ٢٠٢٦
  | "time24";     // 20:00

const OPTIONS: Record<CairoFormat, Intl.DateTimeFormatOptions> = {
  date: { day: "numeric", month: "long", year: "numeric" },
  time: { hour: "numeric", minute: "2-digit", hour12: true },
  datetime: { day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true },
  weekday: { weekday: "long" },
  short: { day: "numeric", month: "long" },
  monthYear: { month: "long", year: "numeric" },
  time24: { hour: "2-digit", minute: "2-digit", hour12: false },
};

function toDate(value: string | number | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/** `time24` is machine-facing (form values, .ics previews) so it keeps Latin digits. */
const LOCALE_OVERRIDES: Partial<Record<CairoFormat, string>> = { time24: "en-GB" };

export function formatCairo(value: string | number | Date, format: CairoFormat = "datetime"): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(LOCALE_OVERRIDES[format] ?? LOCALE, {
    timeZone: CAIRO_TIME_ZONE,
    ...OPTIONS[format],
  }).format(date);
}

export interface CairoParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
  second: number;
}

/** Wall-clock parts of `value` as seen in Cairo. */
export function cairoParts(value: string | number | Date): CairoParts {
  const date = toDate(value);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CAIRO_TIME_ZONE,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
}

function offsetMs(date: Date): number {
  const p = cairoParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * Convert a Cairo wall-clock time (what the admin picks in the form) to a UTC Date.
 * Runs the offset twice so DST transition days still resolve correctly.
 */
export function cairoLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  let ts = naive - offsetMs(new Date(naive));
  ts = naive - offsetMs(new Date(ts));
  return new Date(ts);
}

/** Week starts Saturday in Egypt (react-day-picker `weekStartsOn={6}`). */
export const CAIRO_WEEK_START = 6;

export interface Countdown {
  totalMs: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** "mm:ss" (adds hours when >= 1h). */
  label: string;
}

export function countdown(target: string | number | Date, now: number = Date.now()): Countdown {
  const totalMs = Math.max(0, toDate(target).getTime() - now);
  const totalSeconds = Math.floor(totalMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const label =
    days > 0
      ? `${days} ي  ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
      : hours > 0
        ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
        : `${pad(minutes)}:${pad(seconds)}`;
  return { totalMs, days, hours, minutes, seconds, label };
}

/**
 * Client clock correction. RPCs return `server_now`; keeping the difference lets
 * countdowns stay honest even when the device clock is wrong.
 */
export function serverOffsetMs(serverNow: string | number | Date, clientNow: number = Date.now()): number {
  return toDate(serverNow).getTime() - clientNow;
}

export function serverNow(offset: number, clientNow: number = Date.now()): number {
  return clientNow + offset;
}
