# Phase 02 — Phase-1 fixes + Recordings (Phase 3) + Reconnect & Calendars (Phase 4)

Branch: `feat/live-sessions-p1` · Date: 2026-11-07 · Supabase: `lhzawomzzuhfalvdgjcd`
Commits: `4fcd6f9` (E1) · `50be428` (E2) · `b778f10` (E3) · `d8a9297` (E4) · `b86c62b` (E5) · `216bf7c` (E6) · `c67e73d` (E7) · `4979ae1` (E8) · `3b4171d` (E9)

## 1. Summary

- All nine Phase-1 review defects (F1–F9) fixed, with two new unit tests (`live-query-keys`, `open-external`).
- A recording pipeline now exists end to end: Zoom `recording.completed` → `live_recordings` row → cron worker → multipart (or single-stream) upload into a **private** R2 bucket → `live_session_finalize` → one `r2` lesson per part, ordered by recording start.
- Playback never exposes the bucket: the `live-media` function mints 4-hour HMAC URLs, the Worker streams them with Range support, and an unsigned request is 403.
- Admins can upload a recording by hand (free Zoom accounts), retry a failed ingest, and see live progress at 10 s intervals.
- Host controls are live: **ابدأ الجلسة** at T−10, **استبدال الرابط** (new instant Zoom meeting or a pasted URL) with an instant rejoin modal for students who were in the room, and **إنهاء الجلسة**.
- Student and admin calendars (month / week / agenda), an all-sessions admin page, and both nav entries are wired.
- Verified by real HTTP calls with real admin/student JWTs (minted for QA, then deleted): signed PUT, upload completion, part publishing, playback 200/206/403, role gates.
- **NOT VERIFIED by a browser:** no `QA_*` credentials or Zoom app were provided, so no screen was clicked and no screenshot exists. Everything visual is unverified.
- build ✅ · tests 31/31 ✅ · lint 988 errors (baseline 982) — the +6 are `no-explicit-any` in the three new Deno functions, matching existing edge-function style.

## 2. Step log

| Step | Delivered | Commit | Commands / result |
|---|---|---|---|
| E0 | Baseline re-measured | — | build ✅ 27.4 s · test 17/17 ✅ · lint 982 errors |
| E1 | F1–F9 + `000000_live_fix_p1.sql` + 2 test files | `4fcd6f9` | `db push` ✅ · `functions deploy zoom-oauth live-sessions` ✅ · test 25/25 ✅ |
| E2 | `000100` enum, `000200` recordings schema + 3 functions | `50be428` | `db push` ✅ · enum `r2` present, 24 columns, RLS on |
| E3 | R2 bucket, CORS, `workers/live-media`, secrets, deploy | `b778f10` | `wrangler deploy` ✅ → `https://mona-live-media.alammmedd4.workers.dev` · unsigned 403 · bad ingest sig 401 · signed create/abort 200 |
| E4 | `zoom-webhook` | `d8a9297` | deploy ✅ (1 transient TransportError, retried) · forged sig 401 · validation echo correct |
| E5 | `recording-ingest-tick` + Vault + 2 cron jobs | `b86c62b` | deploy ✅ · no/bad `x-cron-secret` 401 · good 200 · pg_net 200 · E2E: pending → ready 3808 B → lesson `— الجزء 1` |
| E6 | `live-media` function + playback UI + recordings sheet + manual upload | `216bf7c` | deploy ✅ · no JWT 401 · types regenerated |
| E7 | start / replace_link / end + range RPCs + 3 components | `c67e73d` | `db push` `000500` ✅ · anon start 401 · RANGE_TOO_LARGE ✅ · student FORBIDDEN ✅ |
| E8 | Calendars, `/admin/live-sessions`, nav, routes | `4979ae1` | build ✅ · test 31/31 ✅ · all four routes serve 200 from `npm run dev` |
| E9 | QA, one defect found and fixed, handover | `3b4171d` | E2E upload + playback re-run ✅ |

## 3. Database changes

