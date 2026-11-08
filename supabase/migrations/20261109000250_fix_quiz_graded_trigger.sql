-- Fix: trg_notify_quiz_attempt_graded referenced NEW.is_passed and
-- NEW.score_percent, which do not exist on quiz_attempts (the columns are
-- `passed` and `percentage`). Every UPDATE that moved an attempt to 'graded'
-- therefore raised 42703 and rolled back — quiz submissions without written
-- questions, and admin grading of written answers, could never complete.
-- Behaviour and wording are otherwise unchanged.
create or replace function public.trg_notify_quiz_attempt_graded()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_quiz_title text;
  v_outcome text;
begin
  if (old.status is null or old.status <> 'graded') and new.status = 'graded' then
    select title into v_quiz_title from public.quizzes where id = new.quiz_id;

    if new.passed is true then
      v_outcome := 'اجتياز بنجاح';
    else
      v_outcome := 'لم يتم الاجتياز';
    end if;

    -- Student Notification
    perform public.create_notification(
      new.user_id,
      'quiz_graded',
      'تم تصحيح اختبارك: ' || coalesce(v_quiz_title, 'الاختبار'),
      'حصلت على نتيجة ' || coalesce(round(new.percentage)::text, '0') || '% (' || v_outcome || '). اضغط لمراجعة تقرير الاختبار.',
      jsonb_build_object('attempt_id', new.id, 'score', new.percentage, 'passed', new.passed),
      '/dashboard/quiz-attempts',
      'quiz_attempt',
      new.id
    );

    -- Parent Notification
    perform public.notify_parents_of_student(
      new.user_id,
      'parent_quiz_graded',
      'نتيجة اختبار جديد',
      'حصل على نتيجة ' || coalesce(round(new.percentage)::text, '0') || '% (' || v_outcome || ') في اختبار (' || coalesce(v_quiz_title, '') || ').',
      jsonb_build_object('attempt_id', new.id, 'score', new.percentage, 'passed', new.passed),
      '/parent?studentId=' || new.user_id,
      'quiz_attempt',
      new.id
    );
  end if;

  -- Admin Notification when quiz needs review
  if (old.status is null or old.status <> 'needs_review') and new.status = 'needs_review' then
    select title into v_quiz_title from public.quizzes where id = new.quiz_id;
    perform public.notify_all_admins(
      'quiz_needs_review',
      'محاولة اختبار تتطلب مراجعة أسئلة مقالية',
      'توجد محاولة جديدة بحاجة لمراجعة تصحيح الأسئلة المقالية في اختبار: ' || coalesce(v_quiz_title, ''),
      jsonb_build_object('attempt_id', new.id, 'user_id', new.user_id),
      '/admin/quiz-attempts',
      'quiz_attempt',
      new.id
    );
  end if;

  return new;
end;
$function$;
