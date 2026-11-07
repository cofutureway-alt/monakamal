# EXECUTION PROMPT 01 — Live Lectures Foundation (Phases 0, 1, 2)

You are the implementation agent. Follow this document **literally**. Where it specifies a name, path,
column, colour, string or order, use exactly that. Where something is not specified and you would have
to guess, **stop guessing**: pick the most conservative option, mark it `ASSUMPTION:` in a code comment,
and list it in the handover. Do not expand scope.

Read first, fully, before touching anything:
1. `docs/LIVE_AND_AI_ROADMAP.md` (sections 0, 1, Part 1 §1.1–1.6). This prompt implements those sections.
2. `src/App.tsx`, `src/components/admin/AdminLayout.tsx`, `src/components/student/StudentLayout.tsx`,
   `src/components/Navbar.tsx`, `src/hooks/use-unit-content-items.ts`, `src/pages/CourseContentPage.tsx`,
   `src/components/course-content/ContentSidebarItem.tsx`, `src/pages/admin/CourseBuilder.tsx`,
   `src/pages/admin/CourseInfoEditor.tsx`, `src/pages/admin/AdminCourses.tsx`, `src/pages/student/MyCourses.tsx`,
   `src/pages/student/MyAccount.tsx`, `src/components/CourseCard.tsx`, `src/hooks/use-cart.ts` (realtime pattern),
   `supabase/functions/admin-create-student/index.ts` (edge pattern), `supabase/config.toml`,
   the three most recent migrations in `supabase/migrations/`.

---

## A. Hard rules (violating any = task failed)

1. **Secrets.** Never write any key, token, password or secret into a file, commit, log line, test, or the
   handover. The Supabase access token is provided to you as env var `SUPABASE_ACCESS_TOKEN`. Edge secrets
   are set with `npx supabase secrets set NAME=value --project-ref lhzawomzzuhfalvdgjcd` using values from
   env vars only. If a required secret (e.g. `ZOOM_CLIENT_ID`) is not in your environment, do **not**
   invent one — implement the code, skip the live test, and record "BLOCKED: needs ZOOM_* secrets" in the handover.
2. **Scope.** Only touch files listed in section D. If another file must change, change the minimum and
   justify it in the handover under "Unplanned changes".
3. **No new npm dependencies.** Everything is buildable with what is in `package.json`.
4. **Git.** Work in `al-saae-journey-main`. Create branch `feat/live-sessions-p1` from `main`. One commit per
   numbered step in section E, message format `feat(live): <step id> <summary>` and end every commit message with
   `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do **not** push. Do **not** commit `.wrangler/`, `.env`, `supabase/.temp/`.
5. **Database.** Every new table: `ENABLE ROW LEVEL SECURITY` + explicit policies. Every `SECURITY DEFINER`
   function: `SET search_path = public`, checks `auth.uid()` and role, `REVOKE ALL ... FROM PUBLIC` then
   `GRANT EXECUTE` only to the roles listed. Migrations must be idempotent and re-runnable.
6. **Never trust the client clock** for unlocking. Unlock checks happen in SQL with `now()`.
7. **Arabic UI only**, RTL. Use the exact strings in section F. Use Tailwind tokens (`bg-primary`, `text-accent`,
   `bg-destructive/15`, …) — **no hex colours, no inline style colours**.
8. **Do not break existing behaviour.** Existing lesson/quiz/assignment flows, purchase flow, and all routes
   must work exactly as before. Run the regression checklist (section G.3).
9. If a command fails, read the error, fix the cause, re-run. Do not disable lint rules, tests, RLS or type
   checks to get green. Do not use `// @ts-ignore` or `any` except where an existing file already does for the same API.

---

## B. Environment facts (verified — do not re-discover)

- Supabase project ref `lhzawomzzuhfalvdgjcd`, URL `https://lhzawomzzuhfalvdgjcd.supabase.co`. The repo is linked
  (`supabase/.temp/project-ref`). Apply migrations with `npx supabase db push` (use `--include-all` only if the CLI asks).
- Deploy functions: `npx supabase functions deploy <name> --project-ref lhzawomzzuhfalvdgjcd` (add `--no-verify-jwt`
  for `zoom-oauth` callback handling and `zoom-webhook`; see C.4).
- Regenerate types: `npx supabase gen types typescript --project-id lhzawomzzuhfalvdgjcd > src/integrations/supabase/types.ts`.
- Roles: enum `app_role` = admin | student | parent. **"Instructor" = admin.** Use `public.has_role(uid,'admin')`.
- `enrollments` has `UNIQUE(user_id, course_id)`. `courses.stage_ids uuid[]`. Student grade = `profiles.stage_id`.
- `notifications(user_id,type,title,body,template_data,action_url,related_entity_type,related_entity_id,is_read,read_at,created_at)`.
- `pg_cron` installed; `pg_net` NOT installed. `supabase_vault` installed.
- Site URL: `https://www.miss-mona-kamel.com`; local dev `http://localhost:8080`.
- Time zone for display: `Africa/Cairo`. Week starts **Saturday**.

