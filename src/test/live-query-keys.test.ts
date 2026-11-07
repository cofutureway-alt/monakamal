import { describe, expect, it } from "vitest";
import { liveSessionStateKey, liveUpcomingKey } from "@/hooks/use-live-sessions";

/**
 * F1 regression: the banner re-renders every second. If the query key carried a
 * time-derived bound, every render would register a new query and fire a new RPC.
 */
describe("live session query keys", () => {
  it("returns deep-equal keys on repeated calls (upcoming)", () => {
    expect(liveUpcomingKey("student")).toEqual(liveUpcomingKey("student"));
    expect(liveUpcomingKey("admin")).toEqual(liveUpcomingKey("admin"));
  });

  it("contains no time-derived values", () => {
    const key = liveUpcomingKey("student");
    expect(key).toEqual(["live-sessions", "student-upcoming"]);
    key.forEach((part) => expect(String(part)).not.toMatch(/\d{4}-\d{2}-\d{2}T/));
  });

  it("distinguishes student and admin keys", () => {
    expect(liveUpcomingKey("student")).not.toEqual(liveUpcomingKey("admin"));
  });

  it("state keys are stable and scoped per session", () => {
    expect(liveSessionStateKey("abc")).toEqual(liveSessionStateKey("abc"));
    expect(liveSessionStateKey("abc")).not.toEqual(liveSessionStateKey("def"));
  });
});
