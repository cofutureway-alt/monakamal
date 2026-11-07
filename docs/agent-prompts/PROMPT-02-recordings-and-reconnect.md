# EXECUTION PROMPT 02 — Phase-1 fixes + Recordings to R2 (Phase 3) + Reconnect & Calendars (Phase 4)

You are the implementation agent. Follow this document **literally**. Same rules as Prompt 01 apply in full;
the ones that changed or matter most are repeated here. If you would have to guess, choose the most conservative
option, mark it `ASSUMPTION:` in a code comment, and list it in the handover. Do not expand scope.

Read first, fully:
1. `docs/LIVE_AND_AI_ROADMAP.md` §0, §1, Part 1 §1.7–1.9.
2. `docs/handover/PHASE-01-HANDOVER.md` and **`docs/handover/PHASE-01-REVIEW.md`** (defects F1–F9).
3. Existing code from Phase 1: `supabase/functions/_shared/zoom.ts`, `supabase/functions/zoom-oauth/index.ts`,
   `supabase/functions/live-sessions/index.ts`, all four `supabase/migrations/20261107*.sql`,
   `src/hooks/use-live-sessions.ts`, `src/lib/live-sessions-api.ts`, `src/lib/cairo-time.ts`,
   `src/components/live/*`, `src/components/lesson/LessonVideoPlayer.tsx`, `src/lib/video.ts`,
   `src/components/lesson/Watermark.tsx`, `src/pages/admin/CourseBuilder.tsx`, `src/components/admin/AdminLayout.tsx`,
   `src/components/student/StudentLayout.tsx`, `src/App.tsx`.

---

## A. Hard rules (violating any = task failed)

1. **Secrets** only from env vars; never in files, commits, logs, screenshots or the handover. Available env vars:
   `SUPABASE_ACCESS_TOKEN`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `ZOOM_WEBHOOK_SECRET_TOKEN`, `QA_ADMIN_LOGIN`,
   `QA_ADMIN_PASSWORD`, `QA_STUDENT_LOGIN`, `QA_STUDENT_PASSWORD`. Any that are missing → implement, skip that runtime
   test, mark **BLOCKED** in the handover. You generate random values yourself (`openssl rand -hex 32`) for:
   `ZOOM_STATE_SECRET` (only if not already set), `MEDIA_SIGNING_SECRET`, `INGEST_SECRET`, `LIVE_CRON_SECRET`. Set each
   in **both** places that need it without echoing it (pipe it into `supabase secrets set` / `wrangler secret put`).
2. **Git:** continue on branch `feat/live-sessions-p1`. **One commit per step in section E (mandatory this time)**,
   message `feat(live): <step id> <summary>`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
   Never commit `.wrangler/`, `.env`, `supabase/.temp/`, `workers/live-media/.dev.vars`. Do not push.
3. **Scope:** only files listed in section D. Anything else → "Unplanned changes" in the handover with justification.
4. **No new npm dependencies in the web app.** The Worker may use only the Workers runtime (no npm packages).
5. **DB:** RLS on every new table; `SECURITY DEFINER` functions set `search_path = public`, check the caller, revoke from
   `public`, grant explicitly. Idempotent migrations named `20261108HHMMSS_<phase>_<topic>.sql`.
6. **Server time decides** every unlock/start window.
7. **Arabic UI, RTL, Tailwind tokens only** (no hex, no inline colours). Use the exact strings in section F.
8. **Do not break existing behaviour.** Run the regression list in G.3.
9. Never disable lint rules, tests, RLS or type checks. No `@ts-ignore`.
10. **Do not claim anything works unless you ran it.** Unrun = **NOT VERIFIED** with the reason.

---

## B. Verified environment facts (do not rediscover)

- Supabase ref `lhzawomzzuhfalvdgjcd`; functions base `https://lhzawomzzuhfalvdgjcd.supabase.co/functions/v1`.
- `pg_net` is installed (Phase 1). `pg_cron` installed. `supabase_vault` installed.
- Wrangler 4.137 is logged in to the owner's Cloudflare account. Existing R2 buckets there are unrelated, so **do not touch them**.
- `video_provider` enum = `youtube | bunny | vimeo`. `LessonVideoPlayer` uses Plyr.
- Edge Function wall-clock limit: assume **150 s**. Worker memory: assume **128 MB**.
- Instructor = admin. Display time zone `Africa/Cairo`. Week starts Saturday.

---

## C. Backend specification

### C.0 Phase-1 fixes (do these first, step E1)
Implement F1–F9 from `PHASE-01-REVIEW.md` exactly as the "Required fix" column says. Specifics:
- **F1** `use-live-sessions.ts`: keys become `[LIVE_SESSIONS_KEY,"student-upcoming"]` and `[LIVE_SESSIONS_KEY,"admin-upcoming"]`;
  `windowBounds(8, 24*7)` is called inside `queryFn`. Add a unit test `src/test/live-query-keys.test.ts` asserting that two
  calls of the exported key builder return deep-equal arrays.