---

## C. Backend specification

### C.1 Migration `supabase/migrations/20261107000000_live_p0_extensions.sql`
- `CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;`

### C.2 Migration `supabase/migrations/20261107000100_live_p1_zoom.sql`
```sql
create table if not exists public.zoom_connections (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  zoom_user_id text not null,
  zoom_email text,
  zoom_display_name text,
  zoom_account_type int,                 -- 1 = Basic, 2 = Licensed, others as returned by Zoom
  scopes text[] not null default '{}',
  status text not null default 'active' check (status in ('active','revoked')),
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.zoom_connection_secrets (
  user_id uuid primary key references public.zoom_connections(user_id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
```
RLS: `zoom_connections` — select: `user_id = auth.uid() or has_role(auth.uid(),'admin')`; no insert/update/delete
policies (service role only). `zoom_connection_secrets` — RLS enabled, **no policies**.
Also `revoke all on public.zoom_connection_secrets from anon, authenticated;`

### C.3 Migration `supabase/migrations/20261107000200_live_p1_sessions.sql`
Create exactly (types/defaults/checks as written):
```sql
alter table public.courses
  add column if not exists course_type text not null default 'recorded',
  add column if not exists enrollment_mode text not null default 'standard';
-- add CHECK constraints by name (drop if exists first):
--   courses_course_type_chk      : course_type in ('recorded','live')
--   courses_enrollment_mode_chk  : enrollment_mode in ('standard','auto_all_students','auto_stages')
--   courses_auto_enroll_free_chk : enrollment_mode = 'standard' or coalesce(is_paid,false) = false

create table if not exists public.live_sessions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  description text,
  scheduled_start_at timestamptz not null,
  duration_minutes int not null check (duration_minutes between 15 and 480),
  host_user_id uuid not null references public.profiles(id),
  status text not null default 'scheduled'
    check (status in ('scheduled','live','ended','completed','cancelled')),
  current_segment_id uuid,
  link_version int not null default 1,
  recording_enabled boolean not null default true,
  position int not null default 0,          -- order inside the unit, same semantics as lessons.position
  started_at timestamptz, ended_at timestamptz, cancelled_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists live_sessions_course_idx on public.live_sessions(course_id);
create index if not exists live_sessions_start_idx on public.live_sessions(scheduled_start_at);

create table if not exists public.live_session_segments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  segment_index int not null check (segment_index >= 1),
  source text not null check (source in ('zoom_api','manual_url')),
  zoom_meeting_id bigint, zoom_meeting_uuid text,
  join_url text not null, password text,
  replace_reason text,
  started_at timestamptz, ended_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (session_id, segment_index)
);
alter table public.live_sessions drop constraint if exists live_sessions_current_segment_fk;
alter table public.live_sessions add constraint live_sessions_current_segment_fk
  foreign key (current_segment_id) references public.live_session_segments(id) on delete set null;

create table if not exists public.live_session_secrets (
  segment_id uuid primary key references public.live_session_segments(id) on delete cascade,
  start_url text, start_url_fetched_at timestamptz
);

create table if not exists public.live_session_files (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  file_name text not null, storage_path text not null, file_type text, file_size bigint,
  allow_download boolean not null default true, position int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.live_session_attendance (
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  segment_id uuid not null references public.live_session_segments(id) on delete cascade,
  first_joined_at timestamptz not null default now(),
  last_joined_at timestamptz not null default now(),
  join_count int not null default 1,
  primary key (session_id, user_id, segment_id)
);

create table if not exists public.live_session_notification_log (
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  kind text not null,
  sent_at timestamptz not null default now(),
  primary key (session_id, kind)
);
```
- `updated_at` trigger on `live_sessions` (reuse an existing `set_updated_at`-style function if one exists in prior
  migrations — search for it; else create `public.tg_set_updated_at()`).
- Helper: `public.is_enrolled_in_course(_user uuid, _course uuid) returns boolean` (STABLE, SECURITY DEFINER) —
  `exists(select 1 from enrollments where user_id=_user and course_id=_course)`.
- **RLS**
  - `live_sessions`: admin all (`has_role(auth.uid(),'admin')`); select for authenticated where
    `is_enrolled_in_course(auth.uid(), course_id)` (cancelled rows included, so students see the cancelled state).
    No parent access in this phase.
  - `live_session_segments`: admin all. No student policy.
  - `live_session_secrets`: RLS on, no policies.
  - `live_session_files`: admin all; select for enrolled (join through `live_sessions`).
  - `live_session_attendance`: admin select; student select own rows. Inserts only via RPC.
  - `live_session_notification_log`: RLS on, no policies.
- **Realtime:** `alter publication supabase_realtime add table public.live_sessions;` (guard with a `DO` block that
  checks `pg_publication_tables` first).