| Migration | Contents |
|---|---|
| `20261108000000_live_fix_p1.sql` | `apply_course_auto_enrollment` caller check (F7); `tg_profiles_auto_enroll` skips `is_banned` (F9) |
| `20261108000100_live_p3_enum.sql` | `video_provider += 'r2'` (alone, enum rule) |
| `20261108000200_live_p3_recordings.sql` | `live_recordings` (+ RLS admin select), `live_sessions.no_recording_reason`, `live_recording_claim_next`, `live_session_finalize`, `live_session_auto_end`, 3 channel rows |
| `20261108000300_live_p3_state.sql` | `get_live_session_state` += `recordings`, `processing_count`, `no_recording_reason`, `i_joined` |
| `20261108000400_live_p3_cron.sql` | `live_recording_ingest_tick` (Vault-read) + cron `live_recording_ingest` (1 min), `live_session_auto_end` (5 min) |
| `20261108000500_live_p4_control.sql` | `admin_live_sessions_range` (5 filters, 62-day cap), `student_live_sessions_range` |
| `20261108000600_live_manual_claim_fix.sql` | `live_recording_claim_next` restricted to `zoom_cloud`; `live_manual_upload_expire` + hourly cron |

Verification output:

```
enum video_provider: youtube, bunny, vimeo, r2
live_recordings RLS: true   columns: 24 (id … updated_at)
functions: live_recording_claim_next, live_session_finalize, live_session_auto_end
cron: live_recording_ingest * * * * * · live_session_auto_end */5 * * * * ·
      live_manual_upload_expire 17 * * * * · live_session_reminders * * * * *
vault secrets (names only): live_cron_secret, live_functions_base_url
F7 student call        -> ERROR FORBIDDEN
F7 admin call          -> 0
range > 62 days        -> ERROR RANGE_TOO_LARGE
range as student       -> ERROR FORBIDDEN
post-cleanup leftovers -> sessions 0, recordings 0, r2 lessons 0
```

## 4. Edge functions

| Function | Auth | Actions / routes | Secrets (names) |
|---|---|---|---|
| `zoom-oauth` | `verify_jwt=false`, own JWT check + `/callback` re-checks admin | start / callback / status / disconnect | `ZOOM_*`, `APP_SITE_URL` |
| `live-sessions` | `verify_jwt=true` + admin | create / update / cancel / delete / host_admins / **start** / **replace_link** / **end** | inherits `ZOOM_*` |
| `zoom-webhook` | `verify_jwt=false`, v0 HMAC + 300 s skew | `endpoint.url_validation`, `meeting.started`, `meeting.ended`, `recording.completed`, `app_deauthorized` | `ZOOM_WEBHOOK_SECRET_TOKEN` |
| `recording-ingest-tick` | `x-cron-secret` | queue loop, 110 s budget | `LIVE_CRON_SECRET`, `MEDIA_BASE_URL`, `INGEST_SECRET` |
| `live-media` | `verify_jwt=true` | playback_url / upload_url / upload_complete / retry_recording / list_recordings | `MEDIA_BASE_URL`, `MEDIA_SIGNING_SECRET` |

All five deployed successfully. `live-media` without a JWT → 401. `recording-ingest-tick` with no/incorrect `x-cron-secret` → 401. `zoom-webhook` with a forged signature → 401.

## 5. Infrastructure

- R2 bucket **`mona-live-recordings`**, location `weur`, private (no custom domain, no `r2.dev`).
- CORS: origins `https://www.miss-mona-kamel.com`, `https://miss-mona-kamel.com`, `http://localhost:8080`; methods GET/HEAD/PUT; expose `ETag, Content-Range, Accept-Ranges, Content-Length`; max-age 3600. Verified with `wrangler r2 bucket cors list`.
- Worker **`mona-live-media`** → `https://mona-live-media.alammmedd4.workers.dev`; bindings `RECORDINGS`; secrets `INGEST_SECRET`, `MEDIA_SIGNING_SECRET`; `workers_dev = true`.
- Cron: `live_recording_ingest` (1 min), `live_session_auto_end` (5 min), `live_manual_upload_expire` (hourly :17), `live_session_reminders` (1 min, from Phase 1).
- Edge secrets set this phase: `ZOOM_WEBHOOK_SECRET_TOKEN`, `INGEST_SECRET`, `LIVE_CRON_SECRET`, `MEDIA_BASE_URL`, `MEDIA_SIGNING_SECRET`.
- Vault: `live_functions_base_url`, `live_cron_secret`.