- **F2** `getValidAccessToken`: keep the refresh token you read as `usedRefresh`. On refresh failure re-select the row;
  if `row.refresh_token !== usedRefresh` return `row.access_token`; otherwise mark revoked **only if** the error body includes
  `invalid_grant` (Zoom wording: also accept `"Invalid Token"`); else rethrow as `ZOOM_REFRESH_FAILED`. Update with
  `.eq("refresh_token", usedRefresh)` (compare-and-swap); if 0 rows updated, re-read and return the stored access token.
- **F3** `LiveSessionPanel`: implement as specified; use `refetch` from `useLiveSessionState`.
- **F4** Apply the pre-open pattern in **every** place that opens a Zoom URL (panel, global dialog C.7, admin start/replace).
  Put it in one helper `openExternalAfter(promise: Promise<string>)` in `src/lib/open-external.ts`.
- **F5, F6, F7, F8, F9**: as specified. F7 and F9 (trigger) go in migration `20261108000000_live_fix_p1.sql`.

### C.1 Migration `20261108000100_live_p3_enum.sql` (alone, an enum value cannot be used in the same transaction)
`alter type public.video_provider add value if not exists 'r2';`

### C.2 Migration `20261108000200_live_p3_recordings.sql`
```sql
create table if not exists public.live_recordings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  segment_id uuid references public.live_session_segments(id) on delete set null,
  source text not null check (source in ('zoom_cloud','manual_upload')),
  zoom_file_id text unique,                 -- null for manual uploads
  recording_type text,                      -- e.g. shared_screen_with_speaker_view
  file_size bigint,
  recording_start timestamptz,
  recording_end timestamptz,
  download_url text,
  download_token text,                      -- from webhook payload, ~24 h validity
  status text not null default 'pending'
    check (status in ('pending','uploading','ready','failed','skipped')),
  attempts int not null default 0,
  last_error text,
  upload_id text, parts jsonb not null default '[]'::jsonb, bytes_done bigint not null default 0,
  part_size bigint not null default 33554432,   -- 32 MiB
  r2_key text,
  part_index int,                           -- 1-based position among the session's ready recordings
  lesson_id uuid references public.lessons(id) on delete set null,
  locked_until timestamptz,                 -- worker lease
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists live_recordings_session_idx on public.live_recordings(session_id);
create index if not exists live_recordings_status_idx on public.live_recordings(status);
```
- RLS on; admin `select` only; no other policies (writes = service role).
- `updated_at` trigger (reuse `public.update_updated_at_column`).
- Add `live_sessions.no_recording_reason text` (null).
- `public.live_recording_claim_next() returns setof live_recordings` (service_role only): `update … set locked_until = now()+interval '3 min', status='uploading', attempts = attempts+1 where id = (select id from live_recordings where status in ('pending','uploading') and (locked_until is null or locked_until < now()) and attempts < 8 order by created_at limit 1 for update skip locked) returning *`.
- `public.live_session_finalize(_session_id uuid) returns void` (service_role only), idempotent:
  1. If session status not in (`ended`,`completed`) → return.
  2. If any recording of the session has status `pending` or `uploading` → return.
  3. Ready recordings ordered by `coalesce(recording_start, created_at)` get `part_index = row_number()`.
  4. For each ready recording: if `lesson_id` is null insert a lesson into `session.unit_id` (if unit_id is null: create a unit
     titled the session title in the course, set `live_sessions.unit_id`) with `title = session.title || ' — الجزء ' || part_index`,
     `video_provider = 'r2'`, `video_url = r2_key`, `position = session.position + part_index`; else update its title/position.
     Before inserting, shift positions: `update lessons set position = position + <count> where unit_id = … and position > session.position and id not in (recording lessons)`. Do the same for `live_sessions.position` in that unit.
  5. Set session `status='completed'`. Insert one `live_recording_ready` notification per enrolled student (action_url = first part lesson route
     `/courses/{course}/learn/lesson/{lesson_id}`) **only the first time** (use `live_session_notification_log` kind `recording_ready`).
- Cron jobs (unschedule-then-schedule pattern):
  - `live_recording_ingest` every minute: `select net.http_post(url := <base>/recording-ingest-tick, headers := jsonb_build_object('x-cron-secret', <secret>, 'content-type','application/json'), body := '{}'::jsonb, timeout_milliseconds := 1000)`.
    Read `<base>` and `<secret>` from Vault: create secrets named `live_functions_base_url` and `live_cron_secret`
    with `vault.create_secret(...)` (if a secret with that name exists, use `vault.update_secret`). The value of `live_cron_secret`
    is the same random `LIVE_CRON_SECRET` set on the edge function. Do it with a one-off SQL command that is **not** saved in a migration file.
    The migration reads them via `(select decrypted_secret from vault.decrypted_secrets where name = '…')`.
  - `live_session_auto_end` every 5 min, SQL function `public.live_session_auto_end()`:
    sessions with status in (`scheduled`,`live`) and `now() > scheduled_start_at + duration + 60 min` → `status='ended'`, `ended_at=now()`,
    close the current segment (`ended_at`). Then: if `recording_enabled = false` or the host's `zoom_account_type = 1` → `no_recording_reason = 'disabled'|'basic_account'` and call `live_session_finalize` (which completes with zero parts).
    Also: sessions `ended` for more than 24 h with zero recordings → `status='completed'`, `no_recording_reason='not_received'`, notify the host
    (type `live_recording_missing`, title `لم يصل تسجيل الجلسة`).