- **RPCs** (all `SECURITY DEFINER`, `SET search_path = public`, grant to `authenticated` only):
  1. `get_live_session_state(_session_id uuid) returns jsonb` — caller must be admin or enrolled, else raise
     `exception 'NOT_ENROLLED'`. Returns
     `{id, course_id, unit_id, title, description, status, scheduled_start_at, duration_minutes, server_now: now(),
       join_opens_at: scheduled_start_at, host_start_opens_at: scheduled_start_at - interval '10 min',
       can_join: (status in ('scheduled','live') and now() >= scheduled_start_at
                  and now() <= scheduled_start_at + make_interval(mins => duration_minutes) + interval '120 min'),
       link_version, segment_count, files: [{id,file_name,file_type,file_size,allow_download,storage_path}] ordered by position}`.
  2. `get_live_session_join(_session_id uuid) returns jsonb` — same auth; if not `can_join` raise
     `NOT_OPEN_YET` (before start) / `SESSION_OVER` (after window or status ended/completed) / `SESSION_CANCELLED`.
     Returns `{join_url, password, segment_index, link_version, server_now}` of `current_segment_id`.
     Upserts `live_session_attendance` (increment `join_count`, set `last_joined_at`) for non-admin callers.
  3. `student_upcoming_live_sessions(_from timestamptz, _to timestamptz) returns table(...)` — sessions of courses the
     caller is enrolled in, `scheduled_start_at between _from and _to` or `status='live'`, not cancelled, columns:
     `id, course_id, course_title, course_thumbnail_url, title, scheduled_start_at, duration_minutes, status, link_version, unit_id`.
     Order by `scheduled_start_at`. Limit 50.
  4. `admin_upcoming_live_sessions(_from, _to)` — same columns + `host_user_id, host_name`; admin only.
- **Cron** job `live_session_reminders` every minute (`cron.schedule`, unschedule first if exists) calling SQL function
  `public.live_session_dispatch_reminders()` that, for sessions with status `scheduled`:
  - `kind='reminder_60'` when `now() between start-60min and start-55min`,
  - `kind='reminder_10'` when `now() between start-10min and start-5min`,
  inserts into `live_session_notification_log` with `on conflict do nothing` and **only if inserted** creates one
  `notifications` row per enrolled student (type `live_session_reminder_60` / `live_session_reminder_10`,
  `action_url='/courses/{course_id}/learn/live_session/{id}'`, `related_entity_type='live_session'`, `related_entity_id=id`).
  Also notify the host (admin) for `reminder_10` with action_url `/admin/courses/{course_id}/builder`.
- Insert into `notification_type_channels` rows for the new types **only if** that table has a row shape you can copy from
  existing rows; set WhatsApp channel disabled by default. If unclear, skip and list it in the handover.

### C.4 Edge functions (Deno, copy CORS/auth pattern from `admin-create-student`)

Create `supabase/functions/_shared/zoom.ts`:
- `zoomTokenExchange(code)`, `zoomRefresh(refreshToken)` (POST `https://zoom.us/oauth/token`, Basic auth base64(`ZOOM_CLIENT_ID:ZOOM_CLIENT_SECRET`)).
- `getValidAccessToken(service, userId)` — reads `zoom_connection_secrets`; if `expires_at < now()+60s`, refresh and
  **persist both new tokens** in the same call; on `invalid_grant` set `zoom_connections.status='revoked'` and throw `ZOOM_REVOKED`.
- `zoomFetch(service, userId, path, init)` — base `https://api.zoom.us/v2`, retries once on 401 after forced refresh.
- `signState(payload)` / `verifyState(token)` — HMAC-SHA256 with `ZOOM_STATE_SECRET`, payload `{uid, n, exp}` base64url, exp 10 min.

`supabase/functions/zoom-oauth/index.ts` (config `verify_jwt = false`; it verifies JWT itself for POST routes):
- `POST /zoom-oauth/start` (requires admin JWT) → `{ url }` = `https://zoom.us/oauth/authorize?response_type=code&client_id=…&redirect_uri=<ZOOM_REDIRECT_URI>&state=<signed>`.
- `GET /zoom-oauth/callback?code&state` → verify state → exchange → `GET /users/me` → upsert `zoom_connections`
  (`zoom_account_type = me.type`) and secrets → `302 Location: ${APP_SITE_URL}/admin/account?zoom=connected`.
  On any error `302 …?zoom=error&reason=<short_code>` (codes: `state_invalid`, `exchange_failed`, `profile_failed`).
- `POST /zoom-oauth/disconnect` (admin JWT) → `POST https://zoom.us/oauth/revoke?token=<access>` (ignore failure) → delete rows → `{ ok: true }`.
- `POST /zoom-oauth/status` (admin JWT) → connection row or `null`.
Required secrets: `ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET, ZOOM_REDIRECT_URI, ZOOM_STATE_SECRET, APP_SITE_URL`.

