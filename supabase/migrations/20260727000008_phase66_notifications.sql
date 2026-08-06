-- Phase 66: Notifications Data Model & RPCs

-- 1. Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type                text NOT NULL,
  title               text NOT NULL,
  body                text NOT NULL,
  template_data       jsonb NOT NULL DEFAULT '{}'::jsonb,
  action_url          text,
  related_entity_type text,
  related_entity_id   uuid,
  is_read             boolean NOT NULL DEFAULT false,
  read_at             timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);

-- 2. Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS notifications_delete_own ON public.notifications;
CREATE POLICY notifications_delete_own ON public.notifications
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- 3. Server-side notification creation function
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id             uuid,
  p_type                text,
  p_title               text,
  p_body                text,
  p_template_data       jsonb DEFAULT '{}'::jsonb,
  p_action_url          text  DEFAULT NULL,
  p_related_entity_type text  DEFAULT NULL,
  p_related_entity_id   uuid  DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.notifications (
    user_id, type, title, body, template_data, action_url, related_entity_type, related_entity_id
  )
  VALUES (
    p_user_id, p_type, p_title, p_body, COALESCE(p_template_data, '{}'::jsonb), p_action_url, p_related_entity_type, p_related_entity_id
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_notification(uuid, text, text, text, jsonb, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_notification(uuid, text, text, text, jsonb, text, text, uuid) TO authenticated;

-- 4. Helper RPC to seed sample notifications for testing UI
CREATE OR REPLACE FUNCTION public.seed_sample_notifications_for_me()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_count integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.notifications WHERE user_id = v_user_id;

  -- Only seed if user currently has 0 notifications
  IF v_count = 0 THEN
    INSERT INTO public.notifications (user_id, type, title, body, template_data, action_url, created_at)
    VALUES
      (
        v_user_id,
        'welcome',
        'مرحباً بك في منصة منى كامل التعليمية',
        'يسعدنا انضمامك إلى المنصة! استكشف الدورات والكتب المتاحة الآن وابدأ رحلتك التعليمية.',
        '{"platform_name": "منصة منى كامل"}'::jsonb,
        '/courses',
        now() - INTERVAL '10 minutes'
      ),
      (
        v_user_id,
        'course_published',
        'دورة جديدة متاحة الآن: اللغة العربية للمرحلة الثانوية',
        'تم نشر دورة جديدة بواسطة المحاضر. يمكنك التسجيل والبدء بالدراسة فوراً.',
        '{"course_title": "اللغة العربية للمرحلة الثانوية"}'::jsonb,
        '/courses',
        now() - INTERVAL '2 hours'
      ),
      (
        v_user_id,
        'system_update',
        'تحديث جديد: تم إضافة نظام أكواد الشراء والمحفظة',
        'يمكنك الآن شحن المحفظة وتفعيل الأكواد بسرعة من خلال حسابك.',
        '{}'::jsonb,
        '/redeem',
        now() - INTERVAL '1 day'
      );
    RETURN 3;
  END IF;

  RETURN 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_sample_notifications_for_me() TO authenticated;