### C.3 Cloudflare R2 + Worker `workers/live-media/`
- Create bucket: `npx wrangler r2 bucket create mona-live-recordings --location weur`. Private (no public access, no r2.dev).
- Bucket CORS (`npx wrangler r2 bucket cors set` with a JSON file `workers/live-media/r2-cors.json`): origins
  `https://www.miss-mona-kamel.com`, `https://miss-mona-kamel.com`, `http://localhost:8080`; methods `GET, HEAD, PUT`; headers `*`; expose `ETag, Content-Range, Accept-Ranges, Content-Length`.
- Files: `workers/live-media/wrangler.toml` (name `mona-live-media`, `main = "src/index.ts"`, `compatibility_date = "2026-10-01"`,
  `[[r2_buckets]] binding = "RECORDINGS" bucket_name = "mona-live-recordings"`, `workers_dev = true`), `src/index.ts`, `README.md`.
  Secrets: `INGEST_SECRET`, `MEDIA_SIGNING_SECRET`.
- **Auth helpers:** `hmacHex(secret, msg)`; constant-time compare.
  - Ingest calls: headers `X-Ts` (unix seconds) and `X-Signature = hmacHex(INGEST_SECRET, ts + "." + rawBody)`; reject if `|now−ts| > 300`.
  - Media tokens: query `exp` (unix s), `u` (user id), `sig = hmacHex(MEDIA_SIGNING_SECRET, method + "|" + key + "|" + u + "|" + exp)`.
- **Routes:**
  - `POST /ingest/create` `{key, contentType}` → `RECORDINGS.createMultipartUpload(key, {httpMetadata:{contentType}})` → `{uploadId}`.
  - `POST /ingest/part` `{key, uploadId, partNumber, sourceUrl, rangeStart, rangeEnd}` → `fetch(sourceUrl, {headers:{Range:`bytes=${a}-${b}`}, redirect:"follow"})`.
    If status 206 → `upload.uploadPart(partNumber, resp.body)` → `{etag, bytes}`; if 200 (range ignored) → `{rangeUnsupported:true}` and
    **cancel the body** without reading; other status → 502 `{error:"SOURCE_<status>"}`.
  - `POST /ingest/complete` `{key, uploadId, parts:[{partNumber, etag}]}` → `complete` → `{size}`.
  - `POST /ingest/abort` `{key, uploadId}`.
  - `POST /ingest/single` `{key, sourceUrl, size, contentType}` (fallback when range unsupported and `size <= 4.5 GiB`):
    `const r = await fetch(sourceUrl)`; `RECORDINGS.put(key, r.body.pipeThrough(new FixedLengthStream(size)), {httpMetadata:{contentType}})`.
  - `GET|HEAD /media/<key>?u&exp&sig` → validate (method in the signature is `GET` for both GET and HEAD); supports `Range`
    (`RECORDINGS.get(key, {range: request.headers, onlyIf: request.headers})`), returns `206` with `Content-Range` or `200`,
    `Accept-Ranges: bytes`, `Content-Type` from metadata, `Cache-Control: private, no-store`, CORS for the allowed origins.
  - `PUT /upload/<key>?u&exp&sig` (method `PUT` in signature; max 5 GiB; body streamed with `RECORDINGS.put(key, request.body)` requiring `Content-Length`).
  - Anything else → 404. Errors are JSON `{error}`. Never log tokens or query strings.
- Deploy: `npx wrangler deploy` inside `workers/live-media`. Record the `*.workers.dev` URL; set it as edge secret `MEDIA_BASE_URL`.

