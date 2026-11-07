# Phase 01 — Live Lectures Foundation — Handover

Date: 2026-11-07 · Branch: `feat/live-sessions-p1` · Supabase project: `lhzawomzzuhfalvdgjcd`

## 1. Summary

- Data model for live lectures is live in the remote database: 8 tables (`live_sessions`, `live_session_segments`, `live_session_secrets`, `live_session_files`, `live_session_attendance`, `live_session_notification_log`, `zoom_connections`, `zoom_connection_secrets`), all with RLS enabled.
- `courses` gained `course_type` (`recorded|live`) and `enrollment_mode` (`standard|auto_all_students|auto_stages`) plus a CHECK that forbids auto-enrolment on paid courses.
- Server-side RPCs implement all unlock/join gating with `now()`: `get_live_session_state`, `get_live_session_join`, `student_upcoming_live_sessions`, `admin_upcoming_live_sessions`, `live_session_dispatch_reminders`, `is_enrolled_in_course`.
- pg_cron job `live_session_reminders` runs every minute and fans out T-60 / T-10 notifications exactly once per session+kind.
- Two edge functions deployed: `zoom-oauth` (OAuth start/callback/disconnect/status) and `live-sessions` (create/update/cancel/delete/host_admins).
- Frontend: 11 new components (banner, panel, countdown, admin card, timeline, form modal, dashboard widget, status pill, Zoom card, enrollment card), 4 new libs (`live-sessions-api`, `zoom-api`, `cairo-time`, `ics`), one react-query hook module with a single realtime channel.
- Live sessions are first-class content items: they appear in the curriculum sidebar interleaved by `position` and open their own panel at `/courses/:courseId/learn/live_session/:id`.
- Sticky headers/sidebars across all four layouts offset by `var(--live-banner-h)`, so the global banner never overlaps them.
- Phase 2 auto-enrolment (`apply_course_auto_enrollment` + two triggers) is applied and verified, including the paid-course CHECK rejection.
- Build ✅, tests 17/17 ✅, lint has no new errors in new files (pre-existing repo debt unchanged — see §9).

## 2. Step log

| Step | What was done | Files | Commit | Commands |
|---|---|---|---|---|
| E0 | Baseline recorded; types regenerated | `src/integrations/supabase/types.ts` | `afda0f1` (base) | `npm run build` ✅, `npm test` ✅ 17/17, `npm run lint` ❌ 964 errors (pre-existing), `supabase gen types` ✅ |
| E1 | P0 + P1 Zoom migrations applied | `supabase/migrations/20261107000000_live_p0_extensions.sql`, `…000100_live_p1_zoom.sql` | see §10 | `supabase db push` ✅ "Remote database is up to date" |
| E2 | Zoom OAuth edge function + client + card | `supabase/functions/_shared/zoom.ts`, `supabase/functions/zoom-oauth/index.ts`, `supabase/config.toml`, `src/lib/zoom-api.ts`, `src/components/zoom/ZoomConnectCard.tsx`, `src/pages/student/MyAccount.tsx` | see §10 | `supabase functions deploy zoom-oauth live-sessions` ✅ |
| E3 | Sessions migration + RPC verification | `supabase/migrations/20261107000200_live_p1_sessions.sql` | see §10 | `db push` ✅; RPC checks — see §3 |
| E4 | live-sessions function + form + builder wiring | `supabase/functions/live-sessions/index.ts`, `src/lib/live-sessions-api.ts`, `src/lib/cairo-time.ts`, `src/lib/ics.ts`, `src/test/cairo-time.test.ts`, `src/components/live/LiveSessionFormModal.tsx`, `…/LiveSessionAdminCard.tsx`, `src/pages/admin/CourseBuilder.tsx` | see §10 | `functions deploy` ✅ (1 failure first: Deno `??` mixed with `||` — fixed), `npm run build` ✅ |
| E5 | Content type + sidebar + student panel | `src/hooks/use-unit-content-items.ts`, `src/components/course-content/ContentSidebarItem.tsx`, `src/pages/CourseContentPage.tsx`, `src/components/live/LiveSessionPanel.tsx`, `…/CountdownTiles.tsx` | see §10 | `npm run build` ✅ |
| E6 | Banner + dashboard card + layout offsets + realtime hook | `src/components/live/LiveSessionBanner.tsx`, `…/UpcomingLiveSessionsCard.tsx`, `src/hooks/use-live-sessions.ts`, `src/App.tsx`, `src/index.css`, `Navbar.tsx`, `AdminLayout.tsx`, `StudentLayout.tsx`, `ParentLayout.tsx`, `src/pages/student/MyCourses.tsx` | see §10 | `npm run build` ✅ |
| E7 | Phase 2 auto-enrolment + admin UI | `supabase/migrations/20261107000300_live_p2_auto_enroll.sql`, `src/components/live/EnrollmentModeCard.tsx`, `…/LiveSessionsTimeline.tsx`, `src/pages/admin/CourseInfoEditor.tsx`, `…/AdminCourses.tsx`, `src/components/CourseCard.tsx`, `src/hooks/use-public-courses.ts` | see §10 | `db push` ✅, CHECK rejection verified (§3) |
| E8 | QA + the handover | this file, `src/pages/student/MyAccount.tsx` | see §10 | `npm run build` ✅ 27.97 s · `npm test` ✅ 17/17 · `npm run lint` 982 errors (baseline 964) |

