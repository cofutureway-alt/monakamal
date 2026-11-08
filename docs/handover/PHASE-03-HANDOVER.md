# Phase 03 — Part-1 fixes + AI Gateway & Quotas (Phase 5) + Admin AI Control Center (Phase 6)

Branch: `feat/ai-p5-p6` (from `feat/live-sessions-p1`) · Done by: Claude (directly, not a subordinate agent)
Dates: 2026-11-08 → 2026-11-09 · Supabase: `lhzawomzzuhfalvdgjcd` · **Deployed** on 2026-11-09 with the owner's approval.

## 1. Summary

- Incidents I1/I2 from the Phase 2 review cleaned up on production (see §10).
- Review fixes G2–G8 shipped and deployed, plus two bugs found while testing: CourseBuilder crash, and a blank dev page caused by a duplicate import.
- AI core: settings, providers with write-only keys, plans ($20/$30/$50), subscription (renews 1 Dec 2027 Cairo), usage events, and a quota function enforcing the plan and per-user limits.
- Model gateway for OpenAI-compatible and Anthropic providers, plus a 5-step connection test.
- `/admin/settings/ai`: toggles, limits, providers, connection test, plan and usage dashboard, usage log.
- `/admin/ai`: streaming Arabic admin assistant with 11 read tools, 16 proposal-only write tools and a clarification tool.
  - A server-side entity guard blocks writes that use any id the AI never looked up.
  - Every change needs an admin click; destructive ones also need the name typed.
- **Not verified:** no AI provider is configured yet, so no real model call and no evaluation suite (G.3) has been run. No logged-in screen was exercised (no QA accounts).

## 2. Step log (commits)

| Step | Commit | What |
|---|---|---|
| E1 | `be3465f` | Fixes G2–G8, review doc, prompt 03 |
| E2–E3 | `36ed652` | AI core migrations, quota, gateway, `ai-admin` |
| E4 | `cb8b0a0` | Settings page + components, client API, SSE parser |
| E5 | `22f5dc3` | System prompt, 28 tools, `ai-chat`, `ai-actions` |
| E6 | `2fe1b12` | Chat UI, lesson PDF, CourseBuilder crash fix |
| E7 | `bf14271` | Visual QA fixes (PDF shaping, markdown, chart, digits, mobile grid, duplicate import) |
| E8 | this commit | Handover |

## 3. Database (deployed: `20261109000000`, `…000100`, `…000200`)

- `live_fix_p2`: r2 lessons skip `lesson_added`; `live_session_finalize` locks the session row and shifts quizzes/assignments.
- `ai_p5_core`: `ai_settings`, `ai_providers`, `ai_provider_secrets` (no client access), `ai_plans`, `ai_subscription`, `ai_plan_change_requests`, `ai_usage_events`; functions `ai_window_starts`, `ai_usage_snapshot`, `ai_consume_quota` (service role only), `ai_finish_usage` (refunds errors), `ai_usage_daily`.
- `ai_p6_chat`: `ai_conversations`, `ai_messages`, `ai_conversation_entities`, `ai_pending_actions`, `ai_expire_pending_actions`.
- Verified live: RLS on all 11 `ai_*` tables. `authenticated` cannot read `ai_provider_secrets` and cannot execute `ai_consume_quota`. Anonymous REST access to the keys gets `permission denied`.

**Quota proof** (rolled-back transaction on production):

| Case | Result |
|---|---|
| 50th message in the hour | allowed |
| 51st message in the hour | `platform_hour`, resets at the next Cairo hour |
| Admin message | allowed, `counted=false` |
| A student's 11th message in the hour | `actor_hour` |
| 301st message in the day | `platform_day` |
| Expired plan | `plan_expired` |
| Failed model call | refunded (`counted=false`) |

## 4. Edge functions (deployed)

| Function | Auth | Purpose |
|---|---|---|
| `ai-admin` | JWT + admin | settings, providers, `test_provider`, plan requests (only the owner can apply), usage |
| `ai-chat` | own JWT check (`verify_jwt=false` for future guests) | SSE chat, quota per message, ≤6 model calls / 100 s |
| `ai-actions` | JWT + admin + action owner | confirm/cancel proposals, re-validate, audit (`admin_audit_log`, `ai.<tool>`) |
| `live-sessions`, `zoom-oauth` | unchanged auth | redeployed with G3 token fix |

Verified live: all three AI endpoints return 401 without a JWT or with a forged JWT.