`supabase/functions/live-sessions/index.ts` (`verify_jwt = true`, admin only), body `{ action, ... }`:
- `create` `{course_id, unit_id|null, create_unit_title|null, title, description, scheduled_start_at (ISO UTC), duration_minutes, host_user_id, recording_enabled}`
  1. Validate: admin; `scheduled_start_at >= now()+5min`; duration 15–480; host has `zoom_connections.status='active'`.
  2. If `unit_id` null and `create_unit_title` given → insert `units` (`position` = max+1).
  3. Insert `live_sessions` (position = max position in unit across lessons/sessions + 1).
  4. Zoom `POST /users/me/meetings` as host: `{topic:title, type:2, start_time, duration, timezone:'Africa/Cairo', agenda:description,
     settings:{join_before_host:false, waiting_room:false, mute_upon_entry:true, approval_type:2,
     auto_recording: recording_enabled ? 'cloud' : 'none', meeting_authentication:false}}`.
  5. Insert segment #1 (`source='zoom_api'`, `zoom_meeting_id=id`, `zoom_meeting_uuid=uuid`, `join_url`, `password`), secrets (`start_url`),
     set `current_segment_id`.
  6. If Zoom fails → delete the session (and unit if created in step 2) and return `422 {error:'ZOOM_CREATE_FAILED', message}`.
  7. Notify all enrolled students: type `live_session_scheduled`.
  8. Return the session row.
- `update` `{session_id, title?, description?, scheduled_start_at?, duration_minutes?, recording_enabled?}` → only if status `scheduled`;
  `PATCH /meetings/{zoom_meeting_id}`; update row. If time changed, delete its rows from `live_session_notification_log`.
- `cancel` `{session_id}` → `DELETE /meetings/{id}` (ignore 404) → status `cancelled`, `cancelled_at` → notify `live_session_cancelled`.
- `delete` `{session_id}` → only if `scheduled` or `cancelled`; delete Zoom meeting (ignore 404); delete row.
- `host_admins` → list admins with active Zoom: `[{user_id, full_name, zoom_email, zoom_account_type}]`.
- (Start / replace link actions are **Phase 4 — do not implement**.)
Errors are JSON `{error: CODE, message_ar}`; HTTP 400/403/404/409/422.

Add to `supabase/config.toml`:
```toml
[functions.zoom-oauth]
verify_jwt = false

[functions.live-sessions]
verify_jwt = true
```

### C.5 Phase 2 migration `supabase/migrations/20261107000300_live_p2_auto_enroll.sql`
- `public.apply_course_auto_enrollment(_course_id uuid) returns int` (SECURITY DEFINER; callable by admin or internally):
  if course `status='published'` and `is_paid=false` and mode is auto → insert enrollments for
  `profiles where role='student' and not is_banned` (`auto_all_students`) or additionally `stage_id = any(course.stage_ids)` (`auto_stages`),
  `on conflict (user_id, course_id) do nothing`; returns inserted count.
- Trigger `courses_auto_enroll_trg` AFTER INSERT OR UPDATE OF `enrollment_mode, stage_ids, is_paid, status` ON `courses` → `perform apply_course_auto_enrollment(new.id)`.
- Trigger `profiles_auto_enroll_trg` AFTER INSERT OR UPDATE OF `stage_id, role` ON `profiles` when `new.role='student'` → enroll into all published
  free courses with `auto_all_students`, or `auto_stages` where `new.stage_id = any(stage_ids)`.
- Removing auto mode does NOT delete enrollments (comment this in SQL).
- Storage policy: allow admins to upload to `lesson-files` under `live/%`; allow enrolled students to read objects whose path
  is `live/{session_id}/...` for sessions they can see (use `storage.foldername(name)`). If the bucket is public already
  (it is: `lesson-files` public=true), write the upload policy only and note that read is public by URL — list in handover as a risk.

---

## D. Frontend specification (files to create / modify)

**Create**
| File | Purpose |
|---|---|
| `src/lib/live-sessions-api.ts` | Typed wrappers: `getLiveSessionState`, `getLiveSessionJoin`, `listStudentUpcoming`, `listAdminUpcoming`, `createLiveSession`, `updateLiveSession`, `cancelLiveSession`, `deleteLiveSession`, `listZoomHosts`, file upload/delete helpers. Map RPC exception codes to Arabic messages (section F). |
| `src/lib/zoom-api.ts` | `startZoomConnect()`, `getZoomStatus()`, `disconnectZoom()`. |
| `src/lib/cairo-time.ts` | `formatCairo(date, 'date'|'time'|'datetime'|'weekday')` via `Intl.DateTimeFormat('ar-EG',{timeZone:'Africa/Cairo',…})`; `cairoLocalToUtcISO(dateYMD, hour12, minute, ampm)` (compute offset using `Intl` parts — do not hard-code +2/+3); `useServerClock(serverNowISO)` hook returning a `now()` corrected by offset. Unit test it in `src/test/cairo-time.test.ts` (summer/winter dates, 12 ص/م edge cases). |
| `src/hooks/use-live-sessions.ts` | react-query hooks + realtime subscription on `live_sessions` (copy channel lifecycle from `use-cart.ts`), refetch interval 60 s. |
| `src/components/zoom/ZoomConnectCard.tsx` | Profile card (F.1). |
| `src/components/live/LiveSessionFormModal.tsx` | Create/edit dialog (F.2). |
| `src/components/live/LiveSessionAdminCard.tsx` | Row/card inside builder & timeline (F.3). |
| `src/components/live/LiveSessionPanel.tsx` | Student content panel (F.4). |
| `src/components/live/CountdownTiles.tsx` | Countdown UI (F.4). |
| `src/components/live/UpcomingLiveSessionsCard.tsx` | Dashboard widget (F.5). |
| `src/components/live/LiveSessionBanner.tsx` | Global banner (F.6). |
| `src/components/live/LiveStatusPill.tsx` | Status chip used everywhere (F.7). |
| `src/components/live/LiveSessionsTimeline.tsx` | Live-course builder view (F.8). |
| `src/components/live/EnrollmentModeCard.tsx` | Enrollment rules card (F.9). |
| `src/lib/ics.ts` | Build `.ics` (VEVENT, UTC times, `SUMMARY`, `URL` = platform session page, never the join URL). |