### C.4 Edge function `zoom-webhook` (`verify_jwt = false`)
- Read the raw body as text first. `endpoint.url_validation` → respond `{plainToken, encryptedToken: hmacHex(ZOOM_WEBHOOK_SECRET_TOKEN, plainToken)}`.
- All other events: require `x-zm-signature === "v0=" + hmacHex(secret, "v0:" + x-zm-request-timestamp + ":" + rawBody)` and timestamp within 300 s, else 401.
- Find the segment by `zoom_meeting_uuid = payload.object.uuid` or, if not found, `zoom_meeting_id = payload.object.id` (latest segment). Unknown meeting → 200 `{ignored:true}`.
- `meeting.started` → `segment.started_at = coalesce(started_at, now())`; session: if `scheduled` → `live`, `started_at = coalesce(started_at, now())`; notify enrolled students `live_session_started` (dedupe with notification_log kind `started`).
- `meeting.ended` → `segment.ended_at = now()` only. **Never** end the session here.
- `recording.completed` → for each file in `payload.object.recording_files` where `file_type = 'MP4'` and `status = 'completed'`: keep the best file
  **per recording time slice** (group by `recording_start`), preference `shared_screen_with_speaker_view` > `shared_screen_with_speaker_view(CC)` > `speaker_view` > `active_speaker` > `gallery_view` > `shared_screen`. Upsert into `live_recordings` on `zoom_file_id` with `source='zoom_cloud'`, `download_url`, `download_token = payload.download_token`, `file_size`, `recording_start/end`, `recording_type`, `status='pending'` (do not reset a row that is already `ready`).
- `app_deauthorized` → find `zoom_connections` by `zoom_user_id = payload.user_id`, delete secrets, set `status='revoked'`.
- Always respond within 3 s (do DB work, no Zoom downloads here).

### C.5 Edge function `recording-ingest-tick` (`verify_jwt = false`, requires header `x-cron-secret === LIVE_CRON_SECRET`, else 401)
Loop until 110 s elapsed or no job:
1. `rpc('live_recording_claim_next')` → job or exit.
2. Source URL: `download_url + "?access_token=" + (download_token ?? getValidAccessToken(host))`. If the job is older than 20 h and still pending, use the host OAuth token.
3. If `upload_id` is null: call Worker `/ingest/create` with key `live/{course_id}/{session_id}/{recording_id}.mp4`
   and save `upload_id` and `r2_key`. (Range support is detected by part 1 itself, see step 4.)
4. Upload parts sequentially from `bytes_done`: `rangeStart = bytes_done`, `rangeEnd = min(bytes_done + part_size, file_size) - 1`,
   `partNumber = parts.length + 1`. After each part append `{partNumber, etag}` and update `bytes_done`, renew `locked_until = now()+3 min`.
   If the Worker answers `rangeUnsupported` on part 1 → abort the multipart, call `/ingest/single`, then mark ready.
5. When `bytes_done >= file_size` → `/ingest/complete` → `status='ready'`, clear `locked_until`, then `rpc('live_session_finalize', {_session_id})`.
6. Errors: save `last_error` (≤ 500 chars, no tokens), `status='pending'`, `locked_until = now() + (2^attempts) minutes`. At `attempts >= 8` → `failed`, notify the host `live_recording_failed`.
7. Before starting a job, if `file_size` is null → fail it with `last_error='NO_SIZE'`.
8. Optional setting `delete_zoom_after_ingest`: **do not implement** (leave a comment).

### C.6 Edge function `live-media` (`verify_jwt = true`), body `{action, …}`
- `playback_url` `{lesson_id}` → lesson must have `video_provider='r2'`; caller admin, **or** enrolled in the lesson's course **and** the
  lesson is not locked for them (reuse `is_enrolled_in_lesson_course` RPC if its signature fits; else `is_enrolled_in_course`).
  Returns `{url: MEDIA_BASE_URL + "/media/" + key + "?u=…&exp=now+4h&sig=…", expires_at}`.
- `upload_url` `{session_id, file_name, file_size, content_type}` (admin only) → creates a `live_recordings` row `source='manual_upload'`,
  `status='uploading'`, `r2_key=live/{course}/{session}/{id}.mp4`; returns signed `PUT` URL (exp 2 h) and `recording_id`.
- `upload_complete` `{recording_id, recording_start?}` (admin) → `HEAD` the object via a signed media URL to confirm it exists, set
  `status='ready'`, `file_size`, `recording_start = coalesce(given, now())`; if session is `live`/`scheduled` leave it; then `live_session_finalize`.
- `retry_recording` `{recording_id}` (admin) → `status='pending'`, `attempts=0`, `locked_until=null`, `last_error=null`.
- `list_recordings` `{session_id}` (admin) → rows without `download_url`/`download_token`.

### C.7 `live-sessions` new actions (Phase 4)
- `start` `{session_id}`: caller admin; status in (`scheduled`,`live`); `now() >= scheduled_start_at - 10 min` and
  `now() <= scheduled_start_at + duration + 120 min` (else `START_NOT_AVAILABLE`, 409). For the current segment: if `source='zoom_api'`,
  `GET /meetings/{zoom_meeting_id}` with the **host's** token, store fresh `start_url` + `start_url_fetched_at`; for `manual_url` return `join_url`.
  Set session `status='live'`, `started_at = coalesce(started_at, now())`, segment `started_at = coalesce(…)`. Notify `live_session_started` (dedupe kind `started`). Return `{start_url}`.