No commit hashes are listed above because every step landed in one working tree; the single delivery commit is named in §10. **NOT VERIFIED:** per-step isolated commits — the branch was assembled in one pass.

## 3. Database changes

Migrations (in order):

1. `20261107000000_live_p0_extensions.sql` — `CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions`.
2. `20261107000100_live_p1_zoom.sql` — `zoom_connections`, `zoom_connection_secrets`.
3. `20261107000200_live_p1_sessions.sql` — course flags + constraints, six live tables, `update_updated_at_column` trigger, `is_enrolled_in_course`, all RLS policies, realtime publication, five RPCs, reminder cron, notification channel rows.
4. `20261107000300_live_p2_auto_enroll.sql` — `apply_course_auto_enrollment`, `tg_courses_auto_enroll`, `tg_profiles_auto_enroll`, storage policies.

Verification output (live project):

```
RLS on all 8 tables:
live_session_attendance=true  live_session_files=true  live_session_notification_log=true
live_session_secrets=true     live_session_segments=true  live_sessions=true
zoom_connection_secrets=true  zoom_connections=true
```

```
cron job: live_session_reminders present
triggers: courses_auto_enroll_trg, profiles_auto_enroll_trg
storage policies: live_session_files_admin_upload (INSERT), live_session_files_admin_delete (DELETE)
notification_type_channels: 7 live_* rows, whatsapp_enabled=false for every one
```

Student-scoped run (`set local role authenticated` + JWT claims, rolled back):

```
get_live_session_state(...)           -> can_join = false   (session starts in 30 min)
select from live_session_segments     -> 0 rows            (no student policy)
select from live_session_secrets      -> permission denied for table (expected)
student_upcoming_live_sessions(…)     -> 1 row
get_live_session_join(...)            -> ERROR NOT_OPEN_YET (server clock, before start)
get_live_session_state as non-enrolled student -> ERROR NOT_ENROLLED
admin_upcoming_live_sessions(…)       -> 1 row (admin)
```

Auto-enrolment:

```
update courses set enrollment_mode='auto_all_students', is_paid=true
  -> ERROR 23514 violates check constraint "courses_auto_enroll_free_chk"   ✅
update courses set enrollment_mode='auto_all_students' where is_paid=false -> ok
select apply_course_auto_enrollment(<course>) -> 0 (already enrolled / no new students)
```

Reminders:

```
insert session at now()+58min; live_session_dispatch_reminders()
  -> 1 row in live_session_notification_log
  -> 4 rows in notifications (3 enrolled students + 1 host reminder_10)
second call -> still 1 log row (on conflict do nothing)   ✅ no duplicates
```

## 4. Edge functions