**Modify (minimum necessary)**
- `src/hooks/use-unit-content-items.ts` — add `"live_session"` to `ContentItemType`; load `live_sessions` for the course's units
  (non-cancelled) as items with `orderIndex = position`, `isCompleted = status in ('completed')`, `isLocked=false`,
  `extra.startAt`, `extra.status`. Keep existing ordering logic; sessions interleave by `position`.
- `src/components/course-content/ContentSidebarItem.tsx` — icon `Radio` for `live_session`, plus `LiveStatusPill size="xs"`.
- `src/pages/CourseContentPage.tsx` — render `LiveSessionPanel` when `contentType==='live_session'`.
- `src/pages/admin/CourseBuilder.tsx` — add "جلسة مباشرة (Zoom)" to each unit's add menu and a header button
  "جدولة جلسة مباشرة"; list sessions inside units using `LiveSessionAdminCard`; for `course_type='live'` render `LiveSessionsTimeline` above units.
- `src/pages/admin/CourseInfoEditor.tsx` — read `?type=live`; persist `course_type`; render `EnrollmentModeCard`; enforce free rule.
- `src/pages/admin/AdminCourses.tsx` — split "new course" into DropdownMenu (مسجّلة / مباشرة); add "مباشر" badge in list rows; add filter Select "النوع".
- `src/components/CourseCard.tsx` — live badge + next session line (only when `course_type='live'`; data via a light RPC or join already loaded — if not available without extra queries per card, show only the badge and note it).
- `src/pages/student/MyCourses.tsx` — insert `UpcomingLiveSessionsCard` at top.
- `src/pages/student/MyAccount.tsx` — render `ZoomConnectCard` only when the user is admin; handle `?zoom=connected|error` query → toast, then strip the query param.
- `src/App.tsx` — mount `<LiveSessionBanner />` directly inside `<AuthProvider>` before `<BadgeCelebration />`.
- `src/components/Navbar.tsx`, `src/components/admin/AdminLayout.tsx`, `src/components/student/StudentLayout.tsx`, `src/components/parent/ParentLayout.tsx`
  — replace `top-0` on sticky headers/sidebars with `top-[var(--live-banner-h,0px)]` and `h-screen` on sticky sidebars with
  `h-[calc(100vh-var(--live-banner-h,0px))]`. Nothing else.
- `src/index.css` — add `:root { --live-banner-h: 0px; } body { padding-top: var(--live-banner-h); }` inside `@layer base`.
- `src/integrations/supabase/types.ts` — regenerated only (never hand-edit).
- `supabase/config.toml` — function blocks from C.4.

---

## E. Execution order (one commit per step)

- **E0** Branch; run `npm ci` (or `npm install` if `ci` fails due to lock mismatch — record which); run `npm run build`, `npm test`,
  `npm run lint` and **record the baseline counts** (lint errors may pre-exist — do not fix unrelated ones). Regenerate types. Commit.
- **E1** C.1 + C.2 migrations → `db push` → verify with SQL: tables exist, RLS on (`select relrowsecurity from pg_class …`). Commit.
- **E2** `_shared/zoom.ts`, `zoom-oauth` function, config, deploy, `src/lib/zoom-api.ts`, `ZoomConnectCard`, MyAccount wiring. Commit.
- **E3** C.3 migration → push → regen types. Verify each RPC with SQL as an admin and as a student (use `set local role authenticated; set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}'` inside a transaction you roll back). Commit.
- **E4** `live-sessions` function + deploy + `live-sessions-api.ts` + `cairo-time.ts` (+ tests) + `LiveSessionFormModal` + CourseBuilder wiring + `LiveSessionAdminCard`. Commit.
- **E5** Content item type, sidebar, `LiveSessionPanel`, `CountdownTiles`, `ics.ts`. Commit.
- **E6** `UpcomingLiveSessionsCard`, `LiveSessionBanner`, layout `top-[var(--live-banner-h)]` changes, reminders cron. Commit.
- **E7** Phase 2: C.5 migration, `EnrollmentModeCard`, CourseInfoEditor/AdminCourses/CourseCard changes, `LiveSessionsTimeline`, session files upload. Commit.
- **E8** Full QA (section G), fix defects, final `npm run build && npm test && npm run lint`, write handover (section H). Commit.

