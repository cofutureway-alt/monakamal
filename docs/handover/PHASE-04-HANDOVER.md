# Phase 04 — AI Grading (Phase 7) + Assistant Widget (Phase 8)

Branch: `feat/ai-p5-p6` · Done by: Claude directly · **Deployed 2026-11-09** with the owner's approval.

## 1. Summary

- **AI grading.**
  - Assignment written answers get a score out of the total plus feedback for the student.
  - Quiz fill-in-the-blank answers get a right/wrong verdict.
  - Two modes: *suggest* (the teacher adopts the suggestion in the grading modal) and *auto-apply* (saved when confidence is at least 0.6, never over a teacher's grade).
- **Assistant widget** for visitors, students and parents. Read-only tools, scoped on the server.
- **Production fix:** `trg_notify_quiz_attempt_graded` referenced non-existent columns, so no quiz attempt could ever reach `graded`. Fixed and deployed.

## 2. Commits

| Commit | What |
|---|---|
| `4810161` | Phase 7: grading schema, worker, suggestion panel, quiz trigger fix |
| `d15dac5` | Phase 8 backend: roles in `ai-chat`, prompts, public tools, guest conversations |
| `e45e22d` | Phase 8 widget UI |
| this | config for `ai-grading-tick`, handover |

## 3. Database (deployed)

- `20261109000250_fix_quiz_graded_trigger.sql`: `NEW.is_passed` → `passed`, `NEW.score_percent` → `percentage`. The wording is unchanged.
- `20261109000300_ai_p7_grading.sql`:
  - `ai_grading_jobs` (admin read only)
  - enqueue triggers on `assignment_submissions` (→ `submitted`) and `quiz_attempts` (→ `needs_review`), active only while grading is enabled
  - `ai_grading_claim_next`
  - `ai_apply_quiz_grading`: service role only; touches only ungraded fill-blank answers
  - cron `ai_grading_tick` (every minute; pings the worker only when jobs are waiting)
- `20261109000400_ai_p8_widget.sql`:
  - guest conversations (`user_id` nullable + hashed `guest_key`)
  - `ai_public_config()` for anon
  - daily purge of guest conversations older than 7 days

Verified (rolled-back transaction before deploy, then live):
- **Triggers:** with grading off, no job is created; with grading on, one job.
- **Worker and apply:** the worker claims the job, and applying sets the attempt to `graded` and sends one `quiz_graded` notification.
- **Access:** anon and authenticated users cannot run `ai_apply_quiz_grading` and cannot read `ai_grading_jobs`.

## 4. Edge functions (deployed)

| Function | Change |
|---|---|
| `ai-grading-tick` (new, `verify_jwt=false`, `x-cron-secret` = `LIVE_CRON_SECRET`) | Forced tool output with JSON fallback. Prompt-injection fencing. Blank answers marked wrong without a model call. Files-only submissions skipped. System usage is not counted. Backoff after 5 attempts. |
| `ai-chat` | Roles admin / student / parent / guest. Guests send `x-ai-guest`, and their limit is keyed on `sha256(ip\|id)`. The widget requires `chatbot_enabled`. Widget messages are capped at 1500 characters and 4 model calls. |
| `ai-admin` | New action `enqueue_grading`. |

Verified live:
- Guest with the chatbot off → 403 `AI_DISABLED`.
- Malformed guest id → 401.
- Grading tick with a wrong secret → 401.
- Anon REST read of `ai_grading_jobs` → permission denied.

## 5. Frontend

- `src/components/ai/AiGradeSuggestion.tsx`: added to `SubmissionGradingModal` and `AttemptDetailsModal`. "اعتماد الاقتراح" only fills the form; the teacher still saves.
- `src/components/ai/widget/AiChatWidget.tsx`, mounted in `App.tsx`:
  - placement: bottom-left launcher above the mobile nav; 380×600 on desktop, full screen on mobile
  - content: role-specific quick replies
  - limits: a personal limit shows an inline message; the platform quota shows the dialog
  - hidden on admin, auth and quiz-taking pages
- AI replies: internal links now navigate inside the app.

## 6. QA

| Item | Result |
|---|---|
| Grading normaliser / prompt fencing / JSON fallback | PASS (5 vitest) |
| Role scoping of widget tools (no cross-role, no admin, no write tools) | PASS (3 Deno tests) |
| Gateway + admin guard tests | PASS (9 Deno tests) |
| Build / all vitest | PASS: 56 tests |
| Widget UI: desktop, mobile, guest request headers, error path | PASS (browser, with the visibility check bypassed locally, then restored) |
| Real model grading / real widget conversation | **BLOCKED**: no AI provider configured |
| Teacher adopting a suggestion in the modal | **NOT VERIFIED**: no admin login available |

## 7. Notes & known issues

- **Quiz notifications:** now that grading works, `quiz_graded` and `parent_quiz_graded` notifications are sent, **including WhatsApp** (both channels are enabled in `notification_type_channels`).
- **Stuck attempts:** 3 quiz attempts are stuck `in_progress` from October. Students can now finish new attempts; the old ones finalize when they expire or when the student returns.
- **Homepage headline:** `platform_settings.hero_headline` is stored as literal `?` characters (since 2026-10-12). Owner decision: clear it so the default shows, or retype it in admin homepage settings.
- **Not built:** `ai_grading_suggestion_ready` notifications are not sent; suggestions are visible in the grading modals.
- **Disk:** the C: drive is nearly full.

## 8. To switch everything on

1. **Provider:** `/admin/settings/ai` → add a provider, run "اختبار الاتصال", then "تعيين للمحادثة" (and optionally "تعيين للتصحيح").
2. **Grading:** under "عام", turn on "التصحيح الآلي" and choose a mode. Start with *اقتراح فقط*.
3. **Widget:** turn on "المساعد الذكي للزوار والطلاب". The widget appears within about 5 minutes (config cache).