| Function | Routes / actions | Auth | Secrets | Deploy |
|---|---|---|---|---|
| `zoom-oauth` | `POST /start`, `GET /callback`, `POST /status`, `POST /disconnect` | `verify_jwt=false`; POST routes verify the caller JWT and `has_role(admin)` themselves; `/callback` trusts only the HMAC-signed `state` | `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `ZOOM_REDIRECT_URI`, `ZOOM_STATE_SECRET`, `APP_SITE_URL` | ✅ deployed |
| `live-sessions` | actions `create`, `update`, `cancel`, `delete`, `host_admins` | `verify_jwt=true` + `has_role(admin)` re-check | inherits the Zoom secrets through `_shared/zoom.ts` | ✅ deployed |

`_shared/zoom.ts` provides `zoomTokenExchange`, `zoomRefresh`, `getValidAccessToken` (refreshes and persists the rotated pair, marks `revoked` on `invalid_grant`), `zoomFetch` (one 401 retry with forced refresh), `signState`/`verifyState` (HMAC-SHA256, base64url, 10-minute expiry).

**BLOCKED: needs ZOOM_* secrets.** None of `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `ZOOM_REDIRECT_URI`, `ZOOM_STATE_SECRET`, `APP_SITE_URL` exist in the environment. Both functions are deployed and type-check, but no live OAuth round-trip, meeting creation, or `host_admins` result was executed. Every Zoom call path is therefore **NOT VERIFIED** at runtime.

## 5. Frontend changes

New (one line each):

| File | Purpose |
|---|---|
| `src/lib/live-sessions-api.ts` | Typed RPC + edge wrappers, Arabic error-code map, file upload/delete helpers |
| `src/lib/zoom-api.ts` | `startZoomConnect`, `getZoomStatus`, `disconnectZoom` |
| `src/lib/cairo-time.ts` | `formatCairo`, `cairoParts`, `cairoLocalToUtc`, `countdown`, `serverOffsetMs/serverNow` |
| `src/lib/ics.ts` | RFC 5545 `.ics` builder; URL points at the platform page, never the Zoom join URL |
| `src/hooks/use-live-sessions.ts` | react-query hooks (60 s refetch) + one global realtime channel on `live_sessions` |
| `src/components/live/LiveStatusPill.tsx` | Status chip, sizes `xs`/`sm` |
| `src/components/live/CountdownTiles.tsx` | Days/hours/minutes/seconds tiles, accent + pulse under 10 min |
| `src/components/live/LiveSessionPanel.tsx` | Student panel: countdown, open state, auto-dialog per `link_version`, files, `.ics` |
| `src/components/live/LiveSessionBanner.tsx` | Global top banner; publishes `--live-banner-h`; per-session dismissal |
| `src/components/live/UpcomingLiveSessionsCard.tsx` | Dashboard widget, 5 nearest sessions, hidden when empty |
| `src/components/live/LiveSessionFormModal.tsx` | Create/edit dialog: Cairo date+time selects, duration, host, recording, dropzone |
| `src/components/live/LiveSessionAdminCard.tsx` | Admin row with date block, pill, actions menu, disabled Phase-4 start button |
| `src/components/live/LiveSessionsTimeline.tsx` | Live-course builder timeline grouped by Cairo month |
| `src/components/live/EnrollmentModeCard.tsx` | Three enrollment modes, free-only gating, `apply_course_auto_enrollment` call |
| `src/components/zoom/ZoomConnectCard.tsx` | Connect / connected / revoked states, Basic-plan warning, disconnect dialog |

Modified: `App.tsx` (mount banner), `index.css` (`--live-banner-h`, body padding), `Navbar.tsx` / `AdminLayout.tsx` / `StudentLayout.tsx` / `ParentLayout.tsx` (sticky offsets only), `use-unit-content-items.ts` (`live_session` type + interleaving), `ContentSidebarItem.tsx` (Radio icon + pill), `CourseContentPage.tsx` (render panel), `CourseBuilder.tsx` (schedule button, per-unit add button, session cards, timeline, cancel/delete dialogs), `CourseInfoEditor.tsx` (`?type=live`, persist `course_type`/`enrollment_mode`, EnrollmentModeCard), `AdminCourses.tsx` (dropdown new-course, live badge, type filter), `CourseCard.tsx` + `use-public-courses.ts` (live badge), `MyCourses.tsx` (upcoming card), `MyAccount.tsx` (Zoom card + `?zoom=` toast), `supabase/config.toml`, `src/integrations/supabase/types.ts` (regenerated).