---

## F. UI/UX specification (exact)

General: shadcn components from `src/components/ui/*`; cards `rounded-2xl border border-border/60 bg-card shadow-sm`;
section headings `text-lg font-bold`; secondary text `text-sm text-muted-foreground`; spacing `p-5 md:p-6`, gaps `gap-4`;
icons lucide 18 px (`h-4.5 w-4.5` not available → use `h-5 w-5` for headers, `h-4 w-4` inline). Buttons: primary = default
variant; destructive actions = `variant="destructive"`; secondary = `variant="outline"`. All dialogs: `sm:max-w-lg`, footer buttons
order in RTL: primary first (right). Loading = `Skeleton` blocks matching final layout; empty states = icon in `rounded-full bg-muted p-4`
+ title + one-line hint + optional CTA. Animations: `framer-motion` fade/slide 150–200 ms, respect `prefers-reduced-motion`
(`useReducedMotion()` → no motion). Focus rings must remain visible. All interactive targets ≥ 40 px tall on mobile.

### F.1 ZoomConnectCard (in /admin/account)
- Header: Zoom-blue is NOT allowed (tokens only) → icon `Video` in `rounded-xl bg-primary/10 text-primary p-2.5`; title **"ربط حساب Zoom"**; subtitle **"اربط حسابك لإنشاء الجلسات المباشرة وتسجيلها تلقائياً."**
- Not connected: button **"ربط Zoom"** (icon `Link2`). Loading state "جارٍ التحويل إلى Zoom…".
- Connected: avatar initials circle, `zoom_display_name`, `zoom_email`, chip **"حساب مرخّص"** (`bg-primary/10 text-primary`) or **"حساب مجاني"** (`bg-accent/15 text-accent`),
  "تاريخ الربط: {formatCairo date}". Button **"إلغاء الربط"** (outline, destructive text) → AlertDialog "هل تريد إلغاء ربط Zoom؟" / "لن تتمكن من إنشاء جلسات جديدة حتى تعيد الربط." / "إلغاء الربط" / "تراجع".
- Basic account warning (Alert, amber): **"الحساب المجاني محدود بـ 40 دقيقة لكل اجتماع ولا يدعم التسجيل السحابي."**
- Revoked: Alert destructive **"انتهت صلاحية الربط. يرجى إعادة ربط حساب Zoom."** + button "إعادة الربط".
- Toasts: success **"تم ربط حساب Zoom بنجاح"**; error **"تعذّر ربط حساب Zoom. حاول مرة أخرى."**

### F.2 LiveSessionFormModal
Title "جدولة جلسة مباشرة" / edit "تعديل الجلسة". Fields in order:
1. عنوان الجلسة* (Input, max 200).
2. الوصف (Textarea 3 rows).
3. التاريخ* (Popover + `Calendar` `locale={ar}` `weekStartsOn={6}`, disable past days) — trigger shows `formatCairo(date,'date')`.
4. الوقت* — 3 Selects in one row: الساعة (1–12), الدقيقة (00,05,…,55), ص/م.
5. المدة* Select: 30, 40, 45, 60, 90, 120, 180 دقيقة (default 60).
6. المضيف* Select from `host_admins` (default current user if connected). If list empty → disabled field + inline link "اربط حساب Zoom أولاً" → `/admin/account`.
7. Switch "تسجيل سحابي تلقائي" (default on; disabled + helper "غير متاح للحساب المجاني" when host account type = 1).
8. ملفات الجلسة — dropzone (dashed `border-2 border-dashed rounded-xl p-6`), multi, max 200 MB each, list with size + remove ✕. Uploaded after the session is created to `lesson-files/live/{session_id}/{uuid}-{filename}`.
- Live preview line under time: **"ستبدأ الجلسة {weekday} {date} الساعة {time} بتوقيت القاهرة"**.
- Warnings: duration > 40 and host Basic → amber Alert **"قد ينتهي الاجتماع بعد 40 دقيقة على الحساب المجاني. يمكنك استبدال الرابط أثناء الجلسة."**
- Validation messages: "العنوان مطلوب"، "اختر تاريخاً"، "يجب أن يكون الموعد بعد 5 دقائق على الأقل من الآن"، "اختر المضيف".
- Submit button "جدولة الجلسة" (loading "جارٍ إنشاء اجتماع Zoom…"). Success toast **"تمت جدولة الجلسة وإشعار الطلاب"**.

### F.3 LiveSessionAdminCard
Row: date block (`w-14 rounded-xl bg-primary/10 text-primary text-center` with day number `text-xl font-bold` and short month), title,
`LiveStatusPill`, meta line "{time} · {duration} دقيقة · المضيف: {name}", files count chip. Actions DropdownMenu (`MoreVertical`): تعديل، نسخ رابط صفحة الجلسة، إلغاء الجلسة (destructive, AlertDialog)، حذف (only scheduled/cancelled).
Disabled placeholder button **"ابدأ الجلسة"** with tooltip **"سيتم تفعيله في مرحلة لاحقة"** — leave a `TODO(phase4)` comment. (Phase 4 implements it.)

