import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  buildMonthMatrix,
  cairoDate,
  cairoWeekdayIndex,
  daysInMonth,
} from "@/lib/calendar";

describe("cairo calendar grid", () => {
  it("starts the week on Saturday", () => {
    // 1 Nov 2026 is a Sunday in Cairo; a Saturday-first grid must lead with 31 Oct.
    const matrix = buildMonthMatrix(2026, 11);
    expect(matrix[0][0].date).toEqual({ year: 2026, month: 10, day: 31 });
    expect(matrix[0][1].date).toEqual({ year: 2026, month: 11, day: 1 });
  });

  it("handles a month that starts on Friday", () => {
    // 1 May 2026 is a Friday → the grid starts 6 days earlier (25 Apr).
    const matrix = buildMonthMatrix(2026, 5);
    expect(matrix[0][0].date).toEqual({ year: 2026, month: 4, day: 25 });
    expect(matrix[0][6].date).toEqual({ year: 2026, month: 5, day: 1 });
  });

  it("is always 6×7 and keeps the month inside", () => {
    for (let m = 1; m <= 12; m++) {
      const matrix = buildMonthMatrix(2026, m);
      expect(matrix).toHaveLength(6);
      matrix.forEach((row) => expect(row).toHaveLength(7));
      const inside = matrix.flat().filter((c) => c.inMonth);
      expect(inside).toHaveLength(daysInMonth(2026, m));
    }
  });

  it("advances days and months across boundaries", () => {
    expect(addDays({ year: 2026, month: 12, day: 31 }, 1)).toEqual({
      year: 2027,
      month: 1,
      day: 1,
    });
    expect(addMonths({ year: 2026, month: 12, day: 15 }, 1)).toEqual({
      year: 2027,
      month: 1,
      day: 1,
    });
  });

  it("computes the Egyptian weekday index", () => {
    // 2026-11-07 is a Saturday.
    expect(cairoWeekdayIndex("2026-11-07T12:00:00Z")).toBe(0);
    expect(cairoWeekdayIndex("2026-11-08T12:00:00Z")).toBe(1);
  });

  it("reads Cairo dates, not browser-local ones", () => {
    // 23:30 UTC on 2026-11-07 is already 01:30 on 2026-11-08 in Cairo (UTC+2).
    expect(cairoDate("2026-11-07T23:30:00Z")).toEqual({ year: 2026, month: 11, day: 8 });
  });
});