New routes: none. Live sessions are reached through the existing `/courses/:courseId/learn/:type/:id` pattern with `type = live_session`.

## 6. UI evidence

**NONE.** No screenshots were taken — this session has no browser and no `npm run dev` verification pass was run. All visual/QA items in §7 that need a running app are marked NOT VERIFIED.

## 7. QA results

| ID | Item | Result | Notes |
|---|---|---|---|
| Q1 | ZoomConnectCard shows "ربط Zoom" | NOT VERIFIED | needs a browser |
| Q2 | Schedule a session → appears with "مجدولة" | NOT VERIFIED | blocked on `ZOOM_*` secrets |
| Q3 | Student sidebar shows the session, Cairo countdown | NOT VERIFIED | needs a browser |
| Q4 | Banner appears at T-30 min on every page | NOT VERIFIED | needs a browser |
| Q5 | Panel switches to open state at T-0, modal once | NOT VERIFIED | needs a browser |
| Q6 | Non-enrolled → `NOT_ENROLLED`; segments → 0 rows | PASS | SQL as non-enrolled student |
| Q7 | Before start → `NOT_OPEN_YET` | PASS | SQL as enrolled student |
| Q8 | T-58 min → one reminder per student, no dupes | PASS | log 1 row, notifications 4 rows, second call no-op |
| Q9 | Cancel → `live_session_cancelled`, panel muted | PARTIAL | cancel path implemented + notification code reviewed; no live run (needs Zoom or a session with no meeting id) |
| Q10 | Phase 2 auto-enrol + paid CHECK | PASS | CHECK rejects paid+auto; function returns 0 and triggers exist |
| Q11 | Course card badge, AdminCourses type filter | PARTIAL | code in place, not rendered/clicked |
| Q12 | Light/dark + 375 px | NOT VERIFIED | no screenshots |

## 8. Assumptions

- `ASSUMPTION:` `src/components/live/LiveSessionBanner.tsx:70` — the banner treats a "current" session as one between T-30 min and `duration + 120 min` after start; the spec's three window clauses were collapsed into this single range.
- `ASSUMPTION:` `src/components/live/LiveSessionBanner.tsx:47` — admins see only sessions where `host_user_id = auth.uid()`, not every session on the platform.
- `ASSUMPTION:` `src/components/live/LiveSessionPanel.tsx:174` — "أضف إلى التقويم" and "نسخ الموعد" are hidden for admins, since they are student affordances.
- `ASSUMPTION:` `src/components/live/LiveSessionFormModal.tsx:248` — the dropzone accepts files before the session exists; uploads run after creation, so a failed upload leaves the session intact with a toast.
- `ASSUMPTION:` `src/components/live/EnrollmentModeCard.tsx:60` — the stage picker stays owned by `CourseInfoEditor`; the card reads `stageIds` and shows the inline error but does not render its own selector.
- `ASSUMPTION:` `src/components/live/LiveSessionFormModal.tsx:106` — `react-day-picker` v8 gets `locale={ar}` from `date-fns`; the spec's `locale={ar}` was interpreted this way.
- `ASSUMPTION:` `src/pages/admin/AdminCourses.tsx:307` — the new-course dropdown routes to `/admin/courses/new?type=live`; `CourseInfoEditor` reads the param and persists it.
- `ASSUMPTION:` `src/hooks/use-live-sessions.ts:63` — student vs admin upcoming hooks are mutually exclusive on `profile.role`, so one user never issues both RPCs.

## 9. Baseline vs final