- `replace_link` `{session_id, mode: 'zoom_new'|'manual', manual_url?, reason: 'disconnect'|'time_limit'|'technical'|'other'}`:
  status must be `live` (else 409 `SESSION_NOT_LIVE`). `zoom_new` → `POST /users/me/meetings` `type:1` (instant) with the same settings as
  create (`auto_recording` per session). `manual` → URL must match `^https://([a-z0-9-]+\.)?zoom\.us/(j|w|my)/[A-Za-z0-9?=&._-]+$` (else 400 `INVALID_URL`).
  In this order: close the old segment (`ended_at=now()`); insert segment `segment_index = max+1`, `replace_reason`; insert secrets;
  `update live_sessions set current_segment_id = new, link_version = link_version + 1`. Notify enrolled students `live_session_link_replaced`
  (title `تم تحديث رابط البث`, **no dedupe**). Return `{start_url, segment_index, link_version}`.
- `end` `{session_id}`: status `live` or `scheduled` past start → `status='ended'`, `ended_at=now()`, close the current segment, call
  `live_session_finalize` via RPC (it returns early while recordings are pending).
- Add `i_joined boolean` to `get_live_session_state` (exists in `live_session_attendance` for caller) and `recordings` array:
  `[{part_index, lesson_id, status}]` ordered by `part_index` for ready ones, plus `processing_count`. Migration `20261108000300_live_p4_state.sql`.
- Add RPC `admin_live_sessions_range(_from, _to, _course uuid default null, _host uuid default null, _status text default null)` (admin only) for the calendar; same columns as `admin_upcoming_live_sessions` + `segment_count`, `attendee_count`. Add `student_live_sessions_range(_from,_to)` (enrolled only, cancelled included). Both: no 50 limit, max range 62 days (raise `RANGE_TOO_LARGE`).

---

## D. Frontend specification (files)

**Create**
| File | Purpose |
|---|---|
| `src/lib/open-external.ts` | F4 helper. |
| `src/lib/live-media-api.ts` | `getPlaybackUrl(lessonId)`, `requestUploadUrl`, `completeUpload`, `retryRecording`, `listRecordings`. |
| `src/components/live/LiveRecordingsTab.tsx` | Admin recordings list per session (F.3). |
| `src/components/live/ManualRecordingUpload.tsx` | Upload with XHR progress to signed PUT URL (F.3). |
| `src/components/live/StartMeetingButton.tsx` | Start / replace / end controls (F.1). |
| `src/components/live/ReplaceLinkDialog.tsx` | F.2. |
| `src/components/live/LinkReplacedDialog.tsx` | Global student dialog (F.4), mounted in `App.tsx` next to the banner. |
| `src/components/live/LiveCalendar.tsx` + `src/components/live/calendar/MonthGrid.tsx`, `WeekGrid.tsx`, `AgendaList.tsx`, `EventSheet.tsx` | F.5. |
| `src/pages/student/StudentLiveCalendar.tsx` | Route `/dashboard/calendar`. |
| `src/pages/admin/AdminLiveCalendar.tsx` | Route `/admin/live-calendar`. |
| `src/pages/admin/AdminLiveSessions.tsx` | Route `/admin/live-sessions`: table of all sessions (filters as calendar) with the admin card actions. |
| `workers/live-media/*` | C.3. |
| `supabase/functions/zoom-webhook/index.ts`, `recording-ingest-tick/index.ts`, `live-media/index.ts` | C.4–C.6. |

**Modify (minimum)**
- `src/lib/video.ts`: add `"r2"` to `VideoProvider`; `parseVideoUrl('r2', key)` returns `{provider:'r2', id:key, url:key}` without validation.
- `LessonVideoPlayer.tsx`: for `r2`, call `getPlaybackUrl` (react-query, `staleTime` 3 h), render Plyr with an HTML5 `<video playsInline preload="metadata" controlsList="nodownload" oncontextmenu=prevent>` source; keep `Watermark`. Refresh the URL on a `403` media error once.
- `LessonModal.tsx` (admin): when a lesson has provider `r2`, show the provider as read-only text `تسجيل جلسة مباشرة` and hide the URL input (admins must not edit the key by hand).
- `LiveSessionAdminCard.tsx`: replace the disabled placeholder with `<StartMeetingButton>`; add a "التسجيلات" action that opens a `Sheet` containing `LiveRecordingsTab`; show attendee count chip `{n} حاضر` when > 0.
- `LiveSessionPanel.tsx`: F1–F4 fixes; `completed` state lists parts (F.6); `ended` state shows `processing_count`.
- `LiveSessionBanner.tsx`: F6.
- `use-live-sessions.ts`: F1; add `useLiveSessionsRange(kind, from, to, filters)`.
- `AdminLayout.tsx` NAV: new group `{ id: "live", label: "البث المباشر", icon: Radio, children: [ {to:"/admin/live-sessions", label:"الجلسات", icon: Video}, {to:"/admin/live-calendar", label:"التقويم", icon: CalendarDays} ] }` placed directly after the "المحتوى التعليمي" group.
- `StudentLayout.tsx` nav: insert `{ to: "/dashboard/calendar", label: "التقويم", icon: CalendarDays }` after "دوراتي".
- `App.tsx`: three routes above; mount `<LinkReplacedDialog />` after `<LiveSessionBanner />`.
- `supabase/config.toml`: `[functions.zoom-webhook] verify_jwt=false`, `[functions.recording-ingest-tick] verify_jwt=false`, `[functions.live-media] verify_jwt=true`.
- `.gitignore`: `workers/live-media/.dev.vars`, `workers/live-media/node_modules`.
- `src/integrations/supabase/types.ts`: regenerate only.