## 6. Recording pipeline evidence

Automated run (Zoom-sourced row, public ranged source):

| Field | Value |
|---|---|
| recording id | `cccccccc-…-0001`, then `…-0002` for the ordering check |
| source size | 3808 B |
| parts uploaded | 1 (`bytes_done` 3808 = `file_size`) |
| part indices | first run: 1 · after adding an older slice: re-ranked to 2 and 1 |
| lessons created | `E2E اختبار النقل — الجزء 1` (pos 501), `— الجزء 2` (pos 502), `video_provider = r2` |
| session | `ended` → `completed` |
| notifications | one `live_recording_ready` set (4 rows) + log row `recording_ready` |
| duplicate guard | second dispatch → still 1 log row |

Manual-upload run (real admin JWT, 1 MiB):

| Step | Result |
|---|---|
| `upload_url` | `recording_id`, signed PUT URL, exp 2 h |
| PUT to Worker | `{"size":1048576}` |
| `upload_complete` | `{"ok":true,"size":1048576}` |
| published | `status=ready`, `part_index=1`, lesson `QA upload — الجزء 1` |
| playback plain | 200, 1048576 bytes |
| playback Range 0-999 | 206, `Content-Range: bytes 0-999/1048576` |
| unsigned | 403 |
| enrolled student playback | 200 |
| student `upload_url` | `FORBIDDEN` |

## 7. Frontend changes

New: `lib/open-external.ts`, `lib/live-media-api.ts`, `lib/calendar.ts`, `components/live/{StartMeetingButton,ReplaceLinkDialog,LinkReplacedDialog,LiveRecordingsTab,ManualRecordingUpload,LiveCalendar}.tsx`, `components/live/calendar/{MonthGrid,WeekGrid,AgendaList,EventSheet}.tsx`, `pages/student/StudentLiveCalendar.tsx`, `pages/admin/{AdminLiveCalendar,AdminLiveSessions}.tsx`.

Modified: `video.ts` (`r2`), `LessonVideoPlayer.tsx` (signed-URL Plyr + one refresh on media error), `LessonModal.tsx` (r2 read-only), `LiveSessionAdminCard.tsx` (start controls, recordings sheet, attendee chip), `LiveSessionPanel.tsx` (F3/F4, parts list, processing count, reasons), `LiveSessionBanner.tsx` (F6), `use-live-sessions.ts` (F1), `live-sessions-api.ts` (Phase-4 wrappers), `AdminLayout.tsx` + `StudentLayout.tsx` (nav), `App.tsx` (dialog + 3 routes), `supabase/config.toml`, `.gitignore`, generated types.

Routes added: `/dashboard/calendar`, `/admin/live-calendar`, `/admin/live-sessions`.

## 8. Fix verification (F1–F9)

| Fix | Change | Verified how |
|---|---|---|
| F1 | `use-live-sessions.ts:26-32` stable keys; bounds inside `queryFn` | `live-query-keys.test.ts` (4 assertions) ✅; no timestamp in key |
| F2 | `_shared/zoom.ts:108-190` CAS write on `refresh_token`, re-read after failure, revoked only on `invalid_grant`/`Invalid Token` **and** unchanged row | code review + `ZOOM_REFRESH_FAILED` path; concurrency test **BLOCKED** (no Zoom app) |
| F3 | `LiveSessionPanel.tsx:96-113` 5 s refetch at zero, max 24 | code review; browser test **BLOCKED** |
| F4 | `lib/open-external.ts` + used in panel, StartMeetingButton, ReplaceLinkDialog, LinkReplacedDialog | `open-external.test.ts` (4 assertions) ✅ |
| F5 | removed `void zoomFetch`; `/callback` re-checks `has_role(uid,'admin')` | unknown route now returns JSON 404, not ReferenceError |
| F6 | `LiveSessionBanner.tsx:99-125` started-state text + destructive style | code review; **BLOCKED** in browser |
| F7 | `000000_live_fix_p1.sql` | student → `FORBIDDEN`, admin → `0` ✅ |
| F8 | `live-sessions/index.ts` `discardZoomMeeting` on all three rollback paths | code review; needs Zoom to exercise |
| F9 | cancel guard `scheduled|live` else 409; trigger skips `is_banned` | SQL + code; 409 path **BLOCKED** (needs live session) |

