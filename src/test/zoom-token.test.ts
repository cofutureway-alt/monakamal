import { describe, expect, it } from "vitest";
import {
  chooseTokenAfterRefresh,
  isInvalidGrant,
  tokenFromParallelRotation,
} from "../../supabase/functions/_shared/zoom-token";

const winner = { accessToken: "winner-access", refreshToken: "winner-refresh" };

describe("chooseTokenAfterRefresh (G3)", () => {
  it("uses our fresh token when the compare-and-swap write landed", () => {
    expect(chooseTokenAfterRefresh(true, winner, "ours")).toBe("ours");
  });

  it("uses the parallel winner's access token as a string when our write lost", () => {
    const token = chooseTokenAfterRefresh(false, winner, "ours");
    expect(token).toBe("winner-access");
    expect(typeof token).toBe("string");
  });

  it("falls back to our token when the row vanished", () => {
    expect(chooseTokenAfterRefresh(false, null, "ours")).toBe("ours");
  });
});

describe("tokenFromParallelRotation", () => {
  it("returns the stored token when the refresh token changed under us", () => {
    expect(tokenFromParallelRotation(winner, "old-refresh")).toBe("winner-access");
  });

  it("returns null when nothing rotated (the failure is ours)", () => {
    expect(tokenFromParallelRotation(winner, "winner-refresh")).toBeNull();
    expect(tokenFromParallelRotation(null, "x")).toBeNull();
  });
});

describe("isInvalidGrant", () => {
  it("matches Zoom's dead-token wording only", () => {
    expect(isInvalidGrant("", '{"reason":"Invalid Token!","error":"invalid_request"}')).toBe(true);
    expect(isInvalidGrant("", '{"error":"invalid_grant"}')).toBe(true);
    expect(isInvalidGrant("ZOOM_REFRESH_FAILED:400", '{"error":"invalid_request"}')).toBe(false);
    expect(isInvalidGrant("ZOOM_REFRESH_FAILED:500", "")).toBe(false);
  });
});