---

## E. Execution order (one commit per step, mandatory)

- **E0** Pull state: `git status` clean; run `npm run build`, `npm test`, `npm run lint` and record counts as the new baseline.
- **E1** Fixes F1–F9 + migration `…000000_live_fix_p1.sql` + test from C.0. Deploy `zoom-oauth`, `live-sessions`.
- **E2** C.1 + C.2 migrations (without cron jobs that need Vault values yet) → push → regen types.
- **E3** R2 bucket, CORS, Worker, deploy, Worker secrets. Verify with `curl`: unsigned `GET /media/x` → 403; bad ingest signature → 401.
- **E4** `zoom-webhook` deploy. In the Zoom app set the event URL and validate it (the Marketplace "Validate" button must succeed; if you cannot click it, mark BLOCKED). Verify a forged signature → 401 with `curl`.
- **E5** `recording-ingest-tick` + Vault secrets + cron jobs. Verify `x-cron-secret` missing → 401. End-to-end ingestion test (G.2 #6).
- **E6** `live-media` function, `video.ts`, `LessonVideoPlayer`, `LessonModal`, recordings tab, manual upload, panel completed state.
- **E7** Phase 4 backend (C.7 + migration `…000300`), `StartMeetingButton`, `ReplaceLinkDialog`, `LinkReplacedDialog`.
- **E8** Calendars + `AdminLiveSessions` + nav + routes.
- **E9** QA (section G), fixes, final build/test/lint, handover. Each fix from QA is its own commit `fix(live): …`.

---

## F. UI/UX specification (exact)

General rules from Prompt 01 §F still apply (cards `rounded-2xl border border-border/60 bg-card shadow-sm`, tokens only, skeletons,
empty states, `framer-motion` 150–200 ms honouring reduced motion, ≥ 40 px targets on mobile, primary button first in RTL).

### F.1 StartMeetingButton (inside LiveSessionAdminCard and the banner target page)
- Before `start − 10 min`: disabled outline button **"ابدأ الجلسة"** + Tooltip **"يتاح قبل الموعد بـ 10 دقائق"** + small countdown `text-xs text-muted-foreground tabular-nums` "بعد {hh:mm:ss}". Use server offset from `get_live_session_state`.
- From `start − 10 min` (status `scheduled`): primary button **"ابدأ الجلسة"** with `Play` icon, pulsing ring `ring-2 ring-primary/40 animate-pulse` during the last 2 minutes before start.
  Click → pre-open tab (F4 helper) → `start` → navigate the tab to `start_url`. Error `ZOOM_REVOKED` → toast + link to `/admin/account`.
- Status `live`: two buttons in a row: **"تحديث / استبدال رابط الاجتماع"** (outline, `RefreshCw`) → `ReplaceLinkDialog`; **"فتح Zoom كمضيف"** (ghost, `ExternalLink`) → `start` again (fresh start URL). Below them a small destructive-text button **"إنهاء الجلسة"** → AlertDialog: title "إنهاء الجلسة؟"، body "سيتم إغلاق الجلسة للطلاب وبدء تجهيز التسجيلات."، actions "إنهاء الجلسة" (destructive) / "تراجع".
- Show `الجزء {segment_count}` chip when `segment_count > 1`.

### F.2 ReplaceLinkDialog
Title **"استبدال رابط الاجتماع"**; description **"استخدم هذا الخيار إذا انقطع الاجتماع أو انتهت مدة الـ 40 دقيقة. سيظهر للطلاب الحاضرين تنبيه فوري للانضمام بالرابط الجديد."**
- `Tabs`: **"اجتماع Zoom جديد تلقائياً"** (default; body text "سيُنشأ اجتماع فوري على حساب المضيف ويُفتح لك مباشرة.") and **"لصق رابط يدوي"** (Input `dir="ltr"` placeholder `https://zoom.us/j/...`, error "رابط Zoom غير صالح"; helper Alert amber "الروابط اليدوية لا تُسجَّل تلقائياً — ارفع التسجيل يدوياً بعد الجلسة.").
- Required `Select` **"السبب"**: انقطاع الاتصال / انتهاء مدة الـ 40 دقيقة / مشكلة تقنية / سبب آخر.
- Footer: primary **"استبدال وإشعار الطلاب"** (loading "جارٍ الاستبدال…"), outline "إلغاء". Success toast **"تم تحديث الرابط وإشعار الطلاب"**; the host tab opens the new `start_url` (F4).

### F.3 LiveRecordingsTab + ManualRecordingUpload
- Sheet title **"تسجيلات الجلسة"**, side = left (RTL end), width `sm:max-w-xl`.
- Row per recording: `الجزء {part_index ?? '—'}`, type label (map: shared_screen_with_speaker_view → "الشاشة + المتحدث", speaker_view → "المتحدث", gallery_view → "المعرض", shared_screen → "الشاشة", manual → "رفع يدوي"), size, time range (Cairo), status pill:
  pending "في الانتظار" (`bg-muted`), uploading "جارٍ النقل" (`bg-primary/10 text-primary`) + `Progress` value `bytes_done/file_size`, ready "جاهز" (`bg-secondary`) + link "فتح الدرس", failed "فشل" (`bg-destructive/15 text-destructive`) + `last_error` in `text-xs` + button **"إعادة المحاولة"**.
- Poll every 10 s while any row is pending/uploading.
- Empty: icon `Film`, **"لا توجد تسجيلات بعد"**, hint: if host Basic **"الحساب المجاني لا يدعم التسجيل السحابي — ارفع التسجيل يدوياً"**; else **"ستظهر التسجيلات تلقائياً بعد انتهاء الاجتماع بدقائق"**.
- Button **"رفع تسجيل يدوي"** (outline, `Upload`) → dropzone accepting `video/mp4` only, ≤ 5 GB; progress bar with % and MB/s; cancel button; on success toast **"تم رفع التسجيل"**. Optional Input "وقت بداية التسجيل" (time) to order parts; default = upload time.

### F.4 LinkReplacedDialog (global, students)
- Listens via `useLiveSessionsRealtime` + the student upcoming query; keeps a `Map<sessionId, link_version>` of last seen versions (initialised on first data load, so no dialog on page load).
- When a session's `link_version` increases **and** (`i_joined` from `get_live_session_state` is true **or** the current route is that session's page) → show `AlertDialog` (no outside-click dismissal):
  title **"تم تحديث رابط البث"**, body **"انقطع الاجتماع السابق. اضغط للانضمام بالرابط الجديد."**, primary **"انضم مجدداً"** (F4 helper with `getLiveSessionJoin`), secondary **"لاحقاً"**. Icon `RefreshCw` in `rounded-full bg-destructive/15 text-destructive p-3` above the title. Also play no sound.