## 9. QA results

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | Admin connects Zoom | **BLOCKED** | no Zoom app / `ZOOM_*` secrets |
| 2 | T−10 start button enables | **BLOCKED** | no browser session; logic unit-reviewed |
| 3 | Banner amber → unlock within 5 s → join without fallback link | **BLOCKED** | needs browser |
| 4 | Admin start → live → red banner | **BLOCKED** | needs Zoom + browser |
| 5 | Replace link → student dialog within 5 s | **BLOCKED** | backend verified only by code review |
| 6 | Record → ingest → two ordered parts → student playback + Range + 403 | **PARTIAL** | pipeline, ordering, playback 200/206/403 all PASS by HTTP; the *Zoom* leg is BLOCKED |
| 7 | Manual upload becomes a part | **PASS** | real admin JWT, 1 MiB, became part 1 |
| 8 | Kill test (bad `download_url` → backoff → failed → retry) | **PARTIAL** | failure path exercised (`AUTH:ZOOM_NOT_CONNECTED`, `PART_500`) and backoff visible; `attempts>=8` and the host notification not driven to completion |
| 9 | Auto-end by cron | **BLOCKED** | would require moving a real session's clock; function unit-reviewed |
| 10 | Calendars: month/week/list, Saturday first, filters, 375 px | **PARTIAL** | grid maths covered by `calendar.test.ts`; rendering **BLOCKED** (no browser) |
| 11 | F1 ≤ 1 RPC / 60 s | **BLOCKED** | needs a logged-in browser |
| 12 | F2 concurrent refresh both succeed | **BLOCKED** | needs Zoom tokens |
| 13 | Light/dark/375 px screenshots | **BLOCKED** | **no screenshots exist** — `docs/handover/screens/phase-02/` is not created |

Regression: production build ✅ and all 31 unit tests pass; the dev server serves `/`, `/login`, `/dashboard/calendar`, `/admin/live-calendar`, `/admin/live-sessions` with 200 and no console-level errors in the Vite log. Recorded-lesson playback, quizzes, assignments, purchase flow, notification bell and MCP settings were **not** clicked through (no browser session).

## 10. Assumptions

- `ASSUMPTION:` `supabase/functions/recording-ingest-tick/index.ts:118` — Zoom `download_token` is used while younger than 20 h; afterwards the host's OAuth token is fetched instead (token TTL is ~24 h, so 20 h leaves margin).
- `ASSUMPTION:` `workers/live-media/src/index.ts:196` — each ranged part is buffered before `uploadPart` because R2 requires a known length; parts are ≤ 32 MiB so memory stays inside the 128 MB assumption.
- `ASSUMPTION:` `supabase/migrations/20261108000200_live_p3_recordings.sql:150` — part lessons are inserted at `session.position + part_index`, and every later item in the unit shifts by the number of *new* parts, so repeated finalize calls are idempotent.
- `ASSUMPTION:` `src/components/live/StartMeetingButton.tsx:44` — "الجزء {n}" is shown only when `segment_count > 1`.
- `ASSUMPTION:` `src/components/live/LiveCalendar.tsx:120` — the agenda view covers 30 days from today rather than from the visible month start.
- `ASSUMPTION:` `src/components/live/LiveCalendar.tsx:64` — the view preference falls back to `month` ≥ 768 px and `list` below, then respects `localStorage` if set.
- `ASSUMPTION:` `src/pages/admin/AdminLiveSessions.tsx:250` — creating a session first asks for a course, because the form is course-scoped and the page spans all courses.
- `ASSUMPTION:` `src/components/live/LiveRecordingsTab.tsx:60` — the admin recordings list polls every 10 s only while a row is `pending`/`uploading`.

## 11. Unplanned changes

