/**
 * Calendar helpers. Everything is computed in Cairo wall-clock time so a
 * Saturday-first grid stays correct regardless of the browser's zone.
 */
export const SHORT_DAYS = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];

export interface CairoDate {
  year: number;
  month: number; // 1-12
  day: number;
}

/** Cairo calendar date of a given instant. */
export function cairoDate(value: string | number | Date): CairoDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** 0 = Saturday … 6 = Friday (Egyptian week). */
export function cairoWeekdayIndex(value: string | number | Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Cairo",
    weekday: "short",
  }).format(new Date(value));
  const order = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];
  return Math.max(0, order.indexOf(parts));
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addDays(date: CairoDate, days: number): CairoDate {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day));
  d.setUTCDate(d.getUTCDate() + days);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function sameCairoDate(a: CairoDate, b: CairoDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

export function addMonths(date: CairoDate, delta: number): CairoDate {
  const d = new Date(Date.UTC(date.year, date.month - 1 + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: 1 };
}

/**
 * The 6×7 grid for a month, starting Saturday. Cells outside the month are
 * included so the grid is always rectangular (and the neighbouring days remain
 * visible, dimmed).
 */
export function buildMonthMatrix(year: number, month: number): { date: CairoDate; inMonth: boolean }[][] {
  const first: CairoDate = { year, month, day: 1 };
  const offset = cairoWeekdayIndex(Date.UTC(year, month - 1, 1));
  const start = addDays(first, -offset);

  const rows: { date: CairoDate; inMonth: boolean }[][] = [];
  let cursor = start;
  for (let r = 0; r < 6; r++) {
    const row: { date: CairoDate; inMonth: boolean }[] = [];
    for (let c = 0; c < 7; c++) {
      row.push({ date: cursor, inMonth: cursor.month === month && cursor.year === year });
      cursor = addDays(cursor, 1);
    }
    rows.push(row);
  }
  return rows;
}

/** Sunday-first weeks? No — the group heading uses the full Cairo date. */
export function cairoDayLabel(date: CairoDate): string {
  const stamp = Date.UTC(date.year, date.month - 1, date.day, 12);
  return new Intl.DateTimeFormat("ar-EG", {
    timeZone: "Africa/Cairo",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(stamp));
}

/** ISO-like key in Cairo, for stable react-query keys. */
export function cairoKey(date: CairoDate): string {
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}