- Fallback: while on a session page, poll state every 30 s (already 60 s → set to 30 s only while `status='live'`).

### F.5 Calendars
- `LiveCalendar` props `{ mode: 'student'|'admin' }`. Toolbar (sticky under the layout header): buttons ‹ › (RTL: "السابق" is the right chevron `ChevronRight`), **"اليوم"**, month/week title (`formatCairo` month + year, e.g. "نوفمبر 2026"), `ToggleGroup` **شهر / أسبوع / قائمة**. Admin filters row: Select الدورة، Select المضيف، Select الحالة (all default "الكل").
- Default view: `month` on ≥ 768 px, `قائمة` on < 768 px. Persist the chosen view in `localStorage` key `live-calendar-view` (wrapped in try/catch).
- **MonthGrid:** 7 columns, first column **السبت**; header row with short day names; 6 rows; cell `min-h-[104px] p-1.5 border-border/60`, today cell `bg-primary/5` with day number in `rounded-full bg-primary text-primary-foreground h-6 w-6`; days outside month `text-muted-foreground/60`. Up to 3 chips per day, then `+{n} المزيد` → Popover listing all.
  Chip: `rounded-md px-1.5 py-0.5 text-[11px] truncate border`, time first (`8:00 م`) then title; colours: scheduled `bg-primary/10 text-primary border-primary/30`, live `bg-destructive/15 text-destructive border-destructive/30` + pulsing dot, ended/completed `bg-muted text-muted-foreground border-transparent`, cancelled same + `line-through`.
- **WeekGrid:** columns = 7 days (Sat→Fri), rows = hours 08:00→24:00 (`h-14` per hour, label column `w-14 text-xs`); events absolutely positioned by start/duration in Cairo time; overlapping events split the column width; a red "now" line `border-t-2 border-destructive` in today's column.
- **AgendaList:** grouped by day header (`text-sm font-semibold`, e.g. "الثلاثاء 10 نوفمبر"), rows like `UpcomingLiveSessionsCard`; covers the next 30 days from the visible start; empty: `CalendarX` icon, **"لا توجد جلسات في هذه الفترة"**.
- **EventSheet:** opens from the start side; content: title, course, status pill, date/time, duration, host (admin), segments count, attendees (admin), files count; actions — student: "انضم الآن" (only when open) / "فتح صفحة الجلسة"; admin: `StartMeetingButton`, "تعديل" (opens `LiveSessionFormModal`), "فتح منشئ الدورة".
- Data: `admin_live_sessions_range` / `student_live_sessions_range` for the visible range only; react-query key includes the range **as YYYY-MM-DD strings** (stable).
- Page headers: student **"تقويم الجلسات المباشرة"**, admin **"تقويم البث المباشر"**; subtitle muted "جميع المواعيد بتوقيت القاهرة".

