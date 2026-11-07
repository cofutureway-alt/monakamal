// Pure decision helpers for Zoom token refresh (no imports, so the web test
// suite can exercise them too: src/test/zoom-token.test.ts).

export interface StoredToken {
  accessToken: string;
  refreshToken: string;
}

/**
 * After our refresh succeeded at Zoom: which access token should the caller use?
 * - our compare-and-swap write landed → our fresh token;
 * - it did not land (a parallel call rotated first) → the stored winner's token,
 *   falling back to ours (Zoom issued it, so it is valid too).
 */
export function chooseTokenAfterRefresh(
  writeLanded: boolean,
  stored: StoredToken | null,
  freshAccessToken: string,
): string {
  if (writeLanded) return freshAccessToken;
  return stored?.accessToken ?? freshAccessToken;
}

/**
 * After our refresh failed: did a parallel call already rotate the token?
 * Returns that call's access token, or null when the failure is ours to handle.
 */
export function tokenFromParallelRotation(
  stored: StoredToken | null,
  usedRefreshToken: string,
): string | null {
  if (stored && stored.refreshToken !== usedRefreshToken) return stored.accessToken;
  return null;
}

/** Zoom's wording for a dead refresh token. Only this marks a connection revoked. */
export function isInvalidGrant(message: string, body: string): boolean {
  return (
    body.includes("invalid_grant") ||
    body.includes("Invalid Token") ||
    message.includes("invalid_grant")
  );
}