## 5. Frontend

- New:
  - `src/pages/admin/AdminAiSettings.tsx`, `AdminAiChat.tsx`
  - `src/components/ai/*` (5 settings components + `AiUnavailableDialog`)
  - `src/components/ai/chat/*` (8 components)
  - `src/hooks/use-ai-chat.ts`
  - `src/lib/ai-api.ts`, `ai-sse.ts`, `lesson-pdf.ts`, `pdf-fonts.ts`
- Modified:
  - `App.tsx`: routes; duplicate `AdminBooks` import removed.
  - `AdminLayout.tsx`: nav item "المساعد الذكي".
  - `AdminSettings.tsx`: settings card.
  - `invoice-pdf.ts`: shared font fetch; the invoice's own font URLs are unchanged.
  - `CourseBuilder.tsx`: crash fix.
- New dependencies: `react-markdown@9.0.1` and `remark-gfm@4.0.0` (pinned exactly).

## 6. UI evidence

Checked with a temporary mock-data harness (removed before commit) in the built-in browser, in light, dark and 375 px:
- chat clarification, normal and destructive proposals (type-to-confirm enables only on the exact name), report with chart, table and CSV
- streaming state, conversation list, composer
- connection checklist (finished and running), usage meters, chart, plan cards, quota dialog
- generated lesson PDF

No screenshots are saved to disk because the C: drive is full.

## 7. QA results

| Item | Result |
|---|---|
| Quota cases (G.2 #1–2) | PASS (SQL, rolled back) |
| Gateway adapters, both formats, error mapping, retry | PASS (Deno tests vs mock server) |
| Entity guard, invalid args, unknown tool, clarification limits, closed schemas | PASS (Deno tests) |
| Unauthenticated / forged access to AI functions | PASS (live) |
| `test_provider` against a real provider (G.2 #3) | **BLOCKED**: no provider / key |
| `ai-chat` role & disabled checks with real JWTs (G.2 #5) | **NOT VERIFIED**: no QA accounts (real-user impersonation is banned) |
| Action double-confirm 409 / expired 410 / wrong phrase 400 (G.2 #7) | **NOT VERIFIED** at runtime; code-reviewed |
| Evaluation suite, 12 prompts (G.3) | **BLOCKED**: no provider |
| Build / vitest / deno tests | PASS: build OK, 51 vitest, 9 deno |

## 8. Decisions & assumptions

- **Passwords:** `create_student` always generates the password; it is shown once and never stored, and the model never sees it.
- **Question types:** the quiz tool supports the four types the builder supports (single, multiple, true/false, fill-blank). There are no essay questions, since the builder can't author them.
- **Assignment dates:** `create_assignment` requires start and end dates, because those columns are `NOT NULL`. The AI must ask for them rather than make them up.
- **Old messages:** the history window is the last 30 messages. Older-message summarisation (C.4 step 3) is **not implemented**.
- **Tool context:** read tools use the service client after the admin check, not RLS-scoped clients.
- **PDF output:** the lesson PDF is raster (canvas pages) for correct Arabic shaping, so its text is not selectable.
- **Numbers:** the AI UI uses Western digits; dates use the platform's existing Cairo formatter.

## 9. Known issues

- **No provider yet:** no AI provider is configured, so `/admin/ai` shows "لم يتم إعداد مزوّد" until one is added in settings.
- **Generated types:** `src/integrations/supabase/types.ts` is not regenerated for the `ai_*` tables, so 4 client calls carry lint exemptions. Regenerate now that the migrations are applied.
- **Test storage file:** a ~1 MB manual-upload test object from Phase 2 may remain in R2 under an unknown key.
- **Disk:** the C: drive has ~7 MB free, which breaks temp files for tooling.

## 10. Production clean-up performed

- Deleted 12 queued `lesson_added` WhatsApp messages and their 12 notifications for deleted test lessons (4 students).
- Revoked auth sessions `51522c0d…` (admin) and `5903b51d…` (student) created by the Phase 2 agent; the refresh tokens went with them.
- Deleted R2 objects `live/e2etest/source.mp4` and `live/selftest/source.bin`.

## 11. Next steps

1. Add a provider in `/admin/settings/ai`, then run the connection test and the 12-prompt evaluation (G.3).
2. Phase 7 (AI grading) and Phase 8 (storefront / student / parent widget).
3. Owner items still open:
   - Zoom app and Pro host account
   - QA accounts and QA course
   - rotate the Supabase secret key and access token