### F.4 LiveSessionPanel (student) — states from roadmap §1.4
- Container `max-w-3xl mx-auto`, hero card with gradient `bg-gradient-to-br from-primary/10 via-card to-accent/10`.
- Title `text-2xl font-bold`, course title muted, datetime line with `CalendarClock` icon.
- `CountdownTiles`: 4 tiles (أيام/ساعات/دقائق/ثوانٍ), each `rounded-2xl bg-card border w-20 h-20 md:w-24 md:h-24`, number `text-3xl font-bold tabular-nums`, label `text-xs text-muted-foreground`. Hide "أيام" tile when 0. ≤ 10 min → tiles `border-accent/50 text-accent` + `animate-pulse` ring on container (`ring-2 ring-accent/40`).
- Open state: primary large button `h-12 px-8 text-base` **"انضم إلى البث المباشر"** with `Radio` icon; plus auto-opened Dialog titled **"بدأت الجلسة الآن 🎥"** body **"اضغط للانضمام إلى البث المباشر في Zoom."** button **"انضم الآن"** — opened once per `link_version` (track in `sessionStorage`).
- Join click: call `getLiveSessionJoin` → `window.open(url,'_blank','noopener,noreferrer')`; if blocked, show the URL as a link button.
- Error codes → Arabic: `NOT_OPEN_YET` "لم يحن موعد الجلسة بعد"; `SESSION_OVER` "انتهت الجلسة"; `SESSION_CANCELLED` "تم إلغاء هذه الجلسة"; `NOT_ENROLLED` "يجب الالتحاق بالدورة أولاً".
- Ended: card with `Loader2 animate-spin` **"انتهت الجلسة، جارٍ تجهيز التسجيل"**. Completed: **"التسجيلات"** list placeholder (Phase 3 fills it) — show "لا توجد تسجيلات بعد".
- Cancelled: muted card **"تم إلغاء هذه الجلسة"**.
- Files list: rows with file icon by type, name, size, download button (respect `allow_download`).
- Buttons secondary: **"أضف إلى التقويم"** (`.ics`), **"نسخ الموعد"**.

### F.5 UpcomingLiveSessionsCard (dashboard top)
Title **"الجلسات المباشرة القادمة"** with `Radio` icon; up to 5 rows (7-day window): 48 px rounded thumbnail, session title, course title muted,
relative time via `date-fns/formatDistanceToNowStrict` `locale: ar` ("بعد ساعتين"), `LiveStatusPill`, CTA ("انضم" if live/open, else "التفاصيل").
Empty → render **nothing** (do not show an empty card).

### F.6 LiveSessionBanner
- Visible for students: earliest session where `status='live'` or (`scheduled` and starts within 30 min) or (`scheduled` and started ≤ duration ago).
  For admins: sessions they host with same window. Hidden when the user is not logged in.
- Layout: `fixed top-0 inset-x-0 z-[60] h-11 flex items-center justify-center gap-3 px-4 text-sm font-medium`.
  - Soon: `bg-accent text-accent-foreground`, icon `Clock`, text **"تبدأ جلسة «{title}» خلال {mm:ss}"**.
  - Live: `bg-destructive text-destructive-foreground`, pulsing dot (`h-2 w-2 rounded-full bg-current animate-ping` with static dot overlay), text **"مباشر الآن: «{title}» — {course}"**.
  - Admin variant text: **"جلستك «{title}» تبدأ خلال {mm:ss}"**.
  - Button `size="sm" variant="secondary" className="h-7"`: "انضم الآن" / "التفاصيل" (admin: "فتح الجلسة") → navigates to the session page.
  - Dismiss ✕ `aria-label="إخفاء"`; key `live-banner-dismissed:{id}:{link_version}` in sessionStorage.
- Mobile < 640 px: truncate title (`truncate max-w-[45vw]`), hide course name.
- Sets `document.documentElement.style.setProperty('--live-banner-h', visible ? '44px' : '0px')` in an effect; reset on unmount.
- Entry/exit animation: slide down 200 ms.

### F.7 LiveStatusPill
`scheduled` "مجدولة" `bg-primary/10 text-primary`; `live` "مباشر" `bg-destructive/15 text-destructive` + dot; `ended` "انتهت" `bg-muted text-muted-foreground`;
`completed` "مكتملة" `bg-secondary text-secondary-foreground` + `CheckCircle2`; `cancelled` "ملغاة" `bg-muted text-muted-foreground line-through`.
Sizes `xs` (`text-[10px] px-1.5 py-0.5`) and `sm` (`text-xs px-2 py-0.5`), `rounded-full font-semibold`.

### F.8 LiveSessionsTimeline (live courses)
Vertical timeline: `border-s-2 border-border` line, each item a dot (`h-3 w-3 rounded-full`, colour by status) and a `LiveSessionAdminCard`.
Groups by Cairo month header (`text-sm font-semibold text-muted-foreground`). Header button **"إضافة جلسة"** opens the modal with `create_unit_title = title`.
Empty: icon `CalendarPlus`, **"لا توجد جلسات بعد"**, hint **"أضف أول جلسة مباشرة لهذه الدورة"**, CTA "إضافة جلسة".