- `supabase/migrations/20261108000600_live_manual_claim_fix.sql` — not in the prompt. Required: the cron worker claimed `manual_upload` rows and failed them mid-upload (found during QA, see §12).
- `src/components/admin/LessonModal.tsx` — the r2 provider is hidden from the picker entirely (not just read-only text), because the picker has no r2 entry and rendering it would allow switching a recording lesson to YouTube and back.
- `src/components/live/LiveSessionsTimeline.tsx` — hosts `onRefresh` so the start/end actions in the timeline can refetch.
- `.gitignore` — `.qa_*` token files and `.secrets.tmp` (both deleted after use).

## 12. Known issues / blockers

**Blocks full verification**
1. No Zoom app: `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `ZOOM_REDIRECT_URI`, `ZOOM_STATE_SECRET`, `APP_SITE_URL` are still unset. OAuth, meeting creation, start, replace-with-new-meeting, webhooks and the Zoom-sourced ingest leg are all untested at runtime.
2. No `QA_ADMIN_LOGIN` / `QA_STUDENT_LOGIN` (or passwords): no browser pass, no screenshots. Admin and student screens have **never been rendered**.
3. The Zoom Marketplace event URL is not configured, so `zoom-webhook` has never received a real event; only forged/synthetic payloads were tested.

**Found and fixed during QA**
- Manual uploads were being claimed by the ingest worker (two rows: one `failed`, one `ready`). Fixed in `20261108000600`; re-verified.

**Known limitations**
- `lesson-files` (phase 1) is still a public bucket; session *files* remain unprotected by URL. Recordings are fine (private R2 + signed URLs).
- The worker buffers one part (≤ 32 MiB) per request; a future large-part tuning must stay under the 128 MB worker memory assumption.
- `live_session_finalize` is not transactional across the lesson-shift and the inserts; a crash mid-way can leave shifted positions. It is idempotent, so re-running repairs it.
- `LiveSessionPanel` still carries three `react-hooks/exhaustive-deps` warnings (pre-existing pattern in this repo; no errors).

## 13. Baseline vs final

| Metric | E0 | Final |
|---|---|---|
| `npm run build` | ✅ 27.4 s | ✅ 28.4 s |
| `npm test` | 17/17 | **31/31** (8 files) |
| `npm run lint` | 982 errors / 40 warnings | 988 errors / 46 warnings |
| `tsc --noEmit` | 5 pre-existing errors | same 5 (App `AdminBooks` dup, `FeaturesSection`, `LessonVideoPlayer` ts-expect-error, `NotificationBell` `dir`, `AdminMcpSettings` `replaceAll`) |
| `wrangler deploy --dry-run` | n/a | ✅ 8.18 KiB |

The +6 lint errors are `@typescript-eslint/no-explicit-any` in `zoom-webhook`, `recording-ingest-tick` and `live-sessions` new actions — the same rule the existing `paymob-*`/`rasvio-webhook` functions already fail.

## 14. Next-phase notes

- Zoom setup the owner must still do: create the General App (User-managed, OAuth), redirect `…/functions/v1/zoom-oauth/callback`, add the allow-list origins, grant the seven scopes, and subscribe `meeting.started`, `meeting.ended`, `recording.completed`, `app_deauthorized` to `…/functions/v1/zoom-webhook`, then click **Validate** in the Marketplace. Set `ZOOM_*`, `APP_SITE_URL`, and keep `ZOOM_WEBHOOK_SECRET_TOKEN`.
- `getValidAccessToken`'s concurrency guard has never met a real rotated token. First live OAuth connection is the moment to re-check it (watch for `ZOOM_REFRESH_FAILED` in function logs).
- `live_session_finalize` assumes one lesson per recording part; Part 2 (AI) should key its transcript/summary tables on `live_recordings.id`, not on the lesson.
- `no_recording_reason` values in use: `disabled`, `basic_account`, `not_received`. Part 2 must not invent new ones without adding them to the panel copy in `LiveSessionPanel.tsx`.
- The calendar `EventSheet` edit action navigates to the builder instead of opening the form inline (the form needs a course context). Revisit if inline editing is wanted.
- Screenshot QA is still outstanding for every component in §7; run it as soon as `QA_*` accounts exist.