### F.6 LiveSessionPanel — completed state
Heading **"تسجيلات الجلسة"**; list of part cards `rounded-xl border p-3 flex items-center gap-3`: `PlayCircle` icon in `bg-primary/10 text-primary rounded-lg p-2`, title **"الجزء {n}"**, duration from recording times (`{m} دقيقة`), button "مشاهدة" → lesson route. If `no_recording_reason` is set → muted text: disabled → "لم يتم تفعيل التسجيل لهذه الجلسة"، basic_account → "لا يتوفر تسجيل لهذه الجلسة"، not_received → "لم يصل تسجيل هذه الجلسة". `ended` with `processing_count > 0` → "جارٍ تجهيز {n} تسجيل…" with spinner.

### F.7 AdminLiveSessions page
Header **"الجلسات المباشرة"** + button "جدولة جلسة" (opens the form modal with a required "الدورة" Select first). Filters like the calendar plus a date range (`من`/`إلى`). Table columns: الموعد، الجلسة، الدورة، المضيف، الحالة، الأجزاء، الحضور، الإجراءات. Mobile < 768 px: cards instead of table.

---

## G. Verification

### G.1 Automated
`npm run build` 0 errors; `npm test` all pass (new tests: query keys, `open-external` with a mocked `window.open`, calendar month-matrix builder starting Saturday incl. a month starting on Friday); lint: no **new** errors in web files vs E0 baseline. Worker: `npx wrangler deploy --dry-run` passes.

### G.2 End-to-end (use the built-in browser if you have one; log in with the QA_* accounts; screenshots to `docs/handover/screens/phase-02/`)
1. Admin connects Zoom (QA admin) → card shows connected + account type.
2. Schedule a session 12 min ahead in a course the QA student is enrolled in → at T−10 "ابدأ الجلسة" becomes active (server time).
3. Student: banner amber at T−30…T0; at T0 the panel unlocks **within 5 s** (F3) and the dialog shows once; join opens Zoom without the fallback link (F4).
4. Admin starts → status `live` → banner red for the student.
5. Admin "استبدال" (zoom_new) → student who joined sees `LinkReplacedDialog` within 5 s; "انضم مجدداً" opens the new meeting. A student who never joined and is not on the page sees **no** dialog but gets a notification.
6. Record ≥ 1 min in each segment, end both meetings, "إنهاء الجلسة" → `recording.completed` arrives → ingestion moves to `ready` (watch progress) → session `completed` → two lessons "— الجزء 1" and "— الجزء 2" in the unit, in order → student plays both with seeking (Range) and watermark; URL from `/media` without `sig` → 403.
7. Manual upload on a session with a manual link → becomes a part; ordering by entered start time.
8. Kill test: set a recording's `download_url` to an invalid URL → attempts back off → `failed` → host notification; "إعادة المحاولة" resets.
9. Auto-end: session past `start+duration+60 min` without "إنهاء" → `ended` by cron.
10. Calendars: month/week/list in both roles; Saturday first; filters work; a session on a month boundary shows in both views correctly; 375 px uses list view.
11. F1 check: open DevTools network for 30 s on `/dashboard` → `student_upcoming_live_sessions` called ≤ 1 time per 60 s.
12. F2 check: call `getValidAccessToken` twice concurrently with an expired token (set `expires_at` in the past) → both succeed, connection stays `active`.
13. Light + dark + 375 px screenshots of: start button states, replace dialog, link-replaced dialog, recordings sheet, completed panel, three calendar views, sessions page.

### G.3 Regression
Recorded course: YouTube/Bunny/Vimeo lessons still play; quiz + assignment open; purchase modal; admin lesson edit for non-r2 lessons unchanged; notification bell; MCP settings page loads.

---

## H. Handover (mandatory)

Create `docs/handover/PHASE-02-HANDOVER.md` with the **same 12 sections as Phase 01**, plus:
13. **Fix verification** — table F1–F9: what changed (file:line) and how it was verified.
14. **Infrastructure** — R2 bucket name/location, CORS rules, Worker name + URL, Worker routes, cron jobs (name, schedule), Vault secret **names** (never values), edge secrets **names**.
15. **Recording pipeline evidence** — for the G.2 #6 run: recording ids, sizes, parts uploaded, durations, final lesson ids (no URLs with signatures).

Every QA row is PASS / FAIL / BLOCKED with evidence. Stop after writing the handover. Do **not** start Part 2 (AI).