### F.9 EnrollmentModeCard
Card title **"طريقة الالتحاق"**. RadioGroup with 3 options as bordered selectable tiles (`rounded-xl border p-4`, selected `border-primary bg-primary/5`):
- **"عادية"** — "يلتحق الطالب بالشراء أو التسجيل المجاني من صفحة الدورة."
- **"لجميع طلاب المنصة"** — "يُسجَّل كل الطلاب الحاليين والجدد تلقائياً."
- **"لصفوف محددة"** — "يُسجَّل طلاب الصفوف المختارة في الدورة تلقائياً."
Auto options disabled when course is paid, with helper **"متاح للدورات المجانية فقط"**. `auto_stages` with zero stages → inline error **"اختر صفاً واحداً على الأقل"**.
On save with auto mode show toast **"تم تسجيل {n} طالب تلقائياً"** (n from `apply_course_auto_enrollment` — call it explicitly after save to get the count; trigger also runs, the function is idempotent).

### F.10 Dark mode & responsiveness
Verify every new component in light and dark (`ThemeToggle`) and at 375 px, 768 px, 1280 px. No horizontal scroll. Banner + sticky headers must not overlap.

---

## G. Verification

### G.1 Automated
`npm run build` (0 errors), `npm test` (all pass incl. new `cairo-time.test.ts`), `npm run lint` (no **new** errors vs baseline; report counts).

### G.2 Manual QA script (run with `npm run dev`, port 8080; use the built-in browser if you have one)
1. Admin → الملف الشخصي → ZoomConnectCard shows "ربط Zoom". (If ZOOM secrets exist: complete OAuth; card shows connected + account type.)
2. Builder of an existing course → "جدولة جلسة مباشرة" → fill → session appears in unit with pill "مجدولة". Zoom meeting exists (`GET /meetings/{id}` OK).
3. Student enrolled in that course → sidebar shows the session item → panel shows countdown in Cairo time.
4. Set a session to start in 2 minutes (SQL update `scheduled_start_at`) → banner appears (amber) on every page incl. `/`, `/dashboard`, course page; headers sit below it.
5. At T-0 the panel switches to open state without reload; modal appears once; join opens Zoom URL.
6. Student NOT enrolled → calling `get_live_session_join` returns `NOT_ENROLLED`; direct `select * from live_session_segments` returns 0 rows.
7. Before start, `get_live_session_join` → `NOT_OPEN_YET` even if client clock is moved forward.
8. Reminders: set start = now()+58 min → within 2 minutes one `live_session_reminder_60` notification per enrolled student; no duplicates after 5 minutes.
9. Cancel session → students get `live_session_cancelled`, panel shows cancelled.
10. Phase 2: create live course (free, `auto_stages` with one stage) → publish → all students of that stage enrolled; create a new student in that stage → auto-enrolled; set course paid → UI blocks auto modes; DB rejects `update courses set is_paid=true` while mode is auto (CHECK error).
11. Course card shows "مباشر" badge; AdminCourses filter by type works.
12. Light/dark + 375 px screenshots of: ZoomConnectCard, form modal, panel (upcoming/open), banner, dashboard card, timeline, enrollment card.

### G.3 Regression
Open an existing recorded course as student: lessons, quiz, assignment open and complete as before. Purchase modal opens. Admin course edit saves. Notification bell works.

---

## H. Handover document (mandatory)

Create `docs/handover/PHASE-01-HANDOVER.md` with exactly these sections:
1. **Summary** — 5–10 bullet outcomes.
2. **Step log** — for each E0…E8: what was done, files touched (paths), commit hash, commands run and their result (pass/fail + counts).
3. **Database changes** — every table/column/constraint/function/trigger/policy/cron job created, with migration file name; output of verification SQL.
4. **Edge functions** — name, routes/actions, auth mode, required secrets (names only), deploy result.
5. **Frontend changes** — new components (with one-line purpose), modified files (with what changed), new routes.
6. **UI evidence** — list of screenshots taken (path under `docs/handover/screens/phase-01/`) for light/dark/mobile.
7. **QA results** — table of G.2 items: ID, result (PASS/FAIL/BLOCKED), evidence/notes.
8. **Assumptions** — every `ASSUMPTION:` you made, with file:line.
9. **Unplanned changes** — anything outside section D, with justification.
10. **Known issues / blockers** — including missing secrets, Zoom setup steps the owner must do (Marketplace app, redirect URL, scopes, event subscriptions — list exactly), and anything not verified.
11. **Baseline vs final** — lint/test/build counts before and after.
12. **Next-phase notes** — anything Phase 3/4 must know (e.g. TODO(phase4) locations).

Do not claim something works unless you ran it. If you could not run it, say **NOT VERIFIED** and why.
Stop after writing the handover. Do not start Phase 3.
