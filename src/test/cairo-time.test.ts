import { describe, expect, it } from "vitest";
import {
  CAIRO_TIME_ZONE,
  cairoLocalToUtc,
  cairoParts,
  countdown,
  formatCairo,
  serverOffsetMs,
  serverNow,
} from "@/lib/cairo-time";

describe("cairo-time", () => {
  it("formats in Cairo time zone", () => {
    // 2026-11-07T18:00:00Z → 20:00 in Cairo (UTC+2, DST already ended)
    const iso = "2026-11-07T18:00:00Z";
    expect(formatCairo(iso, "time24")).toBe("20:00");
    expect(formatCairo(iso, "date")).toContain("٢٠٢٦");
    expect(cairoParts(iso)).toMatchObject({ year: 2026, month: 11, day: 7, hour: 20, minute: 0 });
  });

  it("converts Cairo wall clock to UTC (winter, UTC+2)", () => {
    const utc = cairoLocalToUtc(2026, 11, 7, 20, 0);
    expect(utc.toISOString()).toBe("2026-11-07T18:00:00.000Z");
  });

  it("converts Cairo wall clock to UTC (summer, UTC+3)", () => {
    const utc = cairoLocalToUtc(2026, 7, 1, 20, 0);
    expect(utc.toISOString()).toBe("2026-07-01T17:00:00.000Z");
    expect(cairoParts(utc).hour).toBe(20);
  });

  it("round-trips every hour of a day", () => {
    for (let hour = 0; hour < 24; hour++) {
      const utc = cairoLocalToUtc(2026, 3, 15, hour, 30);
      const back = cairoParts(utc);
      expect([back.hour, back.minute]).toEqual([hour, 30]);
    }
  });

  it("splits a countdown into days/hours/minutes/seconds", () => {
    const target = Date.UTC(2026, 10, 8, 0, 0, 0);
    const c = countdown(target, target - (26 * 3600 + 5 * 60 + 9) * 1000);
    expect(c).toMatchObject({ days: 1, hours: 2, minutes: 5, seconds: 9 });
    expect(c.label).toBe("1 ي  02:05:09");
  });

  it("clamps a passed countdown at zero", () => {
    const c = countdown(1000, 5000);
    expect(c.totalMs).toBe(0);
    expect(c.label).toBe("00:00");
  });

  it("corrects the client clock from server_now", () => {
    const offset = serverOffsetMs("2026-11-07T18:00:30Z", Date.parse("2026-11-07T18:00:00Z"));
    expect(offset).toBe(30_000);
    expect(serverNow(offset, Date.parse("2026-11-07T18:00:00Z"))).toBe(
      Date.parse("2026-11-07T18:00:30Z"),
    );
  });

  it("uses the Africa/Cairo zone constant", () => {
    expect(CAIRO_TIME_ZONE).toBe("Africa/Cairo");
  });
});