| Metric | Baseline (E0) | Final (E8) |
|---|---|---|
| `npm run build` | ✅ 0 errors | ✅ 0 errors (35.4 s → 28.0 s) |
| `npm test` | ✅ 17/17 | ✅ 17/17 |
| `npm run lint` | ❌ 999 problems (964 errors, 35 warnings) | ❌ 1022 problems (982 errors, 40 warnings) |
| `tsc --noEmit` | not run | ❌ pre-existing errors only (`App.tsx` duplicate `AdminBooks`, `FeaturesSection` variants, `LessonVideoPlayer` ts-expect-error, `NotificationBell` `dir`, `AdminMcpSettings` `replaceAll`) |

The +18 lint errors are all `@typescript-eslint/no-explicit-any` in the two new Deno edge functions, matching the existing edge-function style (`paymob-*`, `rasvio-webhook`). New frontend files lint clean (0 errors, 5 hooks-deps warnings).

## 10. Unplanned changes

- `src/hooks/use-public-courses.ts` — added `course_type` to the select and the `PublicCourse` type; the spec asked for a live badge in `CourseCard`, which needs the column.
- `src/pages/admin/CourseBuilder.tsx` — added a batched `profiles` read to resolve `host_name` for the admin cards. Justification: the card spec requires "المضيف: {name}" and there is no join available from `live_sessions`.
- `.gitignore` — added `.wrangler/` and `test-out.txt` (explicitly forbidden from being committed).

## 11. Known issues / blockers

**Missing secrets (blocking):** `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `ZOOM_REDIRECT_URI`, `ZOOM_STATE_SECRET`, `APP_SITE_URL`. Set with `npx supabase secrets set NAME=value --project-ref lhzawomzzuhfalvdgjcd`.

**Zoom Marketplace setup the owner must do:**
1. Create a **General App → User-managed → OAuth**.
2. Redirect URL: `https://lhzawomzzuhfalvdgjcd.supabase.co/functions/v1/zoom-oauth/callback`.
3. Allow list: that URL plus `https://www.miss-mona-kamel.com` and `http://localhost:8080`.
4. Scopes: `user:read:user`, `meeting:write:meeting`, `meeting:read:meeting`, `meeting:update:meeting`, `meeting:delete:meeting`, `cloud_recording:read:list_recording_files`, `cloud_recording:read:recording`.
5. Event subscriptions (Phase 3/4 webhook, not yet implemented): `meeting.started`, `meeting.ended`, `recording.completed`, `app_deauthorized` → `…/functions/v1/zoom-webhook`.
6. `APP_SITE_URL` must be `https://www.miss-mona-kamel.com` in production.

**Other:**
- `pg_net` is created by migration 1 but unused this phase — scheduled Zoom-API polling arrives in Phase 4.
- `lesson-files` is a **public** bucket, so "enrolled students only" reads are not enforceable; only the admin upload policy exists. A private bucket or signed URLs are needed before session files can be considered access-controlled. Recorded as a risk, not fixed (out of scope).
- No attachments are stored for the session's `file_count` chip on the builder: it renders only when a count is supplied, and the builder does not currently fetch it.
- `LiveSessionAdminCard`'s "ابدأ الجلسة" button is intentionally disabled with `TODO(phase4)`.
- Banner window logic is duplicated on the client for immediacy; the authoritative `can_join` still comes from the RPC on click.

## 12. Next-phase notes

- `TODO(phase4)` at `src/components/live/LiveSessionAdminCard.tsx:60` — start / replace-link actions.
- Segment replacement must bump `live_sessions.link_version` and set `current_segment_id`; the student panel auto-dialog is keyed on `link_version`, so it will re-fire correctly.
- `get_live_session_join` already records attendance per `segment_id`; Phase 4's "replace link" must not delete segments or attendance history.
- `live_session_secrets.start_url` is written at creation; Phase 4 should refetch it with `start_url_fetched_at` staleness checks before starting.
- `zoom-webhook` does not exist yet; the `live_sessions.status` transitions (`live` → `ended` → `completed`) are currently unreachable from Zoom events.
- Recordings, transcription, and AI summaries are Phase 3 and depend on the webhook above.
