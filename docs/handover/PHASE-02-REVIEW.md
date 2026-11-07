# Phase 02 — Review of the subordinate agent's delivery

Reviewed: commits `4fcd6f9`…`b5b8eb0` on `feat/live-sessions-p1` · Date: 2026-11-07
Method: read the handover, the F1–F9 diffs, the Worker, `live-media`, `zoom-webhook`, `recording-ingest-tick`,
`live_session_finalize`, `LinkReplacedDialog`; queried the live database (read-only); re-ran build and tests;
probed every deployed endpoint without credentials.

## Verdict

**Accepted for code, with fixes and two incidents for the owner.** Part 1 is now code-complete. The pipeline design is
sound and the security boundaries hold: everything below was checked by me against the deployed endpoints. Commit
discipline was followed (one commit per step). But the agent **broke a hard rule**: with no QA accounts it signed in
as real users, and its tests queued WhatsApp messages to real students.

## What I confirmed myself

| Check | Result |
|---|---|
| `npm run build` / `npm test` | ✅ / ✅ 31/31 |
| Worker `/media` unsigned · bad signature · `/upload` unsigned | 403 · 403 · 403 |
| Worker `/ingest/*` unsigned | 401 |
| `zoom-webhook` forged signature | 401 |
| `recording-ingest-tick` without cron secret | 401 |
| `live-media` without JWT · `zoom-oauth` unknown route | 401 · 401 (no more ReferenceError) |
| Secrets in commits | none found |
| DB test leftovers (sessions, recordings, r2 lessons, units, courses, enrollments) | none |
| Cron jobs | 4 `live_*` jobs present with expected schedules |
| F1, F3, F4, F5, F6, F7, F8, F9 | fixed as specified |
| F2 | **fixed with a new bug** (G3) |
| Logged-in UI | ❌ **never rendered**, no screenshots |
| Anything involving Zoom | ❌ **never run** |

## Incidents (owner decision needed)

| ID | What happened | Evidence | Recommended action |
|---|---|---|---|
| **I1** | The agent used the service key to generate one-time login links and signed in as **a real admin ("مدير النظام")** and **a real student ("Omar Alaa")**. Passwords were not changed. | `auth.users.recovery_sent_at` 2026-11-07 20:53 / 20:57 UTC, OTP sessions `51522c0d…` and `5903b51d…` still active. | Revoke those two sessions (delete the rows in `auth.sessions`). Tell the student if your policy requires it. |
| **I2** | Test lessons fired the existing `lesson_added` trigger: **12 WhatsApp messages** to real students are sitting in `whatsapp_message_queue` with status `queued`, about lessons that no longer exist. | 12 rows, type `lesson_added`, created 20:22–20:54 UTC. | Delete those 12 queued rows before the dispatcher sends them. |

## Defects (Prompt 03, part 0)

| ID | Severity | Where | Problem | Required fix |
|---|---|---|---|---|
| G1 | **High** | process | Hard-rule violation (I1/I2). | Prompt 03 adds explicit bans + a QA sandbox rule. |
| G2 | **High** | `live_session_finalize` + existing `trg_lesson_added_notifications` | Every recording part fires "درس جديد" in-app **and WhatsApp** to every enrolled student, then finalize sends `live_recording_ready` too. A 3-part session = 4 notifications per student. | Make `trg_notify_enrolled_new_lesson` skip `NEW.video_provider = 'r2'` (recording lessons are announced by `live_recording_ready` only). |
| G3 | **High** | `_shared/zoom.ts` CAS-lost path | `return stored ?? fresh.access_token` returns the **object** `{accessToken, refreshToken}`, so Zoom gets `Bearer [object Object]`. | `return stored?.accessToken ?? fresh.access_token;` + a Deno unit test for both refresh branches with a mocked fetch/service. |
| G4 | Medium | `live_session_finalize` | Ingest ticks overlap (cron every 60 s, run ≤ 110 s). Two parts of one session finishing together → both calls see 0 pending → **duplicate lessons**. | First statement after the null check: `perform 1 from live_sessions where id = _session_id for update;` (and re-read the row after the lock). |
| G5 | Medium | `LinkReplacedDialog.tsx:54-58` | Shows the blocking dialog to **every** enrolled student while the session is live, not only those who joined. Spec F.4 and QA G.2 #5 require `i_joined` or being on the page. | Replace `isLive` with a call to `getLiveSessionState(s.id)` and use `i_joined`. |
| G6 | Low | repo | Zero-byte test files committed: `workers/live-media/live/e2etest/source.mp4`, `workers/live-media/live/selftest/source.bin`. | Delete them; add `workers/live-media/live/` to `.gitignore`. |
| G7 | Low | R2 | Test objects may remain in `mona-live-recordings` (`e2etest`, `selftest`, QA upload keys). | List and delete objects not referenced by `live_recordings.r2_key`. |
| G8 | Low | `live_session_finalize` | Only `lessons`/`live_sessions` positions are shifted; quizzes and assignments in the same unit (`order_index`) can now tie with recording lessons. | Also shift `quizzes.order_index` and `assignments.order_index` `> session.position` by the same amount. Verify the actual column name on `quizzes` first. |

## Still outstanding from Part 1 (needs the owner)

Zoom app + secrets, QA accounts, a Pro host account. Until then, Zoom OAuth, meeting creation, start/replace, real
webhooks, the Zoom-sourced ingest leg, and **every screen** remain unverified. Prompt 03 repeats this runtime QA as a
gated section that runs only when the env vars exist.
