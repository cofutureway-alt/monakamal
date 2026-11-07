# Phase 01 — Review of the subordinate agent's delivery

Reviewed: commit `4aaee2c` on `feat/live-sessions-p1` · Date: 2026-11-07
Method: read every migration, both edge functions, the shared Zoom module, the hook, banner and panel;
queried the live database (read-only); re-ran build, tests and lint myself; smoke-loaded the logged-out homepage.

## Verdict

**Accepted, with mandatory fixes.** The data model, RLS and server-side gating match the spec closely and
were verified against the real database. The handover is honest (nothing unverified is claimed as working).
Nine defects were found. Three of them would hurt in production. All are listed below and are part 0 of
`docs/agent-prompts/PROMPT-02-recordings-and-reconnect.md`.

## What I confirmed myself

| Check | Result |
|---|---|
| `npm run build` | ✅ pass |
| `npm test` | ✅ 17/17 |
| ESLint on all new frontend files | ✅ 0 errors, 5 hook-deps warnings |
| 8 new tables with RLS on, cron job, both triggers, 7 notification channel rows | ✅ present in live DB |
| Test data left behind | ✅ none (0 live sessions, courses unchanged) |
| Logged-out homepage | ✅ loads, no console errors |
| Logged-in UI (admin/student screens) | ❌ **NOT VERIFIED**: no test accounts available to me or the agent |
| Zoom OAuth / meeting creation | ❌ **NOT VERIFIED**: no Zoom app yet |

## Requirement coverage (Part 1, items in scope for Phases 1–2)

| Requirement | Status |
|---|---|
| Instructor links Zoom from profile | Built, not run (needs Zoom app) |
| Schedule a Zoom meeting inside any course with date/time | Built, not run |
| Auto-unlock for enrolled students at start time | Built, **defect F3** (up to 60 s late) |
| Dashboard upcoming-meeting alerts | Built |
| Top banner above header | Built, **defect F6** (wrong text after start) |
| Live course creation (pricing, thumbnail, files) | Built |
| Multi-session courses | Built (one unit per session) |
| Auto-enroll all students / selected grades (free only) / paid | Built and DB-verified |

## Defects (all must be fixed in Prompt 02, part 0)

| ID | Severity | Where | Problem | Required fix |
|---|---|---|---|---|
| F1 | **High** | `src/hooks/use-live-sessions.ts` `windowBounds()` | The react-query key contains `from`/`to` ISO strings built from `Date.now()` on **every render**. The banner re-renders every second, so each logged-in user creates a new query and calls the RPC **once per second**, and the cache grows without bound. | Key must be stable: `[LIVE_SESSIONS_KEY, "student-upcoming"]`; compute bounds **inside** `queryFn`. |
| F2 | **High** | `_shared/zoom.ts` `getValidAccessToken` | No protection against two concurrent refreshes. Zoom rotates the refresh token, so the second refresh fails, and any `400` is treated as revoked, which **disconnects the instructor's Zoom** for no reason. | After a failed refresh, re-read the secrets row. If `refresh_token` changed, a parallel call succeeded, so use the new access token. Mark revoked only when the response body contains `invalid_grant` **and** the row did not change. |
| F3 | **High** | `LiveSessionPanel.tsx` | Unlock depends on `can_join` from a 60 s poll. When the countdown reaches 0 nothing refetches, so students wait up to a minute looking at 00:00. | When `countdown.totalMs === 0 && !can_join && status === 'scheduled'`: `refetch()` immediately, then every 5 s (max 24 tries). |
| F4 | Medium | `LiveSessionPanel.tsx` `join()` | `window.open(url, "_blank", "noopener,noreferrer")` **always returns null** (browser spec), so the "popup blocked" fallback link always appears. | Use `const w = window.open("about:blank", "_blank")` synchronously **before** the `await`, then `w.opener = null; w.location.href = url`. If `w` is null, show the fallback link. |
| F5 | Medium | `zoom-oauth/index.ts:162` | `void zoomFetch;` references an identifier that is **not imported**, so any unknown route throws `ReferenceError` (500 instead of 404). Also the callback trusts `state.uid` without re-checking the user is still an admin. | Delete the line. In `/callback`, verify `has_role(uid,'admin')` with the service client before saving tokens. |
| F6 | Medium | `LiveSessionBanner.tsx` | Status only becomes `live` in Phase 4, so a started-but-`scheduled` session shows **"تبدأ خلال 00:00"** for up to 2 h. | When `now >= start`, use the live style and text `بدأت الجلسة «{title}» — انضم الآن`. |
| F7 | Medium | `apply_course_auto_enrollment` | `SECURITY DEFINER`, granted to `authenticated`, **no caller check** (violates hard rule 5). | Raise `FORBIDDEN` unless `auth.uid() is null` (trigger/cron/service) or `has_role(auth.uid(),'admin')`. |
| F8 | Low | `live-sessions` `create` | If the DB insert fails after Zoom created the meeting, the Zoom meeting is orphaned. | On every rollback path after the meeting exists, `DELETE /meetings/{id}` (ignore errors). |
| F9 | Low | `live-sessions` `cancel`; `tg_profiles_auto_enroll` | `cancel` accepts `ended/completed` sessions. The profile trigger enrolls banned students. | `cancel` only when status in (`scheduled`,`live`), else 409. Skip `is_banned` in the trigger. |

## Process notes for the agent

- Per-step commits were skipped (one commit). **Prompt 02 makes per-step commits mandatory.**
- No UI was exercised. Prompt 02 requires a browser pass with screenshots using QA accounts the owner provides.

## Things the owner (you) must do before Prompt 02 can be fully verified

1. **Create the Zoom app** (steps in `PHASE-01-HANDOVER.md` §11) and set the secrets:
   `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `ZOOM_REDIRECT_URI`, `ZOOM_STATE_SECRET`, `APP_SITE_URL`, `ZOOM_WEBHOOK_SECRET_TOKEN`.
   Use a **Pro (licensed) Zoom account** as host, otherwise cloud recording cannot be tested.
2. **Provide QA accounts** to the agent as environment variables (not in files):
   `QA_ADMIN_LOGIN`, `QA_ADMIN_PASSWORD`, `QA_STUDENT_LOGIN`, `QA_STUDENT_PASSWORD`.
   The student must be enrolled in a test course.
3. **Rotate** the Supabase secret key and access token that were pasted in chat, then give the agent the new
   access token as `SUPABASE_ACCESS_TOKEN`.
