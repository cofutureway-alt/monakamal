
CREATE TYPE public.app_role AS ENUM ('admin', 'student');
CREATE TYPE public.course_status AS ENUM ('draft', 'published');
CREATE TYPE public.video_provider AS ENUM ('youtube', 'bunny', 'vimeo');

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  role public.app_role NOT NULL DEFAULT 'student',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND role = _role); $$;

CREATE POLICY "Users can read own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Admins can read all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- STAGES
CREATE TABLE public.stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.stages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stages TO authenticated;
GRANT ALL ON public.stages TO service_role;
ALTER TABLE public.stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stages_select_all" ON public.stages FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "stages_insert_admin" ON public.stages FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "stages_update_admin" ON public.stages FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "stages_delete_admin" ON public.stages FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- COURSES
CREATE TABLE public.courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id UUID REFERENCES public.stages(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  status public.course_status NOT NULL DEFAULT 'draft',
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_courses_stage_id ON public.courses(stage_id);
CREATE INDEX idx_courses_created_by ON public.courses(created_by);
CREATE INDEX idx_courses_status ON public.courses(status);
GRANT SELECT ON public.courses TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses TO authenticated;
GRANT ALL ON public.courses TO service_role;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "courses_select_published" ON public.courses FOR SELECT TO anon, authenticated USING (status = 'published');
CREATE POLICY "courses_select_admin" ON public.courses FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "courses_insert_admin" ON public.courses FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "courses_update_admin" ON public.courses FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "courses_delete_admin" ON public.courses FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- UNITS
CREATE TABLE public.units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_units_course_id ON public.units(course_id);
GRANT SELECT ON public.units TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.units TO authenticated;
GRANT ALL ON public.units TO service_role;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "units_select_public" ON public.units FOR SELECT TO anon, authenticated USING (
  EXISTS (SELECT 1 FROM public.courses c WHERE c.id = units.course_id AND c.status = 'published')
);
CREATE POLICY "units_select_admin" ON public.units FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "units_insert_admin" ON public.units FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "units_update_admin" ON public.units FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "units_delete_admin" ON public.units FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- LESSONS
CREATE TABLE public.lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  video_provider public.video_provider,
  video_url TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_lessons_unit_id ON public.lessons(unit_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lessons TO authenticated;
GRANT ALL ON public.lessons TO service_role;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

-- ENROLLMENTS
CREATE TABLE public.enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, course_id)
);
CREATE INDEX idx_enrollments_user_id ON public.enrollments(user_id);
CREATE INDEX idx_enrollments_course_id ON public.enrollments(course_id);
GRANT SELECT, INSERT, DELETE ON public.enrollments TO authenticated;
GRANT ALL ON public.enrollments TO service_role;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "enrollments_select_own" ON public.enrollments FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "enrollments_select_admin" ON public.enrollments FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "enrollments_insert_own" ON public.enrollments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- lesson enrolment helper
CREATE OR REPLACE FUNCTION public.is_enrolled_in_lesson_course(_user_id UUID, _lesson_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.lessons l
    JOIN public.units u ON u.id = l.unit_id
    JOIN public.enrollments e ON e.course_id = u.course_id
    WHERE l.id = _lesson_id AND e.user_id = _user_id
  );
$$;

CREATE POLICY "lessons_select_admin" ON public.lessons FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "lessons_select_enrolled" ON public.lessons FOR SELECT TO authenticated USING (public.is_enrolled_in_lesson_course(auth.uid(), id));
CREATE POLICY "lessons_insert_admin" ON public.lessons FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "lessons_update_admin" ON public.lessons FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "lessons_delete_admin" ON public.lessons FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- LESSON FILES
CREATE TABLE public.lesson_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  file_size BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_lesson_files_lesson_id ON public.lesson_files(lesson_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lesson_files TO authenticated;
GRANT ALL ON public.lesson_files TO service_role;
ALTER TABLE public.lesson_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lesson_files_select_admin" ON public.lesson_files FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "lesson_files_select_enrolled" ON public.lesson_files FOR SELECT TO authenticated USING (public.is_enrolled_in_lesson_course(auth.uid(), lesson_id));
CREATE POLICY "lesson_files_insert_admin" ON public.lesson_files FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "lesson_files_update_admin" ON public.lesson_files FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "lesson_files_delete_admin" ON public.lesson_files FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- LESSON PROGRESS
CREATE TABLE public.lesson_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, lesson_id)
);
CREATE INDEX idx_lesson_progress_user_id ON public.lesson_progress(user_id);
CREATE INDEX idx_lesson_progress_lesson_id ON public.lesson_progress(lesson_id);
CREATE INDEX idx_lesson_progress_course_id ON public.lesson_progress(course_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lesson_progress TO authenticated;
GRANT ALL ON public.lesson_progress TO service_role;
ALTER TABLE public.lesson_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lesson_progress_own" ON public.lesson_progress FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "lesson_progress_admin_select" ON public.lesson_progress FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- PUBLIC LESSONS VIEW (title only, no video_url) — quote reserved word "position"
CREATE OR REPLACE FUNCTION public.get_lessons_public()
RETURNS TABLE (id UUID, unit_id UUID, title TEXT, "position" INTEGER)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT l.id, l.unit_id, l.title, l."position"
  FROM public.lessons l
  JOIN public.units u ON u.id = l.unit_id
  JOIN public.courses c ON c.id = u.course_id
  WHERE c.status = 'published';
$$;

CREATE OR REPLACE VIEW public.lessons_public AS SELECT * FROM public.get_lessons_public();
GRANT SELECT ON public.lessons_public TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_lessons_public() TO anon, authenticated;

-- TRIGGERS
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER update_stages_updated_at BEFORE UPDATE ON public.stages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_courses_updated_at BEFORE UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_units_updated_at BEFORE UPDATE ON public.units FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_lessons_updated_at BEFORE UPDATE ON public.lessons FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    'student'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Revoke public execution of internal helpers used only by RLS/triggers
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_enrolled_in_lesson_course(UUID, UUID) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;

-- The lessons_public view + get_lessons_public function is intentionally
-- SECURITY DEFINER to expose ONLY (id, unit_id, title, position) — no video_url —
-- for signed-out curriculum previews. This is the intended pattern; the linter
-- ERROR is expected and reviewed.

-- Storage policies for the thumbnails bucket
CREATE POLICY "Authenticated can read thumbnails"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'thumbnails');

CREATE POLICY "Admins can upload thumbnails"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'thumbnails' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update thumbnails"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'thumbnails' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'thumbnails' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete thumbnails"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'thumbnails' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins read lesson files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'lesson-files' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins upload lesson files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'lesson-files' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update lesson files"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'lesson-files' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'lesson-files' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete lesson files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'lesson-files' AND public.has_role(auth.uid(), 'admin'));
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_enrolled_in_lesson_course(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_lessons_public() TO authenticated, anon;
UPDATE public.profiles SET role = 'admin' WHERE id = 'e5889949-1dbb-4614-a498-4463da410e56';

CREATE TABLE public.lesson_watch_progress (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  duration_seconds NUMERIC NOT NULL DEFAULT 0,
  watched_seconds NUMERIC NOT NULL DEFAULT 0,
  furthest_position_seconds NUMERIC NOT NULL DEFAULT 0,
  last_position_seconds NUMERIC NOT NULL DEFAULT 0,
  watch_percentage NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, lesson_id)
);

CREATE INDEX idx_lwp_user ON public.lesson_watch_progress(user_id);
CREATE INDEX idx_lwp_lesson ON public.lesson_watch_progress(lesson_id);
CREATE INDEX idx_lwp_course ON public.lesson_watch_progress(course_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lesson_watch_progress TO authenticated;
GRANT ALL ON public.lesson_watch_progress TO service_role;

ALTER TABLE public.lesson_watch_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own watch progress"
  ON public.lesson_watch_progress FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users insert own watch progress"
  ON public.lesson_watch_progress FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own watch progress"
  ON public.lesson_watch_progress FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own watch progress"
  ON public.lesson_watch_progress FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER update_lwp_updated_at
  BEFORE UPDATE ON public.lesson_watch_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.video_player_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  double_tap_seek_enabled BOOLEAN NOT NULL DEFAULT true,
  seek_forward_seconds INTEGER NOT NULL DEFAULT 10 CHECK (seek_forward_seconds BETWEEN 1 AND 120),
  seek_backward_seconds INTEGER NOT NULL DEFAULT 10 CHECK (seek_backward_seconds BETWEEN 1 AND 120),
  speed_control_enabled BOOLEAN NOT NULL DEFAULT true,
  allowed_speeds JSONB NOT NULL DEFAULT '[1.25, 1.5, 2]'::jsonb,
  completion_gate_enabled BOOLEAN NOT NULL DEFAULT false,
  completion_required_percentage INTEGER NOT NULL DEFAULT 90 CHECK (completion_required_percentage BETWEEN 1 AND 100),
  watermark_color TEXT NOT NULL DEFAULT '#ffffff',
  watermark_show_email BOOLEAN NOT NULL DEFAULT true,
  watermark_show_name BOOLEAN NOT NULL DEFAULT false,
  watermark_speed_seconds INTEGER NOT NULL DEFAULT 22 CHECK (watermark_speed_seconds BETWEEN 4 AND 120),
  watermark_opacity NUMERIC NOT NULL DEFAULT 0.35 CHECK (watermark_opacity BETWEEN 0 AND 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.video_player_settings (id) VALUES (1);

GRANT SELECT ON public.video_player_settings TO anon, authenticated;
GRANT UPDATE ON public.video_player_settings TO authenticated;
GRANT ALL ON public.video_player_settings TO service_role;

ALTER TABLE public.video_player_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read player settings"
  ON public.video_player_settings FOR SELECT
  USING (true);

CREATE POLICY "Admins update player settings"
  ON public.video_player_settings FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND id = 1);

CREATE TRIGGER update_vps_updated_at
  BEFORE UPDATE ON public.video_player_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ SUBJECTS (Phase 9) ============
CREATE TABLE public.subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  thumbnail_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.subjects TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subjects TO authenticated;
GRANT ALL ON public.subjects TO service_role;

ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Subjects readable by everyone"
  ON public.subjects FOR SELECT
  USING (true);

CREATE POLICY "Admins insert subjects"
  ON public.subjects FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update subjects"
  ON public.subjects FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete subjects"
  ON public.subjects FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_subjects_updated_at
  BEFORE UPDATE ON public.subjects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ courses.subject_id ============
ALTER TABLE public.courses
  ADD COLUMN subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL;

CREATE INDEX idx_courses_subject_id ON public.courses(subject_id);

-- ============ LESSON FILES PERMISSIONS (Phase 10) ============
ALTER TABLE public.lesson_files
  ADD COLUMN allow_download boolean NOT NULL DEFAULT true,
  ADD COLUMN download_limit integer;

-- ============ LESSON FILE DOWNLOADS ============
CREATE TABLE public.lesson_file_downloads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lesson_file_id uuid NOT NULL REFERENCES public.lesson_files(id) ON DELETE CASCADE,
  download_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, lesson_file_id)
);

GRANT SELECT ON public.lesson_file_downloads TO authenticated;
GRANT ALL ON public.lesson_file_downloads TO service_role;

ALTER TABLE public.lesson_file_downloads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see their own download counts"
  ON public.lesson_file_downloads FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins see all download counts"
  ON public.lesson_file_downloads FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_lesson_file_downloads_updated_at
  BEFORE UPDATE ON public.lesson_file_downloads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ increment_file_download RPC ============
CREATE OR REPLACE FUNCTION public.increment_file_download(p_lesson_file_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_lesson uuid;
  v_course uuid;
  v_allow boolean;
  v_limit integer;
  v_is_admin boolean;
  v_current integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '42501';
  END IF;

  SELECT lf.lesson_id, l.unit_id, lf.allow_download, lf.download_limit
    INTO v_lesson, v_course, v_allow, v_limit
  FROM public.lesson_files lf
  JOIN public.lessons l ON l.id = lf.lesson_id
  WHERE lf.id = p_lesson_file_id;

  IF v_lesson IS NULL THEN
    RAISE EXCEPTION 'file not found' USING ERRCODE = '02000';
  END IF;

  IF NOT v_allow THEN
    RAISE EXCEPTION 'download disabled' USING ERRCODE = '42501';
  END IF;

  SELECT u.course_id INTO v_course FROM public.units u WHERE u.id = v_course;

  v_is_admin := public.has_role(v_user, 'admin');

  IF NOT v_is_admin THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.enrollments e
      WHERE e.user_id = v_user AND e.course_id = v_course
    ) THEN
      RAISE EXCEPTION 'not enrolled' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Get current count
  SELECT download_count INTO v_current
  FROM public.lesson_file_downloads
  WHERE user_id = v_user AND lesson_file_id = p_lesson_file_id;
  v_current := COALESCE(v_current, 0);

  IF v_limit IS NOT NULL AND v_current >= v_limit THEN
    RAISE EXCEPTION 'download limit reached' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.lesson_file_downloads (user_id, lesson_file_id, download_count)
  VALUES (v_user, p_lesson_file_id, 1)
  ON CONFLICT (user_id, lesson_file_id)
  DO UPDATE SET download_count = public.lesson_file_downloads.download_count + 1,
                updated_at = now()
  RETURNING download_count INTO v_current;

  RETURN v_current;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_file_download(uuid) TO authenticated;

CREATE POLICY "Enrolled users read lesson files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'lesson-files'
  AND EXISTS (
    SELECT 1
    FROM public.lesson_files lf
    JOIN public.lessons l ON l.id = lf.lesson_id
    JOIN public.units u ON u.id = l.unit_id
    JOIN public.enrollments e ON e.course_id = u.course_id
    WHERE lf.file_url = storage.objects.name
      AND e.user_id = auth.uid()
  )
);

-- Quizzes table
CREATE TABLE public.quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  order_index integer NOT NULL DEFAULT 0,
  duration_minutes integer NOT NULL DEFAULT 30,
  start_at timestamptz,
  end_at timestamptz,
  randomize_enabled boolean NOT NULL DEFAULT true,
  pass_percentage integer NOT NULL DEFAULT 50 CHECK (pass_percentage BETWEEN 1 AND 100),
  max_attempts integer NOT NULL DEFAULT 1 CHECK (max_attempts BETWEEN 1 AND 20),
  attempt_result_policy text NOT NULL DEFAULT 'highest' CHECK (attempt_result_policy IN ('first','highest','last')),
  forms_count integer NOT NULL DEFAULT 1 CHECK (forms_count BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_quizzes_unit_id ON public.quizzes(unit_id);
CREATE INDEX idx_quizzes_course_id ON public.quizzes(course_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quizzes TO authenticated;
GRANT ALL ON public.quizzes TO service_role;

ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage quizzes"
  ON public.quizzes FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Enrolled students read quizzes"
  ON public.quizzes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.enrollments e
      WHERE e.user_id = auth.uid() AND e.course_id = quizzes.course_id
    )
  );

CREATE TRIGGER trg_quizzes_updated_at
  BEFORE UPDATE ON public.quizzes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RPC: compute next combined order index across lessons + quizzes for a unit
CREATE OR REPLACE FUNCTION public.next_unit_order_index(_unit_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(MAX(pos), -1) + 1 FROM (
    SELECT position AS pos FROM public.lessons WHERE unit_id = _unit_id
    UNION ALL
    SELECT order_index AS pos FROM public.quizzes WHERE unit_id = _unit_id
  ) t;
$$;

GRANT EXECUTE ON FUNCTION public.next_unit_order_index(uuid) TO authenticated;

CREATE TABLE public.quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  form_number integer NOT NULL CHECK (form_number >= 1),
  type text NOT NULL CHECK (type IN ('single_choice','multiple_choice','true_false','fill_blank')),
  content jsonb NOT NULL,
  image_url text,
  points numeric NOT NULL CHECK (points > 0),
  model_answer_text text,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quiz_questions_quiz_form_idx ON public.quiz_questions(quiz_id, form_number);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_questions TO authenticated;
GRANT ALL ON public.quiz_questions TO service_role;

ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage quiz questions" ON public.quiz_questions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER quiz_questions_set_updated_at
  BEFORE UPDATE ON public.quiz_questions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


CREATE TABLE public.quiz_question_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.quiz_questions(id) ON DELETE CASCADE,
  content jsonb NOT NULL,
  is_correct boolean NOT NULL DEFAULT false,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quiz_question_options_question_idx ON public.quiz_question_options(question_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_question_options TO authenticated;
GRANT ALL ON public.quiz_question_options TO service_role;

ALTER TABLE public.quiz_question_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage quiz question options" ON public.quiz_question_options
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Signed-in users can read quiz images"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'quiz-images');

CREATE POLICY "Admins can upload quiz images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'quiz-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update quiz images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'quiz-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete quiz images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'quiz-images' AND public.has_role(auth.uid(), 'admin'));

-- ============ quiz_attempts ============
CREATE TABLE public.quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  form_number integer NOT NULL,
  attempt_number integer NOT NULL,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','submitted','needs_review','graded')),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  submitted_at timestamptz,
  question_order jsonb NOT NULL,
  total_points numeric NOT NULL DEFAULT 0,
  earned_points numeric NOT NULL DEFAULT 0,
  percentage numeric,
  passed boolean,
  feedback text,
  feedback_given_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.quiz_attempts TO authenticated;
GRANT ALL ON public.quiz_attempts TO service_role;

ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students view own attempts" ON public.quiz_attempts
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins view all attempts" ON public.quiz_attempts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Students insert own attempts" ON public.quiz_attempts
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Students update own in-progress attempts" ON public.quiz_attempts
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status = 'in_progress')
  WITH CHECK (user_id = auth.uid() AND status = 'in_progress');

CREATE INDEX idx_quiz_attempts_quiz_user ON public.quiz_attempts(quiz_id, user_id);
CREATE INDEX idx_quiz_attempts_status ON public.quiz_attempts(status);

CREATE TRIGGER trg_quiz_attempts_updated_at
  BEFORE UPDATE ON public.quiz_attempts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ quiz_answers ============
CREATE TABLE public.quiz_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.quiz_attempts(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.quiz_questions(id) ON DELETE CASCADE,
  option_order jsonb NOT NULL DEFAULT '[]'::jsonb,
  selected_option_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  fill_blank_text text,
  is_correct boolean,
  points_earned numeric NOT NULL DEFAULT 0,
  time_spent_seconds numeric NOT NULL DEFAULT 0,
  answered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, question_id)
);

GRANT SELECT, INSERT, UPDATE ON public.quiz_answers TO authenticated;
GRANT ALL ON public.quiz_answers TO service_role;

ALTER TABLE public.quiz_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students view own answers" ON public.quiz_answers
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.quiz_attempts a
    WHERE a.id = quiz_answers.attempt_id AND a.user_id = auth.uid()
  ));

CREATE POLICY "Admins view all answers" ON public.quiz_answers
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Students update own in-progress answers" ON public.quiz_answers
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.quiz_attempts a
    WHERE a.id = quiz_answers.attempt_id
      AND a.user_id = auth.uid()
      AND a.status = 'in_progress'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.quiz_attempts a
    WHERE a.id = quiz_answers.attempt_id
      AND a.user_id = auth.uid()
      AND a.status = 'in_progress'
  ));

CREATE TRIGGER trg_quiz_answers_updated_at
  BEFORE UPDATE ON public.quiz_answers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Helper: recompute a single answer's correctness/points ============
CREATE OR REPLACE FUNCTION public._grade_answer(_answer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a RECORD;
  q RECORD;
  correct_ids uuid[];
  selected_ids uuid[];
BEGIN
  SELECT * INTO a FROM public.quiz_answers WHERE id = _answer_id;
  IF a IS NULL THEN RETURN; END IF;
  SELECT * INTO q FROM public.quiz_questions WHERE id = a.question_id;

  IF q.type = 'fill_blank' THEN
    -- Manual grading; leave nulls until admin grades
    UPDATE public.quiz_answers
      SET is_correct = NULL, points_earned = 0
      WHERE id = _answer_id;
    RETURN;
  END IF;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO correct_ids
    FROM public.quiz_question_options
    WHERE question_id = q.id AND is_correct = true;

  SELECT COALESCE(array_agg((elem)::uuid), ARRAY[]::uuid[]) INTO selected_ids
    FROM jsonb_array_elements_text(a.selected_option_ids) AS elem;

  IF (SELECT count(*) FROM unnest(selected_ids) s WHERE s = ANY(correct_ids)) = array_length(correct_ids,1)
     AND array_length(selected_ids,1) = array_length(correct_ids,1) THEN
    UPDATE public.quiz_answers
      SET is_correct = true, points_earned = q.points
      WHERE id = _answer_id;
  ELSE
    UPDATE public.quiz_answers
      SET is_correct = false, points_earned = 0
      WHERE id = _answer_id;
  END IF;
END;
$$;

-- ============ Finalize an attempt (internal) ============
CREATE OR REPLACE FUNCTION public._finalize_attempt(_attempt_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a RECORD;
  quiz RECORD;
  has_fill_blank boolean;
  earned numeric;
  pct numeric;
BEGIN
  SELECT * INTO a FROM public.quiz_attempts WHERE id = _attempt_id FOR UPDATE;
  IF a IS NULL OR a.status <> 'in_progress' THEN RETURN; END IF;

  SELECT * INTO quiz FROM public.quizzes WHERE id = a.quiz_id;

  -- Any answered auto-gradable answers should already be graded; unanswered auto-gradable → 0
  -- (points_earned default is 0, so nothing to update for unanswered.)

  SELECT EXISTS (
    SELECT 1 FROM public.quiz_questions
    WHERE quiz_id = a.quiz_id AND form_number = a.form_number AND type = 'fill_blank'
  ) INTO has_fill_blank;

  SELECT COALESCE(SUM(points_earned), 0) INTO earned
    FROM public.quiz_answers WHERE attempt_id = _attempt_id;

  IF has_fill_blank THEN
    UPDATE public.quiz_attempts
      SET status = 'needs_review',
          earned_points = earned,
          percentage = NULL,
          passed = NULL,
          submitted_at = COALESCE(submitted_at, now())
      WHERE id = _attempt_id;
  ELSE
    pct := CASE WHEN a.total_points > 0 THEN round((earned / a.total_points) * 100) ELSE 0 END;
    UPDATE public.quiz_attempts
      SET status = 'graded',
          earned_points = earned,
          percentage = pct,
          passed = pct >= quiz.pass_percentage,
          submitted_at = COALESCE(submitted_at, now())
      WHERE id = _attempt_id;
  END IF;
END;
$$;

-- ============ Start attempt (atomic) ============
CREATE OR REPLACE FUNCTION public.start_quiz_attempt(_quiz_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_quiz RECORD;
  v_enrolled boolean;
  v_existing uuid;
  v_form int;
  v_attempt_no int;
  v_finished_count int;
  v_expires timestamptz;
  v_started timestamptz := now();
  v_qorder jsonb;
  v_total numeric;
  v_attempt_id uuid;
  q RECORD;
  v_opt_order jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_quiz FROM public.quizzes WHERE id = _quiz_id;
  IF v_quiz IS NULL THEN RAISE EXCEPTION 'quiz not found'; END IF;

  -- Enrollment check (admins bypass)
  IF NOT public.has_role(v_user, 'admin') THEN
    SELECT EXISTS (SELECT 1 FROM public.enrollments WHERE user_id = v_user AND course_id = v_quiz.course_id) INTO v_enrolled;
    IF NOT v_enrolled THEN RAISE EXCEPTION 'not enrolled' USING ERRCODE='42501'; END IF;
  END IF;

  -- Date window
  IF v_quiz.start_at IS NOT NULL AND now() < v_quiz.start_at THEN
    RAISE EXCEPTION 'quiz not started yet';
  END IF;
  IF v_quiz.end_at IS NOT NULL AND now() > v_quiz.end_at THEN
    RAISE EXCEPTION 'quiz window closed';
  END IF;

  -- Resume existing in-progress
  SELECT id INTO v_existing FROM public.quiz_attempts
    WHERE quiz_id = _quiz_id AND user_id = v_user AND status = 'in_progress'
    ORDER BY started_at DESC LIMIT 1;
  IF v_existing IS NOT NULL THEN
    -- Check if expired → finalize then continue to a new attempt if allowed
    IF (SELECT expires_at FROM public.quiz_attempts WHERE id = v_existing) < now() THEN
      PERFORM public._finalize_attempt(v_existing);
    ELSE
      RETURN v_existing;
    END IF;
  END IF;

  -- Attempt count limit (finished attempts)
  SELECT count(*) INTO v_finished_count FROM public.quiz_attempts
    WHERE quiz_id = _quiz_id AND user_id = v_user AND status IN ('submitted','needs_review','graded');
  IF v_finished_count >= v_quiz.max_attempts THEN
    RAISE EXCEPTION 'max attempts reached';
  END IF;

  v_form := 1 + floor(random() * v_quiz.forms_count)::int;
  SELECT count(*) + 1 INTO v_attempt_no FROM public.quiz_attempts WHERE quiz_id = _quiz_id AND user_id = v_user;

  -- Build question order (server-side shuffle)
  IF v_quiz.randomize_enabled THEN
    SELECT COALESCE(jsonb_agg(id ORDER BY random()), '[]'::jsonb) INTO v_qorder
      FROM public.quiz_questions WHERE quiz_id = _quiz_id AND form_number = v_form;
  ELSE
    SELECT COALESCE(jsonb_agg(id ORDER BY order_index, id), '[]'::jsonb) INTO v_qorder
      FROM public.quiz_questions WHERE quiz_id = _quiz_id AND form_number = v_form;
  END IF;

  IF jsonb_array_length(v_qorder) = 0 THEN
    RAISE EXCEPTION 'quiz form has no questions';
  END IF;

  SELECT COALESCE(SUM(points), 0) INTO v_total
    FROM public.quiz_questions WHERE quiz_id = _quiz_id AND form_number = v_form;

  v_expires := v_started + (v_quiz.duration_minutes * INTERVAL '1 minute');
  IF v_quiz.end_at IS NOT NULL AND v_expires > v_quiz.end_at THEN
    v_expires := v_quiz.end_at;
  END IF;

  INSERT INTO public.quiz_attempts (quiz_id, user_id, form_number, attempt_number, started_at, expires_at, question_order, total_points)
    VALUES (_quiz_id, v_user, v_form, v_attempt_no, v_started, v_expires, v_qorder, v_total)
    RETURNING id INTO v_attempt_id;

  -- Pre-create answer rows with per-question shuffled option orders
  FOR q IN
    SELECT * FROM public.quiz_questions WHERE quiz_id = _quiz_id AND form_number = v_form
  LOOP
    IF q.type = 'fill_blank' THEN
      v_opt_order := '[]'::jsonb;
    ELSIF v_quiz.randomize_enabled THEN
      SELECT COALESCE(jsonb_agg(id ORDER BY random()), '[]'::jsonb) INTO v_opt_order
        FROM public.quiz_question_options WHERE question_id = q.id;
    ELSE
      SELECT COALESCE(jsonb_agg(id ORDER BY order_index, id), '[]'::jsonb) INTO v_opt_order
        FROM public.quiz_question_options WHERE question_id = q.id;
    END IF;

    INSERT INTO public.quiz_answers (attempt_id, question_id, option_order)
      VALUES (v_attempt_id, q.id, v_opt_order);
  END LOOP;

  RETURN v_attempt_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_quiz_attempt(uuid) TO authenticated;

-- ============ Get or finalize attempt (lazy) ============
CREATE OR REPLACE FUNCTION public.get_or_finalize_attempt(_attempt_id uuid)
RETURNS SETOF public.quiz_attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  a RECORD;
BEGIN
  SELECT * INTO a FROM public.quiz_attempts WHERE id = _attempt_id;
  IF a IS NULL THEN RETURN; END IF;
  IF a.user_id <> v_user AND NOT public.has_role(v_user, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF a.status = 'in_progress' AND now() > a.expires_at THEN
    PERFORM public._finalize_attempt(_attempt_id);
  END IF;
  RETURN QUERY SELECT * FROM public.quiz_attempts WHERE id = _attempt_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_finalize_attempt(uuid) TO authenticated;

-- ============ Get attempt questions with options (student view — no is_correct) ============
CREATE OR REPLACE FUNCTION public.get_attempt_questions(_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  a RECORD;
  result jsonb;
BEGIN
  -- Ensure finalization if expired
  PERFORM public.get_or_finalize_attempt(_attempt_id);
  SELECT * INTO a FROM public.quiz_attempts WHERE id = _attempt_id;
  IF a IS NULL THEN RAISE EXCEPTION 'not found'; END IF;
  IF a.user_id <> v_user AND NOT public.has_role(v_user, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  SELECT jsonb_agg(row_to_json(q_row) ORDER BY q_row.pos)
  INTO result
  FROM (
    SELECT
      ans.question_id AS id,
      q.type,
      q.content,
      q.image_url,
      q.points,
      ans.option_order,
      ans.selected_option_ids,
      ans.fill_blank_text,
      ans.answered_at,
      ans.time_spent_seconds,
      (
        SELECT COALESCE(jsonb_object_agg(o.id, jsonb_build_object('id', o.id, 'content', o.content)), '{}'::jsonb)
        FROM public.quiz_question_options o
        WHERE o.question_id = ans.question_id
      ) AS options_by_id,
      COALESCE((SELECT pos_idx FROM jsonb_array_elements_text(a.question_order) WITH ORDINALITY t(qid, pos_idx) WHERE qid = ans.question_id::text LIMIT 1), 0) AS pos
    FROM public.quiz_answers ans
    JOIN public.quiz_questions q ON q.id = ans.question_id
    WHERE ans.attempt_id = _attempt_id
  ) q_row;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_attempt_questions(uuid) TO authenticated;

-- ============ Save answer ============
CREATE OR REPLACE FUNCTION public.save_quiz_answer(
  _attempt_id uuid,
  _question_id uuid,
  _selected_option_ids jsonb,
  _fill_blank_text text,
  _time_delta_seconds numeric DEFAULT 0
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  a RECORD;
  ans_id uuid;
  q_type text;
BEGIN
  SELECT * INTO a FROM public.quiz_attempts WHERE id = _attempt_id;
  IF a IS NULL OR a.user_id <> v_user THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF a.status <> 'in_progress' THEN RAISE EXCEPTION 'attempt not in progress'; END IF;
  IF now() > a.expires_at THEN
    PERFORM public._finalize_attempt(_attempt_id);
    RAISE EXCEPTION 'attempt expired';
  END IF;

  SELECT id INTO ans_id FROM public.quiz_answers WHERE attempt_id = _attempt_id AND question_id = _question_id;
  IF ans_id IS NULL THEN RAISE EXCEPTION 'answer row missing'; END IF;

  SELECT type INTO q_type FROM public.quiz_questions WHERE id = _question_id;

  UPDATE public.quiz_answers
    SET selected_option_ids = COALESCE(_selected_option_ids, '[]'::jsonb),
        fill_blank_text = _fill_blank_text,
        time_spent_seconds = time_spent_seconds + GREATEST(COALESCE(_time_delta_seconds, 0), 0),
        answered_at = COALESCE(answered_at,
          CASE
            WHEN q_type = 'fill_blank' AND _fill_blank_text IS NOT NULL AND length(trim(_fill_blank_text)) > 0 THEN now()
            WHEN q_type <> 'fill_blank' AND jsonb_array_length(COALESCE(_selected_option_ids, '[]'::jsonb)) > 0 THEN now()
            ELSE NULL
          END)
    WHERE id = ans_id;

  -- Auto-grade for auto types
  IF q_type <> 'fill_blank' THEN
    PERFORM public._grade_answer(ans_id);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_quiz_answer(uuid, uuid, jsonb, text, numeric) TO authenticated;

-- ============ Add time only (for question navigation without answer change) ============
CREATE OR REPLACE FUNCTION public.add_answer_time(_attempt_id uuid, _question_id uuid, _delta numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  a RECORD;
BEGIN
  SELECT * INTO a FROM public.quiz_attempts WHERE id = _attempt_id;
  IF a IS NULL OR a.user_id <> v_user THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF a.status <> 'in_progress' THEN RETURN; END IF;
  UPDATE public.quiz_answers
    SET time_spent_seconds = time_spent_seconds + GREATEST(COALESCE(_delta,0), 0)
    WHERE attempt_id = _attempt_id AND question_id = _question_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_answer_time(uuid, uuid, numeric) TO authenticated;

-- ============ Submit ============
CREATE OR REPLACE FUNCTION public.submit_quiz_attempt(_attempt_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  a RECORD;
BEGIN
  SELECT * INTO a FROM public.quiz_attempts WHERE id = _attempt_id;
  IF a IS NULL OR a.user_id <> v_user THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF a.status <> 'in_progress' THEN RETURN; END IF;
  PERFORM public._finalize_attempt(_attempt_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_quiz_attempt(uuid) TO authenticated;

-- ============ Heartbeat ============
CREATE OR REPLACE FUNCTION public.heartbeat_quiz_attempt(_attempt_id uuid)
RETURNS boolean  -- true = still in progress, false = finalized/expired
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a RECORD;
BEGIN
  SELECT * INTO a FROM public.quiz_attempts WHERE id = _attempt_id;
  IF a IS NULL THEN RETURN false; END IF;
  IF a.user_id <> auth.uid() AND NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF a.status = 'in_progress' AND now() > a.expires_at THEN
    PERFORM public._finalize_attempt(_attempt_id);
    RETURN false;
  END IF;
  RETURN a.status = 'in_progress';
END;
$$;

GRANT EXECUTE ON FUNCTION public.heartbeat_quiz_attempt(uuid) TO authenticated;

-- ============ List my attempts for a quiz ============
CREATE OR REPLACE FUNCTION public.list_my_quiz_attempts(_quiz_id uuid)
RETURNS SETOF public.quiz_attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  r RECORD;
BEGIN
  -- Lazy finalize any expired in-progress
  FOR r IN SELECT id FROM public.quiz_attempts
    WHERE quiz_id = _quiz_id AND user_id = v_user
      AND status = 'in_progress' AND now() > expires_at
  LOOP
    PERFORM public._finalize_attempt(r.id);
  END LOOP;

  RETURN QUERY
    SELECT * FROM public.quiz_attempts
    WHERE quiz_id = _quiz_id AND user_id = v_user
    ORDER BY attempt_number DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_quiz_attempts(uuid) TO authenticated;

-- ============ Attempt details (with correct answers for review) ============
CREATE OR REPLACE FUNCTION public.get_attempt_details(_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  a RECORD;
  attempt_json jsonb;
  qs jsonb;
BEGIN
  PERFORM public.get_or_finalize_attempt(_attempt_id);
  SELECT * INTO a FROM public.quiz_attempts WHERE id = _attempt_id;
  IF a IS NULL THEN RAISE EXCEPTION 'not found'; END IF;
  IF a.user_id <> v_user AND NOT public.has_role(v_user, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  SELECT to_jsonb(a) INTO attempt_json;

  SELECT jsonb_agg(row_to_json(x) ORDER BY x.pos)
  INTO qs
  FROM (
    SELECT
      ans.question_id AS id,
      q.type,
      q.content,
      q.image_url,
      q.points,
      q.model_answer_text,
      ans.option_order,
      ans.selected_option_ids,
      ans.fill_blank_text,
      ans.is_correct,
      ans.points_earned,
      ans.time_spent_seconds,
      ans.answered_at,
      (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('id', o.id, 'content', o.content, 'is_correct', o.is_correct) ORDER BY o.order_index), '[]'::jsonb)
        FROM public.quiz_question_options o WHERE o.question_id = ans.question_id
      ) AS options,
      COALESCE((SELECT pos_idx FROM jsonb_array_elements_text(a.question_order) WITH ORDINALITY t(qid, pos_idx) WHERE qid = ans.question_id::text LIMIT 1), 0) AS pos
    FROM public.quiz_answers ans
    JOIN public.quiz_questions q ON q.id = ans.question_id
    WHERE ans.attempt_id = _attempt_id
  ) x;

  RETURN jsonb_build_object('attempt', attempt_json, 'questions', COALESCE(qs, '[]'::jsonb));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_attempt_details(uuid) TO authenticated;

-- ============ Quiz meta for student (bypasses need to expose more tables) ============
CREATE OR REPLACE FUNCTION public.get_quiz_for_student(_quiz_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  q RECORD;
  enrolled boolean;
BEGIN
  SELECT * INTO q FROM public.quizzes WHERE id = _quiz_id;
  IF q IS NULL THEN RETURN NULL; END IF;
  IF NOT public.has_role(v_user, 'admin') THEN
    SELECT EXISTS (SELECT 1 FROM public.enrollments WHERE user_id = v_user AND course_id = q.course_id) INTO enrolled;
    IF NOT enrolled THEN RAISE EXCEPTION 'not enrolled' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN to_jsonb(q);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_quiz_for_student(uuid) TO authenticated;

-- ============ List quizzes for a unit (student-safe view) ============
CREATE OR REPLACE FUNCTION public.get_unit_quizzes(_unit_id uuid)
RETURNS TABLE(id uuid, unit_id uuid, title text, order_index int, duration_minutes int, pass_percentage int, max_attempts int, start_at timestamptz, end_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT q.id, q.unit_id, q.title, q.order_index, q.duration_minutes, q.pass_percentage, q.max_attempts, q.start_at, q.end_at
  FROM public.quizzes q
  JOIN public.units u ON u.id = q.unit_id
  JOIN public.courses c ON c.id = u.course_id
  WHERE q.unit_id = _unit_id
    AND (c.status = 'published' OR public.has_role(auth.uid(), 'admin'));
$$;

GRANT EXECUTE ON FUNCTION public.get_unit_quizzes(uuid) TO authenticated, anon;

-- Admin UPDATE policies
CREATE POLICY "Admins update all attempts" ON public.quiz_attempts
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update all answers" ON public.quiz_answers
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Grading save RPC
CREATE OR REPLACE FUNCTION public.admin_save_grading(_attempt_id uuid, _updates jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  a RECORD;
  quiz RECORD;
  upd jsonb;
  q_id uuid;
  new_correct boolean;
  q_points numeric;
  earned numeric;
  pct numeric;
  has_ungraded_fb boolean;
BEGIN
  IF NOT public.has_role(v_user, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO a FROM public.quiz_attempts WHERE id = _attempt_id FOR UPDATE;
  IF a IS NULL THEN RAISE EXCEPTION 'attempt not found'; END IF;
  SELECT * INTO quiz FROM public.quizzes WHERE id = a.quiz_id;

  FOR upd IN SELECT * FROM jsonb_array_elements(COALESCE(_updates, '[]'::jsonb))
  LOOP
    q_id := (upd->>'question_id')::uuid;
    IF (upd->'is_correct') IS NULL OR jsonb_typeof(upd->'is_correct') = 'null' THEN
      new_correct := NULL;
    ELSE
      new_correct := (upd->>'is_correct')::boolean;
    END IF;
    SELECT points INTO q_points FROM public.quiz_questions WHERE id = q_id;
    UPDATE public.quiz_answers
       SET is_correct = new_correct,
           points_earned = CASE WHEN new_correct IS TRUE THEN COALESCE(q_points, 0) ELSE 0 END
     WHERE attempt_id = _attempt_id AND question_id = q_id;
  END LOOP;

  SELECT COALESCE(SUM(points_earned), 0) INTO earned
    FROM public.quiz_answers WHERE attempt_id = _attempt_id;

  SELECT EXISTS (
    SELECT 1 FROM public.quiz_answers ans
    JOIN public.quiz_questions q ON q.id = ans.question_id
    WHERE ans.attempt_id = _attempt_id
      AND q.type = 'fill_blank'
      AND ans.is_correct IS NULL
  ) INTO has_ungraded_fb;

  IF has_ungraded_fb THEN
    UPDATE public.quiz_attempts
      SET status = 'needs_review',
          earned_points = earned
      WHERE id = _attempt_id;
  ELSE
    pct := CASE WHEN a.total_points > 0 THEN round((earned / a.total_points) * 100) ELSE 0 END;
    UPDATE public.quiz_attempts
      SET status = 'graded',
          earned_points = earned,
          percentage = pct,
          passed = pct >= quiz.pass_percentage,
          submitted_at = COALESCE(submitted_at, now())
      WHERE id = _attempt_id;
  END IF;

  RETURN (SELECT to_jsonb(x) FROM public.quiz_attempts x WHERE x.id = _attempt_id);
END;
$$;

-- Feedback save RPC
CREATE OR REPLACE FUNCTION public.admin_save_feedback(_attempt_id uuid, _feedback text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.quiz_attempts
    SET feedback = _feedback,
        feedback_given_at = now()
    WHERE id = _attempt_id;
  RETURN (SELECT to_jsonb(x) FROM public.quiz_attempts x WHERE x.id = _attempt_id);
END;
$$;

-- Official result RPC — always computed live against current quiz settings
CREATE OR REPLACE FUNCTION public.get_official_result(_quiz_id uuid, _user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  policy text;
  a RECORD;
BEGIN
  IF auth.uid() <> _user_id AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(attempt_result_policy, 'highest') INTO policy
    FROM public.quizzes WHERE id = _quiz_id;
  IF policy IS NULL THEN RETURN NULL; END IF;

  IF policy = 'first' THEN
    SELECT * INTO a FROM public.quiz_attempts
      WHERE quiz_id = _quiz_id AND user_id = _user_id AND status = 'graded'
      ORDER BY attempt_number ASC LIMIT 1;
  ELSIF policy = 'last' THEN
    SELECT * INTO a FROM public.quiz_attempts
      WHERE quiz_id = _quiz_id AND user_id = _user_id AND status = 'graded'
      ORDER BY attempt_number DESC LIMIT 1;
  ELSE
    SELECT * INTO a FROM public.quiz_attempts
      WHERE quiz_id = _quiz_id AND user_id = _user_id AND status = 'graded'
      ORDER BY percentage DESC NULLS LAST, attempt_number ASC LIMIT 1;
  END IF;

  IF a IS NULL THEN RETURN NULL; END IF;
  RETURN to_jsonb(a);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_quiz_attempts(
  _user_search text DEFAULT NULL,
  _course_id uuid DEFAULT NULL,
  _stage_id uuid DEFAULT NULL,
  _subject_id uuid DEFAULT NULL,
  _needs_review_only boolean DEFAULT false,
  _limit int DEFAULT 100,
  _offset int DEFAULT 0
)
RETURNS TABLE (
  attempt_id uuid,
  quiz_id uuid,
  user_id uuid,
  student_name text,
  student_email text,
  course_id uuid,
  course_title text,
  subject_id uuid,
  subject_name text,
  stage_id uuid,
  stage_name text,
  quiz_title text,
  form_number int,
  attempt_number int,
  status text,
  percentage numeric,
  passed boolean,
  earned_points numeric,
  total_points numeric,
  pass_percentage int,
  submitted_at timestamptz,
  has_feedback boolean,
  feedback_given_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_is_admin boolean := public.has_role(v_user, 'admin');
  v_search text := NULLIF(trim(COALESCE(_user_search, '')), '');
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required' USING ERRCODE='42501'; END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      qa.id AS attempt_id,
      qa.quiz_id,
      qa.user_id,
      COALESCE(p.full_name, '') AS student_name,
      u.email::text AS student_email,
      c.id AS course_id,
      c.title AS course_title,
      s.id AS subject_id,
      s.name AS subject_name,
      st.id AS stage_id,
      st.name AS stage_name,
      q.title AS quiz_title,
      qa.form_number,
      qa.attempt_number,
      qa.status,
      qa.percentage,
      qa.passed,
      qa.earned_points,
      qa.total_points,
      q.pass_percentage,
      qa.submitted_at,
      (qa.feedback_given_at IS NOT NULL) AS has_feedback,
      qa.feedback_given_at
    FROM public.quiz_attempts qa
    JOIN public.quizzes q ON q.id = qa.quiz_id
    JOIN public.courses c ON c.id = q.course_id
    LEFT JOIN public.subjects s ON s.id = c.subject_id
    LEFT JOIN public.stages st ON st.id = c.stage_id
    LEFT JOIN public.profiles p ON p.id = qa.user_id
    LEFT JOIN auth.users u ON u.id = qa.user_id
    WHERE qa.status <> 'in_progress'
      AND (v_is_admin OR qa.user_id = v_user)
      AND (_course_id IS NULL OR c.id = _course_id)
      AND (NOT v_is_admin OR _stage_id IS NULL OR c.stage_id = _stage_id)
      AND (NOT v_is_admin OR _subject_id IS NULL OR c.subject_id = _subject_id)
      AND (NOT v_is_admin OR NOT _needs_review_only OR qa.status = 'needs_review')
      AND (
        NOT v_is_admin
        OR v_search IS NULL
        OR p.full_name ILIKE '%' || v_search || '%'
        OR u.email ILIKE '%' || v_search || '%'
      )
  ),
  counted AS (
    SELECT b.*, COUNT(*) OVER () AS total_count FROM base b
  )
  SELECT * FROM counted
  ORDER BY submitted_at DESC NULLS LAST, attempt_id DESC
  LIMIT GREATEST(COALESCE(_limit, 100), 1)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$$;

-- ============= PHASE 20: Profile phone fields =============
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_number text,
  ADD COLUMN IF NOT EXISTS guardian_phone text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS auth_email text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_number_unique
  ON public.profiles (phone_number) WHERE phone_number IS NOT NULL;

-- Trigger to sync auth.users -> profiles on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role, phone_number, guardian_phone, email, auth_email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    'student',
    NULLIF(NEW.raw_user_meta_data->>'phone_number', ''),
    NULLIF(NEW.raw_user_meta_data->>'guardian_phone', ''),
    NULLIF(NEW.raw_user_meta_data->>'real_email', ''),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Resolve login identifier (phone or email) -> auth email
CREATE OR REPLACE FUNCTION public.resolve_login_email(_identifier text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id text := trim(COALESCE(_identifier, ''));
  v_email text;
BEGIN
  IF v_id ~ '^201[0125][0-9]{8}$' THEN
    SELECT auth_email INTO v_email FROM public.profiles
      WHERE phone_number = v_id LIMIT 1;
    RETURN COALESCE(v_email, v_id || '@internal.noemail.local');
  END IF;
  RETURN lower(v_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.resolve_login_email(text) TO anon, authenticated;

-- ============= PHASE 19: Analytics RPCs =============
CREATE OR REPLACE FUNCTION public.get_most_failed_quizzes(_limit int DEFAULT 10)
RETURNS TABLE (
  quiz_id uuid,
  quiz_title text,
  course_id uuid,
  course_title text,
  stage_id uuid,
  stage_name text,
  subject_id uuid,
  subject_name text,
  failed_count bigint,
  total_official bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH ranked AS (
    SELECT qa.*, q.attempt_result_policy AS policy,
      ROW_NUMBER() OVER (
        PARTITION BY qa.quiz_id, qa.user_id
        ORDER BY
          CASE WHEN q.attempt_result_policy = 'first' THEN qa.attempt_number END ASC NULLS LAST,
          CASE WHEN q.attempt_result_policy = 'last'  THEN qa.attempt_number END DESC NULLS LAST,
          CASE WHEN q.attempt_result_policy NOT IN ('first','last') THEN qa.percentage END DESC NULLS LAST,
          CASE WHEN q.attempt_result_policy NOT IN ('first','last') THEN qa.attempt_number END ASC
      ) AS rn
    FROM public.quiz_attempts qa
    JOIN public.quizzes q ON q.id = qa.quiz_id
    WHERE qa.status = 'graded'
  ),
  official AS (SELECT * FROM ranked WHERE rn = 1),
  agg AS (
    SELECT o.quiz_id,
      COUNT(*) FILTER (WHERE o.passed IS FALSE) AS failed_count,
      COUNT(*) AS total_official
    FROM official o
    GROUP BY o.quiz_id
    HAVING COUNT(*) FILTER (WHERE o.passed IS FALSE) > 0
  )
  SELECT
    q.id, q.title,
    c.id, c.title,
    st.id, st.name,
    s.id, s.name,
    a.failed_count, a.total_official
  FROM agg a
  JOIN public.quizzes q ON q.id = a.quiz_id
  JOIN public.courses c ON c.id = q.course_id
  LEFT JOIN public.stages st ON st.id = c.stage_id
  LEFT JOIN public.subjects s ON s.id = c.subject_id
  ORDER BY a.failed_count DESC, a.total_official DESC
  LIMIT GREATEST(COALESCE(_limit, 10), 1);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_most_failed_quizzes(int) TO authenticated;

-- Per-question analysis for a given quiz + form (based on OFFICIAL attempts only)
CREATE OR REPLACE FUNCTION public.get_question_analysis(_quiz_id uuid, _form int)
RETURNS TABLE (
  question_id uuid,
  content text,
  type text,
  points numeric,
  order_index int,
  correct_count bigint,
  incorrect_count bigint,
  unanswered_count bigint,
  total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH ranked AS (
    SELECT qa.*,
      ROW_NUMBER() OVER (
        PARTITION BY qa.user_id
        ORDER BY
          CASE WHEN q.attempt_result_policy = 'first' THEN qa.attempt_number END ASC NULLS LAST,
          CASE WHEN q.attempt_result_policy = 'last'  THEN qa.attempt_number END DESC NULLS LAST,
          CASE WHEN q.attempt_result_policy NOT IN ('first','last') THEN qa.percentage END DESC NULLS LAST,
          CASE WHEN q.attempt_result_policy NOT IN ('first','last') THEN qa.attempt_number END ASC
      ) AS rn
    FROM public.quiz_attempts qa
    JOIN public.quizzes q ON q.id = qa.quiz_id
    WHERE qa.quiz_id = _quiz_id AND qa.status = 'graded'
  ),
  official AS (SELECT * FROM ranked WHERE rn = 1 AND form_number = _form)
  SELECT
    qq.id,
    qq.content,
    qq.type::text,
    qq.points::numeric,
    qq.order_index,
    COUNT(*) FILTER (WHERE ans.is_correct IS TRUE) AS correct_count,
    COUNT(*) FILTER (WHERE ans.is_correct IS FALSE) AS incorrect_count,
    COUNT(*) FILTER (WHERE ans.is_correct IS NULL) AS unanswered_count,
    COUNT(ans.id) AS total_count
  FROM public.quiz_questions qq
  LEFT JOIN public.quiz_answers ans
    ON ans.question_id = qq.id
   AND ans.attempt_id IN (SELECT id FROM official)
  WHERE qq.quiz_id = _quiz_id AND qq.form_number = _form
  GROUP BY qq.id, qq.content, qq.type, qq.points, qq.order_index
  ORDER BY qq.order_index;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_question_analysis(uuid, int) TO authenticated;

-- ============= list_quiz_attempts: add _quiz_id filter =============
CREATE OR REPLACE FUNCTION public.list_quiz_attempts(
  _user_search text DEFAULT NULL,
  _course_id uuid DEFAULT NULL,
  _stage_id uuid DEFAULT NULL,
  _subject_id uuid DEFAULT NULL,
  _needs_review_only boolean DEFAULT false,
  _quiz_id uuid DEFAULT NULL,
  _limit int DEFAULT 100,
  _offset int DEFAULT 0
)
RETURNS TABLE(
  attempt_id uuid, quiz_id uuid, user_id uuid, student_name text, student_email text,
  course_id uuid, course_title text, subject_id uuid, subject_name text,
  stage_id uuid, stage_name text, quiz_title text, form_number int, attempt_number int,
  status text, percentage numeric, passed boolean, earned_points numeric, total_points numeric,
  pass_percentage int, submitted_at timestamptz, has_feedback boolean,
  feedback_given_at timestamptz, total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_is_admin boolean := public.has_role(v_user, 'admin');
  v_search text := NULLIF(trim(COALESCE(_user_search, '')), '');
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  WITH base AS (
    SELECT
      qa.id AS attempt_id, qa.quiz_id, qa.user_id,
      COALESCE(p.full_name, '') AS student_name,
      u.email::text AS student_email,
      c.id AS course_id, c.title AS course_title,
      s.id AS subject_id, s.name AS subject_name,
      st.id AS stage_id, st.name AS stage_name,
      q.title AS quiz_title, qa.form_number, qa.attempt_number, qa.status,
      qa.percentage, qa.passed, qa.earned_points, qa.total_points,
      q.pass_percentage, qa.submitted_at,
      (qa.feedback_given_at IS NOT NULL) AS has_feedback,
      qa.feedback_given_at
    FROM public.quiz_attempts qa
    JOIN public.quizzes q ON q.id = qa.quiz_id
    JOIN public.courses c ON c.id = q.course_id
    LEFT JOIN public.subjects s ON s.id = c.subject_id
    LEFT JOIN public.stages   st ON st.id = c.stage_id
    LEFT JOIN public.profiles p ON p.id = qa.user_id
    LEFT JOIN auth.users u ON u.id = qa.user_id
    WHERE qa.status <> 'in_progress'
      AND (v_is_admin OR qa.user_id = v_user)
      AND (_course_id IS NULL OR c.id = _course_id)
      AND (_quiz_id IS NULL OR q.id = _quiz_id)
      AND (NOT v_is_admin OR _stage_id IS NULL OR c.stage_id = _stage_id)
      AND (NOT v_is_admin OR _subject_id IS NULL OR c.subject_id = _subject_id)
      AND (NOT v_is_admin OR NOT _needs_review_only OR qa.status = 'needs_review')
      AND (
        NOT v_is_admin OR v_search IS NULL
        OR p.full_name ILIKE '%' || v_search || '%'
        OR u.email ILIKE '%' || v_search || '%'
      )
  ),
  counted AS (SELECT b.*, COUNT(*) OVER () AS total_count FROM base b)
  SELECT * FROM counted
  ORDER BY submitted_at DESC NULLS LAST, attempt_id DESC
  LIMIT GREATEST(COALESCE(_limit, 100), 1)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$$;

DROP FUNCTION IF EXISTS public.get_question_analysis(uuid, int);
CREATE OR REPLACE FUNCTION public.get_question_analysis(_quiz_id uuid, _form int)
RETURNS TABLE (
  question_id uuid,
  content jsonb,
  type text,
  points numeric,
  order_index int,
  correct_count bigint,
  incorrect_count bigint,
  unanswered_count bigint,
  total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH ranked AS (
    SELECT qa.*,
      ROW_NUMBER() OVER (
        PARTITION BY qa.user_id
        ORDER BY
          CASE WHEN q.attempt_result_policy = 'first' THEN qa.attempt_number END ASC NULLS LAST,
          CASE WHEN q.attempt_result_policy = 'last'  THEN qa.attempt_number END DESC NULLS LAST,
          CASE WHEN q.attempt_result_policy NOT IN ('first','last') THEN qa.percentage END DESC NULLS LAST,
          CASE WHEN q.attempt_result_policy NOT IN ('first','last') THEN qa.attempt_number END ASC
      ) AS rn
    FROM public.quiz_attempts qa
    JOIN public.quizzes q ON q.id = qa.quiz_id
    WHERE qa.quiz_id = _quiz_id AND qa.status = 'graded'
  ),
  official AS (SELECT * FROM ranked WHERE rn = 1 AND form_number = _form)
  SELECT
    qq.id,
    qq.content,
    qq.type::text,
    qq.points::numeric,
    qq.order_index,
    COUNT(*) FILTER (WHERE ans.is_correct IS TRUE) AS correct_count,
    COUNT(*) FILTER (WHERE ans.is_correct IS FALSE) AS incorrect_count,
    COUNT(*) FILTER (WHERE ans.is_correct IS NULL) AS unanswered_count,
    COUNT(ans.id) AS total_count
  FROM public.quiz_questions qq
  LEFT JOIN public.quiz_answers ans
    ON ans.question_id = qq.id
   AND ans.attempt_id IN (SELECT id FROM official)
  WHERE qq.quiz_id = _quiz_id AND qq.form_number = _form
  GROUP BY qq.id, qq.content, qq.type, qq.points, qq.order_index
  ORDER BY qq.order_index;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_question_analysis(uuid, int) TO authenticated;

-- Phase 21 + 22 migration

-- 1. Add profile columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS student_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS governorate text,
  ADD COLUMN IF NOT EXISTS registration_type text,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS stage_id uuid REFERENCES public.stages(id) ON DELETE SET NULL;

-- 2. registration_form_fields table
CREATE TABLE IF NOT EXISTS public.registration_form_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_key text NOT NULL UNIQUE,
  label text NOT NULL,
  field_type text NOT NULL CHECK (field_type IN ('text','textarea','number','date','select','radio','checkbox','phone')),
  is_required boolean NOT NULL DEFAULT false,
  is_locked boolean NOT NULL DEFAULT false,
  options jsonb,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.registration_form_fields TO anon, authenticated;
GRANT ALL ON public.registration_form_fields TO service_role, authenticated;

ALTER TABLE public.registration_form_fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read registration form fields" ON public.registration_form_fields;
CREATE POLICY "Anyone can read registration form fields"
  ON public.registration_form_fields FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage registration form fields" ON public.registration_form_fields;
CREATE POLICY "Admins manage registration form fields"
  ON public.registration_form_fields FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER registration_form_fields_updated_at
  BEFORE UPDATE ON public.registration_form_fields
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Seed default fields
INSERT INTO public.registration_form_fields (field_key, label, field_type, is_required, is_locked, options, order_index) VALUES
  ('full_name',        'الاسم الكامل',          'text',   true,  true,  NULL, 0),
  ('phone_number',     'رقم الهاتف',            'phone',  true,  true,  NULL, 1),
  ('password',         'كلمة المرور',           'text',   true,  true,  NULL, 2),
  ('confirm_password', 'تأكيد كلمة المرور',     'text',   false, true,  NULL, 3),
  ('email',            'البريد الإلكتروني',     'text',   false, false, NULL, 4),
  ('governorate',      'المحافظة',              'select', false, false,
    '[{"value":"cairo","label":"القاهرة"},{"value":"giza","label":"الجيزة"},{"value":"alexandria","label":"الإسكندرية"},{"value":"qalyubia","label":"القليوبية"},{"value":"sharqia","label":"الشرقية"},{"value":"dakahlia","label":"الدقهلية"},{"value":"beheira","label":"البحيرة"},{"value":"gharbia","label":"الغربية"},{"value":"monufia","label":"المنوفية"},{"value":"kafr_el_sheikh","label":"كفر الشيخ"},{"value":"damietta","label":"دمياط"},{"value":"port_said","label":"بورسعيد"},{"value":"ismailia","label":"الإسماعيلية"},{"value":"suez","label":"السويس"},{"value":"north_sinai","label":"شمال سيناء"},{"value":"south_sinai","label":"جنوب سيناء"},{"value":"beni_suef","label":"بني سويف"},{"value":"faiyum","label":"الفيوم"},{"value":"minya","label":"المنيا"},{"value":"assiut","label":"أسيوط"},{"value":"sohag","label":"سوهاج"},{"value":"qena","label":"قنا"},{"value":"luxor","label":"الأقصر"},{"value":"aswan","label":"أسوان"},{"value":"red_sea","label":"البحر الأحمر"},{"value":"new_valley","label":"الوادي الجديد"},{"value":"matrouh","label":"مطروح"}]'::jsonb, 5),
  ('registration_type','نوع التسجيل',           'radio',  false, false,
    '[{"value":"online","label":"أونلاين"},{"value":"center","label":"سنتر"}]'::jsonb, 6),
  ('gender',           'النوع',                 'radio',  false, false,
    '[{"value":"male","label":"ذكر"},{"value":"female","label":"أنثى"}]'::jsonb, 7),
  ('guardian_phone',   'رقم هاتف ولي الأمر',    'phone',  true,  false, NULL, 8),
  ('stage_id',         'الصف الدراسي',          'select', false, false, NULL, 9)
ON CONFLICT (field_key) DO NOTHING;

-- 4. Student ID generation
CREATE OR REPLACE FUNCTION public.generate_student_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  candidate text;
  exists_already boolean;
BEGIN
  IF NEW.role <> 'student' OR NEW.student_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  LOOP
    candidate := lpad(floor(random()*1000000)::int::text, 6, '0');
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE student_id = candidate) INTO exists_already;
    EXIT WHEN NOT exists_already;
  END LOOP;
  NEW.student_id := candidate;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_student_id ON public.profiles;
CREATE TRIGGER assign_student_id
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.generate_student_id();

-- 5. Update handle_new_user to also copy known columns and custom_fields
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
BEGIN
  INSERT INTO public.profiles (
    id, full_name, role, phone_number, guardian_phone, email, auth_email,
    governorate, registration_type, gender, stage_id, custom_fields
  ) VALUES (
    NEW.id,
    COALESCE(m->>'full_name', m->>'name', ''),
    COALESCE(NULLIF(m->>'role',''), 'student')::app_role,
    NULLIF(m->>'phone_number',''),
    NULLIF(m->>'guardian_phone',''),
    NULLIF(m->>'real_email',''),
    NEW.email,
    NULLIF(m->>'governorate',''),
    NULLIF(m->>'registration_type',''),
    NULLIF(m->>'gender',''),
    CASE WHEN NULLIF(m->>'stage_id','') IS NOT NULL THEN (m->>'stage_id')::uuid ELSE NULL END,
    COALESCE(m->'custom_fields', '{}'::jsonb)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 6. Backfill student_id for existing student profiles
DO $$
DECLARE
  r RECORD;
  candidate text;
  exists_already boolean;
BEGIN
  FOR r IN SELECT id FROM public.profiles WHERE role = 'student' AND student_id IS NULL LOOP
    LOOP
      candidate := lpad(floor(random()*1000000)::int::text, 6, '0');
      SELECT EXISTS(SELECT 1 FROM public.profiles WHERE student_id = candidate) INTO exists_already;
      EXIT WHEN NOT exists_already;
    END LOOP;
    UPDATE public.profiles SET student_id = candidate WHERE id = r.id;
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Avatars are viewable" ON storage.objects;
CREATE POLICY "Avatars are viewable" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users upload own avatar" ON storage.objects;
CREATE POLICY "Users upload own avatar" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(),'admin'))
  );

DROP POLICY IF EXISTS "Users update own avatar" ON storage.objects;
CREATE POLICY "Users update own avatar" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(),'admin'))
  );

DROP POLICY IF EXISTS "Users delete own avatar" ON storage.objects;
CREATE POLICY "Users delete own avatar" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(),'admin'))
  );

-- 1. Ban flag
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_banned boolean NOT NULL DEFAULT false;

-- 2. Admin management policies on profiles
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "Admins can update all profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;
CREATE POLICY "Admins can delete profiles" ON public.profiles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 3. Update resolve_login_email to reject banned accounts by returning a marker
CREATE OR REPLACE FUNCTION public.resolve_login_email(_identifier text)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id text := trim(COALESCE(_identifier, ''));
  v_email text;
BEGIN
  IF v_id ~ '^201[0125][0-9]{8}$' THEN
    SELECT auth_email INTO v_email FROM public.profiles
      WHERE phone_number = v_id LIMIT 1;
    RETURN COALESCE(v_email, v_id || '@internal.noemail.local');
  END IF;
  RETURN lower(v_id);
END;
$$;

-- 4. Ban check helper (used post-login)
CREATE OR REPLACE FUNCTION public.is_current_user_banned()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE((SELECT is_banned FROM public.profiles WHERE id = auth.uid()), false);
$$;
GRANT EXECUTE ON FUNCTION public.is_current_user_banned() TO authenticated, anon;

-- 5. Admin students list RPC (dynamic filter via jsonb)
CREATE OR REPLACE FUNCTION public.admin_list_students(
  _search text DEFAULT NULL,
  _known_filters jsonb DEFAULT '{}'::jsonb,
  _custom_filters jsonb DEFAULT '{}'::jsonb,
  _limit int DEFAULT 50,
  _offset int DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  full_name text,
  phone_number text,
  student_id text,
  email text,
  auth_email text,
  avatar_url text,
  is_banned boolean,
  created_at timestamptz,
  governorate text,
  registration_type text,
  gender text,
  stage_id uuid,
  stage_name text,
  custom_fields jsonb,
  enrollments_count bigint,
  total_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_search text := NULLIF(trim(COALESCE(_search, '')), '');
  v_is_digit_id boolean := v_search IS NOT NULL AND v_search ~ '^[0-9]{1,6}$';
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT p.*, st.name AS stage_name,
      (SELECT COUNT(*) FROM public.enrollments e WHERE e.user_id = p.id) AS enrollments_count
    FROM public.profiles p
    LEFT JOIN public.stages st ON st.id = p.stage_id
    WHERE p.role = 'student'
      AND (
        v_search IS NULL
        OR p.full_name ILIKE '%'||v_search||'%'
        OR p.phone_number ILIKE '%'||v_search||'%'
        OR p.student_id ILIKE '%'||v_search||'%'
        OR (v_is_digit_id AND p.student_id = lpad(v_search, 6, '0'))
      )
      AND (NOT (_known_filters ? 'governorate') OR p.governorate = _known_filters->>'governorate')
      AND (NOT (_known_filters ? 'registration_type') OR p.registration_type = _known_filters->>'registration_type')
      AND (NOT (_known_filters ? 'gender') OR p.gender = _known_filters->>'gender')
      AND (NOT (_known_filters ? 'stage_id') OR p.stage_id = (_known_filters->>'stage_id')::uuid)
      AND (_custom_filters = '{}'::jsonb OR p.custom_fields @> _custom_filters)
  ),
  counted AS (
    SELECT b.*, COUNT(*) OVER () AS total_count FROM base b
  )
  SELECT
    c.id, c.full_name, c.phone_number, c.student_id,
    c.email, c.auth_email, c.avatar_url, c.is_banned, c.created_at,
    c.governorate, c.registration_type, c.gender, c.stage_id, c.stage_name,
    c.custom_fields, c.enrollments_count, c.total_count
  FROM counted c
  ORDER BY
    CASE WHEN v_is_digit_id AND c.student_id = lpad(v_search, 6, '0') THEN 0 ELSE 1 END,
    c.created_at DESC
  LIMIT GREATEST(COALESCE(_limit, 50), 1)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_students(text, jsonb, jsonb, int, int) TO authenticated;

-- 6. Admin: full detail helper
CREATE OR REPLACE FUNCTION public.admin_get_student(_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  SELECT to_jsonb(p) || jsonb_build_object('stage_name', st.name)
    INTO result
  FROM public.profiles p
  LEFT JOIN public.stages st ON st.id = p.stage_id
  WHERE p.id = _uid AND p.role = 'student';
  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_get_student(uuid) TO authenticated;

-- 7. Admin: enrollments listing for a student
CREATE OR REPLACE FUNCTION public.admin_student_enrollments(_uid uuid)
RETURNS TABLE(
  course_id uuid,
  course_title text,
  stage_name text,
  subject_name text,
  enrolled_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
  SELECT c.id, c.title, st.name, s.name, e.enrolled_at
  FROM public.enrollments e
  JOIN public.courses c ON c.id = e.course_id
  LEFT JOIN public.stages st ON st.id = c.stage_id
  LEFT JOIN public.subjects s ON s.id = c.subject_id
  WHERE e.user_id = _uid
  ORDER BY e.enrolled_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_student_enrollments(uuid) TO authenticated;

-- ============ PHASE 24: QR SYSTEM ============

-- 1) Add qr_token to profiles (unique, unguessable UUID)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS qr_token uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS profiles_qr_token_key ON public.profiles(qr_token);

-- Backfill: any existing rows already got a default from the DEFAULT clause on ALTER.
-- Ensure a trigger keeps future student rows guaranteed to have one (default handles it, but be safe):
UPDATE public.profiles SET qr_token = gen_random_uuid() WHERE qr_token IS NULL;

-- 2) qr_display_settings singleton
CREATE TABLE IF NOT EXISTS public.qr_display_settings (
  id integer PRIMARY KEY CHECK (id = 1),
  show_full_name boolean NOT NULL DEFAULT true,
  show_avatar boolean NOT NULL DEFAULT true,
  show_student_id boolean NOT NULL DEFAULT true,
  show_stage boolean NOT NULL DEFAULT true,
  show_phone boolean NOT NULL DEFAULT false,
  show_enrolled_courses_count boolean NOT NULL DEFAULT true,
  show_quiz_stats boolean NOT NULL DEFAULT true,
  show_weak_subjects boolean NOT NULL DEFAULT true,
  show_weak_courses boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.qr_display_settings TO anon, authenticated;
GRANT INSERT, UPDATE ON public.qr_display_settings TO authenticated;
GRANT ALL ON public.qr_display_settings TO service_role;

ALTER TABLE public.qr_display_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "qr_settings_public_read" ON public.qr_display_settings;
CREATE POLICY "qr_settings_public_read" ON public.qr_display_settings
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "qr_settings_admin_write" ON public.qr_display_settings;
CREATE POLICY "qr_settings_admin_write" ON public.qr_display_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS qr_display_settings_updated_at ON public.qr_display_settings;
CREATE TRIGGER qr_display_settings_updated_at
  BEFORE UPDATE ON public.qr_display_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.qr_display_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- 3) Public snapshot RPC — respects settings server-side
CREATE OR REPLACE FUNCTION public.get_student_qr_snapshot(_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s RECORD;
  p RECORD;
  st_name text;
  cfg RECORD;
  result jsonb;
  enrolled_count int;
  qs jsonb;
  qas jsonb;
BEGIN
  SELECT * INTO cfg FROM public.qr_display_settings WHERE id = 1;
  IF cfg IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO p FROM public.profiles WHERE qr_token = _token AND role = 'student';
  IF p IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT name INTO st_name FROM public.stages WHERE id = p.stage_id;

  result := jsonb_build_object('found', true);

  IF cfg.show_full_name THEN
    result := result || jsonb_build_object('full_name', p.full_name);
  END IF;
  IF cfg.show_avatar THEN
    result := result || jsonb_build_object('avatar_url', p.avatar_url);
  END IF;
  IF cfg.show_student_id THEN
    result := result || jsonb_build_object('student_id', p.student_id);
  END IF;
  IF cfg.show_stage THEN
    result := result || jsonb_build_object('stage_name', st_name);
  END IF;
  IF cfg.show_phone THEN
    result := result || jsonb_build_object('phone_number', p.phone_number);
  END IF;

  IF cfg.show_enrolled_courses_count THEN
    SELECT COUNT(*) INTO enrolled_count FROM public.enrollments WHERE user_id = p.id;
    result := result || jsonb_build_object('enrolled_courses_count', enrolled_count);
  END IF;

  IF cfg.show_quiz_stats THEN
    WITH atts AS (
      SELECT quiz_id, status, passed FROM public.quiz_attempts
      WHERE user_id = p.id AND status <> 'in_progress'
    )
    SELECT jsonb_build_object(
      'total_attempts', (SELECT COUNT(*) FROM atts),
      'unique_quizzes', (SELECT COUNT(DISTINCT quiz_id) FROM atts),
      'passed', (SELECT COUNT(*) FROM atts WHERE status='graded' AND passed IS TRUE),
      'failed', (SELECT COUNT(*) FROM atts WHERE status='graded' AND passed IS FALSE),
      'graded_total', (SELECT COUNT(*) FROM atts WHERE status='graded')
    ) INTO qs;
    result := result || jsonb_build_object('quiz_stats', qs);
  END IF;

  IF cfg.show_weak_subjects OR cfg.show_weak_courses THEN
    -- Expose ONLY the minimum needed for client-side weak grouping (which we already
    -- have battle-tested in src/lib/weak-analysis.ts). No PII in the shape.
    SELECT jsonb_build_object(
      'quizzes', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', q.id,
          'course_id', c.id,
          'subject_id', s.id,
          'subject_name', s.name,
          'course_title', c.title,
          'attempt_result_policy', q.attempt_result_policy
        ))
        FROM public.quizzes q
        JOIN public.courses c ON c.id = q.course_id
        LEFT JOIN public.subjects s ON s.id = c.subject_id
        WHERE q.id IN (
          SELECT DISTINCT quiz_id FROM public.quiz_attempts
          WHERE user_id = p.id AND status = 'graded'
        )
      ), '[]'::jsonb),
      'attempts', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'quiz_id', qa.quiz_id,
          'passed', qa.passed,
          'percentage', qa.percentage,
          'attempt_number', qa.attempt_number,
          'status', qa.status
        ))
        FROM public.quiz_attempts qa
        WHERE qa.user_id = p.id AND qa.status = 'graded'
      ), '[]'::jsonb)
    ) INTO qas;
    result := result || jsonb_build_object(
      'weak_data', qas,
      'weak_flags', jsonb_build_object(
        'subjects', cfg.show_weak_subjects,
        'courses', cfg.show_weak_courses
      )
    );
  END IF;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_student_qr_snapshot(uuid) TO anon, authenticated, service_role;

-- Regenerate QR (admin only)
CREATE OR REPLACE FUNCTION public.admin_regenerate_qr_token(_uid uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_token uuid := gen_random_uuid();
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.profiles SET qr_token = new_token WHERE id = _uid RETURNING qr_token INTO new_token;
  RETURN new_token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_regenerate_qr_token(uuid) TO authenticated, service_role;

-- Extend admin_get_student to expose qr_token
CREATE OR REPLACE FUNCTION public.admin_get_student(_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  SELECT to_jsonb(p) || jsonb_build_object('stage_name', st.name)
    INTO result
  FROM public.profiles p
  LEFT JOIN public.stages st ON st.id = p.stage_id
  WHERE p.id = _uid AND p.role = 'student';
  RETURN result;
END;
$$;


-- ============ PHASE 25: CARD TEMPLATES ============

CREATE TABLE IF NOT EXISTS public.card_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  front_design jsonb NOT NULL DEFAULT '{}'::jsonb,
  back_design jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS card_templates_one_default
  ON public.card_templates(is_default) WHERE is_default = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.card_templates TO authenticated;
GRANT ALL ON public.card_templates TO service_role;

ALTER TABLE public.card_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "card_templates_admin_all" ON public.card_templates;
CREATE POLICY "card_templates_admin_all" ON public.card_templates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS card_templates_updated_at ON public.card_templates;
CREATE TRIGGER card_templates_updated_at
  BEFORE UPDATE ON public.card_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed a starter default design
INSERT INTO public.card_templates (name, is_default, front_design, back_design)
SELECT
  'التصميم الافتراضي',
  true,
  jsonb_build_object(
    'version', '5.3.0',
    'background', '#0f172a',
    'objects', jsonb_build_array(
      jsonb_build_object(
        'type', 'rect',
        'left', 40, 'top', 40,
        'width', 260, 'height', 320,
        'fill', '#1e293b',
        'rx', 12, 'ry', 12,
        'stroke', '#334155', 'strokeWidth', 2
      ),
      jsonb_build_object(
        'type', 'textbox',
        'left', 340, 'top', 200,
        'width', 620,
        'text', 'اسم الطالب',
        'fontSize', 56,
        'fontWeight', 'bold',
        'fill', '#f8fafc',
        'textAlign', 'center',
        'fontFamily', 'Tajawal'
      ),
      jsonb_build_object(
        'type', 'textbox',
        'left', 340, 'top', 300,
        'width', 620,
        'text', 'الصف الدراسي',
        'fontSize', 32,
        'fill', '#cbd5e1',
        'textAlign', 'center',
        'fontFamily', 'Tajawal'
      )
    )
  ),
  '{}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.card_templates WHERE is_default = true);

-- Card assets storage policies
DROP POLICY IF EXISTS "card-assets read" ON storage.objects;
CREATE POLICY "card-assets read" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'card-assets');

DROP POLICY IF EXISTS "card-assets admin write" ON storage.objects;
CREATE POLICY "card-assets admin write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'card-assets' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "card-assets admin update" ON storage.objects;
CREATE POLICY "card-assets admin update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'card-assets' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "card-assets admin delete" ON storage.objects;
CREATE POLICY "card-assets admin delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'card-assets' AND public.has_role(auth.uid(), 'admin'));
INSERT INTO public.qr_display_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
CREATE OR REPLACE FUNCTION public.get_student_qr_snapshot(_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  p RECORD;
  st_name text;
  cfg RECORD;
  result jsonb;
  enrolled_count int;
  qs jsonb;
  qas jsonb;
BEGIN
  SELECT * INTO cfg FROM public.qr_display_settings WHERE id = 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO p FROM public.profiles WHERE qr_token = _token AND role = 'student';
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT name INTO st_name FROM public.stages WHERE id = p.stage_id;

  result := jsonb_build_object('found', true);

  IF cfg.show_full_name THEN
    result := result || jsonb_build_object('full_name', p.full_name);
  END IF;
  IF cfg.show_avatar THEN
    result := result || jsonb_build_object('avatar_url', p.avatar_url);
  END IF;
  IF cfg.show_student_id THEN
    result := result || jsonb_build_object('student_id', p.student_id);
  END IF;
  IF cfg.show_stage THEN
    result := result || jsonb_build_object('stage_name', st_name);
  END IF;
  IF cfg.show_phone THEN
    result := result || jsonb_build_object('phone_number', p.phone_number);
  END IF;

  IF cfg.show_enrolled_courses_count THEN
    SELECT COUNT(*) INTO enrolled_count FROM public.enrollments WHERE user_id = p.id;
    result := result || jsonb_build_object('enrolled_courses_count', enrolled_count);
  END IF;

  IF cfg.show_quiz_stats THEN
    WITH atts AS (
      SELECT quiz_id, status, passed FROM public.quiz_attempts
      WHERE user_id = p.id AND status <> 'in_progress'
    )
    SELECT jsonb_build_object(
      'total_attempts', (SELECT COUNT(*) FROM atts),
      'unique_quizzes', (SELECT COUNT(DISTINCT quiz_id) FROM atts),
      'passed', (SELECT COUNT(*) FROM atts WHERE status='graded' AND passed IS TRUE),
      'failed', (SELECT COUNT(*) FROM atts WHERE status='graded' AND passed IS FALSE),
      'graded_total', (SELECT COUNT(*) FROM atts WHERE status='graded')
    ) INTO qs;
    result := result || jsonb_build_object('quiz_stats', qs);
  END IF;

  IF cfg.show_weak_subjects OR cfg.show_weak_courses THEN
    SELECT jsonb_build_object(
      'quizzes', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', q.id,
          'course_id', c.id,
          'subject_id', subj.id,
          'subject_name', subj.name,
          'course_title', c.title,
          'attempt_result_policy', q.attempt_result_policy
        ))
        FROM public.quizzes q
        JOIN public.courses c ON c.id = q.course_id
        LEFT JOIN public.subjects subj ON subj.id = c.subject_id
        WHERE q.id IN (
          SELECT DISTINCT quiz_id FROM public.quiz_attempts
          WHERE user_id = p.id AND status = 'graded'
        )
      ), '[]'::jsonb),
      'attempts', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'quiz_id', qa.quiz_id,
          'passed', qa.passed,
          'percentage', qa.percentage,
          'attempt_number', qa.attempt_number,
          'status', qa.status
        ))
        FROM public.quiz_attempts qa
        WHERE qa.user_id = p.id AND qa.status = 'graded'
      ), '[]'::jsonb)
    ) INTO qas;
    result := result || jsonb_build_object(
      'weak_data', qas,
      'weak_flags', jsonb_build_object(
        'subjects', cfg.show_weak_subjects,
        'courses', cfg.show_weak_courses
      )
    );
  END IF;

  RETURN result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_student_qr_snapshot(uuid) TO anon, authenticated;

ALTER TABLE public.qr_display_settings
  ADD COLUMN IF NOT EXISTS show_enrolled_courses_list boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_quiz_attempts_list boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.get_student_qr_snapshot(_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  p RECORD;
  st_name text;
  cfg RECORD;
  result jsonb;
  enrolled_count int;
  qs jsonb;
  qas jsonb;
  courses_list jsonb;
  attempts_list jsonb;
BEGIN
  SELECT * INTO cfg FROM public.qr_display_settings WHERE id = 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO p FROM public.profiles WHERE qr_token = _token AND role = 'student';
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT name INTO st_name FROM public.stages WHERE id = p.stage_id;

  result := jsonb_build_object('found', true);

  IF cfg.show_full_name THEN result := result || jsonb_build_object('full_name', p.full_name); END IF;
  IF cfg.show_avatar THEN result := result || jsonb_build_object('avatar_url', p.avatar_url); END IF;
  IF cfg.show_student_id THEN result := result || jsonb_build_object('student_id', p.student_id); END IF;
  IF cfg.show_stage THEN result := result || jsonb_build_object('stage_name', st_name); END IF;
  IF cfg.show_phone THEN result := result || jsonb_build_object('phone_number', p.phone_number); END IF;

  IF cfg.show_enrolled_courses_count THEN
    SELECT COUNT(*) INTO enrolled_count FROM public.enrollments WHERE user_id = p.id;
    result := result || jsonb_build_object('enrolled_courses_count', enrolled_count);
  END IF;

  IF cfg.show_enrolled_courses_list THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'course_id', c.id,
      'course_title', c.title,
      'stage_name', st.name,
      'subject_name', subj.name,
      'enrolled_at', e.enrolled_at
    ) ORDER BY e.enrolled_at DESC), '[]'::jsonb)
    INTO courses_list
    FROM public.enrollments e
    JOIN public.courses c ON c.id = e.course_id
    LEFT JOIN public.stages st ON st.id = c.stage_id
    LEFT JOIN public.subjects subj ON subj.id = c.subject_id
    WHERE e.user_id = p.id;
    result := result || jsonb_build_object('enrolled_courses', courses_list);
  END IF;

  IF cfg.show_quiz_stats THEN
    WITH atts AS (
      SELECT quiz_id, status, passed FROM public.quiz_attempts
      WHERE user_id = p.id AND status <> 'in_progress'
    )
    SELECT jsonb_build_object(
      'total_attempts', (SELECT COUNT(*) FROM atts),
      'unique_quizzes', (SELECT COUNT(DISTINCT quiz_id) FROM atts),
      'passed', (SELECT COUNT(*) FROM atts WHERE status='graded' AND passed IS TRUE),
      'failed', (SELECT COUNT(*) FROM atts WHERE status='graded' AND passed IS FALSE),
      'graded_total', (SELECT COUNT(*) FROM atts WHERE status='graded')
    ) INTO qs;
    result := result || jsonb_build_object('quiz_stats', qs);
  END IF;

  IF cfg.show_quiz_attempts_list THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'attempt_id', qa.id,
      'quiz_title', q.title,
      'course_title', c.title,
      'subject_name', subj.name,
      'stage_name', st.name,
      'attempt_number', qa.attempt_number,
      'status', qa.status,
      'percentage', qa.percentage,
      'passed', qa.passed,
      'submitted_at', qa.submitted_at
    ) ORDER BY qa.submitted_at DESC NULLS LAST), '[]'::jsonb)
    INTO attempts_list
    FROM public.quiz_attempts qa
    JOIN public.quizzes q ON q.id = qa.quiz_id
    JOIN public.courses c ON c.id = q.course_id
    LEFT JOIN public.stages st ON st.id = c.stage_id
    LEFT JOIN public.subjects subj ON subj.id = c.subject_id
    WHERE qa.user_id = p.id AND qa.status <> 'in_progress';
    result := result || jsonb_build_object('quiz_attempts', attempts_list);
  END IF;

  IF cfg.show_weak_subjects OR cfg.show_weak_courses THEN
    SELECT jsonb_build_object(
      'quizzes', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', q.id,
          'course_id', c.id,
          'subject_id', subj.id,
          'subject_name', subj.name,
          'course_title', c.title,
          'attempt_result_policy', q.attempt_result_policy
        ))
        FROM public.quizzes q
        JOIN public.courses c ON c.id = q.course_id
        LEFT JOIN public.subjects subj ON subj.id = c.subject_id
        WHERE q.id IN (
          SELECT DISTINCT quiz_id FROM public.quiz_attempts
          WHERE user_id = p.id AND status = 'graded'
        )
      ), '[]'::jsonb),
      'attempts', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'quiz_id', qa.quiz_id,
          'passed', qa.passed,
          'percentage', qa.percentage,
          'attempt_number', qa.attempt_number,
          'status', qa.status
        ))
        FROM public.quiz_attempts qa
        WHERE qa.user_id = p.id AND qa.status = 'graded'
      ), '[]'::jsonb)
    ) INTO qas;
    result := result || jsonb_build_object(
      'weak_data', qas,
      'weak_flags', jsonb_build_object(
        'subjects', cfg.show_weak_subjects,
        'courses', cfg.show_weak_courses
      )
    );
  END IF;

  RETURN result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_student_qr_snapshot(uuid) TO anon, authenticated;

-- Fix 1: handle_new_user must never trust client-supplied role
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  m jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
BEGIN
  INSERT INTO public.profiles (
    id, full_name, role, phone_number, guardian_phone, email, auth_email,
    governorate, registration_type, gender, stage_id, custom_fields
  ) VALUES (
    NEW.id,
    COALESCE(m->>'full_name', m->>'name', ''),
    'student'::app_role,  -- HARDCODED: never trust client metadata
    NULLIF(m->>'phone_number',''),
    NULLIF(m->>'guardian_phone',''),
    NULLIF(m->>'real_email',''),
    NEW.email,
    NULLIF(m->>'governorate',''),
    NULLIF(m->>'registration_type',''),
    NULLIF(m->>'gender',''),
    CASE WHEN NULLIF(m->>'stage_id','') IS NOT NULL THEN (m->>'stage_id')::uuid ELSE NULL END,
    COALESCE(m->'custom_fields', '{}'::jsonb)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- Fix 2: prevent students from updating privileged columns on their own profile
CREATE OR REPLACE FUNCTION public.prevent_privileged_profile_updates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  NEW.role := OLD.role;
  NEW.is_banned := OLD.is_banned;
  NEW.student_id := OLD.student_id;
  NEW.qr_token := OLD.qr_token;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_prevent_privileged_profile_updates ON public.profiles;
CREATE TRIGGER trg_prevent_privileged_profile_updates
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_privileged_profile_updates();

-- Assignments (unit content, alongside lessons + quizzes)
CREATE TABLE IF NOT EXISTS public.assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  order_index integer NOT NULL DEFAULT 0,
  total_grade numeric NOT NULL CHECK (total_grade > 0),
  pass_grade numeric NOT NULL CHECK (pass_grade > 0),
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assignments_pass_le_total CHECK (pass_grade <= total_grade)
);

CREATE INDEX IF NOT EXISTS assignments_unit_id_idx ON public.assignments(unit_id);
CREATE INDEX IF NOT EXISTS assignments_course_id_idx ON public.assignments(course_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignments TO authenticated;
GRANT ALL ON public.assignments TO service_role;

ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enrolled or admin can view assignments"
  ON public.assignments FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.enrollments e
      WHERE e.course_id = assignments.course_id AND e.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins insert assignments"
  ON public.assignments FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update assignments"
  ON public.assignments FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete assignments"
  ON public.assignments FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER assignments_set_updated_at
  BEFORE UPDATE ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Assignment reference files (admin uploads for students to consult)
CREATE TABLE IF NOT EXISTS public.assignment_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_size_bytes bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assignment_files_assignment_id_idx
  ON public.assignment_files(assignment_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignment_files TO authenticated;
GRANT ALL ON public.assignment_files TO service_role;

ALTER TABLE public.assignment_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enrolled or admin can view assignment files"
  ON public.assignment_files FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.assignments a
      JOIN public.enrollments e ON e.course_id = a.course_id
      WHERE a.id = assignment_files.assignment_id AND e.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins insert assignment files"
  ON public.assignment_files FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update assignment files"
  ON public.assignment_files FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete assignment files"
  ON public.assignment_files FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Extend the shared "next order_index" helper to include assignments
CREATE OR REPLACE FUNCTION public.next_unit_order_index(_unit_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(MAX(pos), -1) + 1 FROM (
    SELECT position AS pos FROM public.lessons WHERE unit_id = _unit_id
    UNION ALL
    SELECT order_index AS pos FROM public.quizzes WHERE unit_id = _unit_id
    UNION ALL
    SELECT order_index AS pos FROM public.assignments WHERE unit_id = _unit_id
  ) t;
$function$;

CREATE POLICY "assignment-files admin read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'assignment-files' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "assignment-files enrolled read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'assignment-files'
    AND EXISTS (
      SELECT 1
      FROM public.assignment_files af
      JOIN public.assignments a ON a.id = af.assignment_id
      JOIN public.enrollments e ON e.course_id = a.course_id
      WHERE af.file_url = storage.objects.name
        AND e.user_id = auth.uid()
    )
  );

CREATE POLICY "assignment-files admin insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'assignment-files' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "assignment-files admin update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'assignment-files' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'assignment-files' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "assignment-files admin delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'assignment-files' AND public.has_role(auth.uid(), 'admin'));

-- Helper: is the assignment window currently open?
CREATE OR REPLACE FUNCTION public.assignment_window_open(_assignment_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.assignments
    WHERE id = _assignment_id
      AND now() >= start_at
      AND now() <= end_at
  );
$$;

-- assignment_submissions
CREATE TABLE public.assignment_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  text_content jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted')),
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, user_id)
);
CREATE INDEX assignment_submissions_assignment_idx ON public.assignment_submissions(assignment_id);
CREATE INDEX assignment_submissions_user_idx ON public.assignment_submissions(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignment_submissions TO authenticated;
GRANT ALL ON public.assignment_submissions TO service_role;

ALTER TABLE public.assignment_submissions ENABLE ROW LEVEL SECURITY;

-- Students can always read their own submission (needed for read-only view after deadline)
CREATE POLICY "Own or admin read submissions"
  ON public.assignment_submissions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Students may INSERT their own row only while the window is open
CREATE POLICY "Own insert within window"
  ON public.assignment_submissions FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.assignment_window_open(assignment_id)
  );

-- Students may UPDATE their own row only while the window is open (blocks post-deadline edits at DB level)
CREATE POLICY "Own update within window"
  ON public.assignment_submissions FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND public.assignment_window_open(assignment_id)
  )
  WITH CHECK (
    user_id = auth.uid()
    AND public.assignment_window_open(assignment_id)
  );

CREATE TRIGGER assignment_submissions_set_updated_at
  BEFORE UPDATE ON public.assignment_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- assignment_submission_files
CREATE TABLE public.assignment_submission_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.assignment_submissions(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_size_bytes bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assignment_submission_files_submission_idx ON public.assignment_submission_files(submission_id);

GRANT SELECT, INSERT, DELETE ON public.assignment_submission_files TO authenticated;
GRANT ALL ON public.assignment_submission_files TO service_role;

ALTER TABLE public.assignment_submission_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own or admin read submission files"
  ON public.assignment_submission_files FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assignment_submissions s
      WHERE s.id = submission_id
        AND (s.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

CREATE POLICY "Own insert submission files within window"
  ON public.assignment_submission_files FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assignment_submissions s
      WHERE s.id = submission_id
        AND s.user_id = auth.uid()
        AND public.assignment_window_open(s.assignment_id)
    )
  );

CREATE POLICY "Own delete submission files within window"
  ON public.assignment_submission_files FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assignment_submissions s
      WHERE s.id = submission_id
        AND s.user_id = auth.uid()
        AND public.assignment_window_open(s.assignment_id)
    )
  );

-- Storage RLS on assignment-submissions bucket
-- Files stored under: <user_id>/<submission_id>/<uuid>-<name>
-- First path segment must equal the user's id.

CREATE POLICY "Read own or admin submission storage"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'assignment-submissions'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR auth.uid()::text = (storage.foldername(name))[1]
    )
  );

CREATE POLICY "Insert own submission storage within window"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'assignment-submissions'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Delete own submission storage"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'assignment-submissions'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- 1. Extend assignment_submissions with grading columns
ALTER TABLE public.assignment_submissions
  ADD COLUMN IF NOT EXISTS grade numeric,
  ADD COLUMN IF NOT EXISTS outcome text,
  ADD COLUMN IF NOT EXISTS feedback text,
  ADD COLUMN IF NOT EXISTS feedback_given_at timestamptz,
  ADD COLUMN IF NOT EXISTS graded_at timestamptz,
  ADD COLUMN IF NOT EXISTS graded_by uuid REFERENCES public.profiles(id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assignment_submissions_outcome_check'
  ) THEN
    ALTER TABLE public.assignment_submissions
      ADD CONSTRAINT assignment_submissions_outcome_check
      CHECK (outcome IS NULL OR outcome IN ('passed','failed','not_submitted'));
  END IF;
END $$;

-- 2. Admin-only UPDATE policy (add separately; keep Phase 30 student policy untouched)
DROP POLICY IF EXISTS "Admins can grade submissions" ON public.assignment_submissions;
CREATE POLICY "Admins can grade submissions"
  ON public.assignment_submissions
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. Helper: finalize a never-submitted row (called first time admin opens it)
CREATE OR REPLACE FUNCTION public.admin_finalize_not_submitted(_submission_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s RECORD;
  a RECORD;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO s FROM public.assignment_submissions WHERE id = _submission_id FOR UPDATE;
  IF s IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO a FROM public.assignments WHERE id = s.assignment_id;
  IF a IS NULL THEN RETURN NULL; END IF;

  IF s.outcome IS NULL AND s.status = 'draft' AND now() > a.end_at THEN
    UPDATE public.assignment_submissions
       SET outcome = 'not_submitted',
           grade = 0,
           graded_at = now(),
           graded_by = auth.uid()
     WHERE id = _submission_id;
    SELECT * INTO s FROM public.assignment_submissions WHERE id = _submission_id;
  END IF;

  RETURN to_jsonb(s);
END;
$$;

-- 4. Listing RPC used by both admin & student pages
CREATE OR REPLACE FUNCTION public.list_assignment_submissions(
  _user_search text DEFAULT NULL,
  _course_id uuid DEFAULT NULL,
  _stage_id uuid DEFAULT NULL,
  _subject_id uuid DEFAULT NULL,
  _ungraded_only boolean DEFAULT false,
  _limit integer DEFAULT 100,
  _offset integer DEFAULT 0
)
RETURNS TABLE(
  submission_id uuid,
  assignment_id uuid,
  user_id uuid,
  student_name text,
  student_email text,
  student_phone text,
  student_student_id text,
  course_id uuid,
  course_title text,
  subject_id uuid,
  subject_name text,
  stage_id uuid,
  stage_name text,
  assignment_title text,
  total_grade numeric,
  pass_grade numeric,
  end_at timestamptz,
  status text,
  submitted_at timestamptz,
  grade numeric,
  outcome text,
  computed_outcome text,
  has_feedback boolean,
  feedback_given_at timestamptz,
  graded_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_is_admin boolean := public.has_role(v_user, 'admin');
  v_search text := NULLIF(trim(COALESCE(_user_search,'')), '');
  v_is_digit_id boolean := v_search IS NOT NULL AND v_search ~ '^[0-9]{1,6}$';
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required' USING ERRCODE='42501'; END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      s.id AS submission_id,
      s.assignment_id,
      s.user_id,
      COALESCE(p.full_name, '') AS student_name,
      u.email::text AS student_email,
      p.phone_number AS student_phone,
      p.student_id  AS student_student_id,
      c.id AS course_id, c.title AS course_title,
      subj.id AS subject_id, subj.name AS subject_name,
      st.id AS stage_id, st.name AS stage_name,
      a.title AS assignment_title,
      a.total_grade, a.pass_grade, a.end_at,
      s.status, s.submitted_at,
      s.grade, s.outcome,
      CASE
        WHEN s.outcome IS NOT NULL THEN s.outcome
        WHEN s.status = 'submitted' THEN NULL
        WHEN s.status = 'draft' AND now() > a.end_at THEN 'not_submitted'
        ELSE NULL
      END AS computed_outcome,
      (s.feedback_given_at IS NOT NULL) AS has_feedback,
      s.feedback_given_at, s.graded_at
    FROM public.assignment_submissions s
    JOIN public.assignments a ON a.id = s.assignment_id
    JOIN public.courses c     ON c.id = a.course_id
    LEFT JOIN public.subjects subj ON subj.id = c.subject_id
    LEFT JOIN public.stages   st   ON st.id   = c.stage_id
    LEFT JOIN public.profiles p    ON p.id    = s.user_id
    LEFT JOIN auth.users u         ON u.id    = s.user_id
    WHERE
      -- Only finalized/closed rows: submitted OR deadline passed
      (s.status = 'submitted' OR now() > a.end_at)
      AND (v_is_admin OR s.user_id = v_user)
      AND (_course_id  IS NULL OR c.id = _course_id)
      AND (NOT v_is_admin OR _stage_id   IS NULL OR c.stage_id   = _stage_id)
      AND (NOT v_is_admin OR _subject_id IS NULL OR c.subject_id = _subject_id)
      AND (NOT v_is_admin OR NOT _ungraded_only OR s.outcome IS NULL)
      AND (
        NOT v_is_admin OR v_search IS NULL
        OR p.full_name    ILIKE '%'||v_search||'%'
        OR u.email        ILIKE '%'||v_search||'%'
        OR p.phone_number ILIKE '%'||v_search||'%'
        OR p.student_id   ILIKE '%'||v_search||'%'
        OR (v_is_digit_id AND p.student_id = lpad(v_search, 6, '0'))
      )
  ),
  counted AS (SELECT b.*, COUNT(*) OVER () AS total_count FROM base b)
  SELECT * FROM counted
  ORDER BY submitted_at DESC NULLS LAST, submission_id DESC
  LIMIT GREATEST(COALESCE(_limit, 100), 1)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$$;

-- Phase 32: Assignment awareness for QR snapshot
ALTER TABLE public.qr_display_settings
  ADD COLUMN IF NOT EXISTS show_assignment_stats boolean NOT NULL DEFAULT true;

-- Extend get_student_qr_snapshot with assignment stats and combined weak data
CREATE OR REPLACE FUNCTION public.get_student_qr_snapshot(_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  p RECORD;
  st_name text;
  cfg RECORD;
  result jsonb;
  enrolled_count int;
  qs jsonb;
  qas jsonb;
  courses_list jsonb;
  attempts_list jsonb;
  a_stats jsonb;
  a_pool jsonb;
BEGIN
  SELECT * INTO cfg FROM public.qr_display_settings WHERE id = 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO p FROM public.profiles WHERE qr_token = _token AND role = 'student';
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT name INTO st_name FROM public.stages WHERE id = p.stage_id;

  result := jsonb_build_object('found', true);

  IF cfg.show_full_name THEN result := result || jsonb_build_object('full_name', p.full_name); END IF;
  IF cfg.show_avatar THEN result := result || jsonb_build_object('avatar_url', p.avatar_url); END IF;
  IF cfg.show_student_id THEN result := result || jsonb_build_object('student_id', p.student_id); END IF;
  IF cfg.show_stage THEN result := result || jsonb_build_object('stage_name', st_name); END IF;
  IF cfg.show_phone THEN result := result || jsonb_build_object('phone_number', p.phone_number); END IF;

  IF cfg.show_enrolled_courses_count THEN
    SELECT COUNT(*) INTO enrolled_count FROM public.enrollments WHERE user_id = p.id;
    result := result || jsonb_build_object('enrolled_courses_count', enrolled_count);
  END IF;

  IF cfg.show_enrolled_courses_list THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'course_id', c.id,
      'course_title', c.title,
      'stage_name', st.name,
      'subject_name', subj.name,
      'enrolled_at', e.enrolled_at
    ) ORDER BY e.enrolled_at DESC), '[]'::jsonb)
    INTO courses_list
    FROM public.enrollments e
    JOIN public.courses c ON c.id = e.course_id
    LEFT JOIN public.stages st ON st.id = c.stage_id
    LEFT JOIN public.subjects subj ON subj.id = c.subject_id
    WHERE e.user_id = p.id;
    result := result || jsonb_build_object('enrolled_courses', courses_list);
  END IF;

  IF cfg.show_quiz_stats THEN
    WITH atts AS (
      SELECT quiz_id, status, passed FROM public.quiz_attempts
      WHERE user_id = p.id AND status <> 'in_progress'
    )
    SELECT jsonb_build_object(
      'total_attempts', (SELECT COUNT(*) FROM atts),
      'unique_quizzes', (SELECT COUNT(DISTINCT quiz_id) FROM atts),
      'passed', (SELECT COUNT(*) FROM atts WHERE status='graded' AND passed IS TRUE),
      'failed', (SELECT COUNT(*) FROM atts WHERE status='graded' AND passed IS FALSE),
      'graded_total', (SELECT COUNT(*) FROM atts WHERE status='graded')
    ) INTO qs;
    result := result || jsonb_build_object('quiz_stats', qs);
  END IF;

  IF cfg.show_quiz_attempts_list THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'attempt_id', qa.id,
      'quiz_title', q.title,
      'course_title', c.title,
      'subject_name', subj.name,
      'stage_name', st.name,
      'attempt_number', qa.attempt_number,
      'status', qa.status,
      'percentage', qa.percentage,
      'passed', qa.passed,
      'submitted_at', qa.submitted_at
    ) ORDER BY qa.submitted_at DESC NULLS LAST), '[]'::jsonb)
    INTO attempts_list
    FROM public.quiz_attempts qa
    JOIN public.quizzes q ON q.id = qa.quiz_id
    JOIN public.courses c ON c.id = q.course_id
    LEFT JOIN public.stages st ON st.id = c.stage_id
    LEFT JOIN public.subjects subj ON subj.id = c.subject_id
    WHERE qa.user_id = p.id AND qa.status <> 'in_progress';
    result := result || jsonb_build_object('quiz_attempts', attempts_list);
  END IF;

  -- Assignment stats (Phase 32): mirrors quiz_stats card group
  IF cfg.show_assignment_stats THEN
    WITH enrolled_assignments AS (
      SELECT a.id AS assignment_id
      FROM public.assignments a
      JOIN public.units u ON u.id = a.unit_id
      JOIN public.enrollments e ON e.course_id = u.course_id AND e.user_id = p.id
    ),
    subs AS (
      SELECT s.assignment_id, s.status, s.outcome
      FROM public.assignment_submissions s
      WHERE s.user_id = p.id
    )
    SELECT jsonb_build_object(
      'total', (SELECT COUNT(*) FROM enrolled_assignments),
      'completed', (SELECT COUNT(*) FROM subs WHERE outcome IN ('passed','failed')),
      'passed', (SELECT COUNT(*) FROM subs WHERE outcome = 'passed'),
      'failed', (SELECT COUNT(*) FROM subs WHERE outcome = 'failed' OR outcome = 'not_submitted')
    ) INTO a_stats;
    result := result || jsonb_build_object('assignment_stats', a_stats);
  END IF;

  IF cfg.show_weak_subjects OR cfg.show_weak_courses THEN
    SELECT jsonb_build_object(
      'quizzes', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', q.id,
          'course_id', c.id,
          'subject_id', subj.id,
          'subject_name', subj.name,
          'course_title', c.title,
          'attempt_result_policy', q.attempt_result_policy
        ))
        FROM public.quizzes q
        JOIN public.courses c ON c.id = q.course_id
        LEFT JOIN public.subjects subj ON subj.id = c.subject_id
        WHERE q.id IN (
          SELECT DISTINCT quiz_id FROM public.quiz_attempts
          WHERE user_id = p.id AND status = 'graded'
        )
      ), '[]'::jsonb),
      'attempts', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'quiz_id', qa.quiz_id,
          'passed', qa.passed,
          'percentage', qa.percentage,
          'attempt_number', qa.attempt_number,
          'status', qa.status
        ))
        FROM public.quiz_attempts qa
        WHERE qa.user_id = p.id AND qa.status = 'graded'
      ), '[]'::jsonb),
      'assignments', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'assignment_id', a.id,
          'course_id', c.id,
          'subject_id', subj.id,
          'subject_name', subj.name,
          'course_title', c.title,
          'outcome', s.outcome
        ))
        FROM public.assignment_submissions s
        JOIN public.assignments a ON a.id = s.assignment_id
        JOIN public.units u ON u.id = a.unit_id
        JOIN public.courses c ON c.id = u.course_id
        LEFT JOIN public.subjects subj ON subj.id = c.subject_id
        WHERE s.user_id = p.id AND s.outcome IN ('passed','failed')
      ), '[]'::jsonb)
    ) INTO qas;
    result := result || jsonb_build_object(
      'weak_data', qas,
      'weak_flags', jsonb_build_object(
        'subjects', cfg.show_weak_subjects,
        'courses', cfg.show_weak_courses
      )
    );
  END IF;

  RETURN result;
END;
$function$;

-- 1. Courses: pricing columns
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS is_paid boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS price_piastres integer,
  ADD COLUMN IF NOT EXISTS discount_price_piastres integer,
  ADD COLUMN IF NOT EXISTS discount_expires_at timestamptz;

ALTER TABLE public.courses DROP CONSTRAINT IF EXISTS courses_pricing_check;
ALTER TABLE public.courses ADD CONSTRAINT courses_pricing_check CHECK (
  (is_paid = false AND price_piastres IS NULL AND discount_price_piastres IS NULL)
  OR (is_paid = true AND price_piastres IS NOT NULL AND price_piastres >= 0
      AND (discount_price_piastres IS NULL
           OR (discount_price_piastres >= 0 AND discount_price_piastres < price_piastres)))
);

-- 2. Wallets table
CREATE TABLE IF NOT EXISTS public.wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  balance_piastres integer NOT NULL DEFAULT 0 CHECK (balance_piastres >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.wallets TO authenticated;
GRANT ALL ON public.wallets TO service_role;

ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students view own wallet" ON public.wallets;
CREATE POLICY "Students view own wallet" ON public.wallets
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins view all wallets" ON public.wallets;
CREATE POLICY "Admins view all wallets" ON public.wallets
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS update_wallets_updated_at ON public.wallets;
CREATE TRIGGER update_wallets_updated_at
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Auto-create wallet for new students
CREATE OR REPLACE FUNCTION public.ensure_student_wallet()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'student' THEN
    INSERT INTO public.wallets (user_id, balance_piastres)
    VALUES (NEW.id, 0)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_student_wallet_trigger ON public.profiles;
CREATE TRIGGER ensure_student_wallet_trigger
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.ensure_student_wallet();

-- 4. Backfill wallets for existing students
INSERT INTO public.wallets (user_id, balance_piastres)
SELECT p.id, 0 FROM public.profiles p
WHERE p.role = 'student'
  AND NOT EXISTS (SELECT 1 FROM public.wallets w WHERE w.user_id = p.id)
ON CONFLICT (user_id) DO NOTHING;

-- ============ top_up_cards ============
CREATE TABLE public.top_up_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[0-9]{6}$'),
  value_piastres integer NOT NULL CHECK (value_piastres > 0),
  expires_at timestamptz,
  is_redeemed boolean NOT NULL DEFAULT false,
  redeemed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  redeemed_at timestamptz,
  batch_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.top_up_cards TO authenticated;
GRANT ALL ON public.top_up_cards TO service_role;
ALTER TABLE public.top_up_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view top-up cards"
  ON public.top_up_cards FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert top-up cards"
  ON public.top_up_cards FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update top-up cards"
  ON public.top_up_cards FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete top-up cards"
  ON public.top_up_cards FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_top_up_cards_code ON public.top_up_cards(code);
CREATE INDEX idx_top_up_cards_batch ON public.top_up_cards(batch_id);

-- ============ wallet_transactions ============
CREATE TABLE public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_number text NOT NULL UNIQUE,
  wallet_id uuid NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('card_redemption','admin_charge','admin_deduct','bulk_charge','bulk_deduct','purchase','admin_reset')),
  amount_piastres integer NOT NULL CHECK (amount_piastres >= 0),
  balance_after_piastres integer NOT NULL,
  related_card_id uuid REFERENCES public.top_up_cards(id) ON DELETE SET NULL,
  performed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wallet_transactions TO authenticated;
GRANT ALL ON public.wallet_transactions TO service_role;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students view own wallet transactions"
  ON public.wallet_transactions FOR SELECT
  TO authenticated
  USING (
    wallet_id IN (SELECT id FROM public.wallets WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE INDEX idx_wallet_tx_wallet ON public.wallet_transactions(wallet_id);
CREATE INDEX idx_wallet_tx_created ON public.wallet_transactions(created_at DESC);

-- ============ helper: generate reference number ============
CREATE OR REPLACE FUNCTION public._gen_txn_reference()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  suffix text;
  attempts int := 0;
  candidate text;
BEGIN
  LOOP
    suffix := '';
    FOR i IN 1..8 LOOP
      suffix := suffix || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    END LOOP;
    candidate := 'TXN-' || suffix;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.wallet_transactions WHERE reference_number = candidate);
    attempts := attempts + 1;
    IF attempts > 20 THEN
      candidate := 'TXN-' || substr(replace(gen_random_uuid()::text,'-',''),1,10);
      EXIT;
    END IF;
  END LOOP;
  RETURN candidate;
END;
$$;

-- ============ redeem_top_up_card ============
CREATE OR REPLACE FUNCTION public.redeem_top_up_card(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Phase 34 placeholder: replace with settings-table lookup in Phase 36
  MAX_WALLET_BALANCE_PIASTRES CONSTANT integer := 200000;
  v_user uuid := auth.uid();
  v_code text := trim(COALESCE(p_code, ''));
  v_card RECORD;
  v_wallet RECORD;
  v_new_balance integer;
  v_ref text;
  v_max_egp text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول أولاً' USING ERRCODE = '42501';
  END IF;

  IF v_code !~ '^[0-9]{6}$' THEN
    RAISE EXCEPTION 'الكود غير صحيح';
  END IF;

  SELECT * INTO v_card FROM public.top_up_cards WHERE code = v_code FOR UPDATE;
  IF v_card IS NULL THEN
    RAISE EXCEPTION 'الكود غير صحيح';
  END IF;

  IF v_card.is_redeemed THEN
    RAISE EXCEPTION 'تم استخدام هذا الكود من قبل، لا يمكن استخدامه مرة أخرى.';
  END IF;

  IF v_card.expires_at IS NOT NULL AND now() > v_card.expires_at THEN
    RAISE EXCEPTION 'انتهت صلاحية هذا الكود.';
  END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_user FOR UPDATE;
  IF v_wallet IS NULL THEN
    INSERT INTO public.wallets(user_id, balance_piastres) VALUES (v_user, 0)
      RETURNING * INTO v_wallet;
  END IF;

  IF v_wallet.balance_piastres + v_card.value_piastres > MAX_WALLET_BALANCE_PIASTRES THEN
    v_max_egp := (MAX_WALLET_BALANCE_PIASTRES / 100)::text;
    RAISE EXCEPTION 'لا يمكن إتمام العملية، الحد الأقصى لرصيد المحفظة هو % جنيه.', v_max_egp;
  END IF;

  v_new_balance := v_wallet.balance_piastres + v_card.value_piastres;

  UPDATE public.top_up_cards
    SET is_redeemed = true, redeemed_by = v_user, redeemed_at = now()
    WHERE id = v_card.id;

  UPDATE public.wallets
    SET balance_piastres = v_new_balance, updated_at = now()
    WHERE id = v_wallet.id;

  v_ref := public._gen_txn_reference();

  INSERT INTO public.wallet_transactions
    (reference_number, wallet_id, type, amount_piastres, balance_after_piastres, related_card_id, performed_by)
  VALUES
    (v_ref, v_wallet.id, 'card_redemption', v_card.value_piastres, v_new_balance, v_card.id, NULL);

  RETURN jsonb_build_object(
    'success', true,
    'new_balance_piastres', v_new_balance,
    'amount_piastres', v_card.value_piastres,
    'reference_number', v_ref
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.redeem_top_up_card(text) TO authenticated;

-- ============ seed 5 sample cards ============
INSERT INTO public.top_up_cards (code, value_piastres, expires_at) VALUES
  ('100001', 5000, NULL),   -- 50 EGP
  ('100002', 10000, NULL),  -- 100 EGP
  ('100003', 20000, NULL),  -- 200 EGP
  ('100004', 2500, NULL),   -- 25 EGP
  ('100005', 50000, NULL);  -- 500 EGP

-- Phase 35: Admin Wallet & Cards RPCs

CREATE OR REPLACE FUNCTION public.admin_generate_top_up_cards(
  p_quantity integer,
  p_value_piastres integer,
  p_expires_at timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch uuid := gen_random_uuid();
  v_code text;
  v_attempts int;
  v_i int;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_row_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 50 THEN
    RAISE EXCEPTION 'الكمية يجب أن تكون بين 1 و 50';
  END IF;
  IF p_value_piastres IS NULL OR p_value_piastres <= 0 THEN
    RAISE EXCEPTION 'قيمة الكارت غير صحيحة';
  END IF;

  FOR v_i IN 1..p_quantity LOOP
    v_attempts := 0;
    LOOP
      v_code := lpad(floor(random() * 1000000)::int::text, 6, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.top_up_cards WHERE code = v_code);
      v_attempts := v_attempts + 1;
      IF v_attempts > 40 THEN
        RAISE EXCEPTION 'تعذر توليد كود فريد';
      END IF;
    END LOOP;
    INSERT INTO public.top_up_cards (code, value_piastres, expires_at, batch_id)
      VALUES (v_code, p_value_piastres, p_expires_at, v_batch)
      RETURNING id INTO v_row_id;
    v_ids := array_append(v_ids, v_row_id);
  END LOOP;

  RETURN jsonb_build_object(
    'batch_id', v_batch,
    'count', p_quantity,
    'ids', to_jsonb(v_ids)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_adjust_wallet(
  p_user_id uuid,
  p_amount_piastres integer,
  p_type text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  MAX_BAL constant integer := 200000;
  v_admin uuid := auth.uid();
  v_wallet RECORD;
  v_new_balance integer;
  v_ref text;
BEGIN
  IF NOT public.has_role(v_admin, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_amount_piastres IS NULL OR p_amount_piastres <= 0 THEN
    RAISE EXCEPTION 'قيمة غير صحيحة';
  END IF;
  IF p_type NOT IN ('admin_charge','admin_deduct') THEN
    RAISE EXCEPTION 'نوع العملية غير صحيح';
  END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
  IF v_wallet IS NULL THEN
    INSERT INTO public.wallets(user_id, balance_piastres) VALUES (p_user_id, 0)
      RETURNING * INTO v_wallet;
  END IF;

  IF p_type = 'admin_charge' THEN
    v_new_balance := v_wallet.balance_piastres + p_amount_piastres;
    IF v_new_balance > MAX_BAL THEN
      RAISE EXCEPTION 'العملية ستتجاوز الحد الأقصى للرصيد (% ج.م)', (MAX_BAL/100)::text;
    END IF;
  ELSE
    v_new_balance := v_wallet.balance_piastres - p_amount_piastres;
    IF v_new_balance < 0 THEN
      RAISE EXCEPTION 'رصيد المحفظة غير كافٍ للخصم';
    END IF;
  END IF;

  UPDATE public.wallets SET balance_piastres = v_new_balance, updated_at = now() WHERE id = v_wallet.id;

  v_ref := public._gen_txn_reference();
  INSERT INTO public.wallet_transactions
    (reference_number, wallet_id, type, amount_piastres, balance_after_piastres, performed_by)
    VALUES (v_ref, v_wallet.id, p_type, p_amount_piastres, v_new_balance, v_admin);

  RETURN jsonb_build_object(
    'success', true,
    'new_balance_piastres', v_new_balance,
    'reference_number', v_ref
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_bulk_adjust_wallets(
  p_amount_piastres integer,
  p_type text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  MAX_BAL constant integer := 200000;
  v_admin uuid := auth.uid();
  v_row RECORD;
  v_new_balance integer;
  v_ref text;
  v_success int := 0;
  v_skipped int := 0;
  v_skipped_users jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.has_role(v_admin, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_amount_piastres IS NULL OR p_amount_piastres <= 0 THEN
    RAISE EXCEPTION 'قيمة غير صحيحة';
  END IF;
  IF p_type NOT IN ('bulk_charge','bulk_deduct') THEN
    RAISE EXCEPTION 'نوع العملية غير صحيح';
  END IF;

  FOR v_row IN
    SELECT w.id AS wallet_id, w.balance_piastres, p.id AS user_id, p.full_name
    FROM public.wallets w
    JOIN public.profiles p ON p.id = w.user_id
    WHERE p.role = 'student' AND COALESCE(p.is_banned, false) = false
    ORDER BY p.full_name
    FOR UPDATE OF w
  LOOP
    IF p_type = 'bulk_charge' THEN
      v_new_balance := v_row.balance_piastres + p_amount_piastres;
      IF v_new_balance > MAX_BAL THEN
        v_skipped := v_skipped + 1;
        v_skipped_users := v_skipped_users || jsonb_build_object(
          'user_id', v_row.user_id, 'full_name', v_row.full_name, 'reason', 'over_max'
        );
        CONTINUE;
      END IF;
    ELSE
      v_new_balance := v_row.balance_piastres - p_amount_piastres;
      IF v_new_balance < 0 THEN
        v_skipped := v_skipped + 1;
        v_skipped_users := v_skipped_users || jsonb_build_object(
          'user_id', v_row.user_id, 'full_name', v_row.full_name, 'reason', 'insufficient'
        );
        CONTINUE;
      END IF;
    END IF;

    UPDATE public.wallets SET balance_piastres = v_new_balance, updated_at = now() WHERE id = v_row.wallet_id;
    v_ref := public._gen_txn_reference();
    INSERT INTO public.wallet_transactions
      (reference_number, wallet_id, type, amount_piastres, balance_after_piastres, performed_by)
      VALUES (v_ref, v_row.wallet_id, p_type, p_amount_piastres, v_new_balance, v_admin);
    v_success := v_success + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success_count', v_success,
    'skipped_count', v_skipped,
    'skipped_users', v_skipped_users
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_wallet_transactions(
  _user_search text DEFAULT NULL,
  _type text DEFAULT NULL,
  _limit integer DEFAULT 100,
  _offset integer DEFAULT 0
) RETURNS TABLE(
  id uuid,
  reference_number text,
  wallet_id uuid,
  user_id uuid,
  student_name text,
  student_phone text,
  student_id_code text,
  type text,
  amount_piastres integer,
  balance_after_piastres integer,
  performed_by uuid,
  performed_by_name text,
  notes text,
  created_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text := NULLIF(trim(COALESCE(_user_search,'')),'');
  v_is_digit boolean := v_search IS NOT NULL AND v_search ~ '^[0-9]{1,6}$';
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      t.id, t.reference_number, t.wallet_id,
      p.id AS user_id, p.full_name AS student_name,
      p.phone_number AS student_phone, p.student_id AS student_id_code,
      t.type, t.amount_piastres, t.balance_after_piastres,
      t.performed_by, pa.full_name AS performed_by_name,
      t.notes, t.created_at
    FROM public.wallet_transactions t
    JOIN public.wallets w ON w.id = t.wallet_id
    JOIN public.profiles p ON p.id = w.user_id
    LEFT JOIN public.profiles pa ON pa.id = t.performed_by
    WHERE
      (_type IS NULL OR t.type = _type)
      AND (
        v_search IS NULL
        OR p.full_name ILIKE '%'||v_search||'%'
        OR p.phone_number ILIKE '%'||v_search||'%'
        OR p.student_id ILIKE '%'||v_search||'%'
        OR (v_is_digit AND p.student_id = lpad(v_search,6,'0'))
      )
  ),
  counted AS (SELECT b.*, COUNT(*) OVER () AS total_count FROM base b)
  SELECT * FROM counted
  ORDER BY created_at DESC
  LIMIT GREATEST(COALESCE(_limit,100),1)
  OFFSET GREATEST(COALESCE(_offset,0),0);
END;
$$;

-- ============================================================
-- payment_gateways
-- ============================================================
CREATE TABLE public.payment_gateways (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payment_gateways TO anon, authenticated;
GRANT ALL ON public.payment_gateways TO service_role;
ALTER TABLE public.payment_gateways ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gateways readable to all" ON public.payment_gateways FOR SELECT USING (true);
CREATE POLICY "admins manage gateways insert" ON public.payment_gateways FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins manage gateways update" ON public.payment_gateways FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins manage gateways delete" ON public.payment_gateways FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_payment_gateways_updated_at BEFORE UPDATE ON public.payment_gateways FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
INSERT INTO public.payment_gateways (gateway_key, display_name, is_enabled) VALUES ('wallet', 'المحفظة الإلكترونية', true);

-- ============================================================
-- wallet_gateway_settings (singleton, id = 1)
-- ============================================================
CREATE TABLE public.wallet_gateway_settings (
  id integer PRIMARY KEY CHECK (id = 1),
  max_wallet_balance_piastres integer NOT NULL DEFAULT 200000 CHECK (max_wallet_balance_piastres > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.wallet_gateway_settings TO anon, authenticated;
GRANT ALL ON public.wallet_gateway_settings TO service_role;
ALTER TABLE public.wallet_gateway_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wallet settings readable to all" ON public.wallet_gateway_settings FOR SELECT USING (true);
CREATE POLICY "admins update wallet settings" ON public.wallet_gateway_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_wallet_gateway_settings_updated_at BEFORE UPDATE ON public.wallet_gateway_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
INSERT INTO public.wallet_gateway_settings (id, max_wallet_balance_piastres) VALUES (1, 200000);

-- ============================================================
-- payment_transactions
-- ============================================================
CREATE TABLE public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_number text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  gateway_id uuid NOT NULL REFERENCES public.payment_gateways(id) ON DELETE RESTRICT,
  amount_piastres integer NOT NULL CHECK (amount_piastres >= 0),
  status text NOT NULL CHECK (status IN ('success','failed')),
  failure_reason text,
  wallet_transaction_id uuid REFERENCES public.wallet_transactions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payment_transactions TO authenticated;
GRANT ALL ON public.payment_transactions TO service_role;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "students see own payment txns" ON public.payment_transactions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_payment_txns_user ON public.payment_transactions(user_id, created_at DESC);
CREATE INDEX idx_payment_txns_course ON public.payment_transactions(course_id, created_at DESC);

-- Reference generator for payment_transactions
CREATE OR REPLACE FUNCTION public._gen_payment_reference()
RETURNS text LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  suffix text; attempts int := 0; candidate text;
BEGIN
  LOOP
    suffix := '';
    FOR i IN 1..8 LOOP
      suffix := suffix || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    END LOOP;
    candidate := 'PAY-' || suffix;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.payment_transactions WHERE reference_number = candidate);
    attempts := attempts + 1;
    IF attempts > 20 THEN
      candidate := 'PAY-' || substr(replace(gen_random_uuid()::text,'-',''),1,10);
      EXIT;
    END IF;
  END LOOP;
  RETURN candidate;
END; $$;

-- ============================================================
-- purchase_course (atomic)
-- ============================================================
CREATE OR REPLACE FUNCTION public.purchase_course(p_course_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_course RECORD;
  v_price integer;
  v_gw RECORD;
  v_wallet RECORD;
  v_new_balance integer;
  v_wallet_ref text;
  v_wallet_txn_id uuid;
  v_pay_ref text;
  v_pay_id uuid;
  v_failure text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول أولاً' USING ERRCODE = '42501';
  END IF;

  SELECT id, is_paid, price_piastres, discount_price_piastres, discount_expires_at, status
    INTO v_course FROM public.courses WHERE id = p_course_id;
  IF v_course IS NULL THEN
    RAISE EXCEPTION 'الدورة غير موجودة';
  END IF;

  -- Effective price (mirrors getEffectiveCoursePrice in src/lib/money.ts exactly)
  IF v_course.is_paid IS NOT TRUE OR v_course.price_piastres IS NULL THEN
    v_price := 0;
  ELSIF v_course.discount_price_piastres IS NOT NULL
        AND (v_course.discount_expires_at IS NULL OR now() < v_course.discount_expires_at) THEN
    v_price := v_course.discount_price_piastres;
  ELSE
    v_price := v_course.price_piastres;
  END IF;

  -- Already enrolled?
  IF EXISTS (SELECT 1 FROM public.enrollments WHERE user_id = v_user AND course_id = p_course_id) THEN
    RETURN jsonb_build_object('success', false, 'already_enrolled', true,
                              'failure_reason', 'أنت مسجّل بالفعل في هذه الدورة');
  END IF;

  -- Free courses: enroll directly, no transaction record.
  IF v_price = 0 THEN
    INSERT INTO public.enrollments (user_id, course_id) VALUES (v_user, p_course_id)
      ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('success', true, 'free', true);
  END IF;

  -- Wallet gateway lookup
  SELECT * INTO v_gw FROM public.payment_gateways WHERE gateway_key = 'wallet';
  IF v_gw IS NULL OR NOT v_gw.is_enabled THEN
    v_failure := 'بوابة الدفع غير متاحة حالياً';
    v_pay_ref := public._gen_payment_reference();
    INSERT INTO public.payment_transactions
      (reference_number, user_id, course_id, gateway_id, amount_piastres, status, failure_reason)
      VALUES (v_pay_ref, v_user, p_course_id,
              COALESCE(v_gw.id, (SELECT id FROM public.payment_gateways WHERE gateway_key='wallet')),
              v_price, 'failed', v_failure);
    RETURN jsonb_build_object('success', false, 'failure_reason', v_failure, 'reference_number', v_pay_ref);
  END IF;

  -- Lock wallet row (create if missing to be safe)
  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_user FOR UPDATE;
  IF v_wallet IS NULL THEN
    INSERT INTO public.wallets (user_id, balance_piastres) VALUES (v_user, 0)
      RETURNING * INTO v_wallet;
  END IF;

  IF v_wallet.balance_piastres < v_price THEN
    v_failure := 'رصيد غير كافٍ';
    v_pay_ref := public._gen_payment_reference();
    INSERT INTO public.payment_transactions
      (reference_number, user_id, course_id, gateway_id, amount_piastres, status, failure_reason)
      VALUES (v_pay_ref, v_user, p_course_id, v_gw.id, v_price, 'failed', v_failure);
    RETURN jsonb_build_object('success', false, 'failure_reason', v_failure,
                              'reference_number', v_pay_ref,
                              'current_balance_piastres', v_wallet.balance_piastres,
                              'required_piastres', v_price);
  END IF;

  -- Charge
  v_new_balance := v_wallet.balance_piastres - v_price;
  UPDATE public.wallets SET balance_piastres = v_new_balance, updated_at = now() WHERE id = v_wallet.id;

  v_wallet_ref := public._gen_txn_reference();
  INSERT INTO public.wallet_transactions
    (reference_number, wallet_id, type, amount_piastres, balance_after_piastres, performed_by, notes)
    VALUES (v_wallet_ref, v_wallet.id, 'purchase', v_price, v_new_balance, v_user,
            'شراء دورة: ' || p_course_id::text)
    RETURNING id INTO v_wallet_txn_id;

  -- Enroll (ON CONFLICT protects against a rare race where user got enrolled between the earlier check and here)
  INSERT INTO public.enrollments (user_id, course_id) VALUES (v_user, p_course_id)
    ON CONFLICT DO NOTHING;

  v_pay_ref := public._gen_payment_reference();
  INSERT INTO public.payment_transactions
    (reference_number, user_id, course_id, gateway_id, amount_piastres, status, wallet_transaction_id)
    VALUES (v_pay_ref, v_user, p_course_id, v_gw.id, v_price, 'success', v_wallet_txn_id)
    RETURNING id INTO v_pay_id;

  RETURN jsonb_build_object(
    'success', true,
    'reference_number', v_pay_ref,
    'wallet_reference_number', v_wallet_ref,
    'new_balance_piastres', v_new_balance,
    'amount_piastres', v_price
  );
END; $$;

REVOKE ALL ON FUNCTION public.purchase_course(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.purchase_course(uuid) TO authenticated;

-- ============================================================
-- admin_reset_all_wallets
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_reset_all_wallets()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_row RECORD;
  v_ref text;
  v_count int := 0;
  v_total_piastres bigint := 0;
BEGIN
  IF NOT public.has_role(v_admin, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  FOR v_row IN
    SELECT w.id AS wallet_id, w.balance_piastres, p.id AS user_id
    FROM public.wallets w
    JOIN public.profiles p ON p.id = w.user_id
    WHERE p.role = 'student' AND COALESCE(p.is_banned, false) = false
      AND w.balance_piastres > 0
    FOR UPDATE OF w
  LOOP
    v_ref := public._gen_txn_reference();
    INSERT INTO public.wallet_transactions
      (reference_number, wallet_id, type, amount_piastres, balance_after_piastres, performed_by, notes)
      VALUES (v_ref, v_row.wallet_id, 'admin_reset', v_row.balance_piastres, 0, v_admin,
              'تصفير جميع المحافظ');
    UPDATE public.wallets SET balance_piastres = 0, updated_at = now() WHERE id = v_row.wallet_id;
    v_count := v_count + 1;
    v_total_piastres := v_total_piastres + v_row.balance_piastres;
  END LOOP;

  RETURN jsonb_build_object(
    'success_count', v_count,
    'total_piastres_removed', v_total_piastres
  );
END; $$;

REVOKE ALL ON FUNCTION public.admin_reset_all_wallets() FROM public;
GRANT EXECUTE ON FUNCTION public.admin_reset_all_wallets() TO authenticated;

-- ============================================================
-- Update redeem_top_up_card to read max balance from settings table
-- ============================================================
CREATE OR REPLACE FUNCTION public.redeem_top_up_card(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_max_balance integer;
  v_user uuid := auth.uid();
  v_code text := trim(COALESCE(p_code, ''));
  v_card RECORD;
  v_wallet RECORD;
  v_new_balance integer;
  v_ref text;
  v_max_egp text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول أولاً' USING ERRCODE = '42501';
  END IF;

  IF v_code !~ '^[0-9]{6}$' THEN
    RAISE EXCEPTION 'الكود غير صحيح';
  END IF;

  SELECT max_wallet_balance_piastres INTO v_max_balance
    FROM public.wallet_gateway_settings WHERE id = 1;
  IF v_max_balance IS NULL THEN v_max_balance := 200000; END IF;

  SELECT * INTO v_card FROM public.top_up_cards WHERE code = v_code FOR UPDATE;
  IF v_card IS NULL THEN
    RAISE EXCEPTION 'الكود غير صحيح';
  END IF;

  IF v_card.is_redeemed THEN
    RAISE EXCEPTION 'تم استخدام هذا الكود من قبل، لا يمكن استخدامه مرة أخرى.';
  END IF;

  IF v_card.expires_at IS NOT NULL AND now() > v_card.expires_at THEN
    RAISE EXCEPTION 'انتهت صلاحية هذا الكود.';
  END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_user FOR UPDATE;
  IF v_wallet IS NULL THEN
    INSERT INTO public.wallets(user_id, balance_piastres) VALUES (v_user, 0)
      RETURNING * INTO v_wallet;
  END IF;

  IF v_wallet.balance_piastres + v_card.value_piastres > v_max_balance THEN
    v_max_egp := (v_max_balance / 100)::text;
    RAISE EXCEPTION 'لا يمكن إتمام العملية، الحد الأقصى لرصيد المحفظة هو % جنيه.', v_max_egp;
  END IF;

  v_new_balance := v_wallet.balance_piastres + v_card.value_piastres;

  UPDATE public.top_up_cards
    SET is_redeemed = true, redeemed_by = v_user, redeemed_at = now()
    WHERE id = v_card.id;

  UPDATE public.wallets
    SET balance_piastres = v_new_balance, updated_at = now()
    WHERE id = v_wallet.id;

  v_ref := public._gen_txn_reference();

  INSERT INTO public.wallet_transactions
    (reference_number, wallet_id, type, amount_piastres, balance_after_piastres, related_card_id, performed_by)
  VALUES
    (v_ref, v_wallet.id, 'card_redemption', v_card.value_piastres, v_new_balance, v_card.id, NULL);

  RETURN jsonb_build_object(
    'success', true,
    'new_balance_piastres', v_new_balance,
    'amount_piastres', v_card.value_piastres,
    'reference_number', v_ref
  );
END;
$function$;

-- ============================================================
-- Update admin_adjust_wallet to read max balance from settings
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_adjust_wallet(p_user_id uuid, p_amount_piastres integer, p_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_max_balance integer;
  v_admin uuid := auth.uid();
  v_wallet RECORD;
  v_new_balance integer;
  v_ref text;
BEGIN
  IF NOT public.has_role(v_admin, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_amount_piastres IS NULL OR p_amount_piastres <= 0 THEN
    RAISE EXCEPTION 'قيمة غير صحيحة';
  END IF;
  IF p_type NOT IN ('admin_charge','admin_deduct') THEN
    RAISE EXCEPTION 'نوع العملية غير صحيح';
  END IF;

  SELECT max_wallet_balance_piastres INTO v_max_balance
    FROM public.wallet_gateway_settings WHERE id = 1;
  IF v_max_balance IS NULL THEN v_max_balance := 200000; END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
  IF v_wallet IS NULL THEN
    INSERT INTO public.wallets(user_id, balance_piastres) VALUES (p_user_id, 0)
      RETURNING * INTO v_wallet;
  END IF;

  IF p_type = 'admin_charge' THEN
    v_new_balance := v_wallet.balance_piastres + p_amount_piastres;
    IF v_new_balance > v_max_balance THEN
      RAISE EXCEPTION 'العملية ستتجاوز الحد الأقصى للرصيد (% ج.م)', (v_max_balance/100)::text;
    END IF;
  ELSE
    v_new_balance := v_wallet.balance_piastres - p_amount_piastres;
    IF v_new_balance < 0 THEN
      RAISE EXCEPTION 'رصيد المحفظة غير كافٍ للخصم';
    END IF;
  END IF;

  UPDATE public.wallets SET balance_piastres = v_new_balance, updated_at = now() WHERE id = v_wallet.id;

  v_ref := public._gen_txn_reference();
  INSERT INTO public.wallet_transactions
    (reference_number, wallet_id, type, amount_piastres, balance_after_piastres, performed_by)
    VALUES (v_ref, v_wallet.id, p_type, p_amount_piastres, v_new_balance, v_admin);

  RETURN jsonb_build_object(
    'success', true,
    'new_balance_piastres', v_new_balance,
    'reference_number', v_ref
  );
END;
$function$;

-- ============================================================
-- Update admin_bulk_adjust_wallets to read max balance from settings
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_bulk_adjust_wallets(p_amount_piastres integer, p_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_max_balance integer;
  v_admin uuid := auth.uid();
  v_row RECORD;
  v_new_balance integer;
  v_ref text;
  v_success int := 0;
  v_skipped int := 0;
  v_skipped_users jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.has_role(v_admin, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_amount_piastres IS NULL OR p_amount_piastres <= 0 THEN
    RAISE EXCEPTION 'قيمة غير صحيحة';
  END IF;
  IF p_type NOT IN ('bulk_charge','bulk_deduct') THEN
    RAISE EXCEPTION 'نوع العملية غير صحيح';
  END IF;

  SELECT max_wallet_balance_piastres INTO v_max_balance
    FROM public.wallet_gateway_settings WHERE id = 1;
  IF v_max_balance IS NULL THEN v_max_balance := 200000; END IF;

  FOR v_row IN
    SELECT w.id AS wallet_id, w.balance_piastres, p.id AS user_id, p.full_name
    FROM public.wallets w
    JOIN public.profiles p ON p.id = w.user_id
    WHERE p.role = 'student' AND COALESCE(p.is_banned, false) = false
    ORDER BY p.full_name
    FOR UPDATE OF w
  LOOP
    IF p_type = 'bulk_charge' THEN
      v_new_balance := v_row.balance_piastres + p_amount_piastres;
      IF v_new_balance > v_max_balance THEN
        v_skipped := v_skipped + 1;
        v_skipped_users := v_skipped_users || jsonb_build_object(
          'user_id', v_row.user_id, 'full_name', v_row.full_name, 'reason', 'over_max'
        );
        CONTINUE;
      END IF;
    ELSE
      v_new_balance := v_row.balance_piastres - p_amount_piastres;
      IF v_new_balance < 0 THEN
        v_skipped := v_skipped + 1;
        v_skipped_users := v_skipped_users || jsonb_build_object(
          'user_id', v_row.user_id, 'full_name', v_row.full_name, 'reason', 'insufficient'
        );
        CONTINUE;
      END IF;
    END IF;

    UPDATE public.wallets SET balance_piastres = v_new_balance, updated_at = now() WHERE id = v_row.wallet_id;
    v_ref := public._gen_txn_reference();
    INSERT INTO public.wallet_transactions
      (reference_number, wallet_id, type, amount_piastres, balance_after_piastres, performed_by)
      VALUES (v_ref, v_row.wallet_id, p_type, p_amount_piastres, v_new_balance, v_admin);
    v_success := v_success + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success_count', v_success,
    'skipped_count', v_skipped,
    'skipped_users', v_skipped_users
  );
END;
$function$;
-- Phase 39: Academic Performance — Assignment Analytics

-- 1) Most-problematic assignments (ranked by count of students whose outcome is 'failed' OR 'not_submitted')
CREATE OR REPLACE FUNCTION public.get_most_failed_assignments(_limit integer DEFAULT 10)
RETURNS TABLE(
  assignment_id uuid,
  assignment_title text,
  course_id uuid,
  course_title text,
  stage_id uuid,
  stage_name text,
  subject_id uuid,
  subject_name text,
  failed_count bigint,
  total_evaluated bigint,
  failure_rate numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH per_student AS (
    SELECT DISTINCT ON (s.assignment_id, s.user_id)
      s.assignment_id, s.user_id, s.outcome
    FROM public.assignment_submissions s
    WHERE s.outcome IS NOT NULL
    ORDER BY s.assignment_id, s.user_id, s.graded_at DESC NULLS LAST
  ),
  agg AS (
    SELECT
      ps.assignment_id,
      COUNT(*) FILTER (WHERE ps.outcome IN ('failed','not_submitted')) AS failed_count,
      COUNT(*) AS total_evaluated
    FROM per_student ps
    GROUP BY ps.assignment_id
    HAVING COUNT(*) FILTER (WHERE ps.outcome IN ('failed','not_submitted')) > 0
  )
  SELECT
    a.id, a.title,
    c.id, c.title,
    st.id, st.name,
    subj.id, subj.name,
    ag.failed_count,
    ag.total_evaluated,
    ROUND((ag.failed_count::numeric / NULLIF(ag.total_evaluated,0)) * 100, 1) AS failure_rate
  FROM agg ag
  JOIN public.assignments a ON a.id = ag.assignment_id
  JOIN public.courses c     ON c.id = a.course_id
  LEFT JOIN public.stages   st   ON st.id   = c.stage_id
  LEFT JOIN public.subjects subj ON subj.id = c.subject_id
  ORDER BY ag.failed_count DESC, ag.total_evaluated DESC
  LIMIT GREATEST(COALESCE(_limit, 10), 1);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_most_failed_assignments(integer) TO authenticated;

-- 2) Platform-wide submission-rate and response-time averages
CREATE OR REPLACE FUNCTION public.get_assignment_platform_metrics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_avg_rate numeric;
  v_avg_seconds numeric;
  v_rate_count int;
  v_time_count int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Per-assignment submission rate = submitted count / enrolled count.
  WITH per_asg AS (
    SELECT
      a.id AS assignment_id,
      (SELECT COUNT(*) FROM public.enrollments e WHERE e.course_id = a.course_id) AS enrolled,
      (SELECT COUNT(DISTINCT s.user_id)
         FROM public.assignment_submissions s
         WHERE s.assignment_id = a.id AND s.status = 'submitted') AS submitted
    FROM public.assignments a
  ),
  rates AS (
    SELECT (submitted::numeric / enrolled) * 100 AS rate
    FROM per_asg
    WHERE enrolled > 0
  )
  SELECT ROUND(AVG(rate), 1), COUNT(*) INTO v_avg_rate, v_rate_count FROM rates;

  -- Per-assignment average response time = avg(submitted_at - a.start_at) across submitted rows.
  WITH per_asg AS (
    SELECT AVG(EXTRACT(EPOCH FROM (s.submitted_at - a.start_at))) AS avg_secs
    FROM public.assignment_submissions s
    JOIN public.assignments a ON a.id = s.assignment_id
    WHERE s.status = 'submitted' AND s.submitted_at IS NOT NULL AND a.start_at IS NOT NULL
    GROUP BY a.id
    HAVING AVG(EXTRACT(EPOCH FROM (s.submitted_at - a.start_at))) IS NOT NULL
  )
  SELECT ROUND(AVG(avg_secs)), COUNT(*) INTO v_avg_seconds, v_time_count FROM per_asg;

  RETURN jsonb_build_object(
    'avg_submission_rate', v_avg_rate,
    'rate_sample_size', COALESCE(v_rate_count, 0),
    'avg_response_seconds', v_avg_seconds,
    'time_sample_size', COALESCE(v_time_count, 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_assignment_platform_metrics() TO authenticated;

-- 3) Add assignment-level filter to list_assignment_submissions (mirrors Phase 19 quiz filter addition)
CREATE OR REPLACE FUNCTION public.list_assignment_submissions(
  _user_search text DEFAULT NULL::text,
  _course_id uuid DEFAULT NULL::uuid,
  _stage_id uuid DEFAULT NULL::uuid,
  _subject_id uuid DEFAULT NULL::uuid,
  _ungraded_only boolean DEFAULT false,
  _assignment_id uuid DEFAULT NULL::uuid,
  _limit integer DEFAULT 100,
  _offset integer DEFAULT 0
)
RETURNS TABLE(
  submission_id uuid, assignment_id uuid, user_id uuid,
  student_name text, student_email text, student_phone text, student_student_id text,
  course_id uuid, course_title text,
  subject_id uuid, subject_name text,
  stage_id uuid, stage_name text,
  assignment_title text,
  total_grade numeric, pass_grade numeric, end_at timestamp with time zone,
  status text, submitted_at timestamp with time zone,
  grade numeric, outcome text, computed_outcome text,
  has_feedback boolean, feedback_given_at timestamp with time zone,
  graded_at timestamp with time zone, total_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_is_admin boolean := public.has_role(v_user, 'admin');
  v_search text := NULLIF(trim(COALESCE(_user_search,'')), '');
  v_is_digit_id boolean := v_search IS NOT NULL AND v_search ~ '^[0-9]{1,6}$';
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required' USING ERRCODE='42501'; END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      s.id AS submission_id,
      s.assignment_id,
      s.user_id,
      COALESCE(p.full_name, '') AS student_name,
      u.email::text AS student_email,
      p.phone_number AS student_phone,
      p.student_id  AS student_student_id,
      c.id AS course_id, c.title AS course_title,
      subj.id AS subject_id, subj.name AS subject_name,
      st.id AS stage_id, st.name AS stage_name,
      a.title AS assignment_title,
      a.total_grade, a.pass_grade, a.end_at,
      s.status, s.submitted_at,
      s.grade, s.outcome,
      CASE
        WHEN s.outcome IS NOT NULL THEN s.outcome
        WHEN s.status = 'submitted' THEN NULL
        WHEN s.status = 'draft' AND now() > a.end_at THEN 'not_submitted'
        ELSE NULL
      END AS computed_outcome,
      (s.feedback_given_at IS NOT NULL) AS has_feedback,
      s.feedback_given_at, s.graded_at
    FROM public.assignment_submissions s
    JOIN public.assignments a ON a.id = s.assignment_id
    JOIN public.courses c     ON c.id = a.course_id
    LEFT JOIN public.subjects subj ON subj.id = c.subject_id
    LEFT JOIN public.stages   st   ON st.id   = c.stage_id
    LEFT JOIN public.profiles p    ON p.id    = s.user_id
    LEFT JOIN auth.users u         ON u.id    = s.user_id
    WHERE
      (s.status = 'submitted' OR now() > a.end_at)
      AND (v_is_admin OR s.user_id = v_user)
      AND (_course_id     IS NULL OR c.id = _course_id)
      AND (_assignment_id IS NULL OR a.id = _assignment_id)
      AND (NOT v_is_admin OR _stage_id   IS NULL OR c.stage_id   = _stage_id)
      AND (NOT v_is_admin OR _subject_id IS NULL OR c.subject_id = _subject_id)
      AND (NOT v_is_admin OR NOT _ungraded_only OR s.outcome IS NULL)
      AND (
        NOT v_is_admin OR v_search IS NULL
        OR p.full_name    ILIKE '%'||v_search||'%'
        OR u.email        ILIKE '%'||v_search||'%'
        OR p.phone_number ILIKE '%'||v_search||'%'
        OR p.student_id   ILIKE '%'||v_search||'%'
        OR (v_is_digit_id AND p.student_id = lpad(v_search, 6, '0'))
      )
  ),
  counted AS (SELECT b.*, COUNT(*) OVER () AS total_count FROM base b)
  SELECT * FROM counted
  ORDER BY submitted_at DESC NULLS LAST, submission_id DESC
  LIMIT GREATEST(COALESCE(_limit, 100), 1)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$$;
CREATE OR REPLACE FUNCTION public.resolve_login_email(_identifier text)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id text := trim(COALESCE(_identifier, ''));
BEGIN
  -- Never reveal whether a phone number is registered, and never return
  -- another user's real email. Always return the deterministic synthetic
  -- address so the response is indistinguishable for existing vs
  -- non-existing accounts.
  IF v_id ~ '^201[0125][0-9]{8}$' THEN
    RETURN v_id || '@internal.noemail.local';
  END IF;
  RETURN lower(v_id);
END;
$$;

-- 1. Extend payment_gateways
ALTER TABLE public.payment_gateways
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'automatic',
  ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.payment_gateways DROP CONSTRAINT IF EXISTS payment_gateways_type_check;
ALTER TABLE public.payment_gateways
  ADD CONSTRAINT payment_gateways_type_check CHECK (type IN ('automatic','manual'));

-- 2. Extend payment_transactions
ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'course_purchase',
  ADD COLUMN IF NOT EXISTS topup_amount_piastres integer,
  ADD COLUMN IF NOT EXISTS requires_manual_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_notes text;

ALTER TABLE public.payment_transactions ALTER COLUMN course_id DROP NOT NULL;

ALTER TABLE public.payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_purpose_check;
ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_purpose_check CHECK (purpose IN ('course_purchase','wallet_topup'));

ALTER TABLE public.payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_status_check;
ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_status_check CHECK (status IN ('success','failed','pending_review'));

-- 3. Extend wallet_transactions.type to allow 'gateway_topup'
ALTER TABLE public.wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;
ALTER TABLE public.wallet_transactions
  ADD CONSTRAINT wallet_transactions_type_check CHECK (type IN (
    'card_redemption','admin_charge','admin_deduct','bulk_charge','bulk_deduct',
    'purchase','admin_reset','gateway_topup'
  ));

-- 4. Insert manual payment gateway (disabled by default)
INSERT INTO public.payment_gateways (gateway_key, display_name, is_enabled, type)
VALUES ('manual','الدفع اليدوي', false, 'manual')
ON CONFLICT (gateway_key) DO UPDATE SET type='manual';

-- 5. manual_payment_methods
CREATE TABLE IF NOT EXISTS public.manual_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  method_type text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  account_number text NOT NULL,
  account_holder_name text NOT NULL,
  support_whatsapp_number text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT manual_payment_methods_type_check CHECK (method_type IN ('vodafone_cash','instapay'))
);

GRANT SELECT ON public.manual_payment_methods TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.manual_payment_methods TO authenticated;
GRANT ALL ON public.manual_payment_methods TO service_role;

ALTER TABLE public.manual_payment_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "manual methods readable" ON public.manual_payment_methods;
CREATE POLICY "manual methods readable" ON public.manual_payment_methods FOR SELECT USING (true);

DROP POLICY IF EXISTS "admins manage manual methods insert" ON public.manual_payment_methods;
CREATE POLICY "admins manage manual methods insert" ON public.manual_payment_methods
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "admins manage manual methods update" ON public.manual_payment_methods;
CREATE POLICY "admins manage manual methods update" ON public.manual_payment_methods
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "admins manage manual methods delete" ON public.manual_payment_methods;
CREATE POLICY "admins manage manual methods delete" ON public.manual_payment_methods
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

DROP TRIGGER IF EXISTS update_manual_payment_methods_updated_at ON public.manual_payment_methods;
CREATE TRIGGER update_manual_payment_methods_updated_at
  BEFORE UPDATE ON public.manual_payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. manual_payment_proofs
CREATE TABLE IF NOT EXISTS public.manual_payment_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_transaction_id uuid NOT NULL REFERENCES public.payment_transactions(id) ON DELETE CASCADE,
  manual_payment_method_id uuid NOT NULL REFERENCES public.manual_payment_methods(id) ON DELETE RESTRICT,
  sender_number text NOT NULL,
  proof_image_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_manual_proofs_txn ON public.manual_payment_proofs(payment_transaction_id);

GRANT SELECT, INSERT ON public.manual_payment_proofs TO authenticated;
GRANT ALL ON public.manual_payment_proofs TO service_role;

ALTER TABLE public.manual_payment_proofs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "proofs owner or admin select" ON public.manual_payment_proofs;
CREATE POLICY "proofs owner or admin select" ON public.manual_payment_proofs FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR EXISTS (SELECT 1 FROM public.payment_transactions t
               WHERE t.id = payment_transaction_id AND t.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "proofs owner insert" ON public.manual_payment_proofs;
CREATE POLICY "proofs owner insert" ON public.manual_payment_proofs FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.payment_transactions t
            WHERE t.id = payment_transaction_id AND t.user_id = auth.uid())
  );

-- 7. RPC: submit manual payment (course purchase)
CREATE OR REPLACE FUNCTION public.submit_manual_course_payment(
  p_course_id uuid,
  p_method_id uuid,
  p_sender_number text,
  p_proof_image_url text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_course RECORD;
  v_price integer;
  v_gw RECORD;
  v_method RECORD;
  v_ref text;
  v_txn_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول أولاً' USING ERRCODE='42501'; END IF;
  IF p_sender_number IS NULL OR length(trim(p_sender_number)) < 4 THEN
    RAISE EXCEPTION 'رقم المُحوِّل غير صحيح';
  END IF;
  IF p_proof_image_url IS NULL OR length(trim(p_proof_image_url)) = 0 THEN
    RAISE EXCEPTION 'يجب رفع صورة إثبات التحويل';
  END IF;

  SELECT id, is_paid, price_piastres, discount_price_piastres, discount_expires_at
    INTO v_course FROM public.courses WHERE id = p_course_id;
  IF v_course IS NULL THEN RAISE EXCEPTION 'الدورة غير موجودة'; END IF;

  IF v_course.is_paid IS NOT TRUE OR v_course.price_piastres IS NULL THEN
    v_price := 0;
  ELSIF v_course.discount_price_piastres IS NOT NULL
        AND (v_course.discount_expires_at IS NULL OR now() < v_course.discount_expires_at) THEN
    v_price := v_course.discount_price_piastres;
  ELSE
    v_price := v_course.price_piastres;
  END IF;

  IF v_price <= 0 THEN RAISE EXCEPTION 'هذه الدورة مجانية'; END IF;

  IF EXISTS (SELECT 1 FROM public.enrollments WHERE user_id=v_user AND course_id=p_course_id) THEN
    RAISE EXCEPTION 'أنت مسجّل بالفعل في هذه الدورة';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.payment_transactions
    WHERE user_id=v_user AND course_id=p_course_id AND status='pending_review'
  ) THEN
    RAISE EXCEPTION 'لديك طلب دفع قيد المراجعة لهذه الدورة بالفعل';
  END IF;

  SELECT * INTO v_gw FROM public.payment_gateways WHERE gateway_key='manual';
  IF v_gw IS NULL OR NOT v_gw.is_enabled THEN RAISE EXCEPTION 'بوابة الدفع اليدوي غير مفعلة'; END IF;

  SELECT * INTO v_method FROM public.manual_payment_methods WHERE id=p_method_id;
  IF v_method IS NULL OR NOT v_method.is_enabled THEN RAISE EXCEPTION 'طريقة الدفع غير متاحة'; END IF;

  v_ref := public._gen_payment_reference();
  INSERT INTO public.payment_transactions
    (reference_number, user_id, course_id, gateway_id, amount_piastres, status, purpose, requires_manual_review)
    VALUES (v_ref, v_user, p_course_id, v_gw.id, v_price, 'pending_review', 'course_purchase', true)
    RETURNING id INTO v_txn_id;

  INSERT INTO public.manual_payment_proofs
    (payment_transaction_id, manual_payment_method_id, sender_number, proof_image_url)
    VALUES (v_txn_id, p_method_id, trim(p_sender_number), p_proof_image_url);

  RETURN jsonb_build_object('success', true, 'transaction_id', v_txn_id, 'reference_number', v_ref);
END; $$;

-- 8. RPC: submit manual payment (wallet top-up)
CREATE OR REPLACE FUNCTION public.submit_manual_wallet_topup(
  p_amount_piastres integer,
  p_method_id uuid,
  p_sender_number text,
  p_proof_image_url text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_max integer;
  v_wallet RECORD;
  v_gw RECORD;
  v_method RECORD;
  v_ref text;
  v_txn_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول أولاً' USING ERRCODE='42501'; END IF;
  IF p_amount_piastres IS NULL OR p_amount_piastres <= 0 THEN
    RAISE EXCEPTION 'قيمة الشحن غير صحيحة';
  END IF;
  IF p_sender_number IS NULL OR length(trim(p_sender_number)) < 4 THEN
    RAISE EXCEPTION 'رقم المُحوِّل غير صحيح';
  END IF;
  IF p_proof_image_url IS NULL OR length(trim(p_proof_image_url)) = 0 THEN
    RAISE EXCEPTION 'يجب رفع صورة إثبات التحويل';
  END IF;

  SELECT max_wallet_balance_piastres INTO v_max FROM public.wallet_gateway_settings WHERE id=1;
  IF v_max IS NULL THEN v_max := 200000; END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id=v_user;
  IF v_wallet IS NULL THEN
    INSERT INTO public.wallets(user_id, balance_piastres) VALUES (v_user, 0) RETURNING * INTO v_wallet;
  END IF;

  IF v_wallet.balance_piastres + p_amount_piastres > v_max THEN
    RAISE EXCEPTION 'المبلغ سيتجاوز الحد الأقصى للرصيد (% ج.م)', (v_max/100)::text;
  END IF;

  SELECT * INTO v_gw FROM public.payment_gateways WHERE gateway_key='manual';
  IF v_gw IS NULL OR NOT v_gw.is_enabled THEN RAISE EXCEPTION 'بوابة الدفع اليدوي غير مفعلة'; END IF;

  SELECT * INTO v_method FROM public.manual_payment_methods WHERE id=p_method_id;
  IF v_method IS NULL OR NOT v_method.is_enabled THEN RAISE EXCEPTION 'طريقة الدفع غير متاحة'; END IF;

  v_ref := public._gen_payment_reference();
  INSERT INTO public.payment_transactions
    (reference_number, user_id, course_id, gateway_id, amount_piastres, status, purpose,
     topup_amount_piastres, requires_manual_review)
    VALUES (v_ref, v_user, NULL, v_gw.id, p_amount_piastres, 'pending_review', 'wallet_topup',
            p_amount_piastres, true)
    RETURNING id INTO v_txn_id;

  INSERT INTO public.manual_payment_proofs
    (payment_transaction_id, manual_payment_method_id, sender_number, proof_image_url)
    VALUES (v_txn_id, p_method_id, trim(p_sender_number), p_proof_image_url);

  RETURN jsonb_build_object('success', true, 'transaction_id', v_txn_id, 'reference_number', v_ref);
END; $$;

-- 9. RPC: admin approve
CREATE OR REPLACE FUNCTION public.admin_approve_payment_request(
  p_transaction_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_txn RECORD;
  v_max integer;
  v_wallet RECORD;
  v_new_balance integer;
  v_wref text;
  v_wtx_id uuid;
BEGIN
  IF NOT public.has_role(v_admin, 'admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_txn FROM public.payment_transactions WHERE id=p_transaction_id FOR UPDATE;
  IF v_txn IS NULL THEN RAISE EXCEPTION 'الطلب غير موجود'; END IF;
  IF v_txn.status <> 'pending_review' THEN RAISE EXCEPTION 'هذا الطلب لم يعد قابلاً للمراجعة'; END IF;

  IF v_txn.purpose = 'course_purchase' THEN
    IF v_txn.course_id IS NULL THEN RAISE EXCEPTION 'الطلب لا يحتوي على دورة'; END IF;
    INSERT INTO public.enrollments (user_id, course_id) VALUES (v_txn.user_id, v_txn.course_id)
      ON CONFLICT DO NOTHING;
    UPDATE public.payment_transactions
      SET status='success', reviewed_by=v_admin, reviewed_at=now()
      WHERE id=p_transaction_id;
    RETURN jsonb_build_object('success', true, 'purpose', 'course_purchase');

  ELSIF v_txn.purpose = 'wallet_topup' THEN
    SELECT max_wallet_balance_piastres INTO v_max FROM public.wallet_gateway_settings WHERE id=1;
    IF v_max IS NULL THEN v_max := 200000; END IF;

    SELECT * INTO v_wallet FROM public.wallets WHERE user_id=v_txn.user_id FOR UPDATE;
    IF v_wallet IS NULL THEN
      INSERT INTO public.wallets(user_id, balance_piastres) VALUES (v_txn.user_id, 0) RETURNING * INTO v_wallet;
    END IF;

    IF v_wallet.balance_piastres + COALESCE(v_txn.topup_amount_piastres,0) > v_max THEN
      RAISE EXCEPTION 'قبول هذا الطلب سيتجاوز الحد الأقصى لرصيد الطالب (% ج.م). تواصل مع الطالب.', (v_max/100)::text;
    END IF;

    v_new_balance := v_wallet.balance_piastres + v_txn.topup_amount_piastres;
    UPDATE public.wallets SET balance_piastres=v_new_balance, updated_at=now() WHERE id=v_wallet.id;

    v_wref := public._gen_txn_reference();
    INSERT INTO public.wallet_transactions
      (reference_number, wallet_id, type, amount_piastres, balance_after_piastres, performed_by, notes)
      VALUES (v_wref, v_wallet.id, 'gateway_topup', v_txn.topup_amount_piastres, v_new_balance, v_admin,
              'شحن معتمد عبر بوابة الدفع - ' || v_txn.reference_number)
      RETURNING id INTO v_wtx_id;

    UPDATE public.payment_transactions
      SET status='success', reviewed_by=v_admin, reviewed_at=now(), wallet_transaction_id=v_wtx_id
      WHERE id=p_transaction_id;

    RETURN jsonb_build_object('success', true, 'purpose', 'wallet_topup', 'new_balance_piastres', v_new_balance);
  END IF;

  RAISE EXCEPTION 'نوع طلب غير مدعوم';
END; $$;

-- 10. RPC: admin reject
CREATE OR REPLACE FUNCTION public.admin_reject_payment_request(
  p_transaction_id uuid,
  p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_txn RECORD;
BEGIN
  IF NOT public.has_role(v_admin, 'admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN RAISE EXCEPTION 'يجب إدخال سبب واضح للرفض'; END IF;

  SELECT * INTO v_txn FROM public.payment_transactions WHERE id=p_transaction_id FOR UPDATE;
  IF v_txn IS NULL THEN RAISE EXCEPTION 'الطلب غير موجود'; END IF;
  IF v_txn.status <> 'pending_review' THEN RAISE EXCEPTION 'هذا الطلب لم يعد قابلاً للمراجعة'; END IF;

  UPDATE public.payment_transactions
    SET status='failed', failure_reason=trim(p_reason), review_notes=trim(p_reason),
        reviewed_by=v_admin, reviewed_at=now()
    WHERE id=p_transaction_id;

  RETURN jsonb_build_object('success', true);
END; $$;

-- 11. RPC: admin list payment requests (with joined info)
CREATE OR REPLACE FUNCTION public.admin_list_payment_requests(
  _status text DEFAULT 'pending_review',
  _purpose text DEFAULT NULL,
  _limit integer DEFAULT 100,
  _offset integer DEFAULT 0
) RETURNS TABLE(
  transaction_id uuid, reference_number text, purpose text, status text,
  user_id uuid, student_name text, student_phone text, student_student_id text,
  course_id uuid, course_title text,
  amount_piastres integer, topup_amount_piastres integer,
  gateway_display_name text, method_type text, method_account_number text,
  method_account_holder text, method_whatsapp text,
  sender_number text, proof_image_url text,
  review_notes text, failure_reason text,
  reviewed_at timestamptz, created_at timestamptz, total_count bigint
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
  WITH base AS (
    SELECT t.id AS transaction_id, t.reference_number, t.purpose, t.status,
      p.id AS user_id, p.full_name AS student_name, p.phone_number AS student_phone, p.student_id AS student_student_id,
      c.id AS course_id, c.title AS course_title,
      t.amount_piastres, t.topup_amount_piastres,
      g.display_name AS gateway_display_name,
      mm.method_type, mm.account_number AS method_account_number,
      mm.account_holder_name AS method_account_holder, mm.support_whatsapp_number AS method_whatsapp,
      pr.sender_number, pr.proof_image_url,
      t.review_notes, t.failure_reason, t.reviewed_at, t.created_at
    FROM public.payment_transactions t
    JOIN public.profiles p ON p.id = t.user_id
    JOIN public.payment_gateways g ON g.id = t.gateway_id
    LEFT JOIN public.courses c ON c.id = t.course_id
    LEFT JOIN public.manual_payment_proofs pr ON pr.payment_transaction_id = t.id
    LEFT JOIN public.manual_payment_methods mm ON mm.id = pr.manual_payment_method_id
    WHERE (_status IS NULL OR t.status = _status)
      AND (_purpose IS NULL OR t.purpose = _purpose)
  ),
  counted AS (SELECT b.*, COUNT(*) OVER () AS total_count FROM base b)
  SELECT * FROM counted
  ORDER BY created_at DESC
  LIMIT GREATEST(COALESCE(_limit,100),1) OFFSET GREATEST(COALESCE(_offset,0),0);
END; $$;

-- 12. RPC: student list own payment requests
CREATE OR REPLACE FUNCTION public.student_list_own_payment_requests()
RETURNS TABLE(
  transaction_id uuid, reference_number text, purpose text, status text,
  course_id uuid, course_title text,
  amount_piastres integer, topup_amount_piastres integer,
  gateway_display_name text, method_type text,
  method_account_number text, method_whatsapp text,
  sender_number text, proof_image_url text,
  review_notes text, failure_reason text,
  reviewed_at timestamptz, created_at timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT t.id, t.reference_number, t.purpose, t.status,
    c.id, c.title,
    t.amount_piastres, t.topup_amount_piastres,
    g.display_name, mm.method_type,
    mm.account_number, mm.support_whatsapp_number,
    pr.sender_number, pr.proof_image_url,
    t.review_notes, t.failure_reason, t.reviewed_at, t.created_at
  FROM public.payment_transactions t
  JOIN public.payment_gateways g ON g.id = t.gateway_id
  LEFT JOIN public.courses c ON c.id = t.course_id
  LEFT JOIN public.manual_payment_proofs pr ON pr.payment_transaction_id = t.id
  LEFT JOIN public.manual_payment_methods mm ON mm.id = pr.manual_payment_method_id
  WHERE t.user_id = v_user
  ORDER BY t.created_at DESC;
END; $$;

-- 13. Ensure the gateway enable trigger: manual gateway needs at least one enabled method
CREATE OR REPLACE FUNCTION public.validate_manual_gateway_enable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.gateway_key='manual' AND NEW.is_enabled = true THEN
    IF NOT EXISTS (SELECT 1 FROM public.manual_payment_methods WHERE is_enabled=true) THEN
      RAISE EXCEPTION 'لا يمكن تفعيل بوابة الدفع اليدوي بدون وجود طريقة دفع مفعلة واحدة على الأقل';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_validate_manual_gateway_enable ON public.payment_gateways;
CREATE TRIGGER trg_validate_manual_gateway_enable
  BEFORE UPDATE OR INSERT ON public.payment_gateways
  FOR EACH ROW EXECUTE FUNCTION public.validate_manual_gateway_enable();

GRANT EXECUTE ON FUNCTION public.submit_manual_course_payment(uuid,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_manual_wallet_topup(integer,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_approve_payment_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reject_payment_request(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_payment_requests(text,text,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_list_own_payment_requests() TO authenticated;

DROP POLICY IF EXISTS "payment proofs owner insert" ON storage.objects;
CREATE POLICY "payment proofs owner insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "payment proofs owner or admin select" ON storage.objects;
CREATE POLICY "payment proofs owner or admin select" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'payment-proofs'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin')
    )
  );

DROP POLICY IF EXISTS "payment proofs owner update" ON storage.objects;
CREATE POLICY "payment proofs owner update" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 1) Extend payment_transactions status
ALTER TABLE public.payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_status_check;
ALTER TABLE public.payment_transactions ADD CONSTRAINT payment_transactions_status_check
  CHECK (status = ANY (ARRAY['success'::text, 'failed'::text, 'pending_review'::text, 'pending_gateway'::text]));

-- 2) Admin-only secrets table (isolated from public gateway metadata)
CREATE TABLE IF NOT EXISTS public.payment_gateway_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_id uuid NOT NULL UNIQUE REFERENCES public.payment_gateways(id) ON DELETE CASCADE,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_gateway_secrets TO authenticated;
GRANT ALL ON public.payment_gateway_secrets TO service_role;
ALTER TABLE public.payment_gateway_secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read gateway secrets" ON public.payment_gateway_secrets
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins insert gateway secrets" ON public.payment_gateway_secrets
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins update gateway secrets" ON public.payment_gateway_secrets
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins delete gateway secrets" ON public.payment_gateway_secrets
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_payment_gateway_secrets_updated_at
  BEFORE UPDATE ON public.payment_gateway_secrets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Move any existing config values into the new secrets table before dropping
INSERT INTO public.payment_gateway_secrets (gateway_id, config)
SELECT id, COALESCE(config, '{}'::jsonb) FROM public.payment_gateways
ON CONFLICT (gateway_id) DO NOTHING;

ALTER TABLE public.payment_gateways DROP COLUMN IF EXISTS config;

-- 4) Register Kashier gateway (disabled by default)
INSERT INTO public.payment_gateways (gateway_key, display_name, type, is_enabled)
VALUES ('kashier', 'Kashier', 'automatic', false)
ON CONFLICT (gateway_key) DO NOTHING;

INSERT INTO public.payment_gateway_secrets (gateway_id, config)
SELECT id, jsonb_build_object('merchant_id','','api_key','','secret_key','','mode','test')
FROM public.payment_gateways WHERE gateway_key='kashier'
ON CONFLICT (gateway_id) DO NOTHING;

-- 5) Create pending gateway transaction (called by student initiating an automatic gateway payment)
CREATE OR REPLACE FUNCTION public.create_pending_gateway_transaction(
  p_gateway_key text,
  p_purpose text,
  p_course_id uuid DEFAULT NULL,
  p_topup_amount_piastres integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_gateway RECORD;
  v_course RECORD;
  v_amount integer;
  v_ref text;
  v_max integer;
  v_wallet_balance integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required' USING ERRCODE='42501'; END IF;
  IF p_purpose NOT IN ('course_purchase','wallet_topup') THEN RAISE EXCEPTION 'invalid purpose'; END IF;

  SELECT * INTO v_gateway FROM public.payment_gateways WHERE gateway_key = p_gateway_key;
  IF v_gateway IS NULL THEN RAISE EXCEPTION 'gateway not found'; END IF;
  IF NOT v_gateway.is_enabled THEN RAISE EXCEPTION 'gateway disabled'; END IF;
  IF v_gateway.type <> 'automatic' THEN RAISE EXCEPTION 'not an automatic gateway'; END IF;

  IF p_purpose = 'course_purchase' THEN
    IF p_course_id IS NULL THEN RAISE EXCEPTION 'course_id required'; END IF;
    SELECT id, is_paid, price_piastres, discount_price_piastres, discount_expires_at
      INTO v_course FROM public.courses WHERE id = p_course_id;
    IF v_course IS NULL THEN RAISE EXCEPTION 'course not found'; END IF;
    IF v_course.is_paid IS NOT TRUE OR v_course.price_piastres IS NULL THEN
      v_amount := 0;
    ELSIF v_course.discount_price_piastres IS NOT NULL
      AND (v_course.discount_expires_at IS NULL OR now() < v_course.discount_expires_at) THEN
      v_amount := v_course.discount_price_piastres;
    ELSE
      v_amount := v_course.price_piastres;
    END IF;
    IF v_amount <= 0 THEN RAISE EXCEPTION 'الدورة مجانية — لا حاجة لبوابة دفع'; END IF;
    IF EXISTS (SELECT 1 FROM public.enrollments WHERE user_id=v_user AND course_id=p_course_id) THEN
      RAISE EXCEPTION 'أنت مسجّل بالفعل في هذه الدورة';
    END IF;
  ELSE
    IF p_topup_amount_piastres IS NULL OR p_topup_amount_piastres <= 0 THEN
      RAISE EXCEPTION 'topup amount required';
    END IF;
    SELECT max_wallet_balance_piastres INTO v_max FROM public.wallet_gateway_settings WHERE id=1;
    IF v_max IS NULL THEN v_max := 200000; END IF;
    SELECT balance_piastres INTO v_wallet_balance FROM public.wallets WHERE user_id=v_user;
    IF COALESCE(v_wallet_balance,0) + p_topup_amount_piastres > v_max THEN
      RAISE EXCEPTION 'المبلغ سيتجاوز الحد الأقصى لرصيد المحفظة (% ج.م)', (v_max/100)::text;
    END IF;
    v_amount := p_topup_amount_piastres;
  END IF;

  v_ref := public._gen_payment_reference();
  INSERT INTO public.payment_transactions
    (reference_number, user_id, course_id, gateway_id, amount_piastres, status, purpose, topup_amount_piastres, requires_manual_review)
  VALUES
    (v_ref, v_user,
     CASE WHEN p_purpose='course_purchase' THEN p_course_id ELSE NULL END,
     v_gateway.id, v_amount, 'pending_gateway', p_purpose,
     CASE WHEN p_purpose='wallet_topup' THEN p_topup_amount_piastres ELSE NULL END,
     false);

  RETURN jsonb_build_object('reference_number', v_ref, 'amount_piastres', v_amount);
END;
$fn$;

REVOKE ALL ON FUNCTION public.create_pending_gateway_transaction(text,text,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_pending_gateway_transaction(text,text,uuid,integer) TO authenticated;

-- 6) Finalize kashier transaction — called from webhook via service role
CREATE OR REPLACE FUNCTION public.finalize_gateway_transaction(
  p_reference text,
  p_success boolean,
  p_failure_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_txn RECORD;
  v_max integer;
  v_wallet RECORD;
  v_new_balance integer;
  v_wref text;
  v_wtx_id uuid;
BEGIN
  SELECT * INTO v_txn FROM public.payment_transactions WHERE reference_number = p_reference FOR UPDATE;
  IF v_txn IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'transaction not found'); END IF;
  IF v_txn.status <> 'pending_gateway' THEN
    RETURN jsonb_build_object('ok', true, 'already_finalized', true, 'status', v_txn.status);
  END IF;

  IF NOT p_success THEN
    UPDATE public.payment_transactions
      SET status='failed', failure_reason=COALESCE(p_failure_reason,'gateway declined')
      WHERE id = v_txn.id;
    RETURN jsonb_build_object('ok', true, 'status', 'failed');
  END IF;

  IF v_txn.purpose = 'course_purchase' THEN
    IF v_txn.course_id IS NULL THEN
      UPDATE public.payment_transactions SET status='failed', failure_reason='course missing' WHERE id=v_txn.id;
      RETURN jsonb_build_object('ok', true, 'status', 'failed');
    END IF;
    INSERT INTO public.enrollments (user_id, course_id) VALUES (v_txn.user_id, v_txn.course_id)
      ON CONFLICT DO NOTHING;
    UPDATE public.payment_transactions SET status='success' WHERE id=v_txn.id;
    RETURN jsonb_build_object('ok', true, 'status', 'success', 'purpose', 'course_purchase');

  ELSIF v_txn.purpose = 'wallet_topup' THEN
    SELECT max_wallet_balance_piastres INTO v_max FROM public.wallet_gateway_settings WHERE id=1;
    IF v_max IS NULL THEN v_max := 200000; END IF;

    SELECT * INTO v_wallet FROM public.wallets WHERE user_id=v_txn.user_id FOR UPDATE;
    IF v_wallet IS NULL THEN
      INSERT INTO public.wallets(user_id, balance_piastres) VALUES (v_txn.user_id, 0) RETURNING * INTO v_wallet;
    END IF;

    IF v_wallet.balance_piastres + COALESCE(v_txn.topup_amount_piastres,0) > v_max THEN
      -- Do NOT silently truncate. Mark failed, flag for admin reconciliation.
      UPDATE public.payment_transactions
        SET status='failed',
            failure_reason='تم الدفع بنجاح ولكن الرصيد سيتجاوز الحد الأقصى (' || (v_max/100)::text || ' ج.م). يستوجب مراجعة إدارية.',
            requires_manual_review = true
        WHERE id = v_txn.id;
      RETURN jsonb_build_object('ok', true, 'status', 'failed', 'requires_reconciliation', true);
    END IF;

    v_new_balance := v_wallet.balance_piastres + v_txn.topup_amount_piastres;
    UPDATE public.wallets SET balance_piastres=v_new_balance, updated_at=now() WHERE id=v_wallet.id;

    v_wref := public._gen_txn_reference();
    INSERT INTO public.wallet_transactions
      (reference_number, wallet_id, type, amount_piastres, balance_after_piastres, notes)
      VALUES (v_wref, v_wallet.id, 'gateway_topup', v_txn.topup_amount_piastres, v_new_balance,
              'شحن عبر بوابة دفع - ' || v_txn.reference_number)
      RETURNING id INTO v_wtx_id;

    UPDATE public.payment_transactions
      SET status='success', wallet_transaction_id=v_wtx_id
      WHERE id=v_txn.id;

    RETURN jsonb_build_object('ok', true, 'status', 'success', 'purpose', 'wallet_topup', 'new_balance_piastres', v_new_balance);
  END IF;

  RETURN jsonb_build_object('ok', false, 'error', 'unsupported purpose');
END;
$fn$;

REVOKE ALL ON FUNCTION public.finalize_gateway_transaction(text,boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_gateway_transaction(text,boolean,text) TO service_role;

-- 7) Student polls transaction status by reference number
CREATE OR REPLACE FUNCTION public.get_own_payment_transaction_status(p_reference text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_txn RECORD;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required' USING ERRCODE='42501'; END IF;
  SELECT id, reference_number, status, purpose, course_id, amount_piastres, topup_amount_piastres, failure_reason
    INTO v_txn FROM public.payment_transactions
    WHERE reference_number = p_reference AND user_id = v_user;
  IF v_txn IS NULL THEN RETURN NULL; END IF;
  RETURN to_jsonb(v_txn);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_own_payment_transaction_status(text) TO authenticated;

-- 8) Update admin payment-requests queue to also surface failed automatic-gateway rows needing reconciliation
CREATE OR REPLACE FUNCTION public.admin_list_payment_requests(
  _status text DEFAULT 'pending_review',
  _purpose text DEFAULT NULL,
  _limit integer DEFAULT 100,
  _offset integer DEFAULT 0
) RETURNS TABLE(
  transaction_id uuid, reference_number text, purpose text, status text,
  user_id uuid, student_name text, student_phone text, student_student_id text,
  course_id uuid, course_title text,
  amount_piastres integer, topup_amount_piastres integer,
  gateway_display_name text, method_type text, method_account_number text,
  method_account_holder text, method_whatsapp text,
  sender_number text, proof_image_url text,
  review_notes text, failure_reason text,
  reviewed_at timestamptz, created_at timestamptz, total_count bigint
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
  WITH base AS (
    SELECT t.id AS transaction_id, t.reference_number, t.purpose, t.status,
      p.id AS user_id, p.full_name AS student_name, p.phone_number AS student_phone, p.student_id AS student_student_id,
      c.id AS course_id, c.title AS course_title,
      t.amount_piastres, t.topup_amount_piastres,
      g.display_name AS gateway_display_name,
      mm.method_type::text, mm.account_number AS method_account_number,
      mm.account_holder_name AS method_account_holder, mm.support_whatsapp_number AS method_whatsapp,
      pr.sender_number, pr.proof_image_url,
      t.review_notes, t.failure_reason, t.reviewed_at, t.created_at
    FROM public.payment_transactions t
    JOIN public.profiles p ON p.id = t.user_id
    LEFT JOIN public.courses c ON c.id = t.course_id
    LEFT JOIN public.payment_gateways g ON g.id = t.gateway_id
    LEFT JOIN public.manual_payment_proofs pr ON pr.payment_transaction_id = t.id
    LEFT JOIN public.manual_payment_methods mm ON mm.id = pr.manual_payment_method_id
    WHERE
      (
        (_status IS NULL AND (t.status = 'pending_review' OR (t.requires_manual_review AND t.status = 'failed')))
        OR (_status IS NOT NULL AND t.status = _status)
        OR (_status = 'pending_review' AND t.requires_manual_review AND t.status = 'failed')
      )
      AND (_purpose IS NULL OR t.purpose = _purpose)
  ),
  counted AS (SELECT b.*, COUNT(*) OVER () AS total_count FROM base b)
  SELECT * FROM counted
  ORDER BY created_at DESC
  LIMIT GREATEST(COALESCE(_limit,100),1)
  OFFSET GREATEST(COALESCE(_offset,0),0);
END;
$fn$;

-- 1. Column for storing gateway-specific identifiers (e.g. Fawaterak invoice_id/invoice_key)
ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS gateway_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. Helper to age out stale Fawaterak pending_gateway transactions.
--    Fawaterak's webhook fires only on paid, so anything left pending past the
--    timeout is treated as failed. Runs as SECURITY DEFINER so any caller can
--    trigger the cleanup safely (only touches Fawaterak pending rows past the cutoff).
CREATE OR REPLACE FUNCTION public.expire_stale_fawaterak_pending()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gateway_id uuid;
  v_cutoff timestamptz := now() - interval '2 hours';
  v_count integer := 0;
BEGIN
  SELECT id INTO v_gateway_id FROM public.payment_gateways WHERE gateway_key = 'fawaterak';
  IF v_gateway_id IS NULL THEN
    RETURN 0;
  END IF;

  WITH updated AS (
    UPDATE public.payment_transactions
       SET status = 'failed',
           failure_reason = COALESCE(failure_reason, 'انتهت مهلة إتمام الدفع دون تأكيد من فواتيرك')
     WHERE gateway_id = v_gateway_id
       AND status = 'pending_gateway'
       AND created_at < v_cutoff
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM updated;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_stale_fawaterak_pending() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_stale_fawaterak_pending() TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_fawaterak_pending() TO service_role;

CREATE TABLE public.payment_gateway_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_id uuid NOT NULL REFERENCES public.payment_gateways(id) ON DELETE CASCADE,
  method_key text NOT NULL,
  display_name text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  order_index integer NOT NULL DEFAULT 0,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gateway_id, method_key)
);

GRANT SELECT ON public.payment_gateway_methods TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.payment_gateway_methods TO authenticated;
GRANT ALL ON public.payment_gateway_methods TO service_role;

ALTER TABLE public.payment_gateway_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gateway_methods_select_all"
  ON public.payment_gateway_methods FOR SELECT
  USING (true);

CREATE POLICY "gateway_methods_admin_insert"
  ON public.payment_gateway_methods FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "gateway_methods_admin_update"
  ON public.payment_gateway_methods FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "gateway_methods_admin_delete"
  ON public.payment_gateway_methods FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER payment_gateway_methods_updated_at
  BEFORE UPDATE ON public.payment_gateway_methods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX payment_gateway_methods_gateway_idx
  ON public.payment_gateway_methods (gateway_id, order_index);

-- Seed Kashier's three fixed methods
INSERT INTO public.payment_gateway_methods (gateway_id, method_key, display_name, is_enabled, order_index)
SELECT g.id, m.method_key, m.display_name, true, m.order_index
FROM public.payment_gateways g
CROSS JOIN (VALUES
  ('card', 'الدفع بالبطاقة', 0),
  ('wallet', 'المحافظ الإلكترونية', 1),
  ('bank_installments', 'أقساط بنكية', 2)
) AS m(method_key, display_name, order_index)
WHERE g.gateway_key = 'kashier'
ON CONFLICT (gateway_id, method_key) DO NOTHING;

-- Migrate PayMob integration_ids from payment_gateway_secrets.config into rows
DO $$
DECLARE
  v_gid uuid;
  v_cfg jsonb;
  v_id text;
  v_idx int := 0;
BEGIN
  SELECT g.id INTO v_gid FROM public.payment_gateways g WHERE g.gateway_key = 'paymob';
  IF v_gid IS NULL THEN RETURN; END IF;
  SELECT s.config INTO v_cfg FROM public.payment_gateway_secrets s WHERE s.gateway_id = v_gid;
  IF v_cfg IS NULL OR jsonb_typeof(v_cfg -> 'integration_ids') <> 'array' THEN RETURN; END IF;
  FOR v_id IN SELECT jsonb_array_elements_text(v_cfg -> 'integration_ids')
  LOOP
    v_idx := v_idx + 1;
    IF trim(v_id) = '' THEN CONTINUE; END IF;
    INSERT INTO public.payment_gateway_methods (gateway_id, method_key, display_name, is_enabled, order_index)
    VALUES (v_gid, trim(v_id), 'طريقة الدفع ' || v_idx::text, true, v_idx - 1)
    ON CONFLICT (gateway_id, method_key) DO NOTHING;
  END LOOP;
END $$;
ALTER TABLE public.payment_gateway_methods ADD COLUMN IF NOT EXISTS description text;

-- 1) Restrict manual payment method details to signed-in users
REVOKE SELECT ON public.manual_payment_methods FROM anon;
DROP POLICY IF EXISTS "manual methods readable" ON public.manual_payment_methods;
CREATE POLICY "manual methods readable authenticated" ON public.manual_payment_methods
  FOR SELECT TO authenticated USING (true);

-- 2) Hide answer key while a quiz attempt is still in progress
CREATE OR REPLACE FUNCTION public.get_attempt_details(_attempt_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  a RECORD;
  v_is_admin boolean;
  v_hide_answers boolean;
  attempt_json jsonb;
  qs jsonb;
BEGIN
  PERFORM public.get_or_finalize_attempt(_attempt_id);
  SELECT * INTO a FROM public.quiz_attempts WHERE id = _attempt_id;
  IF a IS NULL THEN RAISE EXCEPTION 'not found'; END IF;
  v_is_admin := public.has_role(v_user, 'admin');
  IF a.user_id <> v_user AND NOT v_is_admin THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  -- Hide correctness for students on in-progress attempts
  v_hide_answers := (a.status = 'in_progress') AND NOT v_is_admin;

  SELECT to_jsonb(a) INTO attempt_json;

  SELECT jsonb_agg(row_to_json(x) ORDER BY x.pos)
  INTO qs
  FROM (
    SELECT
      ans.question_id AS id,
      q.type,
      q.content,
      q.image_url,
      q.points,
      CASE WHEN v_hide_answers THEN NULL ELSE q.model_answer_text END AS model_answer_text,
      ans.option_order,
      ans.selected_option_ids,
      ans.fill_blank_text,
      CASE WHEN v_hide_answers THEN NULL ELSE ans.is_correct END AS is_correct,
      CASE WHEN v_hide_answers THEN 0 ELSE ans.points_earned END AS points_earned,
      ans.time_spent_seconds,
      ans.answered_at,
      (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', o.id,
          'content', o.content,
          'is_correct', CASE WHEN v_hide_answers THEN NULL ELSE o.is_correct END
        ) ORDER BY o.order_index), '[]'::jsonb)
        FROM public.quiz_question_options o WHERE o.question_id = ans.question_id
      ) AS options,
      COALESCE((SELECT pos_idx FROM jsonb_array_elements_text(a.question_order) WITH ORDINALITY t(qid, pos_idx) WHERE qid = ans.question_id::text LIMIT 1), 0) AS pos
    FROM public.quiz_answers ans
    JOIN public.quiz_questions q ON q.id = ans.question_id
    WHERE ans.attempt_id = _attempt_id
  ) x;

  RETURN jsonb_build_object('attempt', attempt_json, 'questions', COALESCE(qs, '[]'::jsonb));
END;
$function$;

-- 1) courses.content_drip_enabled
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS content_drip_enabled boolean NOT NULL DEFAULT false;

-- 2) lessons.unlock_quiz_id (quiz gate)
ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS unlock_quiz_id uuid REFERENCES public.quizzes(id) ON DELETE SET NULL;

-- 3) student_quiz_attempt_grants
CREATE TABLE IF NOT EXISTS public.student_quiz_attempt_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  extra_attempts integer NOT NULL DEFAULT 1 CHECK (extra_attempts > 0),
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sqag_user_quiz ON public.student_quiz_attempt_grants(user_id, quiz_id);

GRANT SELECT ON public.student_quiz_attempt_grants TO authenticated;
GRANT ALL ON public.student_quiz_attempt_grants TO service_role;

ALTER TABLE public.student_quiz_attempt_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "students read own grants"
  ON public.student_quiz_attempt_grants
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins manage grants"
  ON public.student_quiz_attempt_grants
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4) Effective max attempts helper
CREATE OR REPLACE FUNCTION public.student_effective_quiz_max_attempts(_user_id uuid, _quiz_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE((SELECT max_attempts FROM public.quizzes WHERE id = _quiz_id), 0)
       + COALESCE((SELECT SUM(extra_attempts) FROM public.student_quiz_attempt_grants
                    WHERE user_id = _user_id AND quiz_id = _quiz_id), 0);
$$;

-- 5) Admin grant extra attempts
CREATE OR REPLACE FUNCTION public.admin_grant_quiz_attempt(_user_id uuid, _quiz_id uuid, _extra integer DEFAULT 1, _note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_new_total integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _extra IS NULL OR _extra <= 0 THEN
    RAISE EXCEPTION 'invalid extra_attempts';
  END IF;
  INSERT INTO public.student_quiz_attempt_grants(user_id, quiz_id, extra_attempts, granted_by, note)
    VALUES (_user_id, _quiz_id, _extra, auth.uid(), _note);
  v_new_total := public.student_effective_quiz_max_attempts(_user_id, _quiz_id);
  RETURN jsonb_build_object('success', true, 'effective_max_attempts', v_new_total);
END;
$$;

-- 6) Course lock resolver: returns lock state per item
CREATE OR REPLACE FUNCTION public.resolve_course_lock_state(_course_id uuid, _user_id uuid)
RETURNS TABLE(
  item_type text,
  item_id uuid,
  unit_id uuid,
  ord numeric,
  is_completed boolean,
  is_locked boolean,
  reason text,
  gate_quiz_id uuid,
  gate_quiz_title text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_drip boolean;
  r RECORD;
  prev_done boolean := true;
BEGIN
  SELECT content_drip_enabled INTO v_drip FROM public.courses WHERE id = _course_id;
  v_drip := COALESCE(v_drip, false);

  FOR r IN
    WITH items AS (
      SELECT 'lesson'::text AS item_type, l.id AS item_id, l.unit_id, l.position::numeric AS ord,
             (EXISTS(SELECT 1 FROM public.lesson_progress lp WHERE lp.user_id = _user_id AND lp.lesson_id = l.id)) AS is_completed,
             l.unlock_quiz_id AS gate_quiz_id
      FROM public.lessons l
      JOIN public.units u ON u.id = l.unit_id
      WHERE u.course_id = _course_id
      UNION ALL
      SELECT 'quiz'::text, q.id, q.unit_id, q.order_index::numeric,
             (EXISTS(SELECT 1 FROM public.quiz_attempts qa WHERE qa.user_id = _user_id AND qa.quiz_id = q.id)),
             NULL::uuid
      FROM public.quizzes q
      JOIN public.units u ON u.id = q.unit_id
      WHERE u.course_id = _course_id
      UNION ALL
      SELECT 'assignment'::text, a.id, a.unit_id, a.order_index::numeric,
             (EXISTS(SELECT 1 FROM public.assignment_submissions s
                     WHERE s.user_id = _user_id AND s.assignment_id = a.id
                       AND s.outcome IN ('passed','failed'))),
             NULL::uuid
      FROM public.assignments a
      JOIN public.units u ON u.id = a.unit_id
      WHERE u.course_id = _course_id
    )
    SELECT i.*, u.position AS unit_pos
    FROM items i
    JOIN public.units u ON u.id = i.unit_id
    ORDER BY u.position, i.ord, i.item_id
  LOOP
    item_type := r.item_type;
    item_id := r.item_id;
    unit_id := r.unit_id;
    ord := r.ord;
    is_completed := r.is_completed;
    gate_quiz_id := r.gate_quiz_id;
    gate_quiz_title := NULL;
    is_locked := false;
    reason := 'ok';

    -- Quiz gate for lessons (applies regardless of drip)
    IF r.item_type = 'lesson' AND r.gate_quiz_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.quiz_attempts qa
        WHERE qa.user_id = _user_id AND qa.quiz_id = r.gate_quiz_id
          AND qa.status = 'graded' AND qa.passed IS TRUE
      ) THEN
        is_locked := true;
        reason := 'quiz_gate';
        SELECT title INTO gate_quiz_title FROM public.quizzes WHERE id = r.gate_quiz_id;
      END IF;
    END IF;

    -- Sequential drip
    IF NOT is_locked AND v_drip AND NOT prev_done THEN
      is_locked := true;
      reason := 'drip';
    END IF;

    prev_done := r.is_completed;
    RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_course_lock_state(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_effective_quiz_max_attempts(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_quiz_attempt(uuid, uuid, integer, text) TO authenticated;

-- 7) Update start_quiz_attempt to use effective attempts + honor locks
CREATE OR REPLACE FUNCTION public.start_quiz_attempt(_quiz_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_quiz RECORD;
  v_enrolled boolean;
  v_existing uuid;
  v_form int;
  v_attempt_no int;
  v_finished_count int;
  v_effective_max int;
  v_expires timestamptz;
  v_started timestamptz := now();
  v_qorder jsonb;
  v_total numeric;
  v_attempt_id uuid;
  v_locked boolean;
  q RECORD;
  v_opt_order jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_quiz FROM public.quizzes WHERE id = _quiz_id;
  IF v_quiz IS NULL THEN RAISE EXCEPTION 'quiz not found'; END IF;

  IF NOT public.has_role(v_user, 'admin') THEN
    SELECT EXISTS (SELECT 1 FROM public.enrollments WHERE user_id = v_user AND course_id = v_quiz.course_id) INTO v_enrolled;
    IF NOT v_enrolled THEN RAISE EXCEPTION 'not enrolled' USING ERRCODE='42501'; END IF;

    -- Drip lock check
    SELECT is_locked INTO v_locked
      FROM public.resolve_course_lock_state(v_quiz.course_id, v_user)
      WHERE item_type = 'quiz' AND item_id = _quiz_id
      LIMIT 1;
    IF COALESCE(v_locked, false) THEN
      RAISE EXCEPTION 'هذا الاختبار مقفل — أكمل العناصر السابقة أولاً';
    END IF;
  END IF;

  IF v_quiz.start_at IS NOT NULL AND now() < v_quiz.start_at THEN
    RAISE EXCEPTION 'quiz not started yet';
  END IF;
  IF v_quiz.end_at IS NOT NULL AND now() > v_quiz.end_at THEN
    RAISE EXCEPTION 'quiz window closed';
  END IF;

  SELECT id INTO v_existing FROM public.quiz_attempts
    WHERE quiz_id = _quiz_id AND user_id = v_user AND status = 'in_progress'
    ORDER BY started_at DESC LIMIT 1;
  IF v_existing IS NOT NULL THEN
    IF (SELECT expires_at FROM public.quiz_attempts WHERE id = v_existing) < now() THEN
      PERFORM public._finalize_attempt(v_existing);
    ELSE
      RETURN v_existing;
    END IF;
  END IF;

  SELECT count(*) INTO v_finished_count FROM public.quiz_attempts
    WHERE quiz_id = _quiz_id AND user_id = v_user AND status IN ('submitted','needs_review','graded');
  v_effective_max := public.student_effective_quiz_max_attempts(v_user, _quiz_id);
  IF v_finished_count >= v_effective_max THEN
    RAISE EXCEPTION 'max attempts reached';
  END IF;

  v_form := 1 + floor(random() * v_quiz.forms_count)::int;
  SELECT count(*) + 1 INTO v_attempt_no FROM public.quiz_attempts WHERE quiz_id = _quiz_id AND user_id = v_user;

  IF v_quiz.randomize_enabled THEN
    SELECT COALESCE(jsonb_agg(id ORDER BY random()), '[]'::jsonb) INTO v_qorder
      FROM public.quiz_questions WHERE quiz_id = _quiz_id AND form_number = v_form;
  ELSE
    SELECT COALESCE(jsonb_agg(id ORDER BY order_index, id), '[]'::jsonb) INTO v_qorder
      FROM public.quiz_questions WHERE quiz_id = _quiz_id AND form_number = v_form;
  END IF;

  IF jsonb_array_length(v_qorder) = 0 THEN
    RAISE EXCEPTION 'quiz form has no questions';
  END IF;

  SELECT COALESCE(SUM(points), 0) INTO v_total
    FROM public.quiz_questions WHERE quiz_id = _quiz_id AND form_number = v_form;

  v_expires := v_started + (v_quiz.duration_minutes * INTERVAL '1 minute');
  IF v_quiz.end_at IS NOT NULL AND v_expires > v_quiz.end_at THEN
    v_expires := v_quiz.end_at;
  END IF;

  INSERT INTO public.quiz_attempts (quiz_id, user_id, form_number, attempt_number, started_at, expires_at, question_order, total_points)
    VALUES (_quiz_id, v_user, v_form, v_attempt_no, v_started, v_expires, v_qorder, v_total)
    RETURNING id INTO v_attempt_id;

  FOR q IN SELECT * FROM public.quiz_questions WHERE quiz_id = _quiz_id AND form_number = v_form
  LOOP
    IF q.type = 'fill_blank' THEN
      v_opt_order := '[]'::jsonb;
    ELSIF v_quiz.randomize_enabled THEN
      SELECT COALESCE(jsonb_agg(id ORDER BY random()), '[]'::jsonb) INTO v_opt_order
        FROM public.quiz_question_options WHERE question_id = q.id;
    ELSE
      SELECT COALESCE(jsonb_agg(id ORDER BY order_index, id), '[]'::jsonb) INTO v_opt_order
        FROM public.quiz_question_options WHERE question_id = q.id;
    END IF;
    INSERT INTO public.quiz_answers (attempt_id, question_id, option_order)
      VALUES (v_attempt_id, q.id, v_opt_order);
  END LOOP;

  RETURN v_attempt_id;
END;
$$;

-- =========================================================================
-- PHASE 48 — Course Bundles: schema + purchase / finalize RPCs
-- =========================================================================

-- 1. BUNDLES
CREATE TABLE public.bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text UNIQUE,
  description text,
  cover_image_url text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  is_paid boolean NOT NULL DEFAULT true,
  price_piastres integer CHECK (price_piastres IS NULL OR price_piastres >= 0),
  discount_price_piastres integer CHECK (discount_price_piastres IS NULL OR discount_price_piastres >= 0),
  discount_expires_at timestamptz,
  stage_id uuid REFERENCES public.stages(id) ON DELETE SET NULL,
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.bundles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bundles TO authenticated;
GRANT ALL ON public.bundles TO service_role;
ALTER TABLE public.bundles ENABLE ROW LEVEL SECURITY;
CREATE POLICY bundles_select_published ON public.bundles FOR SELECT USING (status='published');
CREATE POLICY bundles_select_admin    ON public.bundles FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY bundles_insert_admin    ON public.bundles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY bundles_update_admin    ON public.bundles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY bundles_delete_admin    ON public.bundles FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER update_bundles_updated_at BEFORE UPDATE ON public.bundles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. BUNDLE COURSES (junction, ordered)
CREATE TABLE public.bundle_courses (
  bundle_id uuid NOT NULL REFERENCES public.bundles(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bundle_id, course_id)
);
GRANT SELECT ON public.bundle_courses TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bundle_courses TO authenticated;
GRANT ALL ON public.bundle_courses TO service_role;
ALTER TABLE public.bundle_courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY bundle_courses_select_all ON public.bundle_courses FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.bundles b WHERE b.id = bundle_id AND (b.status='published' OR public.has_role(auth.uid(),'admin')))
);
CREATE POLICY bundle_courses_write_admin ON public.bundle_courses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE INDEX idx_bundle_courses_bundle ON public.bundle_courses(bundle_id, position);
CREATE INDEX idx_bundle_courses_course ON public.bundle_courses(course_id);

-- 3. BUNDLE PURCHASES (audit trail; enrollments still created individually)
CREATE TABLE public.bundle_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  bundle_id uuid NOT NULL REFERENCES public.bundles(id) ON DELETE RESTRICT,
  payment_transaction_id uuid REFERENCES public.payment_transactions(id) ON DELETE SET NULL,
  amount_piastres integer NOT NULL,
  courses_included integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.bundle_purchases TO authenticated;
GRANT ALL ON public.bundle_purchases TO service_role;
ALTER TABLE public.bundle_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY bundle_purchases_select_own   ON public.bundle_purchases FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_bundle_purchases_user ON public.bundle_purchases(user_id, created_at DESC);
CREATE INDEX idx_bundle_purchases_bundle ON public.bundle_purchases(bundle_id, created_at DESC);

-- 4. Extend payment_transactions for bundle purpose
ALTER TABLE public.payment_transactions DROP CONSTRAINT payment_transactions_purpose_check;
ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_purpose_check
  CHECK (purpose IN ('course_purchase','wallet_topup','bundle_purchase'));
ALTER TABLE public.payment_transactions
  ADD COLUMN bundle_id uuid REFERENCES public.bundles(id) ON DELETE SET NULL;
CREATE INDEX idx_payment_txns_bundle ON public.payment_transactions(bundle_id, created_at DESC);

-- 5. Effective bundle price helper (mirrors course logic)
CREATE OR REPLACE FUNCTION public.effective_bundle_price(_bundle_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path='public' AS $$
  SELECT CASE
    WHEN b.is_paid IS NOT TRUE OR b.price_piastres IS NULL THEN 0
    WHEN b.discount_price_piastres IS NOT NULL
         AND (b.discount_expires_at IS NULL OR now() < b.discount_expires_at)
         THEN b.discount_price_piastres
    ELSE b.price_piastres
  END
  FROM public.bundles b WHERE b.id = _bundle_id;
$$;

-- 6. Internal: fan out enrollments for a bundle to a user
CREATE OR REPLACE FUNCTION public._enroll_user_in_bundle(_user_id uuid, _bundle_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE v_count integer;
BEGIN
  INSERT INTO public.enrollments (user_id, course_id)
  SELECT _user_id, bc.course_id
  FROM public.bundle_courses bc
  WHERE bc.bundle_id = _bundle_id
  ON CONFLICT DO NOTHING;
  SELECT COUNT(*) INTO v_count FROM public.bundle_courses WHERE bundle_id = _bundle_id;
  RETURN v_count;
END; $$;

-- 7. Wallet purchase of a bundle (mirrors purchase_course pattern)
CREATE OR REPLACE FUNCTION public.purchase_bundle(p_bundle_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_bundle RECORD;
  v_price integer;
  v_gw RECORD;
  v_wallet RECORD;
  v_new_balance integer;
  v_wref text;
  v_wtx_id uuid;
  v_pay_ref text;
  v_pay_id uuid;
  v_count integer;
  v_failure text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول أولاً' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_bundle FROM public.bundles WHERE id = p_bundle_id;
  IF v_bundle IS NULL THEN RAISE EXCEPTION 'الحزمة غير موجودة'; END IF;
  IF v_bundle.status <> 'published' THEN RAISE EXCEPTION 'الحزمة غير متاحة للشراء'; END IF;

  v_price := public.effective_bundle_price(p_bundle_id);
  SELECT COUNT(*) INTO v_count FROM public.bundle_courses WHERE bundle_id = p_bundle_id;
  IF v_count = 0 THEN RAISE EXCEPTION 'لا توجد دورات في هذه الحزمة'; END IF;

  IF v_price = 0 THEN
    PERFORM public._enroll_user_in_bundle(v_user, p_bundle_id);
    INSERT INTO public.bundle_purchases (user_id, bundle_id, amount_piastres, courses_included)
      VALUES (v_user, p_bundle_id, 0, v_count);
    RETURN jsonb_build_object('success', true, 'free', true, 'courses_included', v_count);
  END IF;

  SELECT * INTO v_gw FROM public.payment_gateways WHERE gateway_key='wallet';
  IF v_gw IS NULL OR NOT v_gw.is_enabled THEN
    v_failure := 'بوابة الدفع غير متاحة حالياً';
    v_pay_ref := public._gen_payment_reference();
    INSERT INTO public.payment_transactions (reference_number, user_id, bundle_id, gateway_id, amount_piastres, status, purpose, failure_reason)
      VALUES (v_pay_ref, v_user, p_bundle_id, COALESCE(v_gw.id, (SELECT id FROM public.payment_gateways WHERE gateway_key='wallet')), v_price, 'failed', 'bundle_purchase', v_failure);
    RETURN jsonb_build_object('success', false, 'failure_reason', v_failure, 'reference_number', v_pay_ref);
  END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_user FOR UPDATE;
  IF v_wallet IS NULL THEN
    INSERT INTO public.wallets (user_id, balance_piastres) VALUES (v_user, 0) RETURNING * INTO v_wallet;
  END IF;

  IF v_wallet.balance_piastres < v_price THEN
    v_failure := 'رصيد غير كافٍ';
    v_pay_ref := public._gen_payment_reference();
    INSERT INTO public.payment_transactions (reference_number, user_id, bundle_id, gateway_id, amount_piastres, status, purpose, failure_reason)
      VALUES (v_pay_ref, v_user, p_bundle_id, v_gw.id, v_price, 'failed', 'bundle_purchase', v_failure);
    RETURN jsonb_build_object('success', false, 'failure_reason', v_failure, 'reference_number', v_pay_ref,
                              'current_balance_piastres', v_wallet.balance_piastres, 'required_piastres', v_price);
  END IF;

  v_new_balance := v_wallet.balance_piastres - v_price;
  UPDATE public.wallets SET balance_piastres = v_new_balance, updated_at=now() WHERE id = v_wallet.id;

  v_wref := public._gen_txn_reference();
  INSERT INTO public.wallet_transactions
    (reference_number, wallet_id, type, amount_piastres, balance_after_piastres, performed_by, notes)
    VALUES (v_wref, v_wallet.id, 'purchase', v_price, v_new_balance, v_user, 'شراء حزمة: ' || p_bundle_id::text)
    RETURNING id INTO v_wtx_id;

  PERFORM public._enroll_user_in_bundle(v_user, p_bundle_id);

  v_pay_ref := public._gen_payment_reference();
  INSERT INTO public.payment_transactions
    (reference_number, user_id, bundle_id, gateway_id, amount_piastres, status, purpose, wallet_transaction_id)
    VALUES (v_pay_ref, v_user, p_bundle_id, v_gw.id, v_price, 'success', 'bundle_purchase', v_wtx_id)
    RETURNING id INTO v_pay_id;

  INSERT INTO public.bundle_purchases (user_id, bundle_id, payment_transaction_id, amount_piastres, courses_included)
    VALUES (v_user, p_bundle_id, v_pay_id, v_price, v_count);

  RETURN jsonb_build_object('success', true, 'reference_number', v_pay_ref,
    'wallet_reference_number', v_wref, 'new_balance_piastres', v_new_balance,
    'amount_piastres', v_price, 'courses_included', v_count);
END; $$;

-- 8. Manual bundle payment submission (mirrors submit_manual_course_payment)
CREATE OR REPLACE FUNCTION public.submit_manual_bundle_payment(
  p_bundle_id uuid, p_method_id uuid, p_sender_number text, p_proof_image_url text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_bundle RECORD; v_price integer; v_gw RECORD; v_method RECORD;
  v_ref text; v_txn_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول أولاً' USING ERRCODE='42501'; END IF;
  IF p_sender_number IS NULL OR length(trim(p_sender_number)) < 4 THEN RAISE EXCEPTION 'رقم المُحوِّل غير صحيح'; END IF;
  IF p_proof_image_url IS NULL OR length(trim(p_proof_image_url)) = 0 THEN RAISE EXCEPTION 'يجب رفع صورة إثبات التحويل'; END IF;

  SELECT * INTO v_bundle FROM public.bundles WHERE id = p_bundle_id;
  IF v_bundle IS NULL THEN RAISE EXCEPTION 'الحزمة غير موجودة'; END IF;
  IF v_bundle.status <> 'published' THEN RAISE EXCEPTION 'الحزمة غير متاحة'; END IF;

  v_price := public.effective_bundle_price(p_bundle_id);
  IF v_price <= 0 THEN RAISE EXCEPTION 'هذه الحزمة مجانية'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.payment_transactions
    WHERE user_id=v_user AND bundle_id=p_bundle_id AND status='pending_review'
  ) THEN RAISE EXCEPTION 'لديك طلب دفع قيد المراجعة لهذه الحزمة'; END IF;

  SELECT * INTO v_gw FROM public.payment_gateways WHERE gateway_key='manual';
  IF v_gw IS NULL OR NOT v_gw.is_enabled THEN RAISE EXCEPTION 'بوابة الدفع اليدوي غير مفعلة'; END IF;

  SELECT * INTO v_method FROM public.manual_payment_methods WHERE id=p_method_id;
  IF v_method IS NULL OR NOT v_method.is_enabled THEN RAISE EXCEPTION 'طريقة الدفع غير متاحة'; END IF;

  v_ref := public._gen_payment_reference();
  INSERT INTO public.payment_transactions
    (reference_number, user_id, bundle_id, gateway_id, amount_piastres, status, purpose, requires_manual_review)
    VALUES (v_ref, v_user, p_bundle_id, v_gw.id, v_price, 'pending_review', 'bundle_purchase', true)
    RETURNING id INTO v_txn_id;

  INSERT INTO public.manual_payment_proofs
    (payment_transaction_id, manual_payment_method_id, sender_number, proof_image_url)
    VALUES (v_txn_id, p_method_id, trim(p_sender_number), p_proof_image_url);

  RETURN jsonb_build_object('success', true, 'transaction_id', v_txn_id, 'reference_number', v_ref);
END; $$;

-- 9. Update finalize_gateway_transaction to fan-out for bundle purchases
CREATE OR REPLACE FUNCTION public.finalize_gateway_transaction(
  p_reference text, p_success boolean, p_failure_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE
  v_txn RECORD; v_max integer; v_wallet RECORD; v_new_balance integer;
  v_wref text; v_wtx_id uuid; v_count integer;
BEGIN
  SELECT * INTO v_txn FROM public.payment_transactions WHERE reference_number = p_reference FOR UPDATE;
  IF v_txn IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'transaction not found'); END IF;
  IF v_txn.status <> 'pending_gateway' THEN
    RETURN jsonb_build_object('ok', true, 'already_finalized', true, 'status', v_txn.status);
  END IF;

  IF NOT p_success THEN
    UPDATE public.payment_transactions SET status='failed', failure_reason=COALESCE(p_failure_reason,'gateway declined') WHERE id=v_txn.id;
    RETURN jsonb_build_object('ok', true, 'status', 'failed');
  END IF;

  IF v_txn.purpose = 'course_purchase' THEN
    IF v_txn.course_id IS NULL THEN
      UPDATE public.payment_transactions SET status='failed', failure_reason='course missing' WHERE id=v_txn.id;
      RETURN jsonb_build_object('ok', true, 'status', 'failed');
    END IF;
    INSERT INTO public.enrollments (user_id, course_id) VALUES (v_txn.user_id, v_txn.course_id) ON CONFLICT DO NOTHING;
    UPDATE public.payment_transactions SET status='success' WHERE id=v_txn.id;
    RETURN jsonb_build_object('ok', true, 'status', 'success', 'purpose', 'course_purchase');

  ELSIF v_txn.purpose = 'bundle_purchase' THEN
    IF v_txn.bundle_id IS NULL THEN
      UPDATE public.payment_transactions SET status='failed', failure_reason='bundle missing' WHERE id=v_txn.id;
      RETURN jsonb_build_object('ok', true, 'status', 'failed');
    END IF;
    v_count := public._enroll_user_in_bundle(v_txn.user_id, v_txn.bundle_id);
    UPDATE public.payment_transactions SET status='success' WHERE id=v_txn.id;
    INSERT INTO public.bundle_purchases (user_id, bundle_id, payment_transaction_id, amount_piastres, courses_included)
      VALUES (v_txn.user_id, v_txn.bundle_id, v_txn.id, v_txn.amount_piastres, v_count);
    RETURN jsonb_build_object('ok', true, 'status', 'success', 'purpose', 'bundle_purchase', 'courses_included', v_count);

  ELSIF v_txn.purpose = 'wallet_topup' THEN
    SELECT max_wallet_balance_piastres INTO v_max FROM public.wallet_gateway_settings WHERE id=1;
    IF v_max IS NULL THEN v_max := 200000; END IF;
    SELECT * INTO v_wallet FROM public.wallets WHERE user_id=v_txn.user_id FOR UPDATE;
    IF v_wallet IS NULL THEN INSERT INTO public.wallets(user_id, balance_piastres) VALUES (v_txn.user_id, 0) RETURNING * INTO v_wallet; END IF;
    IF v_wallet.balance_piastres + COALESCE(v_txn.topup_amount_piastres,0) > v_max THEN
      UPDATE public.payment_transactions
        SET status='failed',
            failure_reason='تم الدفع بنجاح ولكن الرصيد سيتجاوز الحد الأقصى (' || (v_max/100)::text || ' ج.م). يستوجب مراجعة إدارية.',
            requires_manual_review=true
        WHERE id=v_txn.id;
      RETURN jsonb_build_object('ok', true, 'status', 'failed', 'requires_reconciliation', true);
    END IF;
    v_new_balance := v_wallet.balance_piastres + v_txn.topup_amount_piastres;
    UPDATE public.wallets SET balance_piastres=v_new_balance, updated_at=now() WHERE id=v_wallet.id;
    v_wref := public._gen_txn_reference();
    INSERT INTO public.wallet_transactions
      (reference_number, wallet_id, type, amount_piastres, balance_after_piastres, notes)
      VALUES (v_wref, v_wallet.id, 'gateway_topup', v_txn.topup_amount_piastres, v_new_balance,
              'شحن عبر بوابة دفع - ' || v_txn.reference_number)
      RETURNING id INTO v_wtx_id;
    UPDATE public.payment_transactions SET status='success', wallet_transaction_id=v_wtx_id WHERE id=v_txn.id;
    RETURN jsonb_build_object('ok', true, 'status', 'success', 'purpose', 'wallet_topup', 'new_balance_piastres', v_new_balance);
  END IF;

  RETURN jsonb_build_object('ok', false, 'error', 'unsupported purpose');
END; $$;

-- 10. Admin listing for bundles with course counts + purchase counts
CREATE OR REPLACE FUNCTION public.admin_list_bundles()
RETURNS TABLE(
  id uuid, title text, slug text, status text, is_paid boolean,
  price_piastres integer, discount_price_piastres integer, discount_expires_at timestamptz,
  cover_image_url text, courses_count bigint, purchases_count bigint,
  revenue_piastres bigint, created_at timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT b.id, b.title, b.slug, b.status, b.is_paid, b.price_piastres, b.discount_price_piastres,
    b.discount_expires_at, b.cover_image_url,
    (SELECT COUNT(*) FROM public.bundle_courses bc WHERE bc.bundle_id=b.id) AS courses_count,
    (SELECT COUNT(*) FROM public.bundle_purchases bp WHERE bp.bundle_id=b.id) AS purchases_count,
    COALESCE((SELECT SUM(bp.amount_piastres) FROM public.bundle_purchases bp WHERE bp.bundle_id=b.id),0)::bigint AS revenue_piastres,
    b.created_at
  FROM public.bundles b
  ORDER BY b.created_at DESC;
END; $$;

-- Phase 47 (attempt 3): drop dependent policies on both courses and units
DROP POLICY IF EXISTS courses_select_published ON public.courses;
DROP POLICY IF EXISTS courses_admin_all ON public.courses;
DROP POLICY IF EXISTS units_select_public ON public.units;

-- Convert enum -> text
ALTER TABLE public.courses ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.courses ALTER COLUMN status TYPE text USING status::text;
ALTER TABLE public.courses ALTER COLUMN status SET DEFAULT 'draft';
DROP TYPE IF EXISTS public.course_status;
ALTER TABLE public.courses
  ADD CONSTRAINT courses_status_check
  CHECK (status IN ('draft','coming_soon','published'));

-- Recreate policies (published + coming_soon are public)
CREATE POLICY courses_select_published ON public.courses
  FOR SELECT USING (status IN ('published','coming_soon'));

CREATE POLICY courses_admin_all ON public.courses
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY units_select_public ON public.units
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.id = units.course_id
        AND c.status IN ('published','coming_soon')
    )
  );

-- Scheduling columns
ALTER TABLE public.courses
  ADD COLUMN scheduled_publish_at timestamptz NULL,
  ADD COLUMN scheduled_publish_job_id text NULL;

CREATE INDEX idx_courses_scheduled_publish
  ON public.courses(scheduled_publish_at)
  WHERE scheduled_publish_at IS NOT NULL AND status = 'coming_soon';

-- Enrollment RLS guard
DROP POLICY IF EXISTS enrollments_insert_own ON public.enrollments;
CREATE POLICY enrollments_insert_own ON public.enrollments
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      public.has_role(auth.uid(),'admin')
      OR EXISTS (
        SELECT 1 FROM public.courses c
        WHERE c.id = enrollments.course_id AND c.status = 'published'
      )
    )
  );

-- Enrollment trigger
CREATE OR REPLACE FUNCTION public._enforce_enrollment_course_published()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM public.courses WHERE id = NEW.course_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'الدورة غير موجودة'; END IF;
  IF v_status <> 'published' THEN
    RAISE EXCEPTION 'لا يمكن التسجيل في هذا الكورس حاليًا — سيتاح قريبًا'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_enforce_enrollment_course_published ON public.enrollments;
CREATE TRIGGER trg_enforce_enrollment_course_published
  BEFORE INSERT ON public.enrollments
  FOR EACH ROW EXECUTE FUNCTION public._enforce_enrollment_course_published();

-- purchase_course RPC
CREATE OR REPLACE FUNCTION public.purchase_course(p_course_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_course RECORD;
  v_price integer;
  v_gw RECORD;
  v_wallet RECORD;
  v_new_balance integer;
  v_wallet_ref text;
  v_wallet_txn_id uuid;
  v_pay_ref text;
  v_pay_id uuid;
  v_failure text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول أولاً' USING ERRCODE='42501'; END IF;

  SELECT id, is_paid, price_piastres, discount_price_piastres, discount_expires_at, status
    INTO v_course FROM public.courses WHERE id = p_course_id;
  IF v_course IS NULL THEN RAISE EXCEPTION 'الدورة غير موجودة'; END IF;
  IF v_course.status <> 'published' THEN
    RAISE EXCEPTION 'لا يمكن التسجيل في هذا الكورس حاليًا — سيتاح قريبًا';
  END IF;

  IF v_course.is_paid IS NOT TRUE OR v_course.price_piastres IS NULL THEN
    v_price := 0;
  ELSIF v_course.discount_price_piastres IS NOT NULL
        AND (v_course.discount_expires_at IS NULL OR now() < v_course.discount_expires_at) THEN
    v_price := v_course.discount_price_piastres;
  ELSE
    v_price := v_course.price_piastres;
  END IF;

  IF EXISTS (SELECT 1 FROM public.enrollments WHERE user_id = v_user AND course_id = p_course_id) THEN
    RETURN jsonb_build_object('success', false, 'already_enrolled', true,
                              'failure_reason','أنت مسجّل بالفعل في هذه الدورة');
  END IF;

  IF v_price = 0 THEN
    INSERT INTO public.enrollments (user_id, course_id) VALUES (v_user, p_course_id)
      ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('success', true, 'free', true);
  END IF;

  SELECT * INTO v_gw FROM public.payment_gateways WHERE gateway_key='wallet';
  IF v_gw IS NULL OR NOT v_gw.is_enabled THEN
    v_failure := 'بوابة الدفع غير متاحة حالياً';
    v_pay_ref := public._gen_payment_reference();
    INSERT INTO public.payment_transactions
      (reference_number, user_id, course_id, gateway_id, amount_piastres, status, failure_reason)
      VALUES (v_pay_ref, v_user, p_course_id,
              COALESCE(v_gw.id, (SELECT id FROM public.payment_gateways WHERE gateway_key='wallet')),
              v_price, 'failed', v_failure);
    RETURN jsonb_build_object('success', false, 'failure_reason', v_failure, 'reference_number', v_pay_ref);
  END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_user FOR UPDATE;
  IF v_wallet IS NULL THEN
    INSERT INTO public.wallets (user_id, balance_piastres) VALUES (v_user, 0) RETURNING * INTO v_wallet;
  END IF;

  IF v_wallet.balance_piastres < v_price THEN
    v_failure := 'رصيد غير كافٍ';
    v_pay_ref := public._gen_payment_reference();
    INSERT INTO public.payment_transactions
      (reference_number, user_id, course_id, gateway_id, amount_piastres, status, failure_reason)
      VALUES (v_pay_ref, v_user, p_course_id, v_gw.id, v_price, 'failed', v_failure);
    RETURN jsonb_build_object('success', false, 'failure_reason', v_failure,
                              'reference_number', v_pay_ref,
                              'current_balance_piastres', v_wallet.balance_piastres,
                              'required_piastres', v_price);
  END IF;

  v_new_balance := v_wallet.balance_piastres - v_price;
  UPDATE public.wallets SET balance_piastres = v_new_balance, updated_at = now() WHERE id = v_wallet.id;

  v_wallet_ref := public._gen_txn_reference();
  INSERT INTO public.wallet_transactions
    (reference_number, wallet_id, type, amount_piastres, balance_after_piastres, performed_by, notes)
    VALUES (v_wallet_ref, v_wallet.id, 'purchase', v_price, v_new_balance, v_user,
            'شراء دورة: ' || p_course_id::text)
    RETURNING id INTO v_wallet_txn_id;

  INSERT INTO public.enrollments (user_id, course_id) VALUES (v_user, p_course_id)
    ON CONFLICT DO NOTHING;

  v_pay_ref := public._gen_payment_reference();
  INSERT INTO public.payment_transactions
    (reference_number, user_id, course_id, gateway_id, amount_piastres, status, wallet_transaction_id)
    VALUES (v_pay_ref, v_user, p_course_id, v_gw.id, v_price, 'success', v_wallet_txn_id)
    RETURNING id INTO v_pay_id;

  RETURN jsonb_build_object(
    'success', true,
    'reference_number', v_pay_ref,
    'wallet_reference_number', v_wallet_ref,
    'new_balance_piastres', v_new_balance,
    'amount_piastres', v_price
  );
END; $$;

-- Manual course payment submission — same guard
CREATE OR REPLACE FUNCTION public.submit_manual_course_payment(
  p_course_id uuid, p_method_id uuid, p_sender_number text, p_proof_image_url text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_course RECORD;
  v_price integer;
  v_gw RECORD;
  v_method RECORD;
  v_ref text;
  v_txn_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول أولاً' USING ERRCODE='42501'; END IF;
  IF p_sender_number IS NULL OR length(trim(p_sender_number)) < 4 THEN
    RAISE EXCEPTION 'رقم المُحوِّل غير صحيح';
  END IF;
  IF p_proof_image_url IS NULL OR length(trim(p_proof_image_url)) = 0 THEN
    RAISE EXCEPTION 'يجب رفع صورة إثبات التحويل';
  END IF;

  SELECT id, is_paid, price_piastres, discount_price_piastres, discount_expires_at, status
    INTO v_course FROM public.courses WHERE id = p_course_id;
  IF v_course IS NULL THEN RAISE EXCEPTION 'الدورة غير موجودة'; END IF;
  IF v_course.status <> 'published' THEN
    RAISE EXCEPTION 'لا يمكن التسجيل في هذا الكورس حاليًا — سيتاح قريبًا';
  END IF;

  IF v_course.is_paid IS NOT TRUE OR v_course.price_piastres IS NULL THEN
    v_price := 0;
  ELSIF v_course.discount_price_piastres IS NOT NULL
        AND (v_course.discount_expires_at IS NULL OR now() < v_course.discount_expires_at) THEN
    v_price := v_course.discount_price_piastres;
  ELSE
    v_price := v_course.price_piastres;
  END IF;

  IF v_price <= 0 THEN RAISE EXCEPTION 'هذه الدورة مجانية'; END IF;

  IF EXISTS (SELECT 1 FROM public.enrollments WHERE user_id=v_user AND course_id=p_course_id) THEN
    RAISE EXCEPTION 'أنت مسجّل بالفعل في هذه الدورة';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.payment_transactions
    WHERE user_id=v_user AND course_id=p_course_id AND status='pending_review'
  ) THEN
    RAISE EXCEPTION 'لديك طلب دفع قيد المراجعة لهذه الدورة بالفعل';
  END IF;

  SELECT * INTO v_gw FROM public.payment_gateways WHERE gateway_key='manual';
  IF v_gw IS NULL OR NOT v_gw.is_enabled THEN RAISE EXCEPTION 'بوابة الدفع اليدوي غير مفعلة'; END IF;

  SELECT * INTO v_method FROM public.manual_payment_methods WHERE id=p_method_id;
  IF v_method IS NULL OR NOT v_method.is_enabled THEN RAISE EXCEPTION 'طريقة الدفع غير متاحة'; END IF;

  v_ref := public._gen_payment_reference();
  INSERT INTO public.payment_transactions
    (reference_number, user_id, course_id, gateway_id, amount_piastres, status, purpose, requires_manual_review)
    VALUES (v_ref, v_user, p_course_id, v_gw.id, v_price, 'pending_review', 'course_purchase', true)
    RETURNING id INTO v_txn_id;

  INSERT INTO public.manual_payment_proofs
    (payment_transaction_id, manual_payment_method_id, sender_number, proof_image_url)
    VALUES (v_txn_id, p_method_id, trim(p_sender_number), p_proof_image_url);

  RETURN jsonb_build_object('success', true, 'transaction_id', v_txn_id, 'reference_number', v_ref);
END; $$;

-- Auto-publish worker
CREATE OR REPLACE FUNCTION public.auto_publish_scheduled_courses()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ids uuid[];
BEGIN
  WITH flipped AS (
    UPDATE public.courses
       SET status = 'published',
           scheduled_publish_at = NULL,
           scheduled_publish_job_id = NULL,
           updated_at = now()
     WHERE status = 'coming_soon'
       AND scheduled_publish_at IS NOT NULL
       AND scheduled_publish_at <= now()
    RETURNING id
  )
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_ids FROM flipped;
  RETURN jsonb_build_object('published_count', COALESCE(array_length(v_ids,1),0), 'published_ids', v_ids);
END; $$;

-- pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto_publish_scheduled_courses') THEN
    PERFORM cron.unschedule('auto_publish_scheduled_courses');
  END IF;
END $do$;

SELECT cron.schedule(
  'auto_publish_scheduled_courses',
  '* * * * *',
  $cron$ SELECT public.auto_publish_scheduled_courses(); $cron$
);

-- =========================================================================
-- PHASE 49 — Featured flag on courses & bundles + discount analytics
-- =========================================================================

-- 1. FEATURED FLAG on courses
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS featured_at timestamptz;

-- 2. FEATURED FLAG on bundles
ALTER TABLE public.bundles
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS featured_at timestamptz;

-- 3. Auto-maintain featured_at on transitions
CREATE OR REPLACE FUNCTION public._maintain_featured_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_featured IS TRUE THEN
      NEW.featured_at := COALESCE(NEW.featured_at, now());
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.is_featured IS DISTINCT FROM OLD.is_featured THEN
    IF NEW.is_featured IS TRUE THEN
      NEW.featured_at := now();
    ELSE
      NEW.featured_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_courses_featured_at ON public.courses;
CREATE TRIGGER trg_courses_featured_at
  BEFORE INSERT OR UPDATE OF is_featured ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public._maintain_featured_at();

DROP TRIGGER IF EXISTS trg_bundles_featured_at ON public.bundles;
CREATE TRIGGER trg_bundles_featured_at
  BEFORE INSERT OR UPDATE OF is_featured ON public.bundles
  FOR EACH ROW EXECUTE FUNCTION public._maintain_featured_at();

CREATE INDEX IF NOT EXISTS idx_courses_featured    ON public.courses(is_featured, featured_at DESC) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_bundles_featured    ON public.bundles(is_featured, featured_at DESC) WHERE is_featured = true;

-- 4. DISCOUNT COLUMNS on payment_transactions (course + bundle purchases share this table)
ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS original_price_piastres integer,
  ADD COLUMN IF NOT EXISTS discount_amount_piastres integer NOT NULL DEFAULT 0;

ALTER TABLE public.payment_transactions
  DROP CONSTRAINT IF EXISTS payment_transactions_discount_nonneg_check;
ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_discount_nonneg_check
    CHECK (discount_amount_piastres >= 0);

-- 5. DISCOUNT COLUMNS on bundle_purchases (parallel audit trail)
ALTER TABLE public.bundle_purchases
  ADD COLUMN IF NOT EXISTS original_price_piastres integer,
  ADD COLUMN IF NOT EXISTS discount_amount_piastres integer NOT NULL DEFAULT 0;

ALTER TABLE public.bundle_purchases
  DROP CONSTRAINT IF EXISTS bundle_purchases_discount_nonneg_check;
ALTER TABLE public.bundle_purchases
  ADD CONSTRAINT bundle_purchases_discount_nonneg_check
    CHECK (discount_amount_piastres >= 0);

-- 6. VIEW: discount_savings_summary (single source of truth for the KPI)
--    Successful, discounted purchases only. Refunded/failed drop out.
CREATE OR REPLACE VIEW public.discount_savings_summary AS
  SELECT
    'course'::text AS kind,
    pt.created_at,
    pt.discount_amount_piastres
  FROM public.payment_transactions pt
  WHERE pt.status = 'success'
    AND pt.purpose = 'course_purchase'
    AND COALESCE(pt.discount_amount_piastres, 0) > 0
  UNION ALL
  SELECT
    'bundle'::text AS kind,
    bp.created_at,
    bp.discount_amount_piastres
  FROM public.bundle_purchases bp
  WHERE COALESCE(bp.discount_amount_piastres, 0) > 0;

GRANT SELECT ON public.discount_savings_summary TO authenticated;
GRANT SELECT ON public.discount_savings_summary TO service_role;

-- 7. UPDATE purchase_course to record discount at insert time
CREATE OR REPLACE FUNCTION public.purchase_course(p_course_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_course RECORD;
  v_price integer;
  v_original integer;
  v_discount integer;
  v_gw RECORD;
  v_wallet RECORD;
  v_new_balance integer;
  v_wallet_ref text;
  v_wallet_txn_id uuid;
  v_pay_ref text;
  v_pay_id uuid;
  v_failure text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول أولاً' USING ERRCODE='42501'; END IF;

  SELECT id, is_paid, price_piastres, discount_price_piastres, discount_expires_at, status
    INTO v_course FROM public.courses WHERE id = p_course_id;
  IF v_course IS NULL THEN RAISE EXCEPTION 'الدورة غير موجودة'; END IF;
  IF v_course.status <> 'published' THEN
    RAISE EXCEPTION 'لا يمكن التسجيل في هذا الكورس حاليًا — سيتاح قريبًا';
  END IF;

  IF v_course.is_paid IS NOT TRUE OR v_course.price_piastres IS NULL THEN
    v_price := 0;
    v_original := NULL;
  ELSIF v_course.discount_price_piastres IS NOT NULL
        AND (v_course.discount_expires_at IS NULL OR now() < v_course.discount_expires_at) THEN
    v_price := v_course.discount_price_piastres;
    v_original := v_course.price_piastres;
  ELSE
    v_price := v_course.price_piastres;
    v_original := v_course.price_piastres;
  END IF;
  v_discount := GREATEST(0, COALESCE(v_original, v_price) - v_price);

  IF EXISTS (SELECT 1 FROM public.enrollments WHERE user_id = v_user AND course_id = p_course_id) THEN
    RETURN jsonb_build_object('success', false, 'already_enrolled', true,
                              'failure_reason','أنت مسجّل بالفعل في هذه الدورة');
  END IF;

  IF v_price = 0 THEN
    INSERT INTO public.enrollments (user_id, course_id) VALUES (v_user, p_course_id)
      ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('success', true, 'free', true);
  END IF;

  SELECT * INTO v_gw FROM public.payment_gateways WHERE gateway_key='wallet';
  IF v_gw IS NULL OR NOT v_gw.is_enabled THEN
    v_failure := 'بوابة الدفع غير متاحة حالياً';
    v_pay_ref := public._gen_payment_reference();
    INSERT INTO public.payment_transactions
      (reference_number, user_id, course_id, gateway_id, amount_piastres, status, failure_reason,
       original_price_piastres, discount_amount_piastres)
      VALUES (v_pay_ref, v_user, p_course_id,
              COALESCE(v_gw.id, (SELECT id FROM public.payment_gateways WHERE gateway_key='wallet')),
              v_price, 'failed', v_failure, v_original, v_discount);
    RETURN jsonb_build_object('success', false, 'failure_reason', v_failure, 'reference_number', v_pay_ref);
  END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_user FOR UPDATE;
  IF v_wallet IS NULL THEN
    INSERT INTO public.wallets (user_id, balance_piastres) VALUES (v_user, 0) RETURNING * INTO v_wallet;
  END IF;

  IF v_wallet.balance_piastres < v_price THEN
    v_failure := 'رصيد غير كافٍ';
    v_pay_ref := public._gen_payment_reference();
    INSERT INTO public.payment_transactions
      (reference_number, user_id, course_id, gateway_id, amount_piastres, status, failure_reason,
       original_price_piastres, discount_amount_piastres)
      VALUES (v_pay_ref, v_user, p_course_id, v_gw.id, v_price, 'failed', v_failure, v_original, v_discount);
    RETURN jsonb_build_object('success', false, 'failure_reason', v_failure,
                              'reference_number', v_pay_ref,
                              'current_balance_piastres', v_wallet.balance_piastres,
                              'required_piastres', v_price);
  END IF;

  v_new_balance := v_wallet.balance_piastres - v_price;
  UPDATE public.wallets SET balance_piastres = v_new_balance, updated_at = now() WHERE id = v_wallet.id;

  v_wallet_ref := public._gen_txn_reference();
  INSERT INTO public.wallet_transactions
    (reference_number, wallet_id, type, amount_piastres, balance_after_piastres, performed_by, notes)
    VALUES (v_wallet_ref, v_wallet.id, 'purchase', v_price, v_new_balance, v_user,
            'شراء دورة: ' || p_course_id::text)
    RETURNING id INTO v_wallet_txn_id;

  INSERT INTO public.enrollments (user_id, course_id) VALUES (v_user, p_course_id)
    ON CONFLICT DO NOTHING;

  v_pay_ref := public._gen_payment_reference();
  INSERT INTO public.payment_transactions
    (reference_number, user_id, course_id, gateway_id, amount_piastres, status, wallet_transaction_id,
     original_price_piastres, discount_amount_piastres)
    VALUES (v_pay_ref, v_user, p_course_id, v_gw.id, v_price, 'success', v_wallet_txn_id, v_original, v_discount)
    RETURNING id INTO v_pay_id;

  RETURN jsonb_build_object(
    'success', true,
    'reference_number', v_pay_ref,
    'wallet_reference_number', v_wallet_ref,
    'new_balance_piastres', v_new_balance,
    'amount_piastres', v_price
  );
END; $$;

-- 8. UPDATE purchase_bundle to record discount at insert time (both tables)
CREATE OR REPLACE FUNCTION public.purchase_bundle(p_bundle_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_bundle RECORD;
  v_price integer;
  v_original integer;
  v_discount integer;
  v_gw RECORD;
  v_wallet RECORD;
  v_new_balance integer;
  v_wref text;
  v_wtx_id uuid;
  v_pay_ref text;
  v_pay_id uuid;
  v_count integer;
  v_failure text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول أولاً' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_bundle FROM public.bundles WHERE id = p_bundle_id;
  IF v_bundle IS NULL THEN RAISE EXCEPTION 'الحزمة غير موجودة'; END IF;
  IF v_bundle.status <> 'published' THEN RAISE EXCEPTION 'الحزمة غير متاحة للشراء'; END IF;

  v_price := public.effective_bundle_price(p_bundle_id);
  IF v_bundle.is_paid IS NOT TRUE OR v_bundle.price_piastres IS NULL THEN
    v_original := NULL;
  ELSE
    v_original := v_bundle.price_piastres;
  END IF;
  v_discount := GREATEST(0, COALESCE(v_original, v_price) - v_price);

  SELECT COUNT(*) INTO v_count FROM public.bundle_courses WHERE bundle_id = p_bundle_id;
  IF v_count = 0 THEN RAISE EXCEPTION 'لا توجد دورات في هذه الحزمة'; END IF;

  IF v_price = 0 THEN
    PERFORM public._enroll_user_in_bundle(v_user, p_bundle_id);
    INSERT INTO public.bundle_purchases
      (user_id, bundle_id, amount_piastres, courses_included, original_price_piastres, discount_amount_piastres)
      VALUES (v_user, p_bundle_id, 0, v_count, v_original, v_discount);
    RETURN jsonb_build_object('success', true, 'free', true, 'courses_included', v_count);
  END IF;

  SELECT * INTO v_gw FROM public.payment_gateways WHERE gateway_key='wallet';
  IF v_gw IS NULL OR NOT v_gw.is_enabled THEN
    v_failure := 'بوابة الدفع غير متاحة حالياً';
    v_pay_ref := public._gen_payment_reference();
    INSERT INTO public.payment_transactions
      (reference_number, user_id, bundle_id, gateway_id, amount_piastres, status, purpose, failure_reason,
       original_price_piastres, discount_amount_piastres)
      VALUES (v_pay_ref, v_user, p_bundle_id, COALESCE(v_gw.id,(SELECT id FROM public.payment_gateways WHERE gateway_key='wallet')),
              v_price, 'failed', 'bundle_purchase', v_failure, v_original, v_discount);
    RETURN jsonb_build_object('success', false, 'failure_reason', v_failure, 'reference_number', v_pay_ref);
  END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_user FOR UPDATE;
  IF v_wallet IS NULL THEN
    INSERT INTO public.wallets (user_id, balance_piastres) VALUES (v_user, 0) RETURNING * INTO v_wallet;
  END IF;

  IF v_wallet.balance_piastres < v_price THEN
    v_failure := 'رصيد غير كافٍ';
    v_pay_ref := public._gen_payment_reference();
    INSERT INTO public.payment_transactions
      (reference_number, user_id, bundle_id, gateway_id, amount_piastres, status, purpose, failure_reason,
       original_price_piastres, discount_amount_piastres)
      VALUES (v_pay_ref, v_user, p_bundle_id, v_gw.id, v_price, 'failed', 'bundle_purchase', v_failure, v_original, v_discount);
    RETURN jsonb_build_object('success', false, 'failure_reason', v_failure, 'reference_number', v_pay_ref,
                              'current_balance_piastres', v_wallet.balance_piastres, 'required_piastres', v_price);
  END IF;

  v_new_balance := v_wallet.balance_piastres - v_price;
  UPDATE public.wallets SET balance_piastres = v_new_balance, updated_at=now() WHERE id = v_wallet.id;

  v_wref := public._gen_txn_reference();
  INSERT INTO public.wallet_transactions
    (reference_number, wallet_id, type, amount_piastres, balance_after_piastres, performed_by, notes)
    VALUES (v_wref, v_wallet.id, 'purchase', v_price, v_new_balance, v_user, 'شراء حزمة: ' || p_bundle_id::text)
    RETURNING id INTO v_wtx_id;

  PERFORM public._enroll_user_in_bundle(v_user, p_bundle_id);

  v_pay_ref := public._gen_payment_reference();
  INSERT INTO public.payment_transactions
    (reference_number, user_id, bundle_id, gateway_id, amount_piastres, status, purpose, wallet_transaction_id,
     original_price_piastres, discount_amount_piastres)
    VALUES (v_pay_ref, v_user, p_bundle_id, v_gw.id, v_price, 'success', 'bundle_purchase', v_wtx_id, v_original, v_discount)
    RETURNING id INTO v_pay_id;

  INSERT INTO public.bundle_purchases
    (user_id, bundle_id, payment_transaction_id, amount_piastres, courses_included, original_price_piastres, discount_amount_piastres)
    VALUES (v_user, p_bundle_id, v_pay_id, v_price, v_count, v_original, v_discount);

  RETURN jsonb_build_object(
    'success', true, 'reference_number', v_pay_ref, 'wallet_reference_number', v_wref,
    'new_balance_piastres', v_new_balance, 'amount_piastres', v_price, 'courses_included', v_count
  );
END; $$;

-- 9. UPDATE create_pending_gateway_transaction to record discount at insert time
CREATE OR REPLACE FUNCTION public.create_pending_gateway_transaction(
  p_gateway_key text,
  p_purpose text,
  p_course_id uuid DEFAULT NULL,
  p_topup_amount_piastres integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_gateway RECORD;
  v_course RECORD;
  v_amount integer;
  v_original integer;
  v_discount integer;
  v_ref text;
  v_max integer;
  v_wallet_balance integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required' USING ERRCODE='42501'; END IF;
  IF p_purpose NOT IN ('course_purchase','wallet_topup') THEN RAISE EXCEPTION 'invalid purpose'; END IF;

  SELECT * INTO v_gateway FROM public.payment_gateways WHERE gateway_key = p_gateway_key;
  IF v_gateway IS NULL THEN RAISE EXCEPTION 'gateway not found'; END IF;
  IF NOT v_gateway.is_enabled THEN RAISE EXCEPTION 'gateway disabled'; END IF;
  IF v_gateway.type <> 'automatic' THEN RAISE EXCEPTION 'not an automatic gateway'; END IF;

  v_original := NULL;
  v_discount := 0;

  IF p_purpose = 'course_purchase' THEN
    IF p_course_id IS NULL THEN RAISE EXCEPTION 'course_id required'; END IF;
    SELECT id, is_paid, price_piastres, discount_price_piastres, discount_expires_at
      INTO v_course FROM public.courses WHERE id = p_course_id;
    IF v_course IS NULL THEN RAISE EXCEPTION 'course not found'; END IF;
    IF v_course.is_paid IS NOT TRUE OR v_course.price_piastres IS NULL THEN
      v_amount := 0;
    ELSIF v_course.discount_price_piastres IS NOT NULL
      AND (v_course.discount_expires_at IS NULL OR now() < v_course.discount_expires_at) THEN
      v_amount := v_course.discount_price_piastres;
      v_original := v_course.price_piastres;
    ELSE
      v_amount := v_course.price_piastres;
      v_original := v_course.price_piastres;
    END IF;
    v_discount := GREATEST(0, COALESCE(v_original, v_amount) - v_amount);
    IF v_amount <= 0 THEN RAISE EXCEPTION 'الدورة مجانية — لا حاجة لبوابة دفع'; END IF;
    IF EXISTS (SELECT 1 FROM public.enrollments WHERE user_id=v_user AND course_id=p_course_id) THEN
      RAISE EXCEPTION 'أنت مسجّل بالفعل في هذه الدورة';
    END IF;
  ELSE
    IF p_topup_amount_piastres IS NULL OR p_topup_amount_piastres <= 0 THEN
      RAISE EXCEPTION 'topup amount required';
    END IF;
    SELECT max_wallet_balance_piastres INTO v_max FROM public.wallet_gateway_settings WHERE id=1;
    IF v_max IS NULL THEN v_max := 200000; END IF;
    SELECT balance_piastres INTO v_wallet_balance FROM public.wallets WHERE user_id=v_user;
    IF COALESCE(v_wallet_balance,0) + p_topup_amount_piastres > v_max THEN
      RAISE EXCEPTION 'المبلغ سيتجاوز الحد الأقصى لرصيد المحفظة (% ج.م)', (v_max/100)::text;
    END IF;
    v_amount := p_topup_amount_piastres;
  END IF;

  v_ref := public._gen_payment_reference();
  INSERT INTO public.payment_transactions
    (reference_number, user_id, course_id, gateway_id, amount_piastres, status, purpose, topup_amount_piastres, requires_manual_review,
     original_price_piastres, discount_amount_piastres)
  VALUES
    (v_ref, v_user,
     CASE WHEN p_purpose='course_purchase' THEN p_course_id ELSE NULL END,
     v_gateway.id, v_amount, 'pending_gateway', p_purpose,
     CASE WHEN p_purpose='wallet_topup' THEN p_topup_amount_piastres ELSE NULL END,
     false, v_original, v_discount);

  RETURN jsonb_build_object('reference_number', v_ref, 'amount_piastres', v_amount);
END;
$fn$;
REVOKE ALL ON FUNCTION public.create_pending_gateway_transaction(text,text,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_pending_gateway_transaction(text,text,uuid,integer) TO authenticated;

-- 10. UPDATE submit_manual_course_payment to record discount
CREATE OR REPLACE FUNCTION public.submit_manual_course_payment(
  p_course_id uuid,
  p_method_id uuid,
  p_sender_number text,
  p_proof_image_url text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_course RECORD;
  v_price integer;
  v_original integer;
  v_discount integer;
  v_gw RECORD;
  v_method RECORD;
  v_ref text;
  v_txn_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول أولاً' USING ERRCODE='42501'; END IF;
  IF p_sender_number IS NULL OR length(trim(p_sender_number)) < 4 THEN
    RAISE EXCEPTION 'رقم المُحوِّل غير صحيح';
  END IF;
  IF p_proof_image_url IS NULL OR length(trim(p_proof_image_url)) = 0 THEN
    RAISE EXCEPTION 'يجب رفع صورة إثبات التحويل';
  END IF;

  SELECT id, is_paid, price_piastres, discount_price_piastres, discount_expires_at
    INTO v_course FROM public.courses WHERE id = p_course_id;
  IF v_course IS NULL THEN RAISE EXCEPTION 'الدورة غير موجودة'; END IF;

  IF v_course.is_paid IS NOT TRUE OR v_course.price_piastres IS NULL THEN
    v_price := 0;
    v_original := NULL;
  ELSIF v_course.discount_price_piastres IS NOT NULL
        AND (v_course.discount_expires_at IS NULL OR now() < v_course.discount_expires_at) THEN
    v_price := v_course.discount_price_piastres;
    v_original := v_course.price_piastres;
  ELSE
    v_price := v_course.price_piastres;
    v_original := v_course.price_piastres;
  END IF;
  v_discount := GREATEST(0, COALESCE(v_original, v_price) - v_price);

  IF v_price <= 0 THEN RAISE EXCEPTION 'هذه الدورة مجانية'; END IF;

  IF EXISTS (SELECT 1 FROM public.enrollments WHERE user_id=v_user AND course_id=p_course_id) THEN
    RAISE EXCEPTION 'أنت مسجّل بالفعل في هذه الدورة';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.payment_transactions
    WHERE user_id=v_user AND course_id=p_course_id AND status='pending_review'
  ) THEN
    RAISE EXCEPTION 'لديك طلب دفع قيد المراجعة لهذه الدورة بالفعل';
  END IF;

  SELECT * INTO v_gw FROM public.payment_gateways WHERE gateway_key='manual';
  IF v_gw IS NULL OR NOT v_gw.is_enabled THEN RAISE EXCEPTION 'بوابة الدفع اليدوي غير مفعلة'; END IF;

  SELECT * INTO v_method FROM public.manual_payment_methods WHERE id=p_method_id;
  IF v_method IS NULL OR NOT v_method.is_enabled THEN RAISE EXCEPTION 'طريقة الدفع غير متاحة'; END IF;

  v_ref := public._gen_payment_reference();
  INSERT INTO public.payment_transactions
    (reference_number, user_id, course_id, gateway_id, amount_piastres, status, purpose, requires_manual_review,
     original_price_piastres, discount_amount_piastres)
    VALUES (v_ref, v_user, p_course_id, v_gw.id, v_price, 'pending_review', 'course_purchase', true, v_original, v_discount)
    RETURNING id INTO v_txn_id;

  INSERT INTO public.manual_payment_proofs
    (payment_transaction_id, manual_payment_method_id, sender_number, proof_image_url)
    VALUES (v_txn_id, p_method_id, trim(p_sender_number), p_proof_image_url);

  RETURN jsonb_build_object('success', true, 'transaction_id', v_txn_id, 'reference_number', v_ref);
END; $$;

-- =========================================================
-- PHASE 50: Leaderboard Foundation
-- =========================================================

-- 1) points_config
CREATE TABLE public.points_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  points_value integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
GRANT SELECT ON public.points_config TO anon, authenticated;
GRANT ALL ON public.points_config TO service_role;
ALTER TABLE public.points_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "points_config read all" ON public.points_config FOR SELECT USING (true);
CREATE POLICY "points_config admin write" ON public.points_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_points_config_updated_at BEFORE UPDATE ON public.points_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.points_config (event_key, points_value) VALUES
  ('lesson_completed', 0),
  ('quiz_completed', 0),
  ('quiz_passed', 0),
  ('quiz_failed', 0),
  ('assignment_passed', 0),
  ('assignment_failed', 0),
  ('course_completed', 0)
ON CONFLICT (event_key) DO NOTHING;

-- 2) points_purchase_thresholds
CREATE TABLE public.points_purchase_thresholds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('courses', 'bundles')),
  threshold_count integer NOT NULL CHECK (threshold_count > 0),
  points_value integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE (kind, threshold_count)
);
GRANT SELECT ON public.points_purchase_thresholds TO anon, authenticated;
GRANT ALL ON public.points_purchase_thresholds TO service_role;
ALTER TABLE public.points_purchase_thresholds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ppt read all" ON public.points_purchase_thresholds FOR SELECT USING (true);
CREATE POLICY "ppt admin write" ON public.points_purchase_thresholds FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_ppt_updated_at BEFORE UPDATE ON public.points_purchase_thresholds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) points_ledger (append-only)
CREATE TABLE public.points_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_key text NOT NULL,
  points_delta integer NOT NULL,
  source_kind text,
  source_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.points_ledger TO authenticated;
GRANT ALL ON public.points_ledger TO service_role;
CREATE INDEX idx_points_ledger_student ON public.points_ledger(student_id);
CREATE INDEX idx_points_ledger_student_created ON public.points_ledger(student_id, created_at DESC);
CREATE INDEX idx_points_ledger_source ON public.points_ledger(source_kind, source_id);
CREATE UNIQUE INDEX points_ledger_idempotency
  ON public.points_ledger (student_id, source_kind, source_id, event_key)
  WHERE source_id IS NOT NULL;
ALTER TABLE public.points_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ledger own or admin" ON public.points_ledger FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));
-- no INSERT/UPDATE/DELETE policies: triggers/RPCs use SECURITY DEFINER

-- 4) levels
CREATE TABLE public.levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  icon_url text,
  min_points integer NOT NULL CHECK (min_points >= 0) UNIQUE,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
GRANT SELECT ON public.levels TO anon, authenticated;
GRANT ALL ON public.levels TO service_role;
ALTER TABLE public.levels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "levels read all" ON public.levels FOR SELECT USING (true);
CREATE POLICY "levels admin write" ON public.levels FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_levels_updated_at BEFORE UPDATE ON public.levels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) admin_audit_log (if not exists)
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  target text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit admin read" ON public.admin_audit_log;
CREATE POLICY "audit admin read" ON public.admin_audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- =========================================================
-- Helper: award points into ledger (idempotent)
-- =========================================================
CREATE OR REPLACE FUNCTION public._award_points(
  p_student uuid,
  p_event_key text,
  p_source_kind text,
  p_source_id uuid,
  p_delta_override integer DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role app_role;
  v_delta integer;
BEGIN
  -- only students earn points
  SELECT role INTO v_role FROM public.profiles WHERE id = p_student;
  IF v_role IS DISTINCT FROM 'student'::app_role THEN
    RETURN;
  END IF;

  IF p_delta_override IS NOT NULL THEN
    v_delta := p_delta_override;
  ELSE
    SELECT points_value INTO v_delta FROM public.points_config WHERE event_key = p_event_key;
  END IF;

  IF v_delta IS NULL OR v_delta = 0 THEN
    RETURN; -- do not clutter ledger with zero awards
  END IF;

  INSERT INTO public.points_ledger (student_id, event_key, points_delta, source_kind, source_id)
  VALUES (p_student, p_event_key, v_delta, p_source_kind, p_source_id)
  ON CONFLICT (student_id, source_kind, source_id, event_key) WHERE source_id IS NOT NULL DO NOTHING;
END;
$$;

-- =========================================================
-- Helper: derive stable uuid from text
-- =========================================================
CREATE OR REPLACE FUNCTION public._stable_uuid(p text) RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$
  SELECT (
    substr(md5(p),1,8) || '-' ||
    substr(md5(p),9,4) || '-' ||
    substr(md5(p),13,4) || '-' ||
    substr(md5(p),17,4) || '-' ||
    substr(md5(p),21,12)
  )::uuid;
$$;

-- =========================================================
-- Trigger: lesson_progress -> lesson_completed + maybe course_completed
-- =========================================================
CREATE OR REPLACE FUNCTION public.trg_award_lesson_progress()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total_lessons integer;
  v_done_lessons integer;
  v_course uuid := NEW.course_id;
BEGIN
  -- lesson_completed
  PERFORM public._award_points(NEW.user_id, 'lesson_completed', 'lesson', NEW.id, NULL);

  -- course_completed: all published lessons of this course done by this user
  SELECT COUNT(*) INTO v_total_lessons
  FROM public.lessons l
  JOIN public.units u ON u.id = l.unit_id
  WHERE u.course_id = v_course;

  IF v_total_lessons > 0 THEN
    SELECT COUNT(DISTINCT lp.lesson_id) INTO v_done_lessons
    FROM public.lesson_progress lp
    JOIN public.lessons l ON l.id = lp.lesson_id
    JOIN public.units u ON u.id = l.unit_id
    WHERE u.course_id = v_course AND lp.user_id = NEW.user_id;

    IF v_done_lessons >= v_total_lessons THEN
      PERFORM public._award_points(
        NEW.user_id, 'course_completed', 'course_completion',
        public._stable_uuid('course:' || v_course::text || ':user:' || NEW.user_id::text),
        NULL
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lesson_progress_points ON public.lesson_progress;
CREATE TRIGGER trg_lesson_progress_points
AFTER INSERT ON public.lesson_progress
FOR EACH ROW EXECUTE FUNCTION public.trg_award_lesson_progress();

-- =========================================================
-- Trigger: quiz_attempts
-- =========================================================
CREATE OR REPLACE FUNCTION public.trg_award_quiz_attempt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status NOT IN ('submitted','needs_review','graded') THEN
    RETURN NEW;
  END IF;

  -- Fire only when transitioning into a final state
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN
    -- still allow first pass/fail assignment when passed becomes non-null
    IF OLD.passed IS NOT DISTINCT FROM NEW.passed THEN
      RETURN NEW;
    END IF;
  END IF;

  -- quiz_completed always awarded once
  PERFORM public._award_points(NEW.user_id, 'quiz_completed', 'quiz_attempt', NEW.id, NULL);

  IF NEW.passed IS TRUE THEN
    PERFORM public._award_points(NEW.user_id, 'quiz_passed', 'quiz_attempt', NEW.id, NULL);
  ELSIF NEW.passed IS FALSE THEN
    PERFORM public._award_points(NEW.user_id, 'quiz_failed', 'quiz_attempt', NEW.id, NULL);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quiz_attempts_points ON public.quiz_attempts;
CREATE TRIGGER trg_quiz_attempts_points
AFTER INSERT OR UPDATE ON public.quiz_attempts
FOR EACH ROW EXECUTE FUNCTION public.trg_award_quiz_attempt();

-- =========================================================
-- Trigger: assignment_submissions
-- =========================================================
CREATE OR REPLACE FUNCTION public.trg_award_assignment_submission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.outcome IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.outcome IS NOT DISTINCT FROM NEW.outcome THEN
    RETURN NEW;
  END IF;

  IF NEW.outcome = 'passed' THEN
    PERFORM public._award_points(NEW.user_id, 'assignment_passed', 'assignment_submission', NEW.id, NULL);
  ELSIF NEW.outcome = 'failed' THEN
    PERFORM public._award_points(NEW.user_id, 'assignment_failed', 'assignment_submission', NEW.id, NULL);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assignment_submissions_points ON public.assignment_submissions;
CREATE TRIGGER trg_assignment_submissions_points
AFTER INSERT OR UPDATE ON public.assignment_submissions
FOR EACH ROW EXECUTE FUNCTION public.trg_award_assignment_submission();

-- =========================================================
-- Trigger: payment_transactions -> purchase thresholds
-- =========================================================
CREATE OR REPLACE FUNCTION public.trg_award_purchase_thresholds()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_course_count integer;
  v_bundle_count integer;
  r RECORD;
BEGIN
  IF NEW.status <> 'success' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'success' THEN
    RETURN NEW;
  END IF;

  IF NEW.purpose = 'course_purchase' THEN
    SELECT COUNT(DISTINCT course_id) INTO v_course_count
    FROM public.payment_transactions
    WHERE user_id = NEW.user_id AND purpose = 'course_purchase' AND status = 'success' AND course_id IS NOT NULL;

    FOR r IN
      SELECT id, points_value FROM public.points_purchase_thresholds
      WHERE kind = 'courses' AND threshold_count <= v_course_count
    LOOP
      PERFORM public._award_points(NEW.user_id, 'purchased_courses_threshold', 'purchase_threshold_courses', r.id, r.points_value);
    END LOOP;
  ELSIF NEW.purpose = 'bundle_purchase' THEN
    SELECT COUNT(DISTINCT bundle_id) INTO v_bundle_count
    FROM public.payment_transactions
    WHERE user_id = NEW.user_id AND purpose = 'bundle_purchase' AND status = 'success' AND bundle_id IS NOT NULL;

    FOR r IN
      SELECT id, points_value FROM public.points_purchase_thresholds
      WHERE kind = 'bundles' AND threshold_count <= v_bundle_count
    LOOP
      PERFORM public._award_points(NEW.user_id, 'purchased_bundles_threshold', 'purchase_threshold_bundles', r.id, r.points_value);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_txns_points ON public.payment_transactions;
CREATE TRIGGER trg_payment_txns_points
AFTER INSERT OR UPDATE ON public.payment_transactions
FOR EACH ROW EXECUTE FUNCTION public.trg_award_purchase_thresholds();

-- =========================================================
-- Read helpers
-- =========================================================
CREATE OR REPLACE FUNCTION public.student_points_total(p_student uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(points_delta), 0)::integer
  FROM public.points_ledger WHERE student_id = p_student;
$$;

CREATE OR REPLACE FUNCTION public.student_current_level(p_student uuid)
RETURNS SETOF public.levels LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.levels
  WHERE min_points <= public.student_points_total(p_student)
  ORDER BY min_points DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.student_next_level(p_student uuid)
RETURNS SETOF public.levels LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.levels
  WHERE min_points > public.student_points_total(p_student)
  ORDER BY min_points ASC LIMIT 1;
$$;

-- Leaderboard eligible students view
CREATE OR REPLACE VIEW public.leaderboard_eligible_students AS
SELECT p.id, p.full_name, p.avatar_url, p.student_id,
       COALESCE(SUM(pl.points_delta), 0)::integer AS total_points,
       MIN(pl.created_at) AS first_earn_at
FROM public.profiles p
LEFT JOIN public.points_ledger pl ON pl.student_id = p.id
WHERE p.role = 'student'::app_role AND p.is_banned = false
GROUP BY p.id, p.full_name, p.avatar_url, p.student_id;

GRANT SELECT ON public.leaderboard_eligible_students TO authenticated;

-- =========================================================
-- Admin RPCs
-- =========================================================
CREATE OR REPLACE FUNCTION public.save_points_config(p_updates jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  FOR r IN SELECT * FROM jsonb_to_recordset(p_updates) AS x(event_key text, points_value integer)
  LOOP
    UPDATE public.points_config
    SET points_value = r.points_value, updated_by = auth.uid(), updated_at = now()
    WHERE event_key = r.event_key;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_purchase_thresholds(p_kind text, p_rows jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
  v_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_kind NOT IN ('courses','bundles') THEN
    RAISE EXCEPTION 'bad kind';
  END IF;

  FOR r IN SELECT * FROM jsonb_to_recordset(p_rows)
    AS x(id uuid, threshold_count integer, points_value integer)
  LOOP
    IF r.id IS NULL THEN
      INSERT INTO public.points_purchase_thresholds (kind, threshold_count, points_value, updated_by)
      VALUES (p_kind, r.threshold_count, r.points_value, auth.uid())
      ON CONFLICT (kind, threshold_count) DO UPDATE SET points_value = EXCLUDED.points_value, updated_by = auth.uid(), updated_at = now()
      RETURNING id INTO r.id;
    ELSE
      UPDATE public.points_purchase_thresholds
      SET threshold_count = r.threshold_count, points_value = r.points_value, updated_by = auth.uid(), updated_at = now()
      WHERE id = r.id AND kind = p_kind;
    END IF;
    v_ids := v_ids || r.id;
  END LOOP;

  DELETE FROM public.points_purchase_thresholds
  WHERE kind = p_kind AND NOT (id = ANY(v_ids));
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_leaderboard()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rows integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  WITH d AS (DELETE FROM public.points_ledger RETURNING 1)
  SELECT COUNT(*) INTO v_rows FROM d;
  INSERT INTO public.admin_audit_log (actor_id, action, target, detail)
  VALUES (auth.uid(), 'leaderboard_full_reset', 'platform', jsonb_build_object('rows_deleted', v_rows));
  RETURN v_rows;
END;
$$;

CREATE OR REPLACE FUNCTION public.award_admin_adjustment(p_student uuid, p_delta integer, p_notes text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  INSERT INTO public.points_ledger (student_id, event_key, points_delta, source_kind, source_id, notes)
  VALUES (p_student, 'admin_adjustment', p_delta, 'admin_adjustment', NULL, p_notes)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Leaderboard listing RPC (paginated)
CREATE OR REPLACE FUNCTION public.leaderboard_top(p_limit integer, p_offset integer)
RETURNS TABLE(
  student_id uuid,
  full_name text,
  avatar_url text,
  total_points integer,
  first_earn_at timestamptz,
  rank bigint
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH base AS (
    SELECT id AS student_id, full_name, avatar_url,
           GREATEST(total_points, 0) AS total_points,
           first_earn_at
    FROM public.leaderboard_eligible_students
  ),
  ranked AS (
    SELECT *, ROW_NUMBER() OVER (ORDER BY total_points DESC, first_earn_at ASC NULLS LAST, full_name ASC) AS rank
    FROM base
  )
  SELECT student_id, full_name, avatar_url, total_points, first_earn_at, rank
  FROM ranked
  ORDER BY rank
  LIMIT COALESCE(p_limit, 20) OFFSET COALESCE(p_offset, 0);
$$;

CREATE OR REPLACE FUNCTION public.leaderboard_eligible_count()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(*)::integer FROM public.leaderboard_eligible_students;
$$;

GRANT EXECUTE ON FUNCTION public.student_points_total(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_current_level(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_next_level(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_points_config(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_purchase_thresholds(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_leaderboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.award_admin_adjustment(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leaderboard_top(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leaderboard_eligible_count() TO authenticated;

ALTER VIEW public.leaderboard_eligible_students SET (security_invoker = on);

REVOKE EXECUTE ON FUNCTION public.student_points_total(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.student_current_level(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.student_next_level(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.save_points_config(jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.save_purchase_thresholds(text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reset_leaderboard() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.award_admin_adjustment(uuid, integer, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.leaderboard_top(integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.leaderboard_eligible_count() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public._award_points(uuid, text, text, uuid, integer) FROM PUBLIC, anon;

-- =============== 1. profiles.leaderboard_visible ===============
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS leaderboard_visible boolean NOT NULL DEFAULT true;

-- =============== 2. badges ===============
CREATE TABLE IF NOT EXISTS public.badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  icon_url text NOT NULL,
  points_reward integer CHECK (points_reward IS NULL OR points_reward >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
GRANT SELECT ON public.badges TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.badges TO authenticated;
GRANT ALL ON public.badges TO service_role;
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "badges read all" ON public.badges;
CREATE POLICY "badges read all" ON public.badges FOR SELECT USING (true);
DROP POLICY IF EXISTS "badges admin write" ON public.badges;
CREATE POLICY "badges admin write" ON public.badges
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_badges_updated_at BEFORE UPDATE ON public.badges
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============== 3. badge_conditions ===============
CREATE TABLE IF NOT EXISTS public.badge_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  badge_id uuid NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
  condition_type text NOT NULL CHECK (condition_type IN (
    'points_at_least',
    'level_at_least',
    'has_badge',
    'quizzes_completed_at_least',
    'lessons_completed_at_least',
    'assignments_completed_at_least',
    'quizzes_passed_at_least',
    'assignments_passed_at_least',
    'assignments_failed_at_least',
    'quizzes_failed_at_least'
  )),
  target_int integer,
  target_uuid uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT badge_conditions_target_shape CHECK (
    CASE condition_type
      WHEN 'level_at_least' THEN target_uuid IS NOT NULL AND target_int IS NULL
      WHEN 'has_badge'      THEN target_uuid IS NOT NULL AND target_int IS NULL
      ELSE target_int IS NOT NULL AND target_uuid IS NULL AND target_int >= 0
    END
  )
);
GRANT SELECT ON public.badge_conditions TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.badge_conditions TO authenticated;
GRANT ALL ON public.badge_conditions TO service_role;
ALTER TABLE public.badge_conditions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "badge_conditions read all" ON public.badge_conditions;
CREATE POLICY "badge_conditions read all" ON public.badge_conditions FOR SELECT USING (true);
DROP POLICY IF EXISTS "badge_conditions admin write" ON public.badge_conditions;
CREATE POLICY "badge_conditions admin write" ON public.badge_conditions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Prevent a has_badge condition from referencing its own badge
CREATE OR REPLACE FUNCTION public.badge_conditions_no_self_ref()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.condition_type = 'has_badge' AND NEW.target_uuid = NEW.badge_id THEN
    RAISE EXCEPTION 'A badge cannot require itself as a prerequisite';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_badge_conditions_no_self_ref ON public.badge_conditions;
CREATE TRIGGER trg_badge_conditions_no_self_ref
  BEFORE INSERT OR UPDATE ON public.badge_conditions
  FOR EACH ROW EXECUTE FUNCTION public.badge_conditions_no_self_ref();

CREATE INDEX IF NOT EXISTS idx_badge_conditions_badge ON public.badge_conditions(badge_id);

-- =============== 4. student_badges ===============
CREATE TABLE IF NOT EXISTS public.student_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  badge_id uuid NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, badge_id)
);
GRANT SELECT ON public.student_badges TO anon, authenticated;
GRANT DELETE ON public.student_badges TO authenticated;
GRANT ALL ON public.student_badges TO service_role;
ALTER TABLE public.student_badges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "student_badges read all" ON public.student_badges;
CREATE POLICY "student_badges read all" ON public.student_badges FOR SELECT USING (true);
DROP POLICY IF EXISTS "student_badges admin delete" ON public.student_badges;
CREATE POLICY "student_badges admin delete" ON public.student_badges
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_student_badges_student ON public.student_badges(student_id);
CREATE INDEX IF NOT EXISTS idx_student_badges_badge ON public.student_badges(badge_id);

-- =============== 5. student_condition_progress ===============
CREATE OR REPLACE FUNCTION public.student_condition_progress(
  p_student uuid,
  p_condition_type text,
  p_target_int integer,
  p_target_uuid uuid
) RETURNS TABLE(current_value integer, target_value integer, satisfied boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_current integer := 0;
  v_target integer := COALESCE(p_target_int, 0);
BEGIN
  IF p_condition_type = 'points_at_least' THEN
    v_current := public.student_points_total(p_student);
    v_target := COALESCE(p_target_int, 0);

  ELSIF p_condition_type = 'level_at_least' THEN
    v_current := public.student_points_total(p_student);
    SELECT COALESCE(min_points, 0) INTO v_target FROM public.levels WHERE id = p_target_uuid;
    v_target := COALESCE(v_target, 0);

  ELSIF p_condition_type = 'has_badge' THEN
    v_current := CASE WHEN EXISTS(
      SELECT 1 FROM public.student_badges WHERE student_id = p_student AND badge_id = p_target_uuid
    ) THEN 1 ELSE 0 END;
    v_target := 1;

  ELSIF p_condition_type = 'quizzes_completed_at_least' THEN
    SELECT COUNT(DISTINCT source_id)::int INTO v_current FROM public.points_ledger
    WHERE student_id = p_student AND source_kind = 'quiz_attempt' AND event_key = 'quiz_completed';

  ELSIF p_condition_type = 'lessons_completed_at_least' THEN
    SELECT COUNT(DISTINCT source_id)::int INTO v_current FROM public.points_ledger
    WHERE student_id = p_student AND source_kind = 'lesson_progress' AND event_key = 'lesson_completed';

  ELSIF p_condition_type = 'assignments_completed_at_least' THEN
    SELECT COUNT(*)::int INTO v_current FROM public.assignment_submissions
    WHERE user_id = p_student AND status = 'submitted';

  ELSIF p_condition_type = 'quizzes_passed_at_least' THEN
    SELECT COUNT(DISTINCT source_id)::int INTO v_current FROM public.points_ledger
    WHERE student_id = p_student AND source_kind = 'quiz_attempt' AND event_key = 'quiz_passed';

  ELSIF p_condition_type = 'quizzes_failed_at_least' THEN
    SELECT COUNT(DISTINCT source_id)::int INTO v_current FROM public.points_ledger
    WHERE student_id = p_student AND source_kind = 'quiz_attempt' AND event_key = 'quiz_failed';

  ELSIF p_condition_type = 'assignments_passed_at_least' THEN
    SELECT COUNT(DISTINCT source_id)::int INTO v_current FROM public.points_ledger
    WHERE student_id = p_student AND source_kind = 'assignment_submission' AND event_key = 'assignment_passed';

  ELSIF p_condition_type = 'assignments_failed_at_least' THEN
    SELECT COUNT(DISTINCT source_id)::int INTO v_current FROM public.points_ledger
    WHERE student_id = p_student AND source_kind = 'assignment_submission' AND event_key = 'assignment_failed';
  END IF;

  RETURN QUERY SELECT COALESCE(v_current, 0), COALESCE(v_target, 0), COALESCE(v_current, 0) >= COALESCE(v_target, 0);
END;
$$;
GRANT EXECUTE ON FUNCTION public.student_condition_progress(uuid, text, integer, uuid) TO anon, authenticated;

-- =============== 6. evaluate_badges_for_student ===============
CREATE OR REPLACE FUNCTION public.evaluate_badges_for_student(p_student uuid)
RETURNS SETOF uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role app_role;
  v_badge record;
  v_cond record;
  v_all_ok boolean;
  v_prog record;
  v_inserted boolean;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = p_student;
  IF v_role IS DISTINCT FROM 'student' THEN
    RETURN;
  END IF;

  FOR v_badge IN
    SELECT b.id, b.points_reward
    FROM public.badges b
    WHERE b.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM public.student_badges sb
        WHERE sb.student_id = p_student AND sb.badge_id = b.id
      )
  LOOP
    v_all_ok := true;

    -- must have at least one condition
    IF NOT EXISTS (SELECT 1 FROM public.badge_conditions WHERE badge_id = v_badge.id) THEN
      v_all_ok := false;
    END IF;

    FOR v_cond IN
      SELECT condition_type, target_int, target_uuid
      FROM public.badge_conditions WHERE badge_id = v_badge.id
    LOOP
      SELECT * INTO v_prog FROM public.student_condition_progress(
        p_student, v_cond.condition_type, v_cond.target_int, v_cond.target_uuid
      );
      IF NOT v_prog.satisfied THEN
        v_all_ok := false;
        EXIT;
      END IF;
    END LOOP;

    IF v_all_ok THEN
      v_inserted := false;
      WITH ins AS (
        INSERT INTO public.student_badges (student_id, badge_id)
        VALUES (p_student, v_badge.id)
        ON CONFLICT (student_id, badge_id) DO NOTHING
        RETURNING id
      ) SELECT EXISTS(SELECT 1 FROM ins) INTO v_inserted;

      IF v_inserted THEN
        IF v_badge.points_reward IS NOT NULL AND v_badge.points_reward > 0 THEN
          INSERT INTO public.points_ledger (student_id, event_key, points_delta, source_kind, source_id, notes)
          VALUES (p_student, 'badge_award', v_badge.points_reward, 'badge_award', v_badge.id, 'Badge reward')
          ON CONFLICT DO NOTHING;
        END IF;
        RETURN NEXT v_badge.id;
      END IF;
    END IF;
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION public.evaluate_badges_for_student(uuid) TO authenticated, service_role;

-- =============== 7. Trigger on points_ledger ===============
CREATE OR REPLACE FUNCTION public.trg_evaluate_badges_on_ledger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Skip badge_award rows to avoid recursion when a badge reward inserts a ledger row
  IF NEW.event_key <> 'badge_award' THEN
    PERFORM public.evaluate_badges_for_student(NEW.student_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ledger_evaluate_badges ON public.points_ledger;
CREATE TRIGGER trg_ledger_evaluate_badges
  AFTER INSERT ON public.points_ledger
  FOR EACH ROW EXECUTE FUNCTION public.trg_evaluate_badges_on_ledger();

-- =============== 8. Evaluate a new badge across all eligible students ===============
CREATE OR REPLACE FUNCTION public.evaluate_badge_for_all_students(p_badge_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_student uuid;
  v_count integer := 0;
  v_result uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  FOR v_student IN
    SELECT id FROM public.profiles WHERE role = 'student' AND is_banned = false
  LOOP
    FOR v_result IN SELECT * FROM public.evaluate_badges_for_student(v_student)
    LOOP
      IF v_result = p_badge_id THEN v_count := v_count + 1; END IF;
    END LOOP;
  END LOOP;
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.evaluate_badge_for_all_students(uuid) TO authenticated;

-- =============== 9. Public leaderboard (opt-in, top 10 with level+badges) ===============
CREATE OR REPLACE FUNCTION public.leaderboard_public_top10()
RETURNS TABLE(
  student_id uuid,
  full_name text,
  avatar_url text,
  total_points integer,
  rank bigint,
  level_id uuid,
  level_name text,
  level_icon_url text,
  badge_count integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH base AS (
    SELECT p.id AS student_id, p.full_name, p.avatar_url,
           GREATEST(COALESCE((SELECT SUM(points_delta) FROM public.points_ledger WHERE student_id = p.id), 0), 0)::int AS total_points,
           (SELECT MIN(created_at) FROM public.points_ledger WHERE student_id = p.id) AS first_earn_at
    FROM public.profiles p
    WHERE p.role = 'student'
      AND p.is_banned = false
      AND p.leaderboard_visible = true
  ),
  ranked AS (
    SELECT *, ROW_NUMBER() OVER (ORDER BY total_points DESC, first_earn_at ASC NULLS LAST, full_name ASC) AS rank
    FROM base
    WHERE total_points > 0
  )
  SELECT r.student_id, r.full_name, r.avatar_url, r.total_points, r.rank,
         lv.id, lv.name, lv.icon_url,
         COALESCE((SELECT COUNT(*)::int FROM public.student_badges WHERE student_id = r.student_id), 0)
  FROM ranked r
  LEFT JOIN LATERAL (
    SELECT * FROM public.levels WHERE min_points <= r.total_points ORDER BY min_points DESC LIMIT 1
  ) lv ON true
  ORDER BY r.rank
  LIMIT 10;
$$;
GRANT EXECUTE ON FUNCTION public.leaderboard_public_top10() TO anon, authenticated;

-- =============== 10. leaderboard_rank_for_student ===============
CREATE OR REPLACE FUNCTION public.leaderboard_rank_for_student(p_student uuid)
RETURNS TABLE(rank bigint, total_students bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH base AS (
    SELECT id AS student_id,
           GREATEST(COALESCE((SELECT SUM(points_delta) FROM public.points_ledger WHERE student_id = p.id), 0), 0)::int AS total_points,
           (SELECT MIN(created_at) FROM public.points_ledger WHERE student_id = p.id) AS first_earn_at,
           full_name
    FROM public.profiles p
    WHERE p.role = 'student' AND p.is_banned = false
  ),
  ranked AS (
    SELECT student_id, ROW_NUMBER() OVER (ORDER BY total_points DESC, first_earn_at ASC NULLS LAST, full_name ASC) AS rk
    FROM base
  )
  SELECT (SELECT rk FROM ranked WHERE student_id = p_student),
         (SELECT COUNT(*) FROM base);
$$;
GRANT EXECUTE ON FUNCTION public.leaderboard_rank_for_student(uuid) TO authenticated;

-- =============== 11. student_earned_badges ===============
CREATE OR REPLACE FUNCTION public.student_earned_badges(p_student uuid)
RETURNS TABLE(badge_id uuid, name text, description text, icon_url text, awarded_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT b.id, b.name, b.description, b.icon_url, sb.awarded_at
  FROM public.student_badges sb
  JOIN public.badges b ON b.id = sb.badge_id
  WHERE sb.student_id = p_student
  ORDER BY sb.awarded_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.student_earned_badges(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public._award_points(p_student uuid, p_event_key text, p_source_kind text, p_source_id uuid, p_delta_override integer DEFAULT NULL::integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role app_role;
  v_delta integer;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = p_student;
  IF v_role IS DISTINCT FROM 'student'::app_role THEN
    RETURN;
  END IF;

  IF p_delta_override IS NOT NULL THEN
    v_delta := p_delta_override;
  ELSE
    SELECT points_value INTO v_delta FROM public.points_config WHERE event_key = p_event_key;
  END IF;

  IF v_delta IS NULL THEN v_delta := 0; END IF;

  -- Always insert so the ledger is a complete event history (Phase 51: needed by badge conditions)
  INSERT INTO public.points_ledger (student_id, event_key, points_delta, source_kind, source_id)
  VALUES (p_student, p_event_key, v_delta, p_source_kind, p_source_id)
  ON CONFLICT (student_id, source_kind, source_id, event_key) WHERE source_id IS NOT NULL DO NOTHING;
END;
$function$;

CREATE OR REPLACE FUNCTION public.leaderboard_top_full(p_limit integer, p_offset integer)
RETURNS TABLE(
  student_id uuid,
  full_name text,
  avatar_url text,
  total_points integer,
  rank bigint,
  level_id uuid,
  level_name text,
  level_icon_url text,
  badge_count integer,
  leaderboard_visible boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH base AS (
    SELECT p.id AS student_id, p.full_name, p.avatar_url, p.leaderboard_visible,
           GREATEST(COALESCE((SELECT SUM(points_delta) FROM public.points_ledger WHERE student_id = p.id), 0), 0)::int AS total_points,
           (SELECT MIN(created_at) FROM public.points_ledger WHERE student_id = p.id) AS first_earn_at
    FROM public.profiles p
    WHERE p.role = 'student' AND p.is_banned = false
  ),
  ranked AS (
    SELECT *, ROW_NUMBER() OVER (ORDER BY total_points DESC, first_earn_at ASC NULLS LAST, full_name ASC) AS rank
    FROM base
  )
  SELECT r.student_id, r.full_name, r.avatar_url, r.total_points, r.rank,
         lv.id, lv.name, lv.icon_url,
         COALESCE((SELECT COUNT(*)::int FROM public.student_badges WHERE student_id = r.student_id), 0),
         r.leaderboard_visible
  FROM ranked r
  LEFT JOIN LATERAL (
    SELECT * FROM public.levels WHERE min_points <= r.total_points ORDER BY min_points DESC LIMIT 1
  ) lv ON true
  ORDER BY r.rank
  LIMIT COALESCE(p_limit, 20) OFFSET COALESCE(p_offset, 0);
$$;
GRANT EXECUTE ON FUNCTION public.leaderboard_top_full(integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.prevent_assignment_self_grade()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF NEW.grade IS DISTINCT FROM OLD.grade
     OR NEW.outcome IS DISTINCT FROM OLD.outcome
     OR NEW.feedback IS DISTINCT FROM OLD.feedback
     OR NEW.feedback_given_at IS DISTINCT FROM OLD.feedback_given_at
     OR NEW.graded_at IS DISTINCT FROM OLD.graded_at
     OR NEW.graded_by IS DISTINCT FROM OLD.graded_by
  THEN
    RAISE EXCEPTION 'Not allowed to modify grading fields';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_assignment_self_grade ON public.assignment_submissions;
CREATE TRIGGER trg_prevent_assignment_self_grade
BEFORE UPDATE ON public.assignment_submissions
FOR EACH ROW EXECUTE FUNCTION public.prevent_assignment_self_grade();

DROP POLICY IF EXISTS lesson_progress_own ON public.lesson_progress;

CREATE POLICY lesson_progress_own_select ON public.lesson_progress
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY lesson_progress_own_insert ON public.lesson_progress
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND public.is_enrolled_in_lesson_course(auth.uid(), lesson_id)
);

CREATE POLICY lesson_progress_own_update ON public.lesson_progress
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND public.is_enrolled_in_lesson_course(auth.uid(), lesson_id)
);

CREATE POLICY lesson_progress_own_delete ON public.lesson_progress
FOR DELETE TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Students insert own attempts" ON public.quiz_attempts;

CREATE POLICY "Students insert own attempts" ON public.quiz_attempts
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND status = 'in_progress'
  AND passed IS NULL
  AND COALESCE(earned_points, 0) = 0
  AND COALESCE(percentage, 0) = 0
  AND submitted_at IS NULL
);

DROP POLICY IF EXISTS "Students view own answers" ON public.quiz_answers;

CREATE POLICY "Students view own answers" ON public.quiz_answers
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.quiz_attempts qa
    WHERE qa.id = quiz_answers.attempt_id
      AND qa.user_id = auth.uid()
      AND qa.status <> 'in_progress'
  )
);

-- 1) manual_payment_methods: only enabled rows readable by regular auth users
DROP POLICY IF EXISTS "manual methods readable authenticated" ON public.manual_payment_methods;
CREATE POLICY "manual methods readable when enabled"
  ON public.manual_payment_methods
  FOR SELECT TO authenticated
  USING (is_enabled = true);
CREATE POLICY "admins read all manual methods"
  ON public.manual_payment_methods
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 2) assignment_submissions: block students from writing grading columns
CREATE OR REPLACE FUNCTION public.block_student_grade_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;
  IF NEW.grade IS DISTINCT FROM OLD.grade
     OR NEW.outcome IS DISTINCT FROM OLD.outcome
     OR NEW.feedback IS DISTINCT FROM OLD.feedback
     OR NEW.graded_by IS DISTINCT FROM OLD.graded_by
     OR NEW.graded_at IS DISTINCT FROM OLD.graded_at
     OR NEW.feedback_given_at IS DISTINCT FROM OLD.feedback_given_at THEN
    RAISE EXCEPTION 'Not permitted to modify grading columns';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.block_student_grade_writes() FROM PUBLIC;
DROP TRIGGER IF EXISTS trg_block_student_grade_writes ON public.assignment_submissions;
CREATE TRIGGER trg_block_student_grade_writes
  BEFORE UPDATE ON public.assignment_submissions
  FOR EACH ROW EXECUTE FUNCTION public.block_student_grade_writes();

-- 3) quiz_attempts: remove direct client INSERT/UPDATE; all state via SECURITY DEFINER RPCs
DROP POLICY IF EXISTS "Students update own in-progress attempts" ON public.quiz_attempts;
DROP POLICY IF EXISTS "Students insert own attempts" ON public.quiz_attempts;

-- 4) lesson_progress: enforce enrollment on UPDATE USING clause too
DROP POLICY IF EXISTS lesson_progress_own_update ON public.lesson_progress;
CREATE POLICY lesson_progress_own_update
  ON public.lesson_progress
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND is_enrolled_in_lesson_course(auth.uid(), lesson_id))
  WITH CHECK (auth.uid() = user_id AND is_enrolled_in_lesson_course(auth.uid(), lesson_id));

-- 5) Views: switch to security_invoker
ALTER VIEW public.discount_savings_summary SET (security_invoker = on);
ALTER VIEW public.lessons_public SET (security_invoker = on);

-- 6) Function search_path hardening for helpers missing it
ALTER FUNCTION public._gen_payment_reference() SET search_path = public;
ALTER FUNCTION public._gen_txn_reference() SET search_path = public;
ALTER FUNCTION public._maintain_featured_at() SET search_path = public;
ALTER FUNCTION public._stable_uuid(text) SET search_path = public;
ALTER FUNCTION public.badge_conditions_no_self_ref() SET search_path = public;

-- 7) Tighten function EXECUTE grants
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;
GRANT  EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Internal / trigger-only functions: revoke from authenticated as well (triggers run as owner)
REVOKE EXECUTE ON FUNCTION public._award_points(uuid, text, text, uuid, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public._enforce_enrollment_course_published() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public._enroll_user_in_bundle(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public._finalize_attempt(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public._gen_payment_reference() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public._gen_txn_reference() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public._grade_answer(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public._maintain_featured_at() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public._stable_uuid(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.badge_conditions_no_self_ref() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_publish_scheduled_courses() FROM authenticated;

-- ========== BOOKS ==========
CREATE TABLE public.books (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  author TEXT,
  publisher TEXT,
  publication_year INTEGER,
  isbn TEXT,
  language TEXT NOT NULL DEFAULT 'ar',
  subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  stage_id UUID REFERENCES public.stages(id) ON DELETE SET NULL,
  tags TEXT[],
  book_type TEXT NOT NULL CHECK (book_type IN ('digital','physical')),
  price_piastres INTEGER NOT NULL CHECK (price_piastres > 0),
  discount_price_piastres INTEGER CHECK (discount_price_piastres IS NULL OR discount_price_piastres >= 0),
  discount_expires_at TIMESTAMPTZ,
  cover_image_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  -- Digital
  digital_file_url TEXT,
  download_limit INTEGER CHECK (download_limit IS NULL OR download_limit >= 0),
  is_drm_protected BOOLEAN NOT NULL DEFAULT true,
  -- Physical
  stock_quantity INTEGER CHECK (stock_quantity IS NULL OR stock_quantity >= 0),
  weight_grams INTEGER CHECK (weight_grams IS NULL OR weight_grams >= 0),
  length_cm NUMERIC,
  width_cm NUMERIC,
  height_cm NUMERIC,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT discount_lt_price CHECK (
    discount_price_piastres IS NULL OR discount_price_piastres < price_piastres
  ),
  CONSTRAINT type_fields_consistent CHECK (
    (book_type = 'digital'
      AND stock_quantity IS NULL AND weight_grams IS NULL
      AND length_cm IS NULL AND width_cm IS NULL AND height_cm IS NULL)
    OR
    (book_type = 'physical'
      AND digital_file_url IS NULL AND download_limit IS NULL)
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.books TO authenticated;
GRANT SELECT ON public.books TO anon;
GRANT ALL ON public.books TO service_role;

ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;

CREATE POLICY "books_select_published" ON public.books
  FOR SELECT TO anon, authenticated
  USING (status = 'published');
CREATE POLICY "books_select_admin" ON public.books
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "books_insert_admin" ON public.books
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "books_update_admin" ON public.books
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "books_delete_admin" ON public.books
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_books_subject ON public.books(subject_id);
CREATE INDEX idx_books_stage ON public.books(stage_id);
CREATE INDEX idx_books_type ON public.books(book_type);
CREATE INDEX idx_books_status ON public.books(status);

CREATE TRIGGER update_books_updated_at BEFORE UPDATE ON public.books
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========== BOOK IMAGES ==========
CREATE TABLE public.book_images (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.book_images TO authenticated;
GRANT SELECT ON public.book_images TO anon;
GRANT ALL ON public.book_images TO service_role;

ALTER TABLE public.book_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "book_images_select_visible" ON public.book_images
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.books b
    WHERE b.id = book_images.book_id AND b.status = 'published'
  ));
CREATE POLICY "book_images_select_admin" ON public.book_images
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "book_images_write_admin" ON public.book_images
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_book_images_book ON public.book_images(book_id, order_index);

-- ========== STORAGE: book-assets ==========
CREATE POLICY "book_assets_admin_all" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'book-assets' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'book-assets' AND public.has_role(auth.uid(), 'admin'));

-- Reusable updated_at trigger (already exists in project as update_updated_at_column)

-- SHIPPING SETTINGS (singleton)
CREATE TABLE public.shipping_settings (
  id integer PRIMARY KEY CHECK (id = 1),
  default_shipping_price_piastres integer NOT NULL DEFAULT 5000 CHECK (default_shipping_price_piastres >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.shipping_settings TO anon, authenticated;
GRANT ALL ON public.shipping_settings TO service_role;
GRANT UPDATE ON public.shipping_settings TO authenticated;
ALTER TABLE public.shipping_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shipping_settings_public_read" ON public.shipping_settings FOR SELECT USING (true);
CREATE POLICY "shipping_settings_admin_update" ON public.shipping_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_shipping_settings_updated BEFORE UPDATE ON public.shipping_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
INSERT INTO public.shipping_settings (id) VALUES (1);

-- SHIPPING ZONES
CREATE TABLE public.shipping_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_governorate boolean NOT NULL DEFAULT false,
  shipping_price_piastres integer CHECK (shipping_price_piastres IS NULL OR shipping_price_piastres >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX shipping_zones_gov_idx ON public.shipping_zones(is_governorate);
GRANT SELECT ON public.shipping_zones TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.shipping_zones TO authenticated;
GRANT ALL ON public.shipping_zones TO service_role;
ALTER TABLE public.shipping_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shipping_zones_public_read" ON public.shipping_zones FOR SELECT USING (true);
CREATE POLICY "shipping_zones_admin_write" ON public.shipping_zones FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_shipping_zones_updated BEFORE UPDATE ON public.shipping_zones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed 27 Egyptian governorates (matches registration_form_fields governorate options)
INSERT INTO public.shipping_zones (name, is_governorate, shipping_price_piastres) VALUES
  ('القاهرة', true, NULL), ('الجيزة', true, NULL), ('الإسكندرية', true, NULL),
  ('القليوبية', true, NULL), ('الشرقية', true, NULL), ('الدقهلية', true, NULL),
  ('البحيرة', true, NULL), ('الغربية', true, NULL), ('المنوفية', true, NULL),
  ('كفر الشيخ', true, NULL), ('دمياط', true, NULL), ('بورسعيد', true, NULL),
  ('الإسماعيلية', true, NULL), ('السويس', true, NULL), ('شمال سيناء', true, NULL),
  ('جنوب سيناء', true, NULL), ('بني سويف', true, NULL), ('الفيوم', true, NULL),
  ('المنيا', true, NULL), ('أسيوط', true, NULL), ('سوهاج', true, NULL),
  ('قنا', true, NULL), ('الأقصر', true, NULL), ('أسوان', true, NULL),
  ('البحر الأحمر', true, NULL), ('الوادي الجديد', true, NULL), ('مطروح', true, NULL);

-- BOOK CART ITEMS
CREATE TABLE public.book_cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, book_id)
);
CREATE INDEX book_cart_items_user_idx ON public.book_cart_items(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.book_cart_items TO authenticated;
GRANT ALL ON public.book_cart_items TO service_role;
ALTER TABLE public.book_cart_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "book_cart_items_own_all" ON public.book_cart_items FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Trigger enforcing digital books limited to quantity 1
CREATE OR REPLACE FUNCTION public.enforce_digital_cart_quantity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE bt text;
BEGIN
  SELECT book_type INTO bt FROM public.books WHERE id = NEW.book_id;
  IF bt = 'digital' AND NEW.quantity <> 1 THEN
    RAISE EXCEPTION 'Digital books are limited to quantity 1';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.enforce_digital_cart_quantity() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_book_cart_digital_qty
  BEFORE INSERT OR UPDATE ON public.book_cart_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_digital_cart_quantity();

-- ============================================================================
-- Phase 55: Book Checkout, Orders + Payment (incl. Cash on Delivery)
-- ============================================================================

-- 1) Extend payment_gateways with scope
ALTER TABLE public.payment_gateways
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'all';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='payment_gateways_scope_check'
  ) THEN
    ALTER TABLE public.payment_gateways
      ADD CONSTRAINT payment_gateways_scope_check
      CHECK (scope IN ('all','courses_and_bundles','books_only'));
  END IF;
END$$;

-- Cash on Delivery gateway (books only, disabled by default).
-- Bypasses the Phase 41 manual-review flow: no proof, no pending review.
INSERT INTO public.payment_gateways (gateway_key, display_name, type, is_enabled, scope)
VALUES ('cod', 'الدفع عند الاستلام', 'manual', false, 'books_only')
ON CONFLICT (gateway_key) DO UPDATE
  SET scope = EXCLUDED.scope,
      display_name = EXCLUDED.display_name;

-- Allow the manual-gateway validation trigger to keep working with COD (COD needs no methods).
-- The existing trigger `validate_manual_gateway_enable` guards enabling `manual`. Confirm COD is not blocked
-- by inspecting the function body; it targets `manual` only, not `cod`, so COD enable is fine.

-- 2) Extend payment_transactions
ALTER TABLE public.payment_transactions
  DROP CONSTRAINT IF EXISTS payment_transactions_purpose_check;

ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_purpose_check
  CHECK (purpose IN ('course_purchase','wallet_topup','bundle_purchase','book_order'));

ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS book_order_id uuid;

-- FK added below (after book_orders exists)

-- 3) book_orders table
CREATE TABLE IF NOT EXISTS public.book_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment','confirmed','shipped','delivered','cancelled','refund_requested','refunded')),
  payment_gateway_id uuid NOT NULL REFERENCES public.payment_gateways(id) ON DELETE RESTRICT,
  has_physical_items boolean NOT NULL,
  shipping_zone_id uuid REFERENCES public.shipping_zones(id) ON DELETE SET NULL,
  shipping_address jsonb,
  shipping_cost_piastres integer NOT NULL DEFAULT 0 CHECK (shipping_cost_piastres >= 0),
  items_subtotal_piastres integer NOT NULL CHECK (items_subtotal_piastres >= 0),
  total_piastres integer NOT NULL CHECK (total_piastres >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz
);

CREATE INDEX IF NOT EXISTS book_orders_user_idx ON public.book_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS book_orders_status_idx ON public.book_orders(status, created_at DESC);

GRANT SELECT ON public.book_orders TO authenticated;
GRANT ALL ON public.book_orders TO service_role;
ALTER TABLE public.book_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "book_orders_own_select" ON public.book_orders
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "book_orders_admin_select" ON public.book_orders
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_book_orders_updated_at
  BEFORE UPDATE ON public.book_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Deferred FK from payment_transactions
ALTER TABLE public.payment_transactions
  DROP CONSTRAINT IF EXISTS payment_transactions_book_order_id_fkey;
ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_book_order_id_fkey
  FOREIGN KEY (book_order_id) REFERENCES public.book_orders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_payment_txns_book_order ON public.payment_transactions(book_order_id, created_at DESC);

-- 4) book_order_items table
CREATE TABLE IF NOT EXISTS public.book_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.book_orders(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE RESTRICT,
  book_type text NOT NULL CHECK (book_type IN ('digital','physical')),
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_piastres integer NOT NULL CHECK (unit_price_piastres >= 0),
  digital_downloads_used integer NOT NULL DEFAULT 0 CHECK (digital_downloads_used >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS book_order_items_order_idx ON public.book_order_items(order_id);
CREATE INDEX IF NOT EXISTS book_order_items_book_idx ON public.book_order_items(book_id);

GRANT SELECT ON public.book_order_items TO authenticated;
GRANT ALL ON public.book_order_items TO service_role;
ALTER TABLE public.book_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "book_order_items_own_select" ON public.book_order_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.book_orders o
    WHERE o.id = order_id AND o.user_id = auth.uid()
  ));

CREATE POLICY "book_order_items_admin_select" ON public.book_order_items
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 5) Order-number sequence + generator
CREATE SEQUENCE IF NOT EXISTS public.book_orders_seq START 1;

CREATE OR REPLACE FUNCTION public._gen_book_order_number()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE v_n bigint;
BEGIN
  v_n := nextval('public.book_orders_seq');
  RETURN 'BK-' || LPAD(v_n::text, 6, '0');
END; $$;

REVOKE EXECUTE ON FUNCTION public._gen_book_order_number() FROM PUBLIC, anon, authenticated;

-- 6) Effective book price helper (server-side mirror of getEffectivePrice)
CREATE OR REPLACE FUNCTION public._book_effective_price(p_book public.books)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_book.discount_price_piastres IS NOT NULL
     AND (p_book.discount_expires_at IS NULL OR now() < p_book.discount_expires_at)
    THEN p_book.discount_price_piastres
    ELSE p_book.price_piastres
  END
$$;

REVOKE EXECUTE ON FUNCTION public._book_effective_price(public.books) FROM PUBLIC, anon, authenticated;

-- 7) Effective shipping helper
CREATE OR REPLACE FUNCTION public._effective_shipping_price(p_zone_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE v_default integer; v_override integer;
BEGIN
  SELECT default_shipping_price_piastres INTO v_default FROM public.shipping_settings WHERE id = 1;
  v_default := COALESCE(v_default, 0);
  IF p_zone_id IS NULL THEN RETURN v_default; END IF;
  SELECT shipping_price_piastres INTO v_override FROM public.shipping_zones WHERE id = p_zone_id;
  RETURN COALESCE(v_override, v_default);
END; $$;

REVOKE EXECUTE ON FUNCTION public._effective_shipping_price(uuid) FROM PUBLIC, anon, authenticated;

-- 8) create_book_order — atomic checkout entry point
--
-- Handles all 5 gateway flows in one place:
--   wallet   : deduct wallet, order='confirmed', txn.status='success'
--   manual   : order='pending_payment', txn.status='pending_review'
--              + inserts manual_payment_proofs (Phase 41 flow)
--   kashier / paymob / fawaterak: order='pending_payment', txn.status='pending_gateway'
--              (client then calls the respective *-initiate edge function with the reference)
--   cod      : order='confirmed' immediately, txn.status='success' (bookkeeping only)
--
-- Stock is always validated + decremented atomically for physical books BEFORE payment work.
CREATE OR REPLACE FUNCTION public.create_book_order(
  p_gateway_key         text,
  p_shipping_zone_id    uuid   DEFAULT NULL,
  p_shipping_address    jsonb  DEFAULT NULL,
  -- manual-only:
  p_manual_method_id    uuid   DEFAULT NULL,
  p_manual_sender_number text  DEFAULT NULL,
  p_manual_proof_path   text   DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_gw RECORD;
  v_cart_rec RECORD;
  v_book RECORD;
  v_subtotal integer := 0;
  v_shipping integer := 0;
  v_total integer := 0;
  v_has_physical boolean := false;
  v_order_id uuid;
  v_order_number text;
  v_txn_id uuid;
  v_ref text;
  v_status text;
  v_txn_status text;
  v_pay_purpose constant text := 'book_order';
  v_wallet RECORD;
  v_new_balance integer;
  v_wtx_ref text;
  v_wtx_id uuid;
  v_book_ids uuid[];
  v_line_items jsonb := '[]'::jsonb;
  v_confirmed_at timestamptz;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول أولاً' USING ERRCODE = '42501';
  END IF;

  -- Load gateway & validate scope
  SELECT * INTO v_gw FROM public.payment_gateways WHERE gateway_key = p_gateway_key;
  IF v_gw IS NULL OR NOT v_gw.is_enabled THEN
    RAISE EXCEPTION 'بوابة الدفع غير متاحة';
  END IF;
  IF v_gw.scope NOT IN ('all','books_only') THEN
    RAISE EXCEPTION 'بوابة الدفع لا تدعم شراء الكتب';
  END IF;

  -- Collect cart book IDs (sorted for consistent lock ordering)
  SELECT array_agg(book_id ORDER BY book_id) INTO v_book_ids
  FROM public.book_cart_items WHERE user_id = v_user;

  IF v_book_ids IS NULL OR array_length(v_book_ids, 1) = 0 THEN
    RAISE EXCEPTION 'سلة الشراء فارغة';
  END IF;

  -- Lock every referenced book row in a stable order to avoid deadlocks
  PERFORM 1 FROM public.books
   WHERE id = ANY(v_book_ids)
   ORDER BY id
   FOR UPDATE;

  -- Detect physical presence + validate stock (aborts entire order if any insufficient)
  FOR v_cart_rec IN
    SELECT ci.book_id, ci.quantity
      FROM public.book_cart_items ci
     WHERE ci.user_id = v_user
     ORDER BY ci.book_id
  LOOP
    SELECT * INTO v_book FROM public.books WHERE id = v_cart_rec.book_id;
    IF v_book IS NULL THEN
      RAISE EXCEPTION 'أحد الكتب لم يعد متاحًا';
    END IF;
    IF v_book.status <> 'published' THEN
      RAISE EXCEPTION 'الكتاب "%" لم يعد متاحًا للشراء', v_book.title;
    END IF;
    IF v_book.book_type = 'physical' THEN
      v_has_physical := true;
      IF COALESCE(v_book.stock_quantity, 0) < v_cart_rec.quantity THEN
        RAISE EXCEPTION 'الكتاب "%" لا يتوفر منه سوى % نسخة/نسخ',
          v_book.title, COALESCE(v_book.stock_quantity, 0)
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END LOOP;

  -- Cash on Delivery only makes sense with a physical item
  IF p_gateway_key = 'cod' AND NOT v_has_physical THEN
    RAISE EXCEPTION 'الدفع عند الاستلام غير متاح للكتب الرقمية فقط';
  END IF;

  -- Physical orders MUST provide a shipping zone + address
  IF v_has_physical THEN
    IF p_shipping_zone_id IS NULL OR p_shipping_address IS NULL THEN
      RAISE EXCEPTION 'يجب إدخال عنوان الشحن';
    END IF;
    -- validate zone exists
    PERFORM 1 FROM public.shipping_zones WHERE id = p_shipping_zone_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'منطقة الشحن غير صحيحة';
    END IF;
    v_shipping := public._effective_shipping_price(p_shipping_zone_id);
  END IF;

  -- Decrement stock + compute subtotal + build line items snapshot
  FOR v_cart_rec IN
    SELECT ci.book_id, ci.quantity
      FROM public.book_cart_items ci
     WHERE ci.user_id = v_user
     ORDER BY ci.book_id
  LOOP
    SELECT * INTO v_book FROM public.books WHERE id = v_cart_rec.book_id;
    IF v_book.book_type = 'physical' THEN
      UPDATE public.books
         SET stock_quantity = stock_quantity - v_cart_rec.quantity,
             updated_at = now()
       WHERE id = v_book.id;
    END IF;
    v_subtotal := v_subtotal + public._book_effective_price(v_book) * v_cart_rec.quantity;
    v_line_items := v_line_items || jsonb_build_object(
      'book_id', v_book.id,
      'book_type', v_book.book_type,
      'quantity', v_cart_rec.quantity,
      'unit_price_piastres', public._book_effective_price(v_book)
    );
  END LOOP;

  v_total := v_subtotal + COALESCE(v_shipping, 0);

  -- Manual-payment gate: sanity check inputs before creating order
  IF p_gateway_key = 'manual' THEN
    IF p_manual_method_id IS NULL OR COALESCE(trim(p_manual_sender_number),'') = ''
       OR COALESCE(trim(p_manual_proof_path),'') = '' THEN
      RAISE EXCEPTION 'أدخل بيانات التحويل وصورة الإثبات';
    END IF;
    PERFORM 1 FROM public.manual_payment_methods
      WHERE id = p_manual_method_id AND is_enabled = true;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'طريقة الدفع اليدوي غير متاحة';
    END IF;
  END IF;

  -- Wallet-payment gate: verify + lock + deduct
  IF p_gateway_key = 'wallet' THEN
    SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_user FOR UPDATE;
    IF v_wallet IS NULL THEN
      INSERT INTO public.wallets(user_id, balance_piastres)
      VALUES (v_user, 0) RETURNING * INTO v_wallet;
    END IF;
    IF v_wallet.balance_piastres < v_total THEN
      RAISE EXCEPTION 'رصيد المحفظة غير كافٍ';
    END IF;
    v_new_balance := v_wallet.balance_piastres - v_total;
    UPDATE public.wallets SET balance_piastres = v_new_balance, updated_at = now()
     WHERE id = v_wallet.id;
    v_wtx_ref := public._gen_txn_reference();
    INSERT INTO public.wallet_transactions
      (reference_number, wallet_id, type, amount_piastres, balance_after_piastres, notes)
    VALUES
      (v_wtx_ref, v_wallet.id, 'purchase', v_total, v_new_balance, 'شراء كتب من المتجر')
    RETURNING id INTO v_wtx_id;
  END IF;

  -- Decide final statuses
  IF p_gateway_key = 'wallet' OR p_gateway_key = 'cod' THEN
    v_status := 'confirmed';
    v_txn_status := 'success';
    v_confirmed_at := now();
  ELSIF p_gateway_key = 'manual' THEN
    v_status := 'pending_payment';
    v_txn_status := 'pending_review';
    v_confirmed_at := NULL;
  ELSE
    -- kashier / paymob / fawaterak (automatic)
    v_status := 'pending_payment';
    v_txn_status := 'pending_gateway';
    v_confirmed_at := NULL;
  END IF;

  -- Create order
  v_order_number := public._gen_book_order_number();
  INSERT INTO public.book_orders (
    order_number, user_id, status, payment_gateway_id,
    has_physical_items, shipping_zone_id, shipping_address,
    shipping_cost_piastres, items_subtotal_piastres, total_piastres,
    confirmed_at
  ) VALUES (
    v_order_number, v_user, v_status, v_gw.id,
    v_has_physical,
    CASE WHEN v_has_physical THEN p_shipping_zone_id ELSE NULL END,
    CASE WHEN v_has_physical THEN p_shipping_address ELSE NULL END,
    COALESCE(v_shipping, 0), v_subtotal, v_total,
    v_confirmed_at
  ) RETURNING id INTO v_order_id;

  -- Create order items from snapshot
  INSERT INTO public.book_order_items (order_id, book_id, book_type, quantity, unit_price_piastres)
  SELECT v_order_id,
         (li->>'book_id')::uuid,
         li->>'book_type',
         (li->>'quantity')::int,
         (li->>'unit_price_piastres')::int
    FROM jsonb_array_elements(v_line_items) li;

  -- Create bookkeeping payment_transactions row
  v_ref := public._gen_payment_reference();
  INSERT INTO public.payment_transactions
    (reference_number, user_id, gateway_id, amount_piastres, status, purpose,
     book_order_id, wallet_transaction_id, requires_manual_review)
  VALUES
    (v_ref, v_user, v_gw.id, v_total, v_txn_status, v_pay_purpose,
     v_order_id, v_wtx_id, (v_txn_status = 'pending_review'))
  RETURNING id INTO v_txn_id;

  -- Manual: attach proof
  IF p_gateway_key = 'manual' THEN
    INSERT INTO public.manual_payment_proofs
      (payment_transaction_id, manual_payment_method_id, sender_number, proof_image_url)
    VALUES
      (v_txn_id, p_manual_method_id, trim(p_manual_sender_number), p_manual_proof_path);
  END IF;

  -- Clear only the purchased books from the cart (leave anything added mid-checkout)
  DELETE FROM public.book_cart_items
   WHERE user_id = v_user AND book_id = ANY(v_book_ids);

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'total_piastres', v_total,
    'status', v_status,
    'payment_transaction_id', v_txn_id,
    'reference_number', v_ref,
    'requires_gateway_redirect', (v_txn_status = 'pending_gateway'),
    'gateway_key', p_gateway_key,
    'new_wallet_balance_piastres', v_new_balance
  );
END; $$;

REVOKE EXECUTE ON FUNCTION public.create_book_order(text, uuid, jsonb, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_book_order(text, uuid, jsonb, uuid, text, text) TO authenticated;

-- 9) Extend admin_approve_payment_request to handle book_order
CREATE OR REPLACE FUNCTION public.admin_approve_payment_request(p_transaction_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_txn RECORD;
  v_max integer;
  v_wallet RECORD;
  v_new_balance integer;
  v_wref text;
  v_wtx_id uuid;
BEGIN
  IF NOT public.has_role(v_admin, 'admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_txn FROM public.payment_transactions WHERE id=p_transaction_id FOR UPDATE;
  IF v_txn IS NULL THEN RAISE EXCEPTION 'الطلب غير موجود'; END IF;
  IF v_txn.status <> 'pending_review' THEN RAISE EXCEPTION 'هذا الطلب لم يعد قابلاً للمراجعة'; END IF;

  IF v_txn.purpose = 'course_purchase' THEN
    IF v_txn.course_id IS NULL THEN RAISE EXCEPTION 'الطلب لا يحتوي على دورة'; END IF;
    INSERT INTO public.enrollments (user_id, course_id) VALUES (v_txn.user_id, v_txn.course_id)
      ON CONFLICT DO NOTHING;
    UPDATE public.payment_transactions
      SET status='success', reviewed_by=v_admin, reviewed_at=now()
      WHERE id=p_transaction_id;
    RETURN jsonb_build_object('success', true, 'purpose', 'course_purchase');

  ELSIF v_txn.purpose = 'book_order' THEN
    IF v_txn.book_order_id IS NULL THEN RAISE EXCEPTION 'الطلب لا يحتوي على كتب'; END IF;
    UPDATE public.book_orders
      SET status='confirmed', confirmed_at=now(), updated_at=now()
      WHERE id=v_txn.book_order_id AND status='pending_payment';
    UPDATE public.payment_transactions
      SET status='success', reviewed_by=v_admin, reviewed_at=now()
      WHERE id=p_transaction_id;
    RETURN jsonb_build_object('success', true, 'purpose', 'book_order');

  ELSIF v_txn.purpose = 'wallet_topup' THEN
    SELECT max_wallet_balance_piastres INTO v_max FROM public.wallet_gateway_settings WHERE id=1;
    IF v_max IS NULL THEN v_max := 200000; END IF;

    SELECT * INTO v_wallet FROM public.wallets WHERE user_id=v_txn.user_id FOR UPDATE;
    IF v_wallet IS NULL THEN
      INSERT INTO public.wallets(user_id, balance_piastres) VALUES (v_txn.user_id, 0) RETURNING * INTO v_wallet;
    END IF;

    IF v_wallet.balance_piastres + COALESCE(v_txn.topup_amount_piastres,0) > v_max THEN
      RAISE EXCEPTION 'قبول هذا الطلب سيتجاوز الحد الأقصى لرصيد الطالب (% ج.م). تواصل مع الطالب.', (v_max/100)::text;
    END IF;

    v_new_balance := v_wallet.balance_piastres + v_txn.topup_amount_piastres;
    UPDATE public.wallets SET balance_piastres=v_new_balance, updated_at=now() WHERE id=v_wallet.id;

    v_wref := public._gen_txn_reference();
    INSERT INTO public.wallet_transactions
      (reference_number, wallet_id, type, amount_piastres, balance_after_piastres, performed_by, notes)
      VALUES (v_wref, v_wallet.id, 'gateway_topup', v_txn.topup_amount_piastres, v_new_balance, v_admin,
              'شحن معتمد عبر بوابة الدفع - ' || v_txn.reference_number)
      RETURNING id INTO v_wtx_id;

    UPDATE public.payment_transactions
      SET status='success', reviewed_by=v_admin, reviewed_at=now(), wallet_transaction_id=v_wtx_id
      WHERE id=p_transaction_id;

    RETURN jsonb_build_object('success', true, 'purpose', 'wallet_topup', 'new_balance_piastres', v_new_balance);
  END IF;

  RAISE EXCEPTION 'نوع طلب غير مدعوم';
END; $$;

-- 10) Extend finalize_gateway_transaction to handle book_order
CREATE OR REPLACE FUNCTION public.finalize_gateway_transaction(
  p_reference text, p_success boolean, p_failure_reason text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_txn RECORD; v_max integer; v_wallet RECORD; v_new_balance integer;
  v_wref text; v_wtx_id uuid; v_count integer;
BEGIN
  SELECT * INTO v_txn FROM public.payment_transactions WHERE reference_number = p_reference FOR UPDATE;
  IF v_txn IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'transaction not found'); END IF;
  IF v_txn.status <> 'pending_gateway' THEN
    RETURN jsonb_build_object('ok', true, 'already_finalized', true, 'status', v_txn.status);
  END IF;

  IF NOT p_success THEN
    UPDATE public.payment_transactions
       SET status='failed', failure_reason=COALESCE(p_failure_reason,'gateway declined')
     WHERE id=v_txn.id;
    RETURN jsonb_build_object('ok', true, 'status', 'failed');
  END IF;

  IF v_txn.purpose = 'course_purchase' THEN
    IF v_txn.course_id IS NULL THEN
      UPDATE public.payment_transactions SET status='failed', failure_reason='course missing' WHERE id=v_txn.id;
      RETURN jsonb_build_object('ok', true, 'status', 'failed');
    END IF;
    INSERT INTO public.enrollments (user_id, course_id) VALUES (v_txn.user_id, v_txn.course_id) ON CONFLICT DO NOTHING;
    UPDATE public.payment_transactions SET status='success' WHERE id=v_txn.id;
    RETURN jsonb_build_object('ok', true, 'status', 'success', 'purpose', 'course_purchase');

  ELSIF v_txn.purpose = 'bundle_purchase' THEN
    IF v_txn.bundle_id IS NULL THEN
      UPDATE public.payment_transactions SET status='failed', failure_reason='bundle missing' WHERE id=v_txn.id;
      RETURN jsonb_build_object('ok', true, 'status', 'failed');
    END IF;
    v_count := public._enroll_user_in_bundle(v_txn.user_id, v_txn.bundle_id);
    UPDATE public.payment_transactions SET status='success' WHERE id=v_txn.id;
    INSERT INTO public.bundle_purchases (user_id, bundle_id, payment_transaction_id, amount_piastres, courses_included)
      VALUES (v_txn.user_id, v_txn.bundle_id, v_txn.id, v_txn.amount_piastres, v_count);
    RETURN jsonb_build_object('ok', true, 'status', 'success', 'purpose', 'bundle_purchase', 'courses_included', v_count);

  ELSIF v_txn.purpose = 'book_order' THEN
    IF v_txn.book_order_id IS NULL THEN
      UPDATE public.payment_transactions SET status='failed', failure_reason='book order missing' WHERE id=v_txn.id;
      RETURN jsonb_build_object('ok', true, 'status', 'failed');
    END IF;
    UPDATE public.book_orders
       SET status='confirmed', confirmed_at=now(), updated_at=now()
     WHERE id = v_txn.book_order_id AND status='pending_payment';
    UPDATE public.payment_transactions SET status='success' WHERE id=v_txn.id;
    RETURN jsonb_build_object('ok', true, 'status', 'success', 'purpose', 'book_order');

  ELSIF v_txn.purpose = 'wallet_topup' THEN
    SELECT max_wallet_balance_piastres INTO v_max FROM public.wallet_gateway_settings WHERE id=1;
    IF v_max IS NULL THEN v_max := 200000; END IF;
    SELECT * INTO v_wallet FROM public.wallets WHERE user_id=v_txn.user_id FOR UPDATE;
    IF v_wallet IS NULL THEN INSERT INTO public.wallets(user_id, balance_piastres) VALUES (v_txn.user_id, 0) RETURNING * INTO v_wallet; END IF;
    IF v_wallet.balance_piastres + COALESCE(v_txn.topup_amount_piastres,0) > v_max THEN
      UPDATE public.payment_transactions
        SET status='failed',
            failure_reason='تم الدفع بنجاح ولكن الرصيد سيتجاوز الحد الأقصى (' || (v_max/100)::text || ' ج.م). يستوجب مراجعة إدارية.',
            requires_manual_review=true
       WHERE id=v_txn.id;
      RETURN jsonb_build_object('ok', true, 'status', 'failed', 'requires_reconciliation', true);
    END IF;
    v_new_balance := v_wallet.balance_piastres + v_txn.topup_amount_piastres;
    UPDATE public.wallets SET balance_piastres=v_new_balance, updated_at=now() WHERE id=v_wallet.id;
    v_wref := public._gen_txn_reference();
    INSERT INTO public.wallet_transactions
      (reference_number, wallet_id, type, amount_piastres, balance_after_piastres, notes)
      VALUES (v_wref, v_wallet.id, 'gateway_topup', v_txn.topup_amount_piastres, v_new_balance,
              'شحن عبر بوابة دفع - ' || v_txn.reference_number)
      RETURNING id INTO v_wtx_id;
    UPDATE public.payment_transactions SET status='success', wallet_transaction_id=v_wtx_id WHERE id=v_txn.id;
    RETURN jsonb_build_object('ok', true, 'status', 'success', 'purpose', 'wallet_topup', 'new_balance_piastres', v_new_balance);
  END IF;

  RETURN jsonb_build_object('ok', false, 'error', 'unknown purpose');
END; $$;

-- 11) Reader for a single order (student sees own; admin sees all)
CREATE OR REPLACE FUNCTION public.get_book_order_detail(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_user uuid := auth.uid(); v_o RECORD; v_gw RECORD; v_zone RECORD; v_items jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_o FROM public.book_orders WHERE id = p_order_id;
  IF v_o IS NULL THEN RETURN NULL; END IF;
  IF v_o.user_id <> v_user AND NOT public.has_role(v_user, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  SELECT gateway_key, display_name, type INTO v_gw
    FROM public.payment_gateways WHERE id = v_o.payment_gateway_id;
  IF v_o.shipping_zone_id IS NOT NULL THEN
    SELECT name INTO v_zone FROM public.shipping_zones WHERE id = v_o.shipping_zone_id;
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', oi.id,
    'book_id', oi.book_id,
    'book_type', oi.book_type,
    'quantity', oi.quantity,
    'unit_price_piastres', oi.unit_price_piastres,
    'title', b.title,
    'author', b.author,
    'cover_image_url', b.cover_image_url
  ) ORDER BY oi.created_at), '[]'::jsonb) INTO v_items
  FROM public.book_order_items oi
  JOIN public.books b ON b.id = oi.book_id
  WHERE oi.order_id = p_order_id;

  RETURN jsonb_build_object(
    'id', v_o.id,
    'order_number', v_o.order_number,
    'status', v_o.status,
    'has_physical_items', v_o.has_physical_items,
    'shipping_address', v_o.shipping_address,
    'shipping_zone_name', v_zone.name,
    'shipping_cost_piastres', v_o.shipping_cost_piastres,
    'items_subtotal_piastres', v_o.items_subtotal_piastres,
    'total_piastres', v_o.total_piastres,
    'gateway_key', v_gw.gateway_key,
    'gateway_display_name', v_gw.display_name,
    'created_at', v_o.created_at,
    'confirmed_at', v_o.confirmed_at,
    'items', v_items
  );
END; $$;

REVOKE EXECUTE ON FUNCTION public.get_book_order_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_book_order_detail(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leaderboard_public_top10() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_publish_scheduled_courses() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_lessons_public() TO anon, authenticated;

-- Extend wallet transaction types to allow refunds
ALTER TABLE public.wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;
ALTER TABLE public.wallet_transactions
  ADD CONSTRAINT wallet_transactions_type_check CHECK (type IN (
    'card_redemption','admin_charge','admin_deduct','bulk_charge','bulk_deduct',
    'purchase','admin_reset','gateway_topup','refund'
  ));

-- 1) book_order_status_history
CREATE TABLE IF NOT EXISTS public.book_order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.book_orders(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  changed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes text,
  notify_student boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS book_order_status_history_order_idx
  ON public.book_order_status_history(order_id, created_at DESC);

GRANT SELECT ON public.book_order_status_history TO authenticated;
GRANT ALL ON public.book_order_status_history TO service_role;
ALTER TABLE public.book_order_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "book_order_history_own_select" ON public.book_order_status_history;
CREATE POLICY "book_order_history_own_select" ON public.book_order_status_history
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.book_orders o
    WHERE o.id = order_id AND o.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "book_order_history_admin_select" ON public.book_order_status_history;
CREATE POLICY "book_order_history_admin_select" ON public.book_order_status_history
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 2) book_order_refund_requests
CREATE TABLE IF NOT EXISTS public.book_order_refund_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.book_orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_notes text
);
CREATE INDEX IF NOT EXISTS bor_refund_order_idx ON public.book_order_refund_requests(order_id);
CREATE INDEX IF NOT EXISTS bor_refund_user_idx ON public.book_order_refund_requests(user_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS bor_refund_status_idx ON public.book_order_refund_requests(status, requested_at DESC);

GRANT SELECT ON public.book_order_refund_requests TO authenticated;
GRANT ALL ON public.book_order_refund_requests TO service_role;
ALTER TABLE public.book_order_refund_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bor_refund_own_select" ON public.book_order_refund_requests;
CREATE POLICY "bor_refund_own_select" ON public.book_order_refund_requests
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "bor_refund_admin_select" ON public.book_order_refund_requests;
CREATE POLICY "bor_refund_admin_select" ON public.book_order_refund_requests
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 3) Trigger — record initial status when order is created
CREATE OR REPLACE FUNCTION public._book_order_record_initial_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.book_order_status_history(order_id, from_status, to_status, changed_by, notes, notify_student)
  VALUES (NEW.id, NULL, NEW.status, NEW.user_id, 'إنشاء الطلب', false);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_book_order_initial_status ON public.book_orders;
CREATE TRIGGER trg_book_order_initial_status
  AFTER INSERT ON public.book_orders
  FOR EACH ROW EXECUTE FUNCTION public._book_order_record_initial_status();

-- 4) Core status-change function (used by both admin and student cancellation)
CREATE OR REPLACE FUNCTION public.change_book_order_status(
  p_order_id uuid,
  p_new_status text,
  p_notes text DEFAULT NULL,
  p_notify_student boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_is_admin boolean;
  v_o RECORD;
  v_gw RECORD;
  v_ok boolean := false;
  v_new_wallet_balance integer;
  v_wallet RECORD;
  v_wtx_ref text;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'auth required' USING ERRCODE='42501'; END IF;
  v_is_admin := public.has_role(v_actor, 'admin');

  SELECT * INTO v_o FROM public.book_orders WHERE id = p_order_id FOR UPDATE;
  IF v_o IS NULL THEN RAISE EXCEPTION 'الطلب غير موجود'; END IF;

  -- authorization: admin can change any; student only own AND only to 'cancelled' AND only from pending_payment/confirmed
  IF NOT v_is_admin THEN
    IF v_o.user_id <> v_actor THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
    IF p_new_status <> 'cancelled' THEN RAISE EXCEPTION 'لا يمكنك تنفيذ هذا الإجراء'; END IF;
    IF v_o.status NOT IN ('pending_payment','confirmed') THEN
      RAISE EXCEPTION 'لا يمكن إلغاء الطلب في حالته الحالية';
    END IF;
  END IF;

  -- Validate transition graph (also applies to admin)
  IF v_o.status = p_new_status THEN
    RAISE EXCEPTION 'الطلب في هذه الحالة بالفعل';
  END IF;

  IF (v_o.status = 'confirmed' AND p_new_status = 'shipped')
     OR (v_o.status = 'shipped'   AND p_new_status = 'delivered')
     OR (v_o.status = 'confirmed' AND p_new_status = 'cancelled')
     OR (v_o.status = 'pending_payment' AND p_new_status = 'cancelled') THEN
    v_ok := true;
  END IF;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'انتقال غير مسموح: من % إلى %', v_o.status, p_new_status;
  END IF;

  -- If moving to cancelled: restore stock for physical items
  IF p_new_status = 'cancelled' THEN
    UPDATE public.books b
       SET stock_quantity = COALESCE(b.stock_quantity,0) + oi.quantity,
           updated_at = now()
      FROM public.book_order_items oi
     WHERE oi.order_id = v_o.id
       AND oi.book_type = 'physical'
       AND b.id = oi.book_id;

    -- If paid via wallet AND order was already 'confirmed' (money was actually deducted) → refund wallet immediately
    IF v_o.status = 'confirmed' THEN
      SELECT gateway_key INTO v_gw FROM public.payment_gateways WHERE id = v_o.payment_gateway_id;
      IF v_gw.gateway_key = 'wallet' THEN
        SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_o.user_id FOR UPDATE;
        IF v_wallet IS NULL THEN
          INSERT INTO public.wallets(user_id, balance_piastres) VALUES (v_o.user_id, 0)
            RETURNING * INTO v_wallet;
        END IF;
        v_new_wallet_balance := v_wallet.balance_piastres + v_o.total_piastres;
        UPDATE public.wallets SET balance_piastres = v_new_wallet_balance, updated_at = now()
          WHERE id = v_wallet.id;
        v_wtx_ref := public._gen_txn_reference();
        INSERT INTO public.wallet_transactions
          (reference_number, wallet_id, type, amount_piastres, balance_after_piastres, performed_by, notes)
        VALUES
          (v_wtx_ref, v_wallet.id, 'refund', v_o.total_piastres, v_new_wallet_balance, v_actor,
           'استرداد قيمة الطلب ' || v_o.order_number || ' بعد الإلغاء');
      END IF;
    END IF;
  END IF;

  -- Update order + timestamp column
  UPDATE public.book_orders SET
    status = p_new_status,
    confirmed_at = CASE WHEN p_new_status = 'confirmed' THEN now() ELSE confirmed_at END,
    shipped_at   = CASE WHEN p_new_status = 'shipped'   THEN now() ELSE shipped_at END,
    delivered_at = CASE WHEN p_new_status = 'delivered' THEN now() ELSE delivered_at END,
    cancelled_at = CASE WHEN p_new_status = 'cancelled' THEN now() ELSE cancelled_at END,
    updated_at = now()
  WHERE id = v_o.id;

  INSERT INTO public.book_order_status_history(order_id, from_status, to_status, changed_by, notes, notify_student)
    VALUES (v_o.id, v_o.status, p_new_status, v_actor, NULLIF(trim(coalesce(p_notes,'')),''), coalesce(p_notify_student, true));

  RETURN jsonb_build_object('success', true, 'order_id', v_o.id, 'from', v_o.status, 'to', p_new_status);
END; $$;

REVOKE EXECUTE ON FUNCTION public.change_book_order_status(uuid, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_book_order_status(uuid, text, text, boolean) TO authenticated;

-- 5) Student refund request (post-delivery only)
CREATE OR REPLACE FUNCTION public.request_book_order_refund(
  p_order_id uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_user uuid := auth.uid(); v_o RECORD; v_req_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required' USING ERRCODE='42501'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'الرجاء توضيح سبب طلب الاسترجاع';
  END IF;

  SELECT * INTO v_o FROM public.book_orders WHERE id = p_order_id FOR UPDATE;
  IF v_o IS NULL THEN RAISE EXCEPTION 'الطلب غير موجود'; END IF;
  IF v_o.user_id <> v_user THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF v_o.status <> 'delivered' THEN
    RAISE EXCEPTION 'يمكن طلب الاسترجاع فقط بعد تسليم الطلب';
  END IF;

  -- Prevent duplicate pending requests
  IF EXISTS (SELECT 1 FROM public.book_order_refund_requests
             WHERE order_id = p_order_id AND status = 'pending') THEN
    RAISE EXCEPTION 'يوجد طلب استرجاع قيد المراجعة بالفعل';
  END IF;

  INSERT INTO public.book_order_refund_requests(order_id, user_id, reason)
    VALUES (p_order_id, v_user, trim(p_reason))
    RETURNING id INTO v_req_id;

  UPDATE public.book_orders SET status = 'refund_requested', updated_at = now()
    WHERE id = p_order_id;
  INSERT INTO public.book_order_status_history(order_id, from_status, to_status, changed_by, notes, notify_student)
    VALUES (p_order_id, 'delivered', 'refund_requested', v_user, 'طلب استرجاع من الطالب: ' || trim(p_reason), false);

  RETURN jsonb_build_object('success', true, 'request_id', v_req_id);
END; $$;

REVOKE EXECUTE ON FUNCTION public.request_book_order_refund(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_book_order_refund(uuid, text) TO authenticated;

-- 6) Admin list function (with filters + search)
CREATE OR REPLACE FUNCTION public.admin_list_book_orders(
  p_status text DEFAULT NULL,
  p_gateway_key text DEFAULT NULL,
  p_shipping_zone_id uuid DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_search text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_actor uuid := auth.uid(); v_rows jsonb; v_counts jsonb;
BEGIN
  IF NOT public.has_role(v_actor, 'admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;

  SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'created_at') DESC), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT jsonb_build_object(
      'id', o.id,
      'order_number', o.order_number,
      'status', o.status,
      'total_piastres', o.total_piastres,
      'has_physical_items', o.has_physical_items,
      'created_at', o.created_at,
      'confirmed_at', o.confirmed_at,
      'shipped_at', o.shipped_at,
      'delivered_at', o.delivered_at,
      'cancelled_at', o.cancelled_at,
      'user_id', o.user_id,
      'student_name', p.full_name,
      'student_phone', p.phone,
      'student_id_code', p.student_id_code,
      'gateway_key', g.gateway_key,
      'gateway_display_name', g.display_name,
      'shipping_zone_id', o.shipping_zone_id,
      'shipping_zone_name', z.name,
      'items_count', (SELECT COALESCE(SUM(oi.quantity),0) FROM public.book_order_items oi WHERE oi.order_id = o.id)
    ) AS row
    FROM public.book_orders o
    JOIN public.profiles p ON p.id = o.user_id
    JOIN public.payment_gateways g ON g.id = o.payment_gateway_id
    LEFT JOIN public.shipping_zones z ON z.id = o.shipping_zone_id
    WHERE (p_status IS NULL OR o.status = p_status)
      AND (p_gateway_key IS NULL OR g.gateway_key = p_gateway_key)
      AND (p_shipping_zone_id IS NULL OR o.shipping_zone_id = p_shipping_zone_id)
      AND (p_from IS NULL OR o.created_at >= p_from)
      AND (p_to IS NULL OR o.created_at <= p_to)
      AND (
        p_search IS NULL OR length(trim(p_search)) = 0
        OR o.order_number ILIKE '%' || p_search || '%'
        OR p.full_name ILIKE '%' || p_search || '%'
        OR COALESCE(p.phone, '') ILIKE '%' || p_search || '%'
      )
  ) s;

  SELECT jsonb_build_object(
    'pending_payment', COUNT(*) FILTER (WHERE status='pending_payment'),
    'confirmed',      COUNT(*) FILTER (WHERE status='confirmed'),
    'shipped',        COUNT(*) FILTER (WHERE status='shipped'),
    'delivered',      COUNT(*) FILTER (WHERE status='delivered'),
    'cancelled',      COUNT(*) FILTER (WHERE status='cancelled'),
    'refund_requested', COUNT(*) FILTER (WHERE status='refund_requested'),
    'refunded',       COUNT(*) FILTER (WHERE status='refunded'),
    'total',          COUNT(*)
  ) INTO v_counts FROM public.book_orders;

  RETURN jsonb_build_object('rows', v_rows, 'counts', v_counts);
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_list_book_orders(text, text, uuid, timestamptz, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_book_orders(text, text, uuid, timestamptz, timestamptz, text) TO authenticated;

-- 7) Full detail with history + student + items (admin OR owner)
CREATE OR REPLACE FUNCTION public.get_book_order_full(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_o RECORD; v_gw RECORD; v_zone RECORD;
  v_items jsonb; v_history jsonb; v_student jsonb; v_refund jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_o FROM public.book_orders WHERE id = p_order_id;
  IF v_o IS NULL THEN RETURN NULL; END IF;
  IF v_o.user_id <> v_user AND NOT public.has_role(v_user, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  SELECT gateway_key, display_name INTO v_gw FROM public.payment_gateways WHERE id = v_o.payment_gateway_id;
  IF v_o.shipping_zone_id IS NOT NULL THEN
    SELECT name INTO v_zone FROM public.shipping_zones WHERE id = v_o.shipping_zone_id;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', oi.id, 'book_id', oi.book_id, 'book_type', oi.book_type,
    'quantity', oi.quantity, 'unit_price_piastres', oi.unit_price_piastres,
    'title', b.title, 'author', b.author, 'cover_image_url', b.cover_image_url
  ) ORDER BY oi.created_at), '[]'::jsonb) INTO v_items
  FROM public.book_order_items oi
  JOIN public.books b ON b.id = oi.book_id
  WHERE oi.order_id = p_order_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', h.id, 'from_status', h.from_status, 'to_status', h.to_status,
    'notes', h.notes, 'created_at', h.created_at, 'notify_student', h.notify_student,
    'changed_by_name', p.full_name
  ) ORDER BY h.created_at), '[]'::jsonb) INTO v_history
  FROM public.book_order_status_history h
  LEFT JOIN public.profiles p ON p.id = h.changed_by
  WHERE h.order_id = p_order_id;

  SELECT jsonb_build_object(
    'id', p.id, 'full_name', p.full_name, 'phone', p.phone, 'email', p.email,
    'student_id_code', p.student_id_code
  ) INTO v_student FROM public.profiles p WHERE p.id = v_o.user_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.id, 'reason', r.reason, 'status', r.status,
    'requested_at', r.requested_at, 'reviewed_at', r.reviewed_at,
    'review_notes', r.review_notes
  ) ORDER BY r.requested_at DESC), '[]'::jsonb) INTO v_refund
  FROM public.book_order_refund_requests r WHERE r.order_id = p_order_id;

  RETURN jsonb_build_object(
    'id', v_o.id, 'order_number', v_o.order_number, 'status', v_o.status,
    'has_physical_items', v_o.has_physical_items,
    'shipping_address', v_o.shipping_address,
    'shipping_zone_name', v_zone.name,
    'shipping_cost_piastres', v_o.shipping_cost_piastres,
    'items_subtotal_piastres', v_o.items_subtotal_piastres,
    'total_piastres', v_o.total_piastres,
    'gateway_key', v_gw.gateway_key, 'gateway_display_name', v_gw.display_name,
    'created_at', v_o.created_at,
    'confirmed_at', v_o.confirmed_at, 'shipped_at', v_o.shipped_at,
    'delivered_at', v_o.delivered_at, 'cancelled_at', v_o.cancelled_at,
    'items', v_items, 'history', v_history, 'student', v_student,
    'refund_requests', v_refund
  );
END; $$;

REVOKE EXECUTE ON FUNCTION public.get_book_order_full(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_book_order_full(uuid) TO authenticated;

-- 8) Student list of own orders
CREATE OR REPLACE FUNCTION public.list_my_book_orders()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_user uuid := auth.uid(); v_rows jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required' USING ERRCODE='42501'; END IF;
  SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'created_at') DESC), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT jsonb_build_object(
      'id', o.id, 'order_number', o.order_number, 'status', o.status,
      'total_piastres', o.total_piastres, 'has_physical_items', o.has_physical_items,
      'created_at', o.created_at,
      'gateway_key', g.gateway_key, 'gateway_display_name', g.display_name,
      'items_count', (SELECT COALESCE(SUM(oi.quantity),0) FROM public.book_order_items oi WHERE oi.order_id = o.id),
      'items_preview', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'title', b.title, 'quantity', oi.quantity
        )), '[]'::jsonb)
        FROM public.book_order_items oi
        JOIN public.books b ON b.id = oi.book_id
        WHERE oi.order_id = o.id
      )
    ) AS row
    FROM public.book_orders o
    JOIN public.payment_gateways g ON g.id = o.payment_gateway_id
    WHERE o.user_id = v_user
  ) s;
  RETURN v_rows;
END; $$;

REVOKE EXECUTE ON FUNCTION public.list_my_book_orders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_book_orders() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_book_orders(
  p_status text DEFAULT NULL,
  p_gateway_key text DEFAULT NULL,
  p_shipping_zone_id uuid DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_search text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_actor uuid := auth.uid(); v_rows jsonb; v_counts jsonb;
BEGIN
  IF NOT public.has_role(v_actor, 'admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;

  SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'created_at') DESC), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT jsonb_build_object(
      'id', o.id,
      'order_number', o.order_number,
      'status', o.status,
      'total_piastres', o.total_piastres,
      'has_physical_items', o.has_physical_items,
      'created_at', o.created_at,
      'confirmed_at', o.confirmed_at,
      'shipped_at', o.shipped_at,
      'delivered_at', o.delivered_at,
      'cancelled_at', o.cancelled_at,
      'user_id', o.user_id,
      'student_name', p.full_name,
      'student_phone', p.phone_number,
      'student_id_code', p.student_id,
      'gateway_key', g.gateway_key,
      'gateway_display_name', g.display_name,
      'shipping_zone_id', o.shipping_zone_id,
      'shipping_zone_name', z.name,
      'items_count', (SELECT COALESCE(SUM(oi.quantity),0) FROM public.book_order_items oi WHERE oi.order_id = o.id)
    ) AS row
    FROM public.book_orders o
    JOIN public.profiles p ON p.id = o.user_id
    JOIN public.payment_gateways g ON g.id = o.payment_gateway_id
    LEFT JOIN public.shipping_zones z ON z.id = o.shipping_zone_id
    WHERE (p_status IS NULL OR o.status = p_status)
      AND (p_gateway_key IS NULL OR g.gateway_key = p_gateway_key)
      AND (p_shipping_zone_id IS NULL OR o.shipping_zone_id = p_shipping_zone_id)
      AND (p_from IS NULL OR o.created_at >= p_from)
      AND (p_to IS NULL OR o.created_at <= p_to)
      AND (
        p_search IS NULL OR length(trim(p_search)) = 0
        OR o.order_number ILIKE '%' || p_search || '%'
        OR p.full_name ILIKE '%' || p_search || '%'
        OR COALESCE(p.phone_number, '') ILIKE '%' || p_search || '%'
      )
  ) s;

  SELECT jsonb_build_object(
    'pending_payment', COUNT(*) FILTER (WHERE status='pending_payment'),
    'confirmed',      COUNT(*) FILTER (WHERE status='confirmed'),
    'shipped',        COUNT(*) FILTER (WHERE status='shipped'),
    'delivered',      COUNT(*) FILTER (WHERE status='delivered'),
    'cancelled',      COUNT(*) FILTER (WHERE status='cancelled'),
    'refund_requested', COUNT(*) FILTER (WHERE status='refund_requested'),
    'refunded',       COUNT(*) FILTER (WHERE status='refunded'),
    'total',          COUNT(*)
  ) INTO v_counts FROM public.book_orders;

  RETURN jsonb_build_object('rows', v_rows, 'counts', v_counts);
END; $$;

CREATE OR REPLACE FUNCTION public.get_book_order_full(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_o RECORD; v_gw RECORD; v_zone RECORD;
  v_items jsonb; v_history jsonb; v_student jsonb; v_refund jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_o FROM public.book_orders WHERE id = p_order_id;
  IF v_o IS NULL THEN RETURN NULL; END IF;
  IF v_o.user_id <> v_user AND NOT public.has_role(v_user, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  SELECT gateway_key, display_name INTO v_gw FROM public.payment_gateways WHERE id = v_o.payment_gateway_id;
  IF v_o.shipping_zone_id IS NOT NULL THEN
    SELECT name INTO v_zone FROM public.shipping_zones WHERE id = v_o.shipping_zone_id;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', oi.id, 'book_id', oi.book_id, 'book_type', oi.book_type,
    'quantity', oi.quantity, 'unit_price_piastres', oi.unit_price_piastres,
    'title', b.title, 'author', b.author, 'cover_image_url', b.cover_image_url
  ) ORDER BY oi.created_at), '[]'::jsonb) INTO v_items
  FROM public.book_order_items oi
  JOIN public.books b ON b.id = oi.book_id
  WHERE oi.order_id = p_order_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', h.id, 'from_status', h.from_status, 'to_status', h.to_status,
    'notes', h.notes, 'created_at', h.created_at, 'notify_student', h.notify_student,
    'changed_by_name', p.full_name
  ) ORDER BY h.created_at), '[]'::jsonb) INTO v_history
  FROM public.book_order_status_history h
  LEFT JOIN public.profiles p ON p.id = h.changed_by
  WHERE h.order_id = p_order_id;

  SELECT jsonb_build_object(
    'id', p.id, 'full_name', p.full_name, 'phone', p.phone_number, 'email', p.email,
    'student_id_code', p.student_id
  ) INTO v_student FROM public.profiles p WHERE p.id = v_o.user_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.id, 'reason', r.reason, 'status', r.status,
    'requested_at', r.requested_at, 'reviewed_at', r.reviewed_at,
    'review_notes', r.review_notes
  ) ORDER BY r.requested_at DESC), '[]'::jsonb) INTO v_refund
  FROM public.book_order_refund_requests r WHERE r.order_id = p_order_id;

  RETURN jsonb_build_object(
    'id', v_o.id, 'order_number', v_o.order_number, 'status', v_o.status,
    'has_physical_items', v_o.has_physical_items,
    'shipping_address', v_o.shipping_address,
    'shipping_zone_name', v_zone.name,
    'shipping_cost_piastres', v_o.shipping_cost_piastres,
    'items_subtotal_piastres', v_o.items_subtotal_piastres,
    'total_piastres', v_o.total_piastres,
    'gateway_key', v_gw.gateway_key, 'gateway_display_name', v_gw.display_name,
    'created_at', v_o.created_at,
    'confirmed_at', v_o.confirmed_at, 'shipped_at', v_o.shipped_at,
    'delivered_at', v_o.delivered_at, 'cancelled_at', v_o.cancelled_at,
    'items', v_items, 'history', v_history, 'student', v_student,
    'refund_requests', v_refund
  );
END; $$;

-- 1) Extend book_order_refund_requests
ALTER TABLE public.book_order_refund_requests
  DROP CONSTRAINT IF EXISTS book_order_refund_requests_status_check;
ALTER TABLE public.book_order_refund_requests
  ADD CONSTRAINT book_order_refund_requests_status_check
  CHECK (status IN ('pending','approved','rejected','processing','completed'));

ALTER TABLE public.book_order_refund_requests
  ADD COLUMN IF NOT EXISTS refund_method text
    CHECK (refund_method IS NULL OR refund_method IN
      ('wallet_credit','kashier_api','paymob_api','fawaterak_manual','manual_external'));
ALTER TABLE public.book_order_refund_requests
  ADD COLUMN IF NOT EXISTS processed_at timestamptz;
ALTER TABLE public.book_order_refund_requests
  ADD COLUMN IF NOT EXISTS gateway_refund_reference text;
ALTER TABLE public.book_order_refund_requests
  ADD COLUMN IF NOT EXISTS processing_error text;

-- 2) Add classic_api_key possibility to paymob config (jsonb column, no schema change needed).
--    Documented for PayMob refund calls which authenticate via classic /api/auth/tokens.

-- 3) Admin list of refund requests (all statuses, with filters)
CREATE OR REPLACE FUNCTION public.admin_list_refund_requests(
  p_status text DEFAULT NULL,
  p_search text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_actor uuid := auth.uid(); v_rows jsonb; v_counts jsonb;
BEGIN
  IF NOT public.has_role(v_actor, 'admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;

  SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'requested_at') DESC), '[]'::jsonb) INTO v_rows FROM (
    SELECT jsonb_build_object(
      'id', r.id, 'order_id', o.id, 'order_number', o.order_number,
      'status', r.status, 'refund_method', r.refund_method,
      'reason', r.reason, 'requested_at', r.requested_at,
      'reviewed_at', r.reviewed_at, 'reviewed_by_name', rp.full_name,
      'review_notes', r.review_notes,
      'processed_at', r.processed_at,
      'gateway_refund_reference', r.gateway_refund_reference,
      'processing_error', r.processing_error,
      'total_piastres', o.total_piastres,
      'order_status', o.status,
      'gateway_key', g.gateway_key,
      'gateway_display_name', g.display_name,
      'student_id', p.id, 'student_name', p.full_name,
      'student_phone', p.phone_number, 'student_id_code', p.student_id
    ) AS row
    FROM public.book_order_refund_requests r
    JOIN public.book_orders o ON o.id = r.order_id
    JOIN public.profiles p ON p.id = r.user_id
    JOIN public.payment_gateways g ON g.id = o.payment_gateway_id
    LEFT JOIN public.profiles rp ON rp.id = r.reviewed_by
    WHERE (p_status IS NULL OR r.status = p_status)
      AND (
        p_search IS NULL OR length(trim(p_search)) = 0
        OR o.order_number ILIKE '%' || p_search || '%'
        OR p.full_name ILIKE '%' || p_search || '%'
        OR COALESCE(p.phone_number,'') ILIKE '%' || p_search || '%'
      )
  ) s;

  SELECT jsonb_build_object(
    'pending',    COUNT(*) FILTER (WHERE status='pending'),
    'approved',   COUNT(*) FILTER (WHERE status='approved'),
    'processing', COUNT(*) FILTER (WHERE status='processing'),
    'completed',  COUNT(*) FILTER (WHERE status='completed'),
    'rejected',   COUNT(*) FILTER (WHERE status='rejected'),
    'total',      COUNT(*)
  ) INTO v_counts FROM public.book_order_refund_requests;

  RETURN jsonb_build_object('rows', v_rows, 'counts', v_counts);
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_list_refund_requests(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_refund_requests(text, text) TO authenticated;

-- 4) Reject a refund request
CREATE OR REPLACE FUNCTION public.admin_reject_refund_request(
  p_request_id uuid,
  p_notes text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_actor uuid := auth.uid(); v_r RECORD;
BEGIN
  IF NOT public.has_role(v_actor,'admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF p_notes IS NULL OR length(trim(p_notes)) < 3 THEN
    RAISE EXCEPTION 'الرجاء توضيح سبب الرفض';
  END IF;
  SELECT * INTO v_r FROM public.book_order_refund_requests WHERE id = p_request_id FOR UPDATE;
  IF v_r IS NULL THEN RAISE EXCEPTION 'طلب الاسترجاع غير موجود'; END IF;
  IF v_r.status NOT IN ('pending') THEN
    RAISE EXCEPTION 'لا يمكن رفض طلب في حالته الحالية';
  END IF;

  UPDATE public.book_order_refund_requests
     SET status='rejected', reviewed_by=v_actor, reviewed_at=now(),
         review_notes=trim(p_notes)
   WHERE id = p_request_id;

  -- Revert order status back to delivered
  UPDATE public.book_orders SET status='delivered', updated_at=now()
    WHERE id = v_r.order_id AND status='refund_requested';

  INSERT INTO public.book_order_status_history(order_id, from_status, to_status, changed_by, notes, notify_student)
  VALUES (v_r.order_id, 'refund_requested', 'delivered', v_actor,
          'رفض طلب الاسترجاع: ' || trim(p_notes), true);

  RETURN jsonb_build_object('success', true);
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_reject_refund_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reject_refund_request(uuid, text) TO authenticated;

-- 5) Approve refund request: sets refund_method by gateway.
--    For 'wallet': performs the wallet credit atomically & marks completed.
--    For 'cod'/'manual': marks 'approved' — admin must click "manually done" to complete.
--    For 'fawaterak': marks 'processing' — waits for their refund webhook.
--    For 'kashier'/'paymob': marks 'processing' — edge fn will call API & complete/error.
CREATE OR REPLACE FUNCTION public.admin_approve_refund_request(
  p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_r RECORD; v_o RECORD; v_gw RECORD;
  v_method text; v_wallet RECORD; v_new_balance integer; v_wref text;
BEGIN
  IF NOT public.has_role(v_actor,'admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_r FROM public.book_order_refund_requests WHERE id=p_request_id FOR UPDATE;
  IF v_r IS NULL THEN RAISE EXCEPTION 'طلب الاسترجاع غير موجود'; END IF;
  IF v_r.status <> 'pending' THEN RAISE EXCEPTION 'لا يمكن اعتماد طلب في حالته الحالية'; END IF;

  SELECT * INTO v_o FROM public.book_orders WHERE id = v_r.order_id FOR UPDATE;
  IF v_o IS NULL THEN RAISE EXCEPTION 'الطلب غير موجود'; END IF;
  SELECT * INTO v_gw FROM public.payment_gateways WHERE id = v_o.payment_gateway_id;

  v_method := CASE v_gw.gateway_key
    WHEN 'wallet' THEN 'wallet_credit'
    WHEN 'kashier' THEN 'kashier_api'
    WHEN 'paymob' THEN 'paymob_api'
    WHEN 'fawaterak' THEN 'fawaterak_manual'
    WHEN 'manual' THEN 'manual_external'
    WHEN 'cod' THEN 'manual_external'
    ELSE 'manual_external' END;

  IF v_gw.gateway_key = 'wallet' THEN
    -- Instant wallet refund
    SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_o.user_id FOR UPDATE;
    IF v_wallet IS NULL THEN
      INSERT INTO public.wallets(user_id, balance_piastres) VALUES (v_o.user_id, 0)
        RETURNING * INTO v_wallet;
    END IF;
    v_new_balance := v_wallet.balance_piastres + v_o.total_piastres;
    UPDATE public.wallets SET balance_piastres=v_new_balance, updated_at=now() WHERE id=v_wallet.id;
    v_wref := public._gen_txn_reference();
    INSERT INTO public.wallet_transactions
      (reference_number, wallet_id, type, amount_piastres, balance_after_piastres, performed_by, notes)
    VALUES
      (v_wref, v_wallet.id, 'refund', v_o.total_piastres, v_new_balance, v_actor,
       'استرداد قيمة الطلب ' || v_o.order_number);

    UPDATE public.book_order_refund_requests
      SET status='completed', refund_method=v_method,
          reviewed_by=v_actor, reviewed_at=now(),
          processed_at=now(), gateway_refund_reference=v_wref,
          processing_error=NULL
     WHERE id=p_request_id;
    UPDATE public.book_orders SET status='refunded', updated_at=now() WHERE id=v_o.id;
    INSERT INTO public.book_order_status_history(order_id, from_status, to_status, changed_by, notes, notify_student)
    VALUES (v_o.id, 'refund_requested', 'refunded', v_actor, 'استرداد فوري إلى محفظة الطالب', true);
    RETURN jsonb_build_object('success', true, 'method', v_method, 'completed', true);

  ELSIF v_gw.gateway_key IN ('cod','manual') THEN
    UPDATE public.book_order_refund_requests
      SET status='approved', refund_method=v_method,
          reviewed_by=v_actor, reviewed_at=now(),
          processing_error=NULL
     WHERE id=p_request_id;
    RETURN jsonb_build_object('success', true, 'method', v_method, 'needs_manual_confirm', true);

  ELSIF v_gw.gateway_key = 'fawaterak' THEN
    UPDATE public.book_order_refund_requests
      SET status='processing', refund_method=v_method,
          reviewed_by=v_actor, reviewed_at=now(),
          processing_error=NULL
     WHERE id=p_request_id;
    RETURN jsonb_build_object('success', true, 'method', v_method, 'needs_dashboard_action', true);

  ELSE
    -- kashier / paymob: mark processing, edge function will call API next
    UPDATE public.book_order_refund_requests
      SET status='processing', refund_method=v_method,
          reviewed_by=v_actor, reviewed_at=now(),
          processing_error=NULL
     WHERE id=p_request_id;
    RETURN jsonb_build_object('success', true, 'method', v_method, 'needs_gateway_call', true,
                              'gateway_key', v_gw.gateway_key);
  END IF;
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_approve_refund_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_refund_request(uuid) TO authenticated;

-- 6) Finalize completion after external gateway success or manual/fawaterak confirmation
CREATE OR REPLACE FUNCTION public.admin_complete_refund_request(
  p_request_id uuid,
  p_gateway_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_actor uuid := auth.uid(); v_r RECORD; v_o RECORD; v_admin boolean;
BEGIN
  v_admin := (v_actor IS NOT NULL AND public.has_role(v_actor,'admin'));
  -- Also allow service_role (used by fawaterak webhook). service_role bypasses RLS
  -- but this is SECURITY DEFINER, so allow when auth.uid() is null (service context).
  IF v_actor IS NOT NULL AND NOT v_admin THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_r FROM public.book_order_refund_requests WHERE id=p_request_id FOR UPDATE;
  IF v_r IS NULL THEN RAISE EXCEPTION 'طلب الاسترجاع غير موجود'; END IF;
  IF v_r.status IN ('completed','rejected') THEN
    RAISE EXCEPTION 'الطلب سبق إنهاؤه';
  END IF;

  SELECT * INTO v_o FROM public.book_orders WHERE id=v_r.order_id FOR UPDATE;
  IF v_o IS NULL THEN RAISE EXCEPTION 'الطلب غير موجود'; END IF;

  UPDATE public.book_order_refund_requests
    SET status='completed', processed_at=now(),
        gateway_refund_reference = COALESCE(p_gateway_reference, gateway_refund_reference),
        review_notes = COALESCE(NULLIF(trim(coalesce(p_notes,'')),''), review_notes),
        processing_error = NULL
   WHERE id=p_request_id;

  IF v_o.status <> 'refunded' THEN
    UPDATE public.book_orders SET status='refunded', updated_at=now() WHERE id=v_o.id;
    INSERT INTO public.book_order_status_history(order_id, from_status, to_status, changed_by, notes, notify_student)
    VALUES (v_o.id, v_o.status, 'refunded', v_actor,
            COALESCE(p_notes, 'تم إتمام الاسترجاع'), true);
  END IF;

  RETURN jsonb_build_object('success', true);
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_complete_refund_request(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_complete_refund_request(uuid, text, text) TO authenticated, service_role;

-- 7) Record processing error (retry path stays available)
CREATE OR REPLACE FUNCTION public.admin_mark_refund_error(
  p_request_id uuid,
  p_error text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NOT NULL AND NOT public.has_role(v_actor,'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  UPDATE public.book_order_refund_requests
    SET status='processing', processing_error=COALESCE(p_error,'خطأ غير معروف')
   WHERE id=p_request_id AND status IN ('processing','approved');
  RETURN jsonb_build_object('success', true);
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_mark_refund_error(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_mark_refund_error(uuid, text) TO authenticated, service_role;

-- 8) Fetch details for edge-function processing (transaction IDs, config)
CREATE OR REPLACE FUNCTION public.admin_get_refund_processing_context(
  p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_actor uuid := auth.uid(); v_r RECORD; v_o RECORD; v_gw RECORD; v_txn RECORD;
BEGIN
  IF NOT public.has_role(v_actor,'admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_r FROM public.book_order_refund_requests WHERE id=p_request_id;
  IF v_r IS NULL THEN RAISE EXCEPTION 'طلب الاسترجاع غير موجود'; END IF;
  SELECT * INTO v_o FROM public.book_orders WHERE id=v_r.order_id;
  SELECT * INTO v_gw FROM public.payment_gateways WHERE id=v_o.payment_gateway_id;
  SELECT * INTO v_txn FROM public.payment_transactions
    WHERE book_order_id = v_o.id AND status='success'
    ORDER BY created_at DESC LIMIT 1;

  RETURN jsonb_build_object(
    'request_id', v_r.id,
    'request_status', v_r.status,
    'refund_method', v_r.refund_method,
    'order_id', v_o.id,
    'order_number', v_o.order_number,
    'order_total_piastres', v_o.total_piastres,
    'gateway_key', v_gw.gateway_key,
    'transaction_reference', v_txn.reference_number,
    'transaction_metadata', COALESCE(v_txn.gateway_metadata, '{}'::jsonb)
  );
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_get_refund_processing_context(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_refund_processing_context(uuid) TO authenticated;

-- 9) Extend get_book_order_full to include refund_method / processed_at
CREATE OR REPLACE FUNCTION public.get_book_order_full(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_o RECORD; v_gw RECORD; v_zone RECORD;
  v_items jsonb; v_history jsonb; v_student jsonb; v_refund jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_o FROM public.book_orders WHERE id = p_order_id;
  IF v_o IS NULL THEN RETURN NULL; END IF;
  IF v_o.user_id <> v_user AND NOT public.has_role(v_user, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  SELECT gateway_key, display_name INTO v_gw FROM public.payment_gateways WHERE id = v_o.payment_gateway_id;
  IF v_o.shipping_zone_id IS NOT NULL THEN
    SELECT name INTO v_zone FROM public.shipping_zones WHERE id = v_o.shipping_zone_id;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', oi.id, 'book_id', oi.book_id, 'book_type', oi.book_type,
    'quantity', oi.quantity, 'unit_price_piastres', oi.unit_price_piastres,
    'title', b.title, 'author', b.author, 'cover_image_url', b.cover_image_url
  ) ORDER BY oi.created_at), '[]'::jsonb) INTO v_items
  FROM public.book_order_items oi
  JOIN public.books b ON b.id = oi.book_id
  WHERE oi.order_id = p_order_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', h.id, 'from_status', h.from_status, 'to_status', h.to_status,
    'notes', h.notes, 'created_at', h.created_at, 'notify_student', h.notify_student,
    'changed_by_name', p.full_name
  ) ORDER BY h.created_at), '[]'::jsonb) INTO v_history
  FROM public.book_order_status_history h
  LEFT JOIN public.profiles p ON p.id = h.changed_by
  WHERE h.order_id = p_order_id;

  SELECT jsonb_build_object(
    'id', p.id, 'full_name', p.full_name, 'phone', p.phone_number, 'email', p.email,
    'student_id_code', p.student_id
  ) INTO v_student FROM public.profiles p WHERE p.id = v_o.user_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.id, 'reason', r.reason, 'status', r.status,
    'requested_at', r.requested_at, 'reviewed_at', r.reviewed_at,
    'review_notes', r.review_notes,
    'refund_method', r.refund_method,
    'processed_at', r.processed_at,
    'gateway_refund_reference', r.gateway_refund_reference,
    'processing_error', r.processing_error
  ) ORDER BY r.requested_at DESC), '[]'::jsonb) INTO v_refund
  FROM public.book_order_refund_requests r WHERE r.order_id = p_order_id;

  RETURN jsonb_build_object(
    'id', v_o.id, 'order_number', v_o.order_number, 'status', v_o.status,
    'has_physical_items', v_o.has_physical_items,
    'shipping_address', v_o.shipping_address,
    'shipping_zone_name', v_zone.name,
    'shipping_cost_piastres', v_o.shipping_cost_piastres,
    'items_subtotal_piastres', v_o.items_subtotal_piastres,
    'total_piastres', v_o.total_piastres,
    'gateway_key', v_gw.gateway_key, 'gateway_display_name', v_gw.display_name,
    'created_at', v_o.created_at,
    'confirmed_at', v_o.confirmed_at, 'shipped_at', v_o.shipped_at,
    'delivered_at', v_o.delivered_at, 'cancelled_at', v_o.cancelled_at,
    'items', v_items, 'history', v_history, 'student', v_student,
    'refund_requests', v_refund
  );
END; $$;

-- 10) Extend list_my_book_orders to include refund status info per order (for chip)
--     (function exists; ensure it returns latest refund status)
CREATE OR REPLACE FUNCTION public.list_my_book_orders()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required' USING ERRCODE='42501'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(row ORDER BY (row->>'created_at') DESC) FROM (
      SELECT jsonb_build_object(
        'id', o.id, 'order_number', o.order_number, 'status', o.status,
        'total_piastres', o.total_piastres, 'has_physical_items', o.has_physical_items,
        'created_at', o.created_at,
        'gateway_key', g.gateway_key, 'gateway_display_name', g.display_name,
        'items_count', (SELECT COALESCE(SUM(oi.quantity),0) FROM public.book_order_items oi WHERE oi.order_id=o.id),
        'items_preview', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object('title', b.title, 'quantity', oi.quantity)), '[]'::jsonb)
          FROM public.book_order_items oi JOIN public.books b ON b.id=oi.book_id
          WHERE oi.order_id=o.id
        ),
        'latest_refund_status', (
          SELECT r.status FROM public.book_order_refund_requests r
          WHERE r.order_id=o.id ORDER BY r.requested_at DESC LIMIT 1
        ),
        'latest_refund_notes', (
          SELECT r.review_notes FROM public.book_order_refund_requests r
          WHERE r.order_id=o.id ORDER BY r.requested_at DESC LIMIT 1
        )
      ) AS row
      FROM public.book_orders o
      JOIN public.payment_gateways g ON g.id=o.payment_gateway_id
      WHERE o.user_id = v_user
    ) s
  ), '[]'::jsonb);
END; $$;
REVOKE EXECUTE ON FUNCTION public.list_my_book_orders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_book_orders() TO authenticated;
-- Phase 58 Step 1: Add 'parent' value to the app_role enum in its own transaction
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'parent';
-- ============================================================================
-- PHASE 58 — Parent Portal
-- ============================================================================

-- 1) parent_student_links table
CREATE TABLE IF NOT EXISTS public.parent_student_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','revoked')),
  relationship text,
  request_note text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (parent_user_id, student_user_id)
);

CREATE INDEX IF NOT EXISTS parent_links_parent_idx ON public.parent_student_links(parent_user_id, status);
CREATE INDEX IF NOT EXISTS parent_links_student_idx ON public.parent_student_links(student_user_id, status);
CREATE INDEX IF NOT EXISTS parent_links_status_idx ON public.parent_student_links(status);

GRANT SELECT, INSERT, UPDATE ON public.parent_student_links TO authenticated;
GRANT ALL ON public.parent_student_links TO service_role;

ALTER TABLE public.parent_student_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS parent_links_read ON public.parent_student_links;
CREATE POLICY parent_links_read ON public.parent_student_links FOR SELECT
  TO authenticated
  USING (
    auth.uid() = parent_user_id
    OR auth.uid() = student_user_id
    OR public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS parent_links_insert ON public.parent_student_links;
CREATE POLICY parent_links_insert ON public.parent_student_links FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = parent_user_id
    AND public.has_role(auth.uid(), 'parent')
  );

DROP POLICY IF EXISTS parent_links_admin_update ON public.parent_student_links;
CREATE POLICY parent_links_admin_update ON public.parent_student_links FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS parent_links_touch ON public.parent_student_links;
CREATE TRIGGER parent_links_touch BEFORE UPDATE ON public.parent_student_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Extend handle_new_user to allow self-selected 'parent' role at signup and 'admin' role at admin creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  m jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  v_role public.app_role := 'student'::public.app_role;
BEGIN
  IF NULLIF(m->>'intended_role','') = 'parent' OR NULLIF(m->>'role','') = 'parent' THEN
    v_role := 'parent'::public.app_role;
  ELSIF NULLIF(m->>'intended_role','') = 'admin' OR NULLIF(m->>'role','') = 'admin' THEN
    v_role := 'admin'::public.app_role;
  END IF;

  INSERT INTO public.profiles (
    id, full_name, role, phone_number, guardian_phone, email, auth_email,
    governorate, registration_type, gender, stage_id, custom_fields
  ) VALUES (
    NEW.id,
    COALESCE(m->>'full_name', m->>'name', ''),
    v_role,
    NULLIF(m->>'phone_number',''),
    NULLIF(m->>'guardian_phone',''),
    NULLIF(m->>'real_email',''),
    NEW.email,
    NULLIF(m->>'governorate',''),
    NULLIF(m->>'registration_type',''),
    NULLIF(m->>'gender',''),
    CASE WHEN NULLIF(m->>'stage_id','') IS NOT NULL THEN (m->>'stage_id')::uuid ELSE NULL END,
    COALESCE(m->'custom_fields', '{}'::jsonb)
  )
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    full_name = CASE WHEN EXCLUDED.full_name <> '' THEN EXCLUDED.full_name ELSE public.profiles.full_name END;
  RETURN NEW;
END;
$function$;

-- 3) Helper: internal parent-child link check
CREATE OR REPLACE FUNCTION public.is_active_parent_of(_parent uuid, _student uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.parent_student_links
     WHERE parent_user_id = _parent
       AND student_user_id = _student
       AND status = 'approved'
  );
$$;
REVOKE EXECUTE ON FUNCTION public.is_active_parent_of(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_parent_of(uuid, uuid) TO authenticated;

-- 4) Parent-facing: request a link using a student's 6-digit student_id
CREATE OR REPLACE FUNCTION public.parent_request_student_link(
  p_student_code text,
  p_relationship text DEFAULT NULL,
  p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_parent uuid := auth.uid();
  v_student uuid;
  v_link_id uuid;
  v_existing RECORD;
BEGIN
  IF v_parent IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول' USING ERRCODE='42501'; END IF;
  IF NOT public.has_role(v_parent, 'parent') THEN
    RAISE EXCEPTION 'هذا الإجراء متاح لحسابات أولياء الأمور فقط' USING ERRCODE='42501';
  END IF;

  SELECT id INTO v_student FROM public.profiles
    WHERE student_id = trim(p_student_code) AND role = 'student';
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'لم يتم العثور على طالب بهذا الرقم';
  END IF;

  SELECT * INTO v_existing FROM public.parent_student_links
    WHERE parent_user_id = v_parent AND student_user_id = v_student;

  IF v_existing IS NOT NULL THEN
    IF v_existing.status IN ('pending','approved') THEN
      RETURN jsonb_build_object('success', false, 'reason', v_existing.status, 'link_id', v_existing.id);
    END IF;
    -- was rejected/revoked → re-request
    UPDATE public.parent_student_links
       SET status='pending', request_note=p_note, relationship=p_relationship,
           reviewed_by=NULL, reviewed_at=NULL, admin_note=NULL, updated_at=now()
     WHERE id = v_existing.id
     RETURNING id INTO v_link_id;
  ELSE
    INSERT INTO public.parent_student_links(parent_user_id, student_user_id, relationship, request_note)
    VALUES (v_parent, v_student, p_relationship, p_note)
    RETURNING id INTO v_link_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'link_id', v_link_id);
END; $$;
REVOKE EXECUTE ON FUNCTION public.parent_request_student_link(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.parent_request_student_link(text, text, text) TO authenticated;

-- 5) Parent: list my approved children (basic profile info)
CREATE OR REPLACE FUNCTION public.parent_list_children()
RETURNS TABLE (
  student_user_id uuid,
  full_name text,
  student_id text,
  avatar_url text,
  stage_name text,
  linked_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.student_id, p.avatar_url, s.name AS stage_name, l.updated_at
    FROM public.parent_student_links l
    JOIN public.profiles p ON p.id = l.student_user_id
    LEFT JOIN public.stages s ON s.id = p.stage_id
   WHERE l.parent_user_id = auth.uid()
     AND l.status = 'approved'
   ORDER BY l.updated_at DESC;
$$;
REVOKE EXECUTE ON FUNCTION public.parent_list_children() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.parent_list_children() TO authenticated;

-- 6) Parent: list my link requests (any status)
CREATE OR REPLACE FUNCTION public.parent_list_my_link_requests()
RETURNS TABLE (
  id uuid, student_user_id uuid, student_name text, student_code text,
  status text, relationship text, request_note text, admin_note text,
  created_at timestamptz, reviewed_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT l.id, l.student_user_id, p.full_name, p.student_id,
         l.status, l.relationship, l.request_note, l.admin_note,
         l.created_at, l.reviewed_at
    FROM public.parent_student_links l
    JOIN public.profiles p ON p.id = l.student_user_id
   WHERE l.parent_user_id = auth.uid()
   ORDER BY l.created_at DESC;
$$;
REVOKE EXECUTE ON FUNCTION public.parent_list_my_link_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.parent_list_my_link_requests() TO authenticated;

-- 7) Admin: list link requests with optional status filter
CREATE OR REPLACE FUNCTION public.admin_list_parent_link_requests(p_status text DEFAULT NULL)
RETURNS TABLE (
  id uuid, status text,
  parent_user_id uuid, parent_name text, parent_phone text,
  student_user_id uuid, student_name text, student_code text,
  relationship text, request_note text, admin_note text,
  reviewed_by uuid, reviewed_at timestamptz,
  created_at timestamptz, updated_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT l.id, l.status,
         l.parent_user_id, pp.full_name, pp.phone_number,
         l.student_user_id, sp.full_name, sp.student_id,
         l.relationship, l.request_note, l.admin_note,
         l.reviewed_by, l.reviewed_at,
         l.created_at, l.updated_at
    FROM public.parent_student_links l
    JOIN public.profiles pp ON pp.id = l.parent_user_id
    JOIN public.profiles sp ON sp.id = l.student_user_id
   WHERE public.has_role(auth.uid(),'admin')
     AND (p_status IS NULL OR l.status = p_status)
   ORDER BY l.created_at DESC;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_list_parent_link_requests(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_parent_link_requests(text) TO authenticated;

-- 8) Admin: approve / reject / revoke a link
CREATE OR REPLACE FUNCTION public.admin_review_parent_link(
  p_link_id uuid,
  p_action text,   -- 'approve' | 'reject' | 'revoke'
  p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_new_status text;
BEGIN
  IF NOT public.has_role(v_admin,'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  v_new_status := CASE p_action
    WHEN 'approve' THEN 'approved'
    WHEN 'reject'  THEN 'rejected'
    WHEN 'revoke'  THEN 'revoked'
    ELSE NULL END;
  IF v_new_status IS NULL THEN RAISE EXCEPTION 'إجراء غير صحيح'; END IF;

  UPDATE public.parent_student_links
     SET status = v_new_status,
         admin_note = COALESCE(p_note, admin_note),
         reviewed_by = v_admin,
         reviewed_at = now(),
         updated_at = now()
   WHERE id = p_link_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'الطلب غير موجود'; END IF;
  RETURN jsonb_build_object('success', true, 'status', v_new_status);
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_review_parent_link(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_parent_link(uuid, text, text) TO authenticated;

-- 9) Parent: read-only snapshot for an approved child (reuses QR snapshot query shape)
CREATE OR REPLACE FUNCTION public.get_child_snapshot(_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_parent uuid := auth.uid();
  p RECORD;
  st_name text;
  result jsonb;
  enrolled_count int;
  qs jsonb;
  a_stats jsonb;
  courses_list jsonb;
  attempts_list jsonb;
BEGIN
  IF v_parent IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول' USING ERRCODE='42501'; END IF;
  IF NOT public.is_active_parent_of(v_parent, _student_id) THEN
    RAISE EXCEPTION 'لا تملك صلاحية عرض بيانات هذا الطالب' USING ERRCODE='42501';
  END IF;

  SELECT * INTO p FROM public.profiles WHERE id = _student_id AND role='student';
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT name INTO st_name FROM public.stages WHERE id = p.stage_id;

  SELECT COUNT(*) INTO enrolled_count FROM public.enrollments WHERE user_id = p.id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'course_id', c.id, 'course_title', c.title,
    'stage_name', st.name, 'subject_name', subj.name,
    'enrolled_at', e.enrolled_at
  ) ORDER BY e.enrolled_at DESC), '[]'::jsonb)
    INTO courses_list
    FROM public.enrollments e
    JOIN public.courses c ON c.id = e.course_id
    LEFT JOIN public.stages st ON st.id = c.stage_id
    LEFT JOIN public.subjects subj ON subj.id = c.subject_id
   WHERE e.user_id = p.id;

  WITH atts AS (
    SELECT quiz_id, status, passed FROM public.quiz_attempts
     WHERE user_id = p.id AND status <> 'in_progress'
  )
  SELECT jsonb_build_object(
    'total_attempts', (SELECT COUNT(*) FROM atts),
    'unique_quizzes', (SELECT COUNT(DISTINCT quiz_id) FROM atts),
    'passed', (SELECT COUNT(*) FROM atts WHERE status='graded' AND passed IS TRUE),
    'failed', (SELECT COUNT(*) FROM atts WHERE status='graded' AND passed IS FALSE),
    'graded_total', (SELECT COUNT(*) FROM atts WHERE status='graded')
  ) INTO qs;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'attempt_id', qa.id, 'quiz_title', q.title,
    'course_title', c.title, 'subject_name', subj.name, 'stage_name', st.name,
    'attempt_number', qa.attempt_number, 'status', qa.status,
    'percentage', qa.percentage, 'passed', qa.passed, 'submitted_at', qa.submitted_at
  ) ORDER BY qa.submitted_at DESC NULLS LAST), '[]'::jsonb)
    INTO attempts_list
    FROM public.quiz_attempts qa
    JOIN public.quizzes q ON q.id = qa.quiz_id
    JOIN public.courses c ON c.id = q.course_id
    LEFT JOIN public.stages st ON st.id = c.stage_id
    LEFT JOIN public.subjects subj ON subj.id = c.subject_id
   WHERE qa.user_id = p.id AND qa.status <> 'in_progress';

  WITH enrolled_assignments AS (
    SELECT a.id AS assignment_id FROM public.assignments a
    JOIN public.units u ON u.id = a.unit_id
    JOIN public.enrollments e ON e.course_id = u.course_id AND e.user_id = p.id
  ),
  subs AS (
    SELECT s.assignment_id, s.status, s.outcome FROM public.assignment_submissions s
     WHERE s.user_id = p.id
  )
  SELECT jsonb_build_object(
    'total', (SELECT COUNT(*) FROM enrolled_assignments),
    'completed', (SELECT COUNT(*) FROM subs WHERE outcome IN ('passed','failed')),
    'passed', (SELECT COUNT(*) FROM subs WHERE outcome='passed'),
    'failed', (SELECT COUNT(*) FROM subs WHERE outcome='failed' OR outcome='not_submitted')
  ) INTO a_stats;

  result := jsonb_build_object(
    'found', true,
    'full_name', p.full_name,
    'avatar_url', p.avatar_url,
    'student_id', p.student_id,
    'stage_name', st_name,
    'phone_number', p.phone_number,
    'enrolled_courses_count', enrolled_count,
    'enrolled_courses', courses_list,
    'quiz_attempts', attempts_list,
    'quiz_stats', qs,
    'assignment_stats', a_stats
  );
  RETURN result;
END; $$;
REVOKE EXECUTE ON FUNCTION public.get_child_snapshot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_child_snapshot(uuid) TO authenticated;

-- 10) Buy-for-child: extend purchase_course with optional recipient student
DROP FUNCTION IF EXISTS public.purchase_course(uuid);
CREATE OR REPLACE FUNCTION public.purchase_course(
  p_course_id uuid,
  p_on_behalf_of uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_recipient uuid;
  v_course RECORD;
  v_price integer;
  v_wallet RECORD;
  v_new_balance integer;
  v_wref text;
  v_pref text;
  v_wtx uuid;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول' USING ERRCODE='42501'; END IF;

  -- Determine who receives enrollment
  IF p_on_behalf_of IS NOT NULL AND p_on_behalf_of <> v_caller THEN
    IF NOT public.is_active_parent_of(v_caller, p_on_behalf_of) THEN
      RAISE EXCEPTION 'لا يمكنك الشراء لهذا الطالب';
    END IF;
    v_recipient := p_on_behalf_of;
  ELSE
    v_recipient := v_caller;
  END IF;

  SELECT * INTO v_course FROM public.courses WHERE id = p_course_id;
  IF v_course IS NULL OR v_course.status <> 'published' THEN
    RAISE EXCEPTION 'الدورة غير متاحة';
  END IF;

  v_price := public._course_effective_price(v_course);

  IF EXISTS (SELECT 1 FROM public.enrollments WHERE user_id = v_recipient AND course_id = p_course_id) THEN
    RETURN jsonb_build_object('success', false, 'failure_reason', 'الطالب مسجّل بالفعل في هذه الدورة');
  END IF;

  -- Wallet always belongs to the payer
  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_caller FOR UPDATE;
  IF v_wallet IS NULL THEN
    INSERT INTO public.wallets(user_id, balance_piastres) VALUES (v_caller, 0)
      RETURNING * INTO v_wallet;
  END IF;
  IF v_wallet.balance_piastres < v_price THEN
    RETURN jsonb_build_object('success', false, 'failure_reason', 'رصيد غير كافٍ');
  END IF;

  v_new_balance := v_wallet.balance_piastres - v_price;
  UPDATE public.wallets SET balance_piastres = v_new_balance, updated_at = now()
   WHERE id = v_wallet.id;

  v_wref := public._gen_txn_reference();
  INSERT INTO public.wallet_transactions
    (reference_number, wallet_id, type, amount_piastres, balance_after_piastres, notes)
  VALUES (v_wref, v_wallet.id, 'purchase', v_price, v_new_balance,
          CASE WHEN v_recipient = v_caller
               THEN 'شراء دورة: ' || v_course.title
               ELSE 'شراء دورة لطالب: ' || v_course.title END)
  RETURNING id INTO v_wtx;

  INSERT INTO public.enrollments (user_id, course_id) VALUES (v_recipient, p_course_id)
    ON CONFLICT DO NOTHING;

  v_pref := public._gen_payment_reference();
  INSERT INTO public.payment_transactions
    (reference_number, user_id, gateway_id, amount_piastres, status, purpose,
     course_id, wallet_transaction_id, on_behalf_of_user_id)
  VALUES (v_pref, v_caller,
          (SELECT id FROM public.payment_gateways WHERE gateway_key='wallet'),
          v_price, 'success', 'course_purchase',
          p_course_id, v_wtx,
          CASE WHEN v_recipient <> v_caller THEN v_recipient ELSE NULL END);

  RETURN jsonb_build_object(
    'success', true,
    'new_balance_piastres', v_new_balance,
    'reference_number', v_pref,
    'recipient_user_id', v_recipient
  );
END; $$;
REVOKE EXECUTE ON FUNCTION public.purchase_course(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_course(uuid, uuid) TO authenticated;

-- 11) Add on_behalf_of_user_id to payment_transactions for bookkeeping
ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS on_behalf_of_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ptx_on_behalf_idx
  ON public.payment_transactions(on_behalf_of_user_id)
  WHERE on_behalf_of_user_id IS NOT NULL;
DROP FUNCTION IF EXISTS public.admin_list_students(text, jsonb, jsonb, integer, integer);

CREATE OR REPLACE FUNCTION public.admin_list_students(
  _search text DEFAULT NULL,
  _known_filters jsonb DEFAULT '{}'::jsonb,
  _custom_filters jsonb DEFAULT '{}'::jsonb,
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid, full_name text, phone_number text, student_id text,
  email text, auth_email text, avatar_url text, is_banned boolean,
  created_at timestamptz, governorate text, registration_type text,
  gender text, stage_id uuid, stage_name text, custom_fields jsonb,
  enrollments_count bigint, completed_courses_count bigint,
  wallet_balance_piastres bigint, total_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_search text := NULLIF(trim(COALESCE(_search, '')), '');
  v_is_digit_id boolean := v_search IS NOT NULL AND v_search ~ '^[0-9]{1,6}$';
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT p.*, st.name AS stage_name,
      (SELECT COUNT(*) FROM public.enrollments e WHERE e.user_id = p.id) AS enrollments_count,
      (
        SELECT COUNT(*) FROM public.enrollments e
        WHERE e.user_id = p.id
          AND EXISTS (
            SELECT 1 FROM public.lessons l
            JOIN public.units u ON u.id = l.unit_id
            WHERE u.course_id = e.course_id
          )
          AND NOT EXISTS (
            SELECT 1 FROM public.lessons l
            JOIN public.units u ON u.id = l.unit_id
            WHERE u.course_id = e.course_id
              AND NOT EXISTS (
                SELECT 1 FROM public.lesson_progress lp
                WHERE lp.user_id = p.id AND lp.lesson_id = l.id
              )
          )
      ) AS completed_courses_count,
      COALESCE(
        (SELECT w.balance_piastres FROM public.wallets w WHERE w.user_id = p.id),
        0
      )::bigint AS wallet_balance_piastres
    FROM public.profiles p
    LEFT JOIN public.stages st ON st.id = p.stage_id
    WHERE p.role = 'student'
      AND (
        v_search IS NULL
        OR p.full_name ILIKE '%'||v_search||'%'
        OR p.phone_number ILIKE '%'||v_search||'%'
        OR p.student_id ILIKE '%'||v_search||'%'
        OR (v_is_digit_id AND p.student_id = lpad(v_search, 6, '0'))
      )
      AND (NOT (_known_filters ? 'governorate') OR p.governorate = _known_filters->>'governorate')
      AND (NOT (_known_filters ? 'registration_type') OR p.registration_type = _known_filters->>'registration_type')
      AND (NOT (_known_filters ? 'gender') OR p.gender = _known_filters->>'gender')
      AND (NOT (_known_filters ? 'stage_id') OR p.stage_id = (_known_filters->>'stage_id')::uuid)
      AND (_custom_filters = '{}'::jsonb OR p.custom_fields @> _custom_filters)
  ),
  counted AS (
    SELECT b.*, COUNT(*) OVER () AS total_count FROM base b
  )
  SELECT
    c.id, c.full_name, c.phone_number, c.student_id,
    c.email, c.auth_email, c.avatar_url, c.is_banned, c.created_at,
    c.governorate, c.registration_type, c.gender, c.stage_id, c.stage_name,
    c.custom_fields, c.enrollments_count, c.completed_courses_count,
    c.wallet_balance_piastres, c.total_count
  FROM counted c
  ORDER BY
    CASE WHEN v_is_digit_id AND c.student_id = lpad(v_search, 6, '0') THEN 0 ELSE 1 END,
    c.created_at DESC
  LIMIT GREATEST(COALESCE(_limit, 50), 1)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_list_students(text, jsonb, jsonb, integer, integer) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_list_students(text, jsonb, jsonb, integer, integer) FROM anon, PUBLIC;

-- 1. book_orders: extend status enum + add delivery_failed_at
ALTER TABLE public.book_orders DROP CONSTRAINT IF EXISTS book_orders_status_check;
ALTER TABLE public.book_orders ADD CONSTRAINT book_orders_status_check
  CHECK (status = ANY (ARRAY[
    'pending_payment','confirmed','shipped','delivered',
    'cancelled','delivery_failed','refund_requested','refunded'
  ]::text[]));
ALTER TABLE public.book_orders
  ADD COLUMN IF NOT EXISTS delivery_failed_at timestamptz;

-- 2. payment_transactions: allow 'pending'
ALTER TABLE public.payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_status_check;
ALTER TABLE public.payment_transactions ADD CONSTRAINT payment_transactions_status_check
  CHECK (status = ANY (ARRAY[
    'success','failed','pending','pending_review','pending_gateway'
  ]::text[]));

-- 3. Fix create_book_order: COD txn must be 'pending' not 'success'
CREATE OR REPLACE FUNCTION public.create_book_order(
  p_gateway_key text,
  p_shipping_zone_id uuid DEFAULT NULL::uuid,
  p_shipping_address jsonb DEFAULT NULL::jsonb,
  p_manual_method_id uuid DEFAULT NULL::uuid,
  p_manual_sender_number text DEFAULT NULL::text,
  p_manual_proof_path text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_gw RECORD;
  v_cart_rec RECORD;
  v_book RECORD;
  v_subtotal integer := 0;
  v_shipping integer := 0;
  v_total integer := 0;
  v_has_physical boolean := false;
  v_order_id uuid;
  v_order_number text;
  v_txn_id uuid;
  v_ref text;
  v_status text;
  v_txn_status text;
  v_pay_purpose constant text := 'book_order';
  v_wallet RECORD;
  v_new_balance integer;
  v_wtx_ref text;
  v_wtx_id uuid;
  v_book_ids uuid[];
  v_line_items jsonb := '[]'::jsonb;
  v_confirmed_at timestamptz;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول أولاً' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_gw FROM public.payment_gateways WHERE gateway_key = p_gateway_key;
  IF v_gw IS NULL OR NOT v_gw.is_enabled THEN
    RAISE EXCEPTION 'بوابة الدفع غير متاحة';
  END IF;
  IF v_gw.scope NOT IN ('all','books_only') THEN
    RAISE EXCEPTION 'بوابة الدفع لا تدعم شراء الكتب';
  END IF;

  SELECT array_agg(book_id ORDER BY book_id) INTO v_book_ids
  FROM public.book_cart_items WHERE user_id = v_user;

  IF v_book_ids IS NULL OR array_length(v_book_ids, 1) = 0 THEN
    RAISE EXCEPTION 'سلة الشراء فارغة';
  END IF;

  PERFORM 1 FROM public.books
   WHERE id = ANY(v_book_ids)
   ORDER BY id
   FOR UPDATE;

  FOR v_cart_rec IN
    SELECT ci.book_id, ci.quantity
      FROM public.book_cart_items ci
     WHERE ci.user_id = v_user
     ORDER BY ci.book_id
  LOOP
    SELECT * INTO v_book FROM public.books WHERE id = v_cart_rec.book_id;
    IF v_book IS NULL THEN
      RAISE EXCEPTION 'أحد الكتب لم يعد متاحًا';
    END IF;
    IF v_book.status <> 'published' THEN
      RAISE EXCEPTION 'الكتاب "%" لم يعد متاحًا للشراء', v_book.title;
    END IF;
    IF v_book.book_type = 'physical' THEN
      v_has_physical := true;
      IF COALESCE(v_book.stock_quantity, 0) < v_cart_rec.quantity THEN
        RAISE EXCEPTION 'الكتاب "%" لا يتوفر منه سوى % نسخة/نسخ',
          v_book.title, COALESCE(v_book.stock_quantity, 0)
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END LOOP;

  IF p_gateway_key = 'cod' AND NOT v_has_physical THEN
    RAISE EXCEPTION 'الدفع عند الاستلام غير متاح للكتب الرقمية فقط';
  END IF;

  IF v_has_physical THEN
    IF p_shipping_zone_id IS NULL OR p_shipping_address IS NULL THEN
      RAISE EXCEPTION 'يجب إدخال عنوان الشحن';
    END IF;
    PERFORM 1 FROM public.shipping_zones WHERE id = p_shipping_zone_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'منطقة الشحن غير صحيحة';
    END IF;
    v_shipping := public._effective_shipping_price(p_shipping_zone_id);
  END IF;

  FOR v_cart_rec IN
    SELECT ci.book_id, ci.quantity
      FROM public.book_cart_items ci
     WHERE ci.user_id = v_user
     ORDER BY ci.book_id
  LOOP
    SELECT * INTO v_book FROM public.books WHERE id = v_cart_rec.book_id;
    IF v_book.book_type = 'physical' THEN
      UPDATE public.books
         SET stock_quantity = stock_quantity - v_cart_rec.quantity,
             updated_at = now()
       WHERE id = v_book.id;
    END IF;
    v_subtotal := v_subtotal + public._book_effective_price(v_book) * v_cart_rec.quantity;
    v_line_items := v_line_items || jsonb_build_object(
      'book_id', v_book.id,
      'book_type', v_book.book_type,
      'quantity', v_cart_rec.quantity,
      'unit_price_piastres', public._book_effective_price(v_book)
    );
  END LOOP;

  v_total := v_subtotal + COALESCE(v_shipping, 0);

  IF p_gateway_key = 'manual' THEN
    IF p_manual_method_id IS NULL OR COALESCE(trim(p_manual_sender_number),'') = ''
       OR COALESCE(trim(p_manual_proof_path),'') = '' THEN
      RAISE EXCEPTION 'أدخل بيانات التحويل وصورة الإثبات';
    END IF;
    PERFORM 1 FROM public.manual_payment_methods
      WHERE id = p_manual_method_id AND is_enabled = true;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'طريقة الدفع اليدوي غير متاحة';
    END IF;
  END IF;

  IF p_gateway_key = 'wallet' THEN
    SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_user FOR UPDATE;
    IF v_wallet IS NULL THEN
      INSERT INTO public.wallets(user_id, balance_piastres)
      VALUES (v_user, 0) RETURNING * INTO v_wallet;
    END IF;
    IF v_wallet.balance_piastres < v_total THEN
      RAISE EXCEPTION 'رصيد المحفظة غير كافٍ';
    END IF;
    v_new_balance := v_wallet.balance_piastres - v_total;
    UPDATE public.wallets SET balance_piastres = v_new_balance, updated_at = now()
     WHERE id = v_wallet.id;
    v_wtx_ref := public._gen_txn_reference();
    INSERT INTO public.wallet_transactions
      (reference_number, wallet_id, type, amount_piastres, balance_after_piastres, notes)
    VALUES
      (v_wtx_ref, v_wallet.id, 'purchase', v_total, v_new_balance, 'شراء كتب من المتجر')
    RETURNING id INTO v_wtx_id;
  END IF;

  -- Decide statuses (FIX: cod payment stays 'pending' until delivery+cash collection)
  IF p_gateway_key = 'wallet' THEN
    v_status := 'confirmed';
    v_txn_status := 'success';
    v_confirmed_at := now();
  ELSIF p_gateway_key = 'cod' THEN
    v_status := 'confirmed';        -- order can be prepared/shipped
    v_txn_status := 'pending';      -- but cash not yet collected
    v_confirmed_at := now();
  ELSIF p_gateway_key = 'manual' THEN
    v_status := 'pending_payment';
    v_txn_status := 'pending_review';
    v_confirmed_at := NULL;
  ELSE
    v_status := 'pending_payment';
    v_txn_status := 'pending_gateway';
    v_confirmed_at := NULL;
  END IF;

  v_order_number := public._gen_book_order_number();
  INSERT INTO public.book_orders (
    order_number, user_id, status, payment_gateway_id,
    has_physical_items, shipping_zone_id, shipping_address,
    shipping_cost_piastres, items_subtotal_piastres, total_piastres,
    confirmed_at
  ) VALUES (
    v_order_number, v_user, v_status, v_gw.id,
    v_has_physical,
    CASE WHEN v_has_physical THEN p_shipping_zone_id ELSE NULL END,
    CASE WHEN v_has_physical THEN p_shipping_address ELSE NULL END,
    COALESCE(v_shipping, 0), v_subtotal, v_total,
    v_confirmed_at
  ) RETURNING id INTO v_order_id;

  INSERT INTO public.book_order_items (order_id, book_id, book_type, quantity, unit_price_piastres)
  SELECT v_order_id,
         (li->>'book_id')::uuid,
         li->>'book_type',
         (li->>'quantity')::int,
         (li->>'unit_price_piastres')::int
    FROM jsonb_array_elements(v_line_items) li;

  v_ref := public._gen_payment_reference();
  INSERT INTO public.payment_transactions
    (reference_number, user_id, gateway_id, amount_piastres, status, purpose,
     book_order_id, wallet_transaction_id, requires_manual_review)
  VALUES
    (v_ref, v_user, v_gw.id, v_total, v_txn_status, v_pay_purpose,
     v_order_id, v_wtx_id, (v_txn_status = 'pending_review'))
  RETURNING id INTO v_txn_id;

  IF p_gateway_key = 'manual' THEN
    INSERT INTO public.manual_payment_proofs
      (payment_transaction_id, manual_payment_method_id, sender_number, proof_image_url)
    VALUES
      (v_txn_id, p_manual_method_id, trim(p_manual_sender_number), p_manual_proof_path);
  END IF;

  DELETE FROM public.book_cart_items
   WHERE user_id = v_user AND book_id = ANY(v_book_ids);

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'total_piastres', v_total,
    'status', v_status,
    'payment_transaction_id', v_txn_id,
    'reference_number', v_ref,
    'requires_gateway_redirect', (v_txn_status = 'pending_gateway'),
    'gateway_key', p_gateway_key,
    'new_wallet_balance_piastres', v_new_balance
  );
END; $function$;

-- 4. change_book_order_status: add delivery_failed + COD cash-collected gate
CREATE OR REPLACE FUNCTION public.change_book_order_status(
  p_order_id uuid,
  p_new_status text,
  p_notes text DEFAULT NULL::text,
  p_notify_student boolean DEFAULT true,
  p_cash_collected boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_is_admin boolean;
  v_o RECORD;
  v_gw RECORD;
  v_ok boolean := false;
  v_new_wallet_balance integer;
  v_wallet RECORD;
  v_wtx_ref text;
  v_is_cod boolean;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'auth required' USING ERRCODE='42501'; END IF;
  v_is_admin := public.has_role(v_actor, 'admin');

  SELECT * INTO v_o FROM public.book_orders WHERE id = p_order_id FOR UPDATE;
  IF v_o IS NULL THEN RAISE EXCEPTION 'الطلب غير موجود'; END IF;

  SELECT * INTO v_gw FROM public.payment_gateways WHERE id = v_o.payment_gateway_id;
  v_is_cod := (v_gw.gateway_key = 'cod');

  IF NOT v_is_admin THEN
    IF v_o.user_id <> v_actor THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
    IF p_new_status <> 'cancelled' THEN RAISE EXCEPTION 'لا يمكنك تنفيذ هذا الإجراء'; END IF;
    IF v_o.status NOT IN ('pending_payment','confirmed') THEN
      RAISE EXCEPTION 'لا يمكن إلغاء الطلب في حالته الحالية';
    END IF;
  END IF;

  IF v_o.status = p_new_status THEN
    RAISE EXCEPTION 'الطلب في هذه الحالة بالفعل';
  END IF;

  IF (v_o.status = 'confirmed'       AND p_new_status = 'shipped')
     OR (v_o.status = 'shipped'      AND p_new_status = 'delivered')
     OR (v_o.status = 'shipped'      AND p_new_status = 'delivery_failed')
     OR (v_o.status = 'shipped'      AND p_new_status = 'cancelled' AND v_is_admin)
     OR (v_o.status = 'confirmed'    AND p_new_status = 'cancelled')
     OR (v_o.status = 'pending_payment' AND p_new_status = 'cancelled') THEN
    v_ok := true;
  END IF;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'انتقال غير مسموح: من % إلى %', v_o.status, p_new_status;
  END IF;

  -- COD delivered gate: cash must be explicitly confirmed collected
  IF p_new_status = 'delivered' AND v_is_cod AND NOT COALESCE(p_cash_collected, false) THEN
    RAISE EXCEPTION 'يجب تأكيد تحصيل المبلغ نقداً قبل تحديد الطلب كمُسلَّم'
      USING ERRCODE = 'P0001';
  END IF;

  -- delivery_failed reason is mandatory
  IF p_new_status = 'delivery_failed' AND COALESCE(trim(coalesce(p_notes,'')),'') = '' THEN
    RAISE EXCEPTION 'يجب إدخال سبب فشل التسليم';
  END IF;

  -- Cancelled OR delivery_failed → restore physical stock
  IF p_new_status IN ('cancelled','delivery_failed') THEN
    UPDATE public.books b
       SET stock_quantity = COALESCE(b.stock_quantity,0) + oi.quantity,
           updated_at = now()
      FROM public.book_order_items oi
     WHERE oi.order_id = v_o.id
       AND oi.book_type = 'physical'
       AND b.id = oi.book_id;

    -- Wallet refund on cancel of an already-confirmed wallet-paid order (unchanged behavior)
    IF p_new_status = 'cancelled' AND v_o.status IN ('confirmed','shipped') THEN
      IF v_gw.gateway_key = 'wallet' THEN
        SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_o.user_id FOR UPDATE;
        IF v_wallet IS NULL THEN
          INSERT INTO public.wallets(user_id, balance_piastres) VALUES (v_o.user_id, 0)
            RETURNING * INTO v_wallet;
        END IF;
        v_new_wallet_balance := v_wallet.balance_piastres + v_o.total_piastres;
        UPDATE public.wallets SET balance_piastres = v_new_wallet_balance, updated_at = now()
          WHERE id = v_wallet.id;
        v_wtx_ref := public._gen_txn_reference();
        INSERT INTO public.wallet_transactions
          (reference_number, wallet_id, type, amount_piastres, balance_after_piastres, performed_by, notes)
        VALUES
          (v_wtx_ref, v_wallet.id, 'refund', v_o.total_piastres, v_new_wallet_balance, v_actor,
           'استرداد قيمة الطلب ' || v_o.order_number || ' بعد الإلغاء');
      END IF;
    END IF;
  END IF;

  -- COD delivered → atomically flip pending payment_transactions to success
  IF p_new_status = 'delivered' AND v_is_cod THEN
    UPDATE public.payment_transactions
       SET status = 'success',
           reviewed_by = v_actor,
           reviewed_at = now(),
           review_notes = COALESCE(review_notes,'')
             || CASE WHEN COALESCE(review_notes,'') = '' THEN '' ELSE E'\n' END
             || 'تم تحصيل المبلغ نقداً عند التسليم'
     WHERE book_order_id = v_o.id
       AND status = 'pending';
  END IF;

  -- COD delivery_failed → flip pending payment_transactions to failed
  IF p_new_status = 'delivery_failed' AND v_is_cod THEN
    UPDATE public.payment_transactions
       SET status = 'failed',
           failure_reason = COALESCE(NULLIF(trim(coalesce(p_notes,'')),''), 'فشل التسليم'),
           reviewed_by = v_actor,
           reviewed_at = now()
     WHERE book_order_id = v_o.id
       AND status = 'pending';
  END IF;

  UPDATE public.book_orders SET
    status = p_new_status,
    confirmed_at = CASE WHEN p_new_status = 'confirmed' THEN now() ELSE confirmed_at END,
    shipped_at   = CASE WHEN p_new_status = 'shipped'   THEN now() ELSE shipped_at END,
    delivered_at = CASE WHEN p_new_status = 'delivered' THEN now() ELSE delivered_at END,
    cancelled_at = CASE WHEN p_new_status = 'cancelled' THEN now() ELSE cancelled_at END,
    delivery_failed_at = CASE WHEN p_new_status = 'delivery_failed' THEN now() ELSE delivery_failed_at END,
    updated_at = now()
  WHERE id = v_o.id;

  INSERT INTO public.book_order_status_history(order_id, from_status, to_status, changed_by, notes, notify_student)
    VALUES (v_o.id, v_o.status, p_new_status, v_actor, NULLIF(trim(coalesce(p_notes,'')),''), coalesce(p_notify_student, true));

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_o.id,
    'from', v_o.status,
    'to', p_new_status,
    'cash_collected', (p_new_status = 'delivered' AND v_is_cod AND COALESCE(p_cash_collected,false))
  );
END; $function$;

-- Lock down: only authenticated may execute (matches project rule about SECURITY DEFINER exposure)
REVOKE ALL ON FUNCTION public.change_book_order_status(uuid, text, text, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_book_order_status(uuid, text, text, boolean, boolean) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_book_order(text, uuid, jsonb, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_book_order(text, uuid, jsonb, uuid, text, text) TO authenticated, service_role;

-- Revoke sensitive digital-book columns from anonymous role only.
-- Public catalog page (Books.tsx) does not select these columns, so browsing is unaffected.
-- Admins and purchasers use the authenticated role, which keeps full access.
REVOKE SELECT (digital_file_url, download_limit, is_drm_protected)
  ON public.books FROM anon;

-- Admin: list parents with linked-student and request counts
CREATE OR REPLACE FUNCTION public.admin_list_parents(_search text DEFAULT NULL)
RETURNS TABLE (
  parent_user_id uuid,
  full_name text,
  phone_number text,
  email text,
  avatar_url text,
  is_banned boolean,
  created_at timestamptz,
  approved_children_count bigint,
  pending_requests_count bigint,
  total_requests_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.full_name,
    p.phone_number,
    COALESCE(p.email, p.auth_email),
    p.avatar_url,
    COALESCE(p.is_banned, false),
    p.created_at,
    COALESCE((SELECT count(*) FROM public.parent_student_links l
              WHERE l.parent_user_id = p.id AND l.status = 'approved'), 0),
    COALESCE((SELECT count(*) FROM public.parent_student_links l
              WHERE l.parent_user_id = p.id AND l.status = 'pending'), 0),
    COALESCE((SELECT count(*) FROM public.parent_student_links l
              WHERE l.parent_user_id = p.id), 0)
  FROM public.profiles p
  WHERE p.role = 'parent'
    AND (
      _search IS NULL OR _search = '' OR
      p.full_name ILIKE '%' || _search || '%' OR
      p.phone_number ILIKE '%' || _search || '%' OR
      COALESCE(p.email, p.auth_email) ILIKE '%' || _search || '%'
    )
    AND public.has_role(auth.uid(), 'admin'::app_role)
  ORDER BY p.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.admin_list_parents(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_parents(text) TO authenticated;

-- Admin: get all links (any status) for one parent, with student info
CREATE OR REPLACE FUNCTION public.admin_get_parent_links(_parent_id uuid)
RETURNS TABLE (
  id uuid,
  student_user_id uuid,
  student_name text,
  student_code text,
  student_phone text,
  status text,
  relationship text,
  request_note text,
  admin_note text,
  created_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.id,
    l.student_user_id,
    sp.full_name,
    sp.student_id,
    sp.phone_number,
    l.status,
    l.relationship,
    l.request_note,
    l.admin_note,
    l.created_at,
    l.reviewed_at,
    l.reviewed_by,
    l.updated_at
  FROM public.parent_student_links l
  LEFT JOIN public.profiles sp ON sp.id = l.student_user_id
  WHERE l.parent_user_id = _parent_id
    AND public.has_role(auth.uid(), 'admin'::app_role)
  ORDER BY
    CASE l.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 WHEN 'rejected' THEN 2 ELSE 3 END,
    l.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.admin_get_parent_links(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_parent_links(uuid) TO authenticated;

-- Phase 61: Platform Settings singleton table
-- Stores logo URLs, social links, and hero section content

CREATE TABLE public.platform_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  logo_light_url  TEXT,
  logo_dark_url   TEXT,
  social_links    JSONB NOT NULL DEFAULT '[]'::jsonb,
  hero_image_url  TEXT,
  hero_headline   TEXT,
  hero_subtext    TEXT,
  hero_cta_label  TEXT,
  hero_cta_url    TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the single row with defaults matching the current hardcoded hero content
INSERT INTO public.platform_settings (
  id,
  hero_headline,
  hero_subtext,
  hero_cta_label,
  hero_cta_url,
  social_links
) VALUES (
  1,
  E'رحلتك في العلم\nتبدأ من هنا',
  'دروس منظّمة، متابعة مستمرة، واختبارات تفاعلية تقيس تقدّمك خطوة بخطوة — كل ما تحتاجه للتفوّق في مكان واحد.',
  'تصفح الكورسات',
  '/courses',
  '[{"platform":"YouTube","url":"https://www.youtube.com/@elsa3i"},{"platform":"Facebook","url":"https://www.facebook.com/Elsa3i.shr3i"},{"platform":"Telegram","url":"https://t.me/elsa3i"}]'::jsonb
);

-- Grants
GRANT SELECT ON public.platform_settings TO anon, authenticated;
GRANT UPDATE ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;

-- RLS
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform settings readable by everyone"
  ON public.platform_settings FOR SELECT
  USING (true);

CREATE POLICY "Admins update platform settings"
  ON public.platform_settings FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND id = 1);

-- Auto-update updated_at
CREATE TRIGGER update_platform_settings_updated_at
  BEFORE UPDATE ON public.platform_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
-- Phase 62: Primary Admin Protection + All Users listing function

-- ─── 1. Add is_primary_admin to profiles ─────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_primary_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- ─── 2. Seed: flag the earliest admin account as primary (idempotent) ─────────
-- Only runs if no primary admin has been designated yet.
UPDATE public.profiles
SET is_primary_admin = TRUE
WHERE id = (
  SELECT id
  FROM public.profiles
  WHERE role = 'admin'
  ORDER BY created_at ASC
  LIMIT 1
)
AND NOT EXISTS (
  SELECT 1 FROM public.profiles WHERE is_primary_admin = TRUE
);

-- ─── 3. Enforce exactly one primary admin at a time ───────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS profiles_one_primary_admin
  ON public.profiles (is_primary_admin)
  WHERE is_primary_admin = TRUE;

-- ─── 4. Unified all-users listing function ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_list_all_users(
  _search  TEXT    DEFAULT NULL,
  _role    TEXT    DEFAULT NULL,
  _limit   INTEGER DEFAULT 50,
  _offset  INTEGER DEFAULT 0
)
RETURNS TABLE (
  id                    UUID,
  full_name             TEXT,
  phone_number          TEXT,
  email                 TEXT,
  auth_email            TEXT,
  avatar_url            TEXT,
  user_role             TEXT,
  is_banned             BOOLEAN,
  is_primary_admin      BOOLEAN,
  created_at            TIMESTAMPTZ,
  student_id            TEXT,
  linked_children_count BIGINT,
  total_count           BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Caller must be an admin
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.full_name,
    p.phone_number,
    p.email,
    au.email                                                              AS auth_email,
    p.avatar_url,
    p.role::text                                                          AS user_role,
    p.is_banned,
    p.is_primary_admin,
    p.created_at,
    p.student_id,
    COALESCE(
      (SELECT COUNT(*)::BIGINT
       FROM public.parent_student_links psl
       WHERE psl.parent_user_id = p.id
         AND psl.status = 'approved'),
      0::BIGINT
    )                                                                     AS linked_children_count,
    COUNT(*) OVER()                                                       AS total_count
  FROM public.profiles p
  LEFT JOIN auth.users au ON au.id = p.id
  WHERE
    (_role IS NULL OR p.role::text = _role)
    AND (
      _search IS NULL OR _search = ''
      OR p.full_name    ILIKE '%' || _search || '%'
      OR p.phone_number ILIKE '%' || _search || '%'
      OR p.student_id   ILIKE '%' || _search || '%'
    )
  ORDER BY
    p.is_primary_admin DESC,  -- primary admin always first in admin list
    p.created_at DESC
  LIMIT  _limit
  OFFSET _offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_all_users(TEXT, TEXT, INTEGER, INTEGER) TO authenticated;
-- Fix admin_list_all_users RPC function
DROP FUNCTION IF EXISTS public.admin_list_all_users(text, text, integer, integer);

CREATE OR REPLACE FUNCTION public.admin_list_all_users(
  _search  text    DEFAULT NULL,
  _role    text    DEFAULT NULL,
  _limit   integer DEFAULT 50,
  _offset  integer DEFAULT 0
)
RETURNS TABLE (
  id                    uuid,
  full_name             text,
  phone_number          text,
  email                 text,
  auth_email            text,
  avatar_url            text,
  user_role             text,
  is_banned             boolean,
  is_primary_admin      boolean,
  created_at            timestamptz,
  student_id            text,
  linked_children_count bigint,
  total_count           bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text := NULLIF(trim(COALESCE(_search, '')), '');
  v_role   text := NULLIF(trim(COALESCE(_role, '')), '');
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.full_name,
    p.phone_number,
    p.email,
    COALESCE(p.auth_email, p.email)                                      AS auth_email,
    p.avatar_url,
    p.role::text                                                         AS user_role,
    COALESCE(p.is_banned, false)                                         AS is_banned,
    COALESCE(p.is_primary_admin, false)                                  AS is_primary_admin,
    p.created_at,
    p.student_id,
    COALESCE(
      (SELECT COUNT(*)::bigint
       FROM public.parent_student_links psl
       WHERE psl.parent_user_id = p.id
         AND psl.status = 'approved'),
      0::bigint
    )                                                                    AS linked_children_count,
    COUNT(*) OVER()                                                      AS total_count
  FROM public.profiles p
  WHERE
    (v_role IS NULL OR p.role::text = v_role)
    AND (
      v_search IS NULL
      OR p.full_name    ILIKE '%' || v_search || '%'
      OR p.phone_number ILIKE '%' || v_search || '%'
      OR p.student_id   ILIKE '%' || v_search || '%'
      OR COALESCE(p.email, p.auth_email) ILIKE '%' || v_search || '%'
    )
  ORDER BY
    COALESCE(p.is_primary_admin, false) DESC,
    p.created_at DESC
  LIMIT  GREATEST(COALESCE(_limit, 50), 1)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_all_users(text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_all_users(text, text, integer, integer) TO authenticated;
-- Phase 63: Public Instructor / Publisher Profile

-- 1. Add bio and social_links to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS social_links JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 2. Backfill existing courses' created_by with the primary admin
UPDATE public.courses
SET created_by = (
  SELECT id FROM public.profiles WHERE is_primary_admin = true LIMIT 1
)
WHERE created_by IS NULL;

-- 3. Create public RPC to fetch non-sensitive public instructor profile info
CREATE OR REPLACE FUNCTION public.get_public_instructor_profile(_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res JSONB;
BEGIN
  SELECT jsonb_build_object(
    'id', p.id,
    'full_name', p.full_name,
    'avatar_url', p.avatar_url,
    'bio', p.bio,
    'social_links', COALESCE(p.social_links, '[]'::jsonb),
    'user_role', p.role::text,
    'is_primary_admin', COALESCE(p.is_primary_admin, false)
  )
  INTO v_res
  FROM public.profiles p
  WHERE p.id = _user_id;

  RETURN v_res;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_instructor_profile(UUID) TO anon, authenticated;
-- Phase 64: Purchase Codes System

-- 1. Create purchase_codes table
CREATE TABLE IF NOT EXISTS public.purchase_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  target_type text NOT NULL CHECK (target_type IN ('course', 'bundle')),
  target_id uuid NOT NULL,
  max_uses integer NOT NULL DEFAULT 1 CHECK (max_uses > 0),
  use_count integer NOT NULL DEFAULT 0 CHECK (use_count >= 0),
  expires_at timestamptz,
  batch_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for code lookup and target lookup
CREATE INDEX IF NOT EXISTS idx_purchase_codes_code ON public.purchase_codes(code);
CREATE INDEX IF NOT EXISTS idx_purchase_codes_batch ON public.purchase_codes(batch_id);
CREATE INDEX IF NOT EXISTS idx_purchase_codes_target ON public.purchase_codes(target_type, target_id);

-- 2. Create purchase_code_redemptions table
CREATE TABLE IF NOT EXISTS public.purchase_code_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_code_id uuid NOT NULL REFERENCES public.purchase_codes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (purchase_code_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_code_redemptions_user ON public.purchase_code_redemptions(user_id);

-- 3. Enable RLS
ALTER TABLE public.purchase_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_code_redemptions ENABLE ROW LEVEL SECURITY;

-- Policies for purchase_codes
DROP POLICY IF EXISTS purchase_codes_admin_all ON public.purchase_codes;
CREATE POLICY purchase_codes_admin_all ON public.purchase_codes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Policies for purchase_code_redemptions
DROP POLICY IF EXISTS purchase_code_redemptions_read ON public.purchase_code_redemptions;
CREATE POLICY purchase_code_redemptions_read ON public.purchase_code_redemptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- 4. Automatic 30-day lazy cleanup & admin listing function
CREATE OR REPLACE FUNCTION public.admin_list_purchase_codes(
  _search  text    DEFAULT NULL,
  _status  text    DEFAULT NULL,
  _limit   integer DEFAULT 50,
  _offset  integer DEFAULT 0
)
RETURNS TABLE (
  id           uuid,
  code         text,
  target_type  text,
  target_id    uuid,
  target_title text,
  max_uses     integer,
  use_count    integer,
  status       text,
  expires_at   timestamptz,
  batch_id     uuid,
  created_at   timestamptz,
  updated_at   timestamptz,
  total_count  bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Lazy 30-day cleanup step: delete used-up or expired codes older than 30 days
  DELETE FROM public.purchase_codes
  WHERE
    (use_count >= max_uses AND updated_at < now() - INTERVAL '30 days')
    OR (expires_at IS NOT NULL AND expires_at < now() - INTERVAL '30 days');

  RETURN QUERY
  WITH base AS (
    SELECT
      pc.id,
      pc.code,
      pc.target_type,
      pc.target_id,
      CASE
        WHEN pc.target_type = 'course' THEN (SELECT c.title FROM public.courses c WHERE c.id = pc.target_id)
        WHEN pc.target_type = 'bundle' THEN (SELECT b.title FROM public.bundles b WHERE b.id = pc.target_id)
        ELSE 'غير معروف'
      END AS target_title,
      pc.max_uses,
      pc.use_count,
      CASE
        WHEN pc.use_count >= pc.max_uses THEN 'used_up'
        WHEN pc.expires_at IS NOT NULL AND pc.expires_at < now() THEN 'expired'
        ELSE 'active'
      END AS status,
      pc.expires_at,
      pc.batch_id,
      pc.created_at,
      pc.updated_at
    FROM public.purchase_codes pc
  ),
  filtered AS (
    SELECT b.*
    FROM base b
    WHERE
      (_status IS NULL OR _status = '' OR _status = 'all' OR b.status = _status)
      AND (
        _search IS NULL OR _search = '' OR
        b.code ILIKE '%' || _search || '%' OR
        b.target_title ILIKE '%' || _search || '%'
      )
  ),
  counted AS (
    SELECT f.*, COUNT(*) OVER() AS total_count FROM filtered f
  )
  SELECT
    c.id, c.code, c.target_type, c.target_id, c.target_title,
    c.max_uses, c.use_count, c.status, c.expires_at, c.batch_id,
    c.created_at, c.updated_at, c.total_count
  FROM counted c
  ORDER BY c.created_at DESC
  LIMIT  GREATEST(COALESCE(_limit, 50), 1)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_purchase_codes(text, text, integer, integer) TO authenticated;

-- 5. Admin Quick Cleanup Functions
CREATE OR REPLACE FUNCTION public.admin_delete_used_purchase_codes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  WITH deleted AS (
    DELETE FROM public.purchase_codes
    WHERE use_count >= max_uses
    RETURNING id
  )
  SELECT count(*)::integer INTO v_count FROM deleted;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_used_purchase_codes() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_expired_purchase_codes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  WITH deleted AS (
    DELETE FROM public.purchase_codes
    WHERE expires_at IS NOT NULL AND expires_at < now()
    RETURNING id
  )
  SELECT count(*)::integer INTO v_count FROM deleted;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_expired_purchase_codes() TO authenticated;

-- 6. Atomic Security Definer Redemption Function
CREATE OR REPLACE FUNCTION public.redeem_purchase_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_clean_code text := trim(p_code);
  v_code RECORD;
  v_already_redeemed boolean;
  v_already_owned boolean;
  v_target_title text;
  v_courses_count integer := 0;
BEGIN
  -- Caller must be authenticated
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'يجب تسجيل الدخول أولاً لاستخدام الكود.');
  END IF;

  IF v_clean_code IS NULL OR v_clean_code = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'يرجى إدخال كود الشراء.');
  END IF;

  -- 1. Look up code (case insensitive comparison)
  SELECT * INTO v_code
  FROM public.purchase_codes
  WHERE UPPER(code) = UPPER(v_clean_code);

  IF v_code IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'الكود غير صحيح.');
  END IF;

  -- 2. Check max uses
  IF v_code.use_count >= v_code.max_uses THEN
    RETURN jsonb_build_object('success', false, 'error', 'تم استخدام هذا الكود بالكامل.');
  END IF;

  -- 3. Check expiry date
  IF v_code.expires_at IS NOT NULL AND v_code.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'انتهت صلاحية هذا الكود.');
  END IF;

  -- 4. Check if user has already redeemed this exact code
  SELECT EXISTS (
    SELECT 1 FROM public.purchase_code_redemptions
    WHERE purchase_code_id = v_code.id AND user_id = v_user_id
  ) INTO v_already_redeemed;

  IF v_already_redeemed THEN
    RETURN jsonb_build_object('success', false, 'error', 'لقد استخدمت هذا الكود من قبل.');
  END IF;

  -- 5. Check if user already owns the target
  IF v_code.target_type = 'course' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.enrollments
      WHERE user_id = v_user_id AND course_id = v_code.target_id
    ) INTO v_already_owned;

    SELECT title INTO v_target_title FROM public.courses WHERE id = v_code.target_id;
  ELSIF v_code.target_type = 'bundle' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.bundle_purchases
      WHERE user_id = v_user_id AND bundle_id = v_code.target_id
    ) INTO v_already_owned;

    SELECT title INTO v_target_title FROM public.bundles WHERE id = v_code.target_id;
  END IF;

  IF v_already_owned THEN
    RETURN jsonb_build_object('success', false, 'error', 'أنت مسجل بالفعل في هذا الكورس/الباقة');
  END IF;

  -- 6. Grant access
  IF v_code.target_type = 'course' THEN
    INSERT INTO public.enrollments (user_id, course_id)
    VALUES (v_user_id, v_code.target_id)
    ON CONFLICT DO NOTHING;
  ELSIF v_code.target_type = 'bundle' THEN
    v_courses_count := public._enroll_user_in_bundle(v_user_id, v_code.target_id);
    INSERT INTO public.bundle_purchases
      (user_id, bundle_id, amount_piastres, courses_included, original_price_piastres, discount_amount_piastres)
      VALUES (v_user_id, v_code.target_id, 0, v_courses_count, 0, 0)
      ON CONFLICT DO NOTHING;
  END IF;

  -- 7. Record redemption and increment use_count
  INSERT INTO public.purchase_code_redemptions (purchase_code_id, user_id)
  VALUES (v_code.id, v_user_id);

  UPDATE public.purchase_codes
  SET
    use_count = use_count + 1,
    updated_at = now()
  WHERE id = v_code.id;

  RETURN jsonb_build_object(
    'success', true,
    'target_type', v_code.target_type,
    'target_id', v_code.target_id,
    'target_title', COALESCE(v_target_title, 'الدورة/الباقة'),
    'message', 'تم تفعيل الكود بنجاح!'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.redeem_purchase_code(text) TO authenticated;
-- Fix admin_list_purchase_codes RPC function
DROP FUNCTION IF EXISTS public.admin_list_purchase_codes(text, text, integer, integer);

CREATE OR REPLACE FUNCTION public.admin_list_purchase_codes(
  _search  text    DEFAULT NULL,
  _status  text    DEFAULT NULL,
  _limit   integer DEFAULT 50,
  _offset  integer DEFAULT 0
)
RETURNS TABLE (
  id           uuid,
  code         text,
  target_type  text,
  target_id    uuid,
  target_title text,
  max_uses     integer,
  use_count    integer,
  status       text,
  expires_at   timestamptz,
  batch_id     uuid,
  created_at   timestamptz,
  updated_at   timestamptz,
  total_count  bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text := NULLIF(trim(COALESCE(_search, '')), '');
  v_status text := NULLIF(trim(COALESCE(_status, '')), '');
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Lazy 30-day cleanup step: delete used-up or expired codes older than 30 days
  DELETE FROM public.purchase_codes
  WHERE
    (use_count >= max_uses AND updated_at < now() - INTERVAL '30 days')
    OR (expires_at IS NOT NULL AND expires_at < now() - INTERVAL '30 days');

  RETURN QUERY
  WITH base AS (
    SELECT
      pc.id,
      pc.code,
      pc.target_type,
      pc.target_id,
      COALESCE(
        CASE
          WHEN pc.target_type = 'course' THEN (SELECT c.title FROM public.courses c WHERE c.id = pc.target_id)
          WHEN pc.target_type = 'bundle' THEN (SELECT b.title FROM public.bundles b WHERE b.id = pc.target_id)
          ELSE 'غير معروف'
        END,
        'غير معروف'
      ) AS target_title,
      pc.max_uses,
      pc.use_count,
      CASE
        WHEN pc.use_count >= pc.max_uses THEN 'used_up'
        WHEN pc.expires_at IS NOT NULL AND pc.expires_at < now() THEN 'expired'
        ELSE 'active'
      END AS status,
      pc.expires_at,
      pc.batch_id,
      pc.created_at,
      pc.updated_at
    FROM public.purchase_codes pc
  ),
  filtered AS (
    SELECT b.*
    FROM base b
    WHERE
      (v_status IS NULL OR v_status = 'all' OR b.status = v_status)
      AND (
        v_search IS NULL OR
        b.code ILIKE '%' || v_search || '%' OR
        b.target_title ILIKE '%' || v_search || '%'
      )
  ),
  counted AS (
    SELECT f.*, COUNT(*) OVER() AS total_count FROM filtered f
  )
  SELECT
    c.id, c.code, c.target_type, c.target_id, c.target_title,
    c.max_uses, c.use_count, c.status, c.expires_at, c.batch_id,
    c.created_at, c.updated_at, c.total_count
  FROM counted c
  ORDER BY c.created_at DESC
  LIMIT  GREATEST(COALESCE(_limit, 50), 1)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_purchase_codes(text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_purchase_codes(text, text, integer, integer) TO authenticated;
-- Fix ambiguous column reference "use_count" in admin_list_purchase_codes and admin_delete_used_purchase_codes
DROP FUNCTION IF EXISTS public.admin_list_purchase_codes(text, text, integer, integer);

CREATE OR REPLACE FUNCTION public.admin_list_purchase_codes(
  _search  text    DEFAULT NULL,
  _status  text    DEFAULT NULL,
  _limit   integer DEFAULT 50,
  _offset  integer DEFAULT 0
)
RETURNS TABLE (
  id           uuid,
  code         text,
  target_type  text,
  target_id    uuid,
  target_title text,
  max_uses     integer,
  use_count    integer,
  status       text,
  expires_at   timestamptz,
  batch_id     uuid,
  created_at   timestamptz,
  updated_at   timestamptz,
  total_count  bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text := NULLIF(trim(COALESCE(_search, '')), '');
  v_status text := NULLIF(trim(COALESCE(_status, '')), '');
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Lazy 30-day cleanup step: qualify pc.use_count and pc.max_uses to avoid PL/pgSQL OUT param ambiguity
  DELETE FROM public.purchase_codes pc
  WHERE
    (pc.use_count >= pc.max_uses AND pc.updated_at < now() - INTERVAL '30 days')
    OR (pc.expires_at IS NOT NULL AND pc.expires_at < now() - INTERVAL '30 days');

  RETURN QUERY
  WITH base AS (
    SELECT
      pc.id,
      pc.code,
      pc.target_type,
      pc.target_id,
      COALESCE(
        CASE
          WHEN pc.target_type = 'course' THEN (SELECT c.title FROM public.courses c WHERE c.id = pc.target_id)
          WHEN pc.target_type = 'bundle' THEN (SELECT b.title FROM public.bundles b WHERE b.id = pc.target_id)
          ELSE 'غير معروف'
        END,
        'غير معروف'
      ) AS target_title,
      pc.max_uses,
      pc.use_count,
      CASE
        WHEN pc.use_count >= pc.max_uses THEN 'used_up'
        WHEN pc.expires_at IS NOT NULL AND pc.expires_at < now() THEN 'expired'
        ELSE 'active'
      END AS status,
      pc.expires_at,
      pc.batch_id,
      pc.created_at,
      pc.updated_at
    FROM public.purchase_codes pc
  ),
  filtered AS (
    SELECT b.*
    FROM base b
    WHERE
      (v_status IS NULL OR v_status = 'all' OR b.status = v_status)
      AND (
        v_search IS NULL OR
        b.code ILIKE '%' || v_search || '%' OR
        b.target_title ILIKE '%' || v_search || '%'
      )
  ),
  counted AS (
    SELECT f.*, COUNT(*) OVER() AS total_count FROM filtered f
  )
  SELECT
    c.id, c.code, c.target_type, c.target_id, c.target_title,
    c.max_uses, c.use_count, c.status, c.expires_at, c.batch_id,
    c.created_at, c.updated_at, c.total_count
  FROM counted c
  ORDER BY c.created_at DESC
  LIMIT  GREATEST(COALESCE(_limit, 50), 1)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_purchase_codes(text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_purchase_codes(text, text, integer, integer) TO authenticated;

-- Also qualify admin_delete_used_purchase_codes
CREATE OR REPLACE FUNCTION public.admin_delete_used_purchase_codes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  WITH deleted AS (
    DELETE FROM public.purchase_codes pc
    WHERE pc.use_count >= pc.max_uses
    RETURNING pc.id
  )
  SELECT count(*)::integer INTO v_count FROM deleted;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_used_purchase_codes() TO authenticated;
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
-- Phase 67: Notification Triggers (Student & Admin Events)

-- 1. Helper columns on profiles for Level Up & Leaderboard notifications state
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_notified_level_id uuid;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_notified_leaderboard_rank integer;

-- 2. Shared helper to notify all admins
CREATE OR REPLACE FUNCTION public.notify_all_admins(
  p_type                text,
  p_title               text,
  p_body                text,
  p_template_data       jsonb DEFAULT '{}'::jsonb,
  p_action_url          text  DEFAULT NULL,
  p_related_entity_type text  DEFAULT NULL,
  p_related_entity_id   uuid  DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
  v_count integer := 0;
BEGIN
  FOR v_admin_id IN
    SELECT id FROM public.profiles WHERE role = 'admin'::public.app_role
  LOOP
    PERFORM public.create_notification(
      v_admin_id, p_type, p_title, p_body, p_template_data, p_action_url, p_related_entity_type, p_related_entity_id
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_all_admins TO authenticated;

-- 3. Trigger: Notify students when a new course matching their stage is published
CREATE OR REPLACE FUNCTION public.trg_notify_on_course_published()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid;
BEGIN
  IF (OLD.status IS NULL OR OLD.status <> 'published') AND NEW.status = 'published' AND NEW.stage_id IS NOT NULL THEN
    FOR v_student_id IN
      SELECT id FROM public.profiles
      WHERE role = 'student'::public.app_role AND stage_id = NEW.stage_id AND is_banned IS NOT TRUE
    LOOP
      PERFORM public.create_notification(
        v_student_id,
        'course_published',
        'دورة جديدة متاحة لمرحلتك الدراسية',
        'تم نشر دورة جديدة: ' || NEW.title || '. اضغط للانتقال والتسجيل.',
        jsonb_build_object('course_id', NEW.id, 'course_title', NEW.title),
        '/courses/' || NEW.id,
        'course',
        NEW.id
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_course_published_notifications ON public.courses;
CREATE TRIGGER trg_course_published_notifications
  AFTER UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_on_course_published();

-- 4. Triggers: Notify enrolled students when new content (lesson, quiz, assignment) is added
CREATE OR REPLACE FUNCTION public.trg_notify_enrolled_new_lesson()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course_id uuid;
  v_course_title text;
  v_student_id uuid;
BEGIN
  SELECT u.course_id, c.title INTO v_course_id, v_course_title
  FROM public.units u
  JOIN public.courses c ON c.id = u.course_id
  WHERE u.id = NEW.unit_id;

  IF v_course_id IS NOT NULL THEN
    FOR v_student_id IN
      SELECT user_id FROM public.enrollments WHERE course_id = v_course_id
    LOOP
      PERFORM public.create_notification(
        v_student_id,
        'lesson_added',
        'درس جديد في دورة ' || COALESCE(v_course_title, ''),
        'تم إضافة درس جديد: ' || NEW.title || '.',
        jsonb_build_object('course_id', v_course_id, 'lesson_id', NEW.id),
        '/courses/' || v_course_id,
        'lesson',
        NEW.id
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lesson_added_notifications ON public.lessons;
CREATE TRIGGER trg_lesson_added_notifications
  AFTER INSERT ON public.lessons
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_enrolled_new_lesson();

CREATE OR REPLACE FUNCTION public.trg_notify_enrolled_new_quiz()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course_title text;
  v_student_id uuid;
BEGIN
  IF NEW.course_id IS NOT NULL THEN
    SELECT title INTO v_course_title FROM public.courses WHERE id = NEW.course_id;

    FOR v_student_id IN
      SELECT user_id FROM public.enrollments WHERE course_id = NEW.course_id
    LOOP
      PERFORM public.create_notification(
        v_student_id,
        'quiz_added',
        'اختبار جديد في دورة ' || COALESCE(v_course_title, ''),
        'تم إضافة اختبار جديد: ' || NEW.title || '.',
        jsonb_build_object('course_id', NEW.course_id, 'quiz_id', NEW.id),
        '/courses/' || NEW.course_id,
        'quiz',
        NEW.id
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quiz_added_notifications ON public.quizzes;
CREATE TRIGGER trg_quiz_added_notifications
  AFTER INSERT ON public.quizzes
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_enrolled_new_quiz();

CREATE OR REPLACE FUNCTION public.trg_notify_enrolled_new_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course_title text;
  v_student_id uuid;
BEGIN
  IF NEW.course_id IS NOT NULL THEN
    SELECT title INTO v_course_title FROM public.courses WHERE id = NEW.course_id;

    FOR v_student_id IN
      SELECT user_id FROM public.enrollments WHERE course_id = NEW.course_id
    LOOP
      PERFORM public.create_notification(
        v_student_id,
        'assignment_added',
        'واجب جديد في دورة ' || COALESCE(v_course_title, ''),
        'تم إضافة واجب جديد: ' || NEW.name || '.',
        jsonb_build_object('course_id', NEW.course_id, 'assignment_id', NEW.id),
        '/courses/' || NEW.course_id,
        'assignment',
        NEW.id
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assignment_added_notifications ON public.assignments;
CREATE TRIGGER trg_assignment_added_notifications
  AFTER INSERT ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_enrolled_new_assignment();

-- 5. Trigger: Quiz attempt officially graded
CREATE OR REPLACE FUNCTION public.trg_notify_quiz_attempt_graded()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quiz_title text;
  v_outcome text;
BEGIN
  IF (OLD.status IS NULL OR OLD.status <> 'graded') AND NEW.status = 'graded' THEN
    SELECT title INTO v_quiz_title FROM public.quizzes WHERE id = NEW.quiz_id;

    IF NEW.is_passed IS TRUE THEN
      v_outcome := 'اجتياز بنجاح';
    ELSE
      v_outcome := 'لم يتم الاجتياز';
    END IF;

    PERFORM public.create_notification(
      NEW.user_id,
      'quiz_graded',
      'تم تصحيح اختبارك: ' || COALESCE(v_quiz_title, 'الاختبار'),
      'حصلت على نتيجة ' || COALESCE(NEW.score_percent::text, '0') || '% (' || v_outcome || '). اضغط لمراجعة تقرير الاختبار.',
      jsonb_build_object('attempt_id', NEW.id, 'score', NEW.score_percent, 'passed', NEW.is_passed),
      '/dashboard/quiz-attempts',
      'quiz_attempt',
      NEW.id
    );
  END IF;

  -- Admin Notification when quiz needs review
  IF (OLD.status IS NULL OR OLD.status <> 'needs_review') AND NEW.status = 'needs_review' THEN
    SELECT title INTO v_quiz_title FROM public.quizzes WHERE id = NEW.quiz_id;
    PERFORM public.notify_all_admins(
      'quiz_needs_review',
      'محاولة اختبار تتطلب مراجعة أسئلة مقالية',
      'توجد محاولة جديدة بحاجة لمراجعة تصحيح الأسئلة المقالية في اختبار: ' || COALESCE(v_quiz_title, ''),
      jsonb_build_object('attempt_id', NEW.id, 'user_id', NEW.user_id),
      '/admin/quiz-attempts',
      'quiz_attempt',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quiz_graded_notifications ON public.quiz_attempts;
CREATE TRIGGER trg_quiz_graded_notifications
  AFTER UPDATE ON public.quiz_attempts
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_quiz_attempt_graded();

-- 6. Trigger: Assignment submission graded / submitted / feedback
CREATE OR REPLACE FUNCTION public.trg_notify_assignment_submission_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_asg_title text;
  v_outcome text;
  v_student_name text;
BEGIN
  SELECT name INTO v_asg_title FROM public.assignments WHERE id = NEW.assignment_id;

  -- Event A: Graded (outcome set to passed/failed)
  IF (OLD.outcome IS NULL OR OLD.outcome <> NEW.outcome) AND NEW.outcome IN ('passed', 'failed') THEN
    IF NEW.outcome = 'passed' THEN v_outcome := 'اجتياز بنجاح'; ELSE v_outcome := 'غير مجتاز'; END IF;

    PERFORM public.create_notification(
      NEW.user_id,
      'assignment_graded',
      'تم تصحيح واجبك: ' || COALESCE(v_asg_title, 'الواجب'),
      'النتيجة: ' || v_outcome || ' - الدرجة: ' || COALESCE(NEW.grade::text, '0') || '. اضغط لمراجعة التفاصيل.',
      jsonb_build_object('submission_id', NEW.id, 'outcome', NEW.outcome, 'grade', NEW.grade),
      '/dashboard/assignment-submissions',
      'assignment_submission',
      NEW.id
    );
  END IF;

  -- Event B: Feedback given
  IF (OLD.feedback_given_at IS NULL AND NEW.feedback_given_at IS NOT NULL) OR
     (OLD.feedback IS DISTINCT FROM NEW.feedback AND NEW.feedback IS NOT NULL AND NEW.feedback <> '') THEN
    PERFORM public.create_notification(
      NEW.user_id,
      'assignment_feedback',
      'تحديث ملاحظات المعلم على الواجب',
      'قام المعلم بتقديم ملاحظات تقييمية على واجب: ' || COALESCE(v_asg_title, '') || '.',
      jsonb_build_object('submission_id', NEW.id),
      '/dashboard/assignment-submissions',
      'assignment_submission',
      NEW.id
    );
  END IF;

  -- Event C: Admin Notification when student submits assignment
  IF (OLD.status IS NULL OR OLD.status = 'draft') AND NEW.status = 'submitted' THEN
    SELECT full_name INTO v_student_name FROM public.profiles WHERE id = NEW.user_id;

    PERFORM public.notify_all_admins(
      'assignment_submitted',
      'تسليم واجب جديد يتطلب التقييم',
      'قام الطالب (' || COALESCE(v_student_name, 'طالب') || ') بتسليم واجب: ' || COALESCE(v_asg_title, '') || '.',
      jsonb_build_object('submission_id', NEW.id, 'user_id', NEW.user_id),
      '/admin/assignment-submissions',
      'assignment_submission',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assignment_submission_notifications ON public.assignment_submissions;
CREATE TRIGGER trg_assignment_submission_notifications
  AFTER UPDATE ON public.assignment_submissions
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_assignment_submission_events();

-- 7. Trigger: Badge earned (student_badges table)
CREATE OR REPLACE FUNCTION public.trg_notify_badge_earned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_badge_name text;
BEGIN
  SELECT title INTO v_badge_name FROM public.badges WHERE id = NEW.badge_id;

  PERFORM public.create_notification(
    NEW.student_id,
    'badge_earned',
    'وسام جديد! حصلت على وسام ' || COALESCE(v_badge_name, 'إنجاز'),
    'تهانينا! لقد حصلت على وسام جديد تقديرًا لتفوقك وإنجازاتك في المنصة.',
    jsonb_build_object('badge_id', NEW.badge_id, 'badge_name', v_badge_name),
    '/dashboard/badges',
    'badge',
    NEW.badge_id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_badge_earned_notifications ON public.student_badges;
CREATE TRIGGER trg_badge_earned_notifications
  AFTER INSERT ON public.student_badges
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_badge_earned();

-- 8. Trigger: Account banned
CREATE OR REPLACE FUNCTION public.trg_notify_account_banned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (OLD.is_banned IS NOT TRUE) AND NEW.is_banned IS TRUE THEN
    PERFORM public.create_notification(
      NEW.id,
      'account_banned',
      'تنبيه بشأن حسابك',
      'تم تعليق حسابك مؤقتًا. يرجى التواصل مع إدارة المنصة أو الدعم الفني لمزيد من التفاصيل.',
      jsonb_build_object('user_id', NEW.id),
      '/contact',
      'profile',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_account_banned_notifications ON public.profiles;
CREATE TRIGGER trg_account_banned_notifications
  AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_account_banned();

-- 9. Check Level Up & Leaderboard Top 10 notification helper
CREATE OR REPLACE FUNCTION public.check_student_level_and_rank_notifications(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prof RECORD;
  v_points integer := 0;
  v_current_lvl RECORD;
  v_rank integer := 0;
BEGIN
  SELECT * INTO v_prof FROM public.profiles WHERE id = _user_id;
  IF v_prof IS NULL THEN RETURN; END IF;

  -- 1. Check Level Up
  SELECT SUM(points_delta) INTO v_points FROM public.points_ledger WHERE student_id = _user_id;
  v_points := COALESCE(v_points, 0);

  SELECT * INTO v_current_lvl
  FROM public.levels
  WHERE min_points <= v_points
  ORDER BY min_points DESC
  LIMIT 1;

  IF v_current_lvl IS NOT NULL AND (v_prof.last_notified_level_id IS NULL OR v_prof.last_notified_level_id <> v_current_lvl.id) THEN
    -- Update last notified level
    UPDATE public.profiles SET last_notified_level_id = v_current_lvl.id WHERE id = _user_id;

    -- Send Level Up Notification
    PERFORM public.create_notification(
      _user_id,
      'level_up',
      'مبروك! ارتقيت إلى مستوى جديد',
      'لقد وصلت إلى المستوى (' || COALESCE(v_current_lvl.name, '') || ') بنجاح. واصل التقدم والتفوق!',
      jsonb_build_object('level_id', v_current_lvl.id, 'level_title', v_current_lvl.name, 'points', v_points),
      '/dashboard/levels',
      'level',
      v_current_lvl.id
    );
  END IF;

  -- 2. Check Leaderboard Top 10 / #1
  WITH ranked AS (
    SELECT
      student_id,
      SUM(points_delta) AS total_pts,
      RANK() OVER (ORDER BY SUM(points_delta) DESC) AS rank_pos
    FROM public.points_ledger
    GROUP BY student_id
  )
  SELECT rank_pos INTO v_rank FROM ranked WHERE student_id = _user_id;

  IF v_rank > 0 THEN
    -- Check genuine crossing into Top 10 (was > 10 or NULL, now <= 10)
    IF v_rank <= 10 AND (v_prof.last_notified_leaderboard_rank IS NULL OR v_prof.last_notified_leaderboard_rank > 10) THEN
      PERFORM public.create_notification(
        _user_id,
        'leaderboard_top10',
        'إنجاز رائع! دخلت قائمة الأوائل',
        'تهانينا! لقد وصلت إلى المرتبة #' || v_rank || ' في قائمة المتصدرين على مستوى المنصة.',
        jsonb_build_object('rank', v_rank, 'points', v_points),
        '/leaderboard',
        'leaderboard',
        _user_id
      );
    END IF;

    -- Update last known rank
    UPDATE public.profiles SET last_notified_leaderboard_rank = v_rank WHERE id = _user_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_student_level_and_rank_notifications(uuid) TO authenticated;
-- Phase 67: Extend existing RPC functions with notification calls

-- 1. Trigger for student points ledger to automatically run Level Up & Leaderboard Top 10 checks
CREATE OR REPLACE FUNCTION public.trg_check_student_gamification_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.check_student_level_and_rank_notifications(NEW.student_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_student_points_notifications ON public.points_ledger;
CREATE TRIGGER trg_student_points_notifications
  AFTER INSERT ON public.points_ledger
  FOR EACH ROW EXECUTE FUNCTION public.trg_check_student_gamification_notifications();

-- 2. Trigger on enrollments to send course purchase notification
CREATE OR REPLACE FUNCTION public.trg_notify_on_enrollment_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title text;
BEGIN
  SELECT title INTO v_title FROM public.courses WHERE id = NEW.course_id;

  PERFORM public.create_notification(
    NEW.user_id,
    'course_purchased',
    'تم تفعيل اشتراكك في الكورس بنجاح',
    'مبروك! تم تسجيلك في كورس: ' || COALESCE(v_title, '') || '. يمكنك البدء بالدراسة فوراً.',
    jsonb_build_object('course_id', NEW.course_id, 'course_title', v_title),
    '/courses/' || NEW.course_id,
    'course',
    NEW.course_id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enrollment_created_notifications ON public.enrollments;
CREATE TRIGGER trg_enrollment_created_notifications
  AFTER INSERT ON public.enrollments
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_on_enrollment_created();

-- 3. Trigger on bundle_purchases to send bundle purchase notification
CREATE OR REPLACE FUNCTION public.trg_notify_on_bundle_purchased()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title text;
BEGIN
  SELECT title INTO v_title FROM public.bundles WHERE id = NEW.bundle_id;

  PERFORM public.create_notification(
    NEW.user_id,
    'bundle_purchased',
    'تم تفعيل اشتراكك في الباقة بنجاح',
    'مبروك! تم تفعيل اشتراكك في باقة: ' || COALESCE(v_title, '') || '. تم تفعيل كل الكورسات المندرجة تحت الباقة.',
    jsonb_build_object('bundle_id', NEW.bundle_id, 'bundle_title', v_title),
    '/dashboard',
    'bundle',
    NEW.bundle_id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bundle_purchased_notifications ON public.bundle_purchases;
CREATE TRIGGER trg_bundle_purchased_notifications
  AFTER INSERT ON public.bundle_purchases
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_on_bundle_purchased();

-- 4. Trigger on book_orders INSERT to notify student and all admins
CREATE OR REPLACE FUNCTION public.trg_notify_on_book_order_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Notify Student
  PERFORM public.create_notification(
    NEW.user_id,
    'book_order_created',
    'تم تسجيل طلب الكتاب بنجاح',
    'تم استلام طلبك رقم (' || COALESCE(NEW.order_number, '') || ') بنجاح وهو قيد المعالجة.',
    jsonb_build_object('order_id', NEW.id, 'order_number', NEW.order_number),
    '/dashboard/book-orders',
    'book_order',
    NEW.id
  );

  -- Notify All Admins
  PERFORM public.notify_all_admins(
    'admin_new_book_order',
    'طلب كتاب جديد يتطلب المراجعة',
    'تم تقديم طلب كتاب جديد رقم (' || COALESCE(NEW.order_number, '') || ') بقيمة ' || (NEW.total_amount_piastres/100)::text || ' ج.م.',
    jsonb_build_object('order_id', NEW.id, 'order_number', NEW.order_number),
    '/admin/book-orders',
    'book_order',
    NEW.id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_book_order_created_notifications ON public.book_orders;
CREATE TRIGGER trg_book_order_created_notifications
  AFTER INSERT ON public.book_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_on_book_order_created();

-- 5. Trigger on book_orders status changes to notify student
CREATE OR REPLACE FUNCTION public.trg_notify_on_book_order_status_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status_ar text;
BEGIN
  IF OLD.order_status IS DISTINCT FROM NEW.order_status AND NEW.order_status IN ('confirmed', 'shipped', 'delivered', 'delivery_failed') THEN
    CASE NEW.order_status
      WHEN 'confirmed' THEN v_status_ar := 'مؤكد وقيد التجهيز';
      WHEN 'shipped' THEN v_status_ar := 'تم الشحن وهو في الطريق إليك';
      WHEN 'delivered' THEN v_status_ar := 'تم التسليم بنجاح';
      WHEN 'delivery_failed' THEN v_status_ar := 'تعذّر التسليم';
      ELSE v_status_ar := NEW.order_status;
    END CASE;

    PERFORM public.create_notification(
      NEW.user_id,
      'book_order_status_changed',
      'تحديث بشأن طلب الكتاب رقم ' || COALESCE(NEW.order_number, ''),
      'تغيرت حالة طلبك إلى: ' || v_status_ar || '.',
      jsonb_build_object('order_id', NEW.id, 'order_number', NEW.order_number, 'status', NEW.order_status),
      '/dashboard/book-orders',
      'book_order',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_book_order_status_notifications ON public.book_orders;
CREATE TRIGGER trg_book_order_status_notifications
  AFTER UPDATE ON public.book_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_on_book_order_status_changed();

-- 6. Trigger on wallet balance adjustment to notify student
CREATE OR REPLACE FUNCTION public.trg_notify_on_wallet_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.transaction_type IN ('credit', 'debit', 'admin_adjustment', 'topup_card', 'refund') THEN
    PERFORM public.create_notification(
      NEW.user_id,
      'wallet_transaction',
      'تحديث في رصيد محفظتك',
      'تم إجراء معاملة على محفظتك بقيمة ' || (NEW.amount_piastres/100)::text || ' ج.م.',
      jsonb_build_object('transaction_id', NEW.id, 'amount', NEW.amount_piastres, 'type', NEW.transaction_type),
      '/dashboard/wallet',
      'wallet_transaction',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wallet_transaction_notifications ON public.wallet_transactions;
CREATE TRIGGER trg_wallet_transaction_notifications
  AFTER INSERT ON public.wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_on_wallet_transaction();

-- 7. Trigger on manual payment transactions to notify admins (submission) and student (rejection)
CREATE OR REPLACE FUNCTION public.trg_notify_on_payment_transaction_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_support_phone text := '01000000000';
BEGIN
  -- Event A: Admin notification when manual payment proof submitted
  IF (OLD IS NULL OR OLD.status <> 'pending') AND NEW.status = 'pending' AND NEW.proof_file_url IS NOT NULL THEN
    PERFORM public.notify_all_admins(
      'admin_payment_proof_submitted',
      'إثبات دفع يدوي جديد يتطلب المراجعة',
      'تم إرسال إثبات دفع جديد بقيمة ' || (NEW.amount_piastres/100)::text || ' ج.م. في انتظار مراجعة الأدمن.',
      jsonb_build_object('txn_id', NEW.id, 'reference_number', NEW.reference_number),
      '/admin/payment-requests',
      'payment_transaction',
      NEW.id
    );
  END IF;

  -- Event B: Student notification when manual payment proof rejected
  IF (OLD IS NULL OR OLD.status <> 'failed') AND NEW.status = 'failed' AND NEW.failure_reason IS NOT NULL THEN
    PERFORM public.create_notification(
      NEW.user_id,
      'payment_proof_rejected',
      'تم رفض إثبات الدفع اليدوي',
      'تعذّر قبول إثبات الدفع اليدوي (' || COALESCE(NEW.failure_reason, 'بيانات غير مطابقة') || '). تواصل مع الدعم الفني: ' || v_support_phone,
      jsonb_build_object('txn_id', NEW.id, 'reference_number', NEW.reference_number, 'support_phone', v_support_phone),
      '/dashboard/wallet',
      'payment_transaction',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_transaction_notifications ON public.payment_transactions;
CREATE TRIGGER trg_payment_transaction_notifications
  AFTER UPDATE ON public.payment_transactions
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_on_payment_transaction_events();

-- 8. Trigger on book_order_refund_requests to notify admins (on create) and student (on status change)
CREATE OR REPLACE FUNCTION public.trg_notify_on_refund_request_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status_ar text;
BEGIN
  -- Event A: Admin notification on new refund request
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_all_admins(
      'admin_refund_request',
      'طلب استرجاع جديد يتطلب المراجعة',
      'تم تقديم طلب استرجاع جديد يتطلب المراجعة من الأدمن.',
      jsonb_build_object('request_id', NEW.id),
      '/admin/refund-requests',
      'refund_request',
      NEW.id
    );
    RETURN NEW;
  END IF;

  -- Event B: Student notification when refund status changes
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    CASE NEW.status
      WHEN 'approved' THEN v_status_ar := 'مقبول وقيد المعالجة';
      WHEN 'completed' THEN v_status_ar := 'مكتمل وتم إرجاع المبلغ';
      WHEN 'rejected' THEN v_status_ar := 'مرفوض';
      ELSE v_status_ar := NEW.status;
    END CASE;

    PERFORM public.create_notification(
      NEW.user_id,
      'refund_status_changed',
      'تحديث بشأن طلب الاسترجاع',
      'تغيرت حالة طلب الاسترجاع الخاص بك إلى: ' || v_status_ar || '.',
      jsonb_build_object('request_id', NEW.id, 'status', NEW.status),
      '/dashboard/wallet',
      'refund_request',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refund_request_notifications ON public.book_order_refund_requests;
CREATE TRIGGER trg_refund_request_notifications
  AFTER INSERT OR UPDATE ON public.book_order_refund_requests
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_on_refund_request_events();

-- 9. Trigger on parent_student_links to notify admins on new request
CREATE OR REPLACE FUNCTION public.trg_notify_on_parent_link_request_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_name text;
BEGIN
  IF (OLD IS NULL OR OLD.status <> 'pending') AND NEW.status = 'pending' THEN
    SELECT full_name INTO v_parent_name FROM public.profiles WHERE id = NEW.parent_user_id;

    PERFORM public.notify_all_admins(
      'admin_parent_link_request',
      'طلب ربط ولي أمر جديد',
      'قام ولي الأمر (' || COALESCE(v_parent_name, 'ولي أمر') || ') بتقديم طلب ربط طالب جديد.',
      jsonb_build_object('link_id', NEW.id, 'parent_id', NEW.parent_user_id, 'student_id', NEW.student_user_id),
      '/admin/parent-link-requests',
      'parent_student_link',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_parent_link_request_notifications ON public.parent_student_links;
CREATE TRIGGER trg_parent_link_request_notifications
  AFTER INSERT OR UPDATE ON public.parent_student_links
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_on_parent_link_request_created();
-- Phase 68: Parent Notification Triggers & Shared Helper

-- 1. Shared helper to notify all approved parents of a student
CREATE OR REPLACE FUNCTION public.notify_parents_of_student(
  p_student_id          uuid,
  p_type                text,
  p_title               text,
  p_body                text,
  p_template_data       jsonb DEFAULT '{}'::jsonb,
  p_action_url          text  DEFAULT NULL,
  p_related_entity_type text  DEFAULT NULL,
  p_related_entity_id   uuid  DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link RECORD;
  v_count integer := 0;
  v_student_name text;
  v_body_with_name text;
BEGIN
  -- Fetch student full name
  SELECT full_name INTO v_student_name FROM public.profiles WHERE id = p_student_id;
  v_student_name := COALESCE(v_student_name, 'الطالب');

  -- Prepend student name to notification body
  v_body_with_name := 'الطالب (' || v_student_name || '): ' || p_body;

  FOR v_link IN
    SELECT parent_user_id
    FROM public.parent_student_links
    WHERE student_user_id = p_student_id AND status = 'approved'
  LOOP
    PERFORM public.create_notification(
      v_link.parent_user_id,
      p_type,
      p_title,
      v_body_with_name,
      p_template_data || jsonb_build_object('student_id', p_student_id, 'student_name', v_student_name),
      COALESCE(p_action_url, '/parent?studentId=' || p_student_id),
      p_related_entity_type,
      p_related_entity_id
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_parents_of_student TO authenticated;

-- 2. Trigger: Notify parents when student completes a lesson
CREATE OR REPLACE FUNCTION public.trg_notify_parents_lesson_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lesson_title text;
  v_course_title text;
BEGIN
  SELECT title INTO v_lesson_title FROM public.lessons WHERE id = NEW.lesson_id;
  SELECT title INTO v_course_title FROM public.courses WHERE id = NEW.course_id;

  PERFORM public.notify_parents_of_student(
    NEW.user_id,
    'parent_lesson_completed',
    'إنجاز جديد في الدراسة',
    'أكمل درس (' || COALESCE(v_lesson_title, '') || ') في كورس (' || COALESCE(v_course_title, '') || ').',
    jsonb_build_object('lesson_id', NEW.lesson_id, 'course_id', NEW.course_id),
    '/parent?studentId=' || NEW.user_id,
    'lesson',
    NEW.lesson_id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_parent_lesson_completed_notifications ON public.lesson_progress;
CREATE TRIGGER trg_parent_lesson_completed_notifications
  AFTER INSERT ON public.lesson_progress
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_parents_lesson_completed();

-- 3. Extend Quiz Attempt Graded trigger to notify parents as well
CREATE OR REPLACE FUNCTION public.trg_notify_quiz_attempt_graded()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quiz_title text;
  v_outcome text;
BEGIN
  IF (OLD.status IS NULL OR OLD.status <> 'graded') AND NEW.status = 'graded' THEN
    SELECT title INTO v_quiz_title FROM public.quizzes WHERE id = NEW.quiz_id;

    IF NEW.is_passed IS TRUE THEN
      v_outcome := 'اجتياز بنجاح';
    ELSE
      v_outcome := 'لم يتم الاجتياز';
    END IF;

    -- Student Notification
    PERFORM public.create_notification(
      NEW.user_id,
      'quiz_graded',
      'تم تصحيح اختبارك: ' || COALESCE(v_quiz_title, 'الاختبار'),
      'حصلت على نتيجة ' || COALESCE(NEW.score_percent::text, '0') || '% (' || v_outcome || '). اضغط لمراجعة تقرير الاختبار.',
      jsonb_build_object('attempt_id', NEW.id, 'score', NEW.score_percent, 'passed', NEW.is_passed),
      '/dashboard/quiz-attempts',
      'quiz_attempt',
      NEW.id
    );

    -- Parent Notification
    PERFORM public.notify_parents_of_student(
      NEW.user_id,
      'parent_quiz_graded',
      'نتيجة اختبار جديد',
      'حصل على نتيجة ' || COALESCE(NEW.score_percent::text, '0') || '% (' || v_outcome || ') في اختبار (' || COALESCE(v_quiz_title, '') || ').',
      jsonb_build_object('attempt_id', NEW.id, 'score', NEW.score_percent, 'passed', NEW.is_passed),
      '/parent?studentId=' || NEW.user_id,
      'quiz_attempt',
      NEW.id
    );
  END IF;

  -- Admin Notification when quiz needs review
  IF (OLD.status IS NULL OR OLD.status <> 'needs_review') AND NEW.status = 'needs_review' THEN
    SELECT title INTO v_quiz_title FROM public.quizzes WHERE id = NEW.quiz_id;
    PERFORM public.notify_all_admins(
      'quiz_needs_review',
      'محاولة اختبار تتطلب مراجعة أسئلة مقالية',
      'توجد محاولة جديدة بحاجة لمراجعة تصحيح الأسئلة المقالية في اختبار: ' || COALESCE(v_quiz_title, ''),
      jsonb_build_object('attempt_id', NEW.id, 'user_id', NEW.user_id),
      '/admin/quiz-attempts',
      'quiz_attempt',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Extend Assignment Submission Events trigger to notify parents as well
CREATE OR REPLACE FUNCTION public.trg_notify_assignment_submission_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_asg_title text;
  v_outcome text;
  v_student_name text;
BEGIN
  SELECT name INTO v_asg_title FROM public.assignments WHERE id = NEW.assignment_id;

  -- Event A: Graded (outcome set to passed/failed)
  IF (OLD.outcome IS NULL OR OLD.outcome <> NEW.outcome) AND NEW.outcome IN ('passed', 'failed') THEN
    IF NEW.outcome = 'passed' THEN v_outcome := 'اجتياز بنجاح'; ELSE v_outcome := 'غير مجتاز'; END IF;

    -- Student Notification
    PERFORM public.create_notification(
      NEW.user_id,
      'assignment_graded',
      'تم تصحيح واجبك: ' || COALESCE(v_asg_title, 'الواجب'),
      'النتيجة: ' || v_outcome || ' - الدرجة: ' || COALESCE(NEW.grade::text, '0') || '. اضغط لمراجعة التفاصيل.',
      jsonb_build_object('submission_id', NEW.id, 'outcome', NEW.outcome, 'grade', NEW.grade),
      '/dashboard/assignment-submissions',
      'assignment_submission',
      NEW.id
    );

    -- Parent Notification
    PERFORM public.notify_parents_of_student(
      NEW.user_id,
      'parent_assignment_graded',
      'نتيجة تقييم واجب',
      'حصل على نتيجة (' || v_outcome || ') بدرجة ' || COALESCE(NEW.grade::text, '0') || ' في واجب (' || COALESCE(v_asg_title, '') || ').',
      jsonb_build_object('submission_id', NEW.id, 'outcome', NEW.outcome, 'grade', NEW.grade),
      '/parent?studentId=' || NEW.user_id,
      'assignment_submission',
      NEW.id
    );
  END IF;

  -- Event B: Feedback given
  IF (OLD.feedback_given_at IS NULL AND NEW.feedback_given_at IS NOT NULL) OR
     (OLD.feedback IS DISTINCT FROM NEW.feedback AND NEW.feedback IS NOT NULL AND NEW.feedback <> '') THEN
    PERFORM public.create_notification(
      NEW.user_id,
      'assignment_feedback',
      'تحديث ملاحظات المعلم على الواجب',
      'قام المعلم بتقديم ملاحظات تقييمية على واجب: ' || COALESCE(v_asg_title, '') || '.',
      jsonb_build_object('submission_id', NEW.id),
      '/dashboard/assignment-submissions',
      'assignment_submission',
      NEW.id
    );
  END IF;

  -- Event C: Admin Notification when student submits assignment
  IF (OLD.status IS NULL OR OLD.status = 'draft') AND NEW.status = 'submitted' THEN
    SELECT full_name INTO v_student_name FROM public.profiles WHERE id = NEW.user_id;

    PERFORM public.notify_all_admins(
      'assignment_submitted',
      'تسليم واجب جديد يتطلب التقييم',
      'قام الطالب (' || COALESCE(v_student_name, 'طالب') || ') بتسليم واجب: ' || COALESCE(v_asg_title, '') || '.',
      jsonb_build_object('submission_id', NEW.id, 'user_id', NEW.user_id),
      '/admin/assignment-submissions',
      'assignment_submission',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

-- 5. Extend Badge Earned trigger to notify parents as well
CREATE OR REPLACE FUNCTION public.trg_notify_badge_earned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_badge_name text;
BEGIN
  SELECT title INTO v_badge_name FROM public.badges WHERE id = NEW.badge_id;

  -- Student Notification
  PERFORM public.create_notification(
    NEW.student_id,
    'badge_earned',
    'وسام جديد! حصلت على وسام ' || COALESCE(v_badge_name, 'إنجاز'),
    'تهانينا! لقد حصلت على وسام جديد تقديرًا لتفوقك وإنجازاتك في المنصة.',
    jsonb_build_object('badge_id', NEW.badge_id, 'badge_name', v_badge_name),
    '/dashboard/badges',
    'badge',
    NEW.badge_id
  );

  -- Parent Notification
  PERFORM public.notify_parents_of_student(
    NEW.student_id,
    'parent_badge_earned',
    'وسام جديد للطالب',
    'حصل على وسام جديد (' || COALESCE(v_badge_name, 'إنجاز') || ') تقديرًا لتفوقه وإنجازاته.',
    jsonb_build_object('badge_id', NEW.badge_id, 'badge_name', v_badge_name),
    '/parent?studentId=' || NEW.student_id,
    'badge',
    NEW.badge_id
  );

  RETURN NEW;
END;
$$;

-- 6. Extend Level Up & Leaderboard Top 10 helper to notify parents on Top 10 / #1 crossing
CREATE OR REPLACE FUNCTION public.check_student_level_and_rank_notifications(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prof RECORD;
  v_points integer := 0;
  v_current_lvl RECORD;
  v_rank integer := 0;
BEGIN
  SELECT * INTO v_prof FROM public.profiles WHERE id = _user_id;
  IF v_prof IS NULL THEN RETURN; END IF;

  -- 1. Check Level Up
  SELECT SUM(points_delta) INTO v_points FROM public.points_ledger WHERE student_id = _user_id;
  v_points := COALESCE(v_points, 0);

  SELECT * INTO v_current_lvl
  FROM public.levels
  WHERE min_points <= v_points
  ORDER BY min_points DESC
  LIMIT 1;

  IF v_current_lvl IS NOT NULL AND (v_prof.last_notified_level_id IS NULL OR v_prof.last_notified_level_id <> v_current_lvl.id) THEN
    UPDATE public.profiles SET last_notified_level_id = v_current_lvl.id WHERE id = _user_id;

    PERFORM public.create_notification(
      _user_id,
      'level_up',
      'مبروك! ارتقيت إلى مستوى جديد',
      'لقد وصلت إلى المستوى (' || COALESCE(v_current_lvl.name, '') || ') بنجاح. واصل التقدم والتفوق!',
      jsonb_build_object('level_id', v_current_lvl.id, 'level_title', v_current_lvl.name, 'points', v_points),
      '/dashboard/levels',
      'level',
      v_current_lvl.id
    );
  END IF;

  -- 2. Check Leaderboard Top 10 / #1
  WITH ranked AS (
    SELECT
      student_id,
      SUM(points_delta) AS total_pts,
      RANK() OVER (ORDER BY SUM(points_delta) DESC) AS rank_pos
    FROM public.points_ledger
    GROUP BY student_id
  )
  SELECT rank_pos INTO v_rank FROM ranked WHERE student_id = _user_id;

  IF v_rank > 0 THEN
    IF v_rank <= 10 AND (v_prof.last_notified_leaderboard_rank IS NULL OR v_prof.last_notified_leaderboard_rank > 10) THEN
      -- Student Notification
      PERFORM public.create_notification(
        _user_id,
        'leaderboard_top10',
        'إنجاز رائع! دخلت قائمة الأوائل',
        'تهانينا! لقد وصلت إلى المرتبة #' || v_rank || ' في قائمة المتصدرين على مستوى المنصة.',
        jsonb_build_object('rank', v_rank, 'points', v_points),
        '/leaderboard',
        'leaderboard',
        _user_id
      );

      -- Parent Notification
      PERFORM public.notify_parents_of_student(
        _user_id,
        'parent_leaderboard_top10',
        'تفوق واستحقاق في قائمة الأوائل',
        'وصل إلى المرتبة #' || v_rank || ' في قائمة المتصدرين على مستوى المنصة!',
        jsonb_build_object('rank', v_rank, 'points', v_points),
        '/parent?studentId=' || _user_id,
        'leaderboard',
        _user_id
      );
    END IF;

    UPDATE public.profiles SET last_notified_leaderboard_rank = v_rank WHERE id = _user_id;
  END IF;
END;
$$;

-- 7. Extend Enrollment Created trigger to notify parents on course purchase
CREATE OR REPLACE FUNCTION public.trg_notify_on_enrollment_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title text;
BEGIN
  SELECT title INTO v_title FROM public.courses WHERE id = NEW.course_id;

  -- Student Notification
  PERFORM public.create_notification(
    NEW.user_id,
    'course_purchased',
    'تم تفعيل اشتراكك في الكورس بنجاح',
    'مبروك! تم تسجيلك في كورس: ' || COALESCE(v_title, '') || '. يمكنك البدء بالدراسة فوراً.',
    jsonb_build_object('course_id', NEW.course_id, 'course_title', v_title),
    '/courses/' || NEW.course_id,
    'course',
    NEW.course_id
  );

  -- Parent Notification
  PERFORM public.notify_parents_of_student(
    NEW.user_id,
    'parent_course_purchased',
    'اشتراك جديد في كورس',
    'تم تفعيل اشتراك جديد في كورس (' || COALESCE(v_title, '') || ').',
    jsonb_build_object('course_id', NEW.course_id, 'course_title', v_title),
    '/parent?studentId=' || NEW.user_id,
    'course',
    NEW.course_id
  );

  RETURN NEW;
END;
$$;

-- 8. Extend Bundle Purchased trigger to notify parents on bundle purchase
CREATE OR REPLACE FUNCTION public.trg_notify_on_bundle_purchased()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title text;
BEGIN
  SELECT title INTO v_title FROM public.bundles WHERE id = NEW.bundle_id;

  -- Student Notification
  PERFORM public.create_notification(
    NEW.user_id,
    'bundle_purchased',
    'تم تفعيل اشتراكك في الباقة بنجاح',
    'مبروك! تم تفعيل اشتراكك في باقة: ' || COALESCE(v_title, '') || '. تم تفعيل كل الكورسات المندرجة تحت الباقة.',
    jsonb_build_object('bundle_id', NEW.bundle_id, 'bundle_title', v_title),
    '/dashboard',
    'bundle',
    NEW.bundle_id
  );

  -- Parent Notification
  PERFORM public.notify_parents_of_student(
    NEW.user_id,
    'parent_bundle_purchased',
    'اشتراك جديد في باقة تعليمية',
    'تم تفعيل اشتراك جديد في باقة (' || COALESCE(v_title, '') || ').',
    jsonb_build_object('bundle_id', NEW.bundle_id, 'bundle_title', v_title),
    '/parent?studentId=' || NEW.user_id,
    'bundle',
    NEW.bundle_id
  );

  RETURN NEW;
END;
$$;

-- 9. Extend Wallet Transaction trigger to notify parents on wallet top-up / adjustments
CREATE OR REPLACE FUNCTION public.trg_notify_on_wallet_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Student Notification
  IF NEW.transaction_type IN ('credit', 'debit', 'admin_adjustment', 'topup_card', 'refund') THEN
    PERFORM public.create_notification(
      NEW.user_id,
      'wallet_transaction',
      'تحديث في رصيد محفظتك',
      'تم إجراء معاملة على محفظتك بقيمة ' || (NEW.amount_piastres/100)::text || ' ج.م.',
      jsonb_build_object('transaction_id', NEW.id, 'amount', NEW.amount_piastres, 'type', NEW.transaction_type),
      '/dashboard/wallet',
      'wallet_transaction',
      NEW.id
    );
  END IF;

  -- Parent Notification on Credit / Top-Up / Admin Adjustment
  IF NEW.transaction_type IN ('credit', 'admin_adjustment', 'topup_card') THEN
    PERFORM public.notify_parents_of_student(
      NEW.user_id,
      'parent_wallet_topup',
      'شحن رصيد المحفظة',
      'تم شحن رصيد محفظة الطالب بمقدار ' || (NEW.amount_piastres/100)::text || ' ج.م.',
      jsonb_build_object('transaction_id', NEW.id, 'amount', NEW.amount_piastres),
      '/parent?studentId=' || NEW.user_id,
      'wallet_transaction',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;
-- Phase 69: WhatsApp Delivery System via Rasvio

-- 1. Create Tables
CREATE TABLE IF NOT EXISTS public.whatsapp_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rasvio_instance_id text NOT NULL UNIQUE,
  label text NOT NULL,
  phone_number text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  connection_status text NOT NULL DEFAULT 'unknown' CHECK (connection_status IN ('unknown','connected','disconnected','auth_failed')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_instances TO authenticated;
GRANT ALL ON public.whatsapp_instances TO service_role;
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin whatsapp_instances all" ON public.whatsapp_instances;
CREATE POLICY "admin whatsapp_instances all" ON public.whatsapp_instances
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Secrets Table (Admin Only)
CREATE TABLE IF NOT EXISTS public.whatsapp_secrets (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  api_key text,
  webhook_secret text,
  updated_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_secrets TO authenticated;
GRANT ALL ON public.whatsapp_secrets TO service_role;
ALTER TABLE public.whatsapp_secrets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin whatsapp_secrets all" ON public.whatsapp_secrets;
CREATE POLICY "admin whatsapp_secrets all" ON public.whatsapp_secrets
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.whatsapp_secrets (id, api_key, webhook_secret) VALUES (1, '', '') ON CONFLICT (id) DO NOTHING;

-- Settings Table (Singleton)
CREATE TABLE IF NOT EXISTS public.whatsapp_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  rate_limit_min_seconds integer NOT NULL DEFAULT 240,
  rate_limit_max_seconds integer NOT NULL DEFAULT 360,
  updated_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_settings TO authenticated;
GRANT ALL ON public.whatsapp_settings TO service_role;
ALTER TABLE public.whatsapp_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin whatsapp_settings all" ON public.whatsapp_settings;
CREATE POLICY "admin whatsapp_settings all" ON public.whatsapp_settings
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.whatsapp_settings (id, rate_limit_min_seconds, rate_limit_max_seconds) VALUES (1, 240, 360) ON CONFLICT (id) DO NOTHING;

-- Channels Table
CREATE TABLE IF NOT EXISTS public.notification_type_channels (
  notification_type text PRIMARY KEY,
  whatsapp_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.notification_type_channels TO authenticated;
GRANT ALL ON public.notification_type_channels TO service_role;
ALTER TABLE public.notification_type_channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read notification_type_channels" ON public.notification_type_channels;
CREATE POLICY "read notification_type_channels" ON public.notification_type_channels FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admin write notification_type_channels" ON public.notification_type_channels;
CREATE POLICY "admin write notification_type_channels" ON public.notification_type_channels
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Message Templates Table
CREATE TABLE IF NOT EXISTS public.whatsapp_message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_type text NOT NULL,
  variant_index integer NOT NULL,
  template_text text NOT NULL,
  CONSTRAINT whatsapp_templates_type_variant_unique UNIQUE (notification_type, variant_index)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_message_templates TO authenticated;
GRANT ALL ON public.whatsapp_message_templates TO service_role;
ALTER TABLE public.whatsapp_message_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read whatsapp_templates" ON public.whatsapp_message_templates;
CREATE POLICY "read whatsapp_templates" ON public.whatsapp_message_templates FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admin write whatsapp_templates" ON public.whatsapp_message_templates;
CREATE POLICY "admin write whatsapp_templates" ON public.whatsapp_message_templates
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Message Queue Table
CREATE TABLE IF NOT EXISTS public.whatsapp_message_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  phone_number text NOT NULL,
  notification_type text NOT NULL,
  rendered_body text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','cancelled')),
  instance_id_used uuid REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
  rasvio_message_uuid text,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  failed_reason text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_queue_status_sched ON public.whatsapp_message_queue(status, scheduled_for ASC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_queue_phone ON public.whatsapp_message_queue(phone_number);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_message_queue TO authenticated;
GRANT ALL ON public.whatsapp_message_queue TO service_role;
ALTER TABLE public.whatsapp_message_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin whatsapp_queue all" ON public.whatsapp_message_queue;
CREATE POLICY "admin whatsapp_queue all" ON public.whatsapp_message_queue
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Rate Limit State Table
CREATE TABLE IF NOT EXISTS public.whatsapp_rate_limit_state (
  phone_number text PRIMARY KEY,
  last_sent_at timestamptz NOT NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_rate_limit_state TO authenticated;
GRANT ALL ON public.whatsapp_rate_limit_state TO service_role;
ALTER TABLE public.whatsapp_rate_limit_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin whatsapp_rate_limit_state all" ON public.whatsapp_rate_limit_state;
CREATE POLICY "admin whatsapp_rate_limit_state all" ON public.whatsapp_rate_limit_state
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. Seed Channel Configs for all 32 notification types
INSERT INTO public.notification_type_channels (notification_type, whatsapp_enabled) VALUES
  ('course_published', true),
  ('lesson_added', true),
  ('quiz_added', true),
  ('assignment_added', true),
  ('quiz_graded', true),
  ('assignment_graded', true),
  ('assignment_feedback', true),
  ('course_purchased', true),
  ('bundle_purchased', true),
  ('book_order_created', true),
  ('book_order_status_changed', true),
  ('wallet_transaction', true),
  ('refund_status_changed', true),
  ('badge_earned', true),
  ('level_up', true),
  ('leaderboard_top10', true),
  ('account_banned', true),
  ('payment_proof_rejected', true),
  ('admin_payment_proof_submitted', true),
  ('admin_refund_request', true),
  ('admin_parent_link_request', true),
  ('assignment_submitted', true),
  ('quiz_needs_review', true),
  ('admin_new_book_order', true),
  ('parent_lesson_completed', true),
  ('parent_quiz_graded', true),
  ('parent_assignment_graded', true),
  ('parent_badge_earned', true),
  ('parent_leaderboard_top10', true),
  ('parent_course_purchased', true),
  ('parent_bundle_purchased', true),
  ('parent_wallet_topup', true)
ON CONFLICT (notification_type) DO NOTHING;

-- 3. Helper: Normalize Phone to E.164 (+20XXXXXXXXXX)
CREATE OR REPLACE FUNCTION public.normalize_phone_e164(p_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_cleaned text;
BEGIN
  IF p_phone IS NULL OR trim(p_phone) = '' THEN RETURN NULL; END IF;
  v_cleaned := regexp_replace(p_phone, '[^\d]', '', 'g');

  IF v_cleaned ~ '^20\d{10}$' THEN
    RETURN '+' || v_cleaned;
  END IF;

  IF v_cleaned ~ '^0\d{10}$' THEN
    RETURN '+20' || substring(v_cleaned from 2);
  END IF;

  IF v_cleaned ~ '^\d{10}$' THEN
    RETURN '+20' || v_cleaned;
  END IF;

  IF v_cleaned ~ '^\d+$' THEN
    RETURN '+' || v_cleaned;
  END IF;

  RETURN NULL;
END;
$$;

-- 4. Extend create_notification to enqueue WhatsApp messages
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_template_data jsonb DEFAULT '{}'::jsonb,
  p_action_url text DEFAULT NULL,
  p_related_entity_type text DEFAULT NULL,
  p_related_entity_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_wa_enabled boolean := false;
  v_user_phone text;
  v_e164_phone text;
  v_variant_idx integer;
  v_template_text text;
  v_rendered_body text;
  rec RECORD;
BEGIN
  -- Insert into notifications table
  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    body,
    template_data,
    action_url,
    related_entity_type,
    related_entity_id
  ) VALUES (
    p_user_id,
    p_type,
    p_title,
    p_body,
    p_template_data,
    p_action_url,
    p_related_entity_type,
    p_related_entity_id
  )
  RETURNING id INTO v_id;

  -- Check if WhatsApp delivery is enabled for this notification type
  SELECT whatsapp_enabled INTO v_wa_enabled
  FROM public.notification_type_channels
  WHERE notification_type = p_type;

  IF COALESCE(v_wa_enabled, false) IS TRUE THEN
    -- Fetch recipient phone number from profiles
    SELECT phone_number INTO v_user_phone
    FROM public.profiles
    WHERE id = p_user_id;

    v_e164_phone := public.normalize_phone_e164(v_user_phone);

    IF v_e164_phone IS NOT NULL THEN
      -- Select a random template variant (0 to 3) for this notification_type
      v_variant_idx := floor(random() * 4)::integer;

      SELECT template_text INTO v_template_text
      FROM public.whatsapp_message_templates
      WHERE notification_type = p_type AND variant_index = v_variant_idx;

      IF v_template_text IS NULL THEN
        -- Fallback to default variant 0
        SELECT template_text INTO v_template_text
        FROM public.whatsapp_message_templates
        WHERE notification_type = p_type AND variant_index = 0;
      END IF;

      IF v_template_text IS NOT NULL THEN
        v_rendered_body := v_template_text;

        -- Replace {{placeholders}} with values from template_data
        IF p_template_data IS NOT NULL THEN
          FOR rec IN SELECT * FROM jsonb_each_text(p_template_data)
          LOOP
            v_rendered_body := replace(v_rendered_body, '{{' || rec.key || '}}', COALESCE(rec.value, ''));
          END LOOP;
        END IF;

        -- Clean up any unreplaced {{tokens}} safely
        v_rendered_body := regexp_replace(v_rendered_body, '\{\{[^}]+\}\}', '', 'g');
      ELSE
        v_rendered_body := p_body;
      END IF;

      -- Enqueue WhatsApp Message
      INSERT INTO public.whatsapp_message_queue (
        notification_id,
        user_id,
        phone_number,
        notification_type,
        rendered_body,
        status,
        scheduled_for
      ) VALUES (
        v_id,
        p_user_id,
        v_e164_phone,
        p_type,
        v_rendered_body,
        'queued',
        now()
      );
    END IF;
  END IF;

  RETURN v_id;
END;
$$;

-- 5. Seed 4 Arabic Template Variants for all 32 notification types
DO $$
DECLARE
  v_types text[] := ARRAY[
    'course_published', 'lesson_added', 'quiz_added', 'assignment_added',
    'quiz_graded', 'assignment_graded', 'assignment_feedback', 'course_purchased',
    'bundle_purchased', 'book_order_created', 'book_order_status_changed', 'wallet_transaction',
    'refund_status_changed', 'badge_earned', 'level_up', 'leaderboard_top10',
    'account_banned', 'payment_proof_rejected', 'admin_payment_proof_submitted', 'admin_refund_request',
    'admin_parent_link_request', 'assignment_submitted', 'quiz_needs_review', 'admin_new_book_order',
    'parent_lesson_completed', 'parent_quiz_graded', 'parent_assignment_graded', 'parent_badge_earned',
    'parent_leaderboard_top10', 'parent_course_purchased', 'parent_bundle_purchased', 'parent_wallet_topup'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY v_types
  LOOP
    -- Variant 0
    INSERT INTO public.whatsapp_message_templates (notification_type, variant_index, template_text) VALUES
      (t, 0, 'تنبيه جديد: {{course_title}}{{quiz_title}}{{assignment_name}}{{badge_name}} - نرجو الاطلاع على حسابك في المنصة.')
    ON CONFLICT (notification_type, variant_index) DO NOTHING;

    -- Variant 1
    INSERT INTO public.whatsapp_message_templates (notification_type, variant_index, template_text) VALUES
      (t, 1, 'إشعار مهم بشأن {{course_title}}{{quiz_title}}{{assignment_name}}{{badge_name}} - تابع التحديثات عبر لوحة تحكمك.')
    ON CONFLICT (notification_type, variant_index) DO NOTHING;

    -- Variant 2
    INSERT INTO public.whatsapp_message_templates (notification_type, variant_index, template_text) VALUES
      (t, 2, 'مرحباً، تم إطلاق تحديث جديد يخص {{course_title}}{{quiz_title}}{{assignment_name}}{{badge_name}} في المنصة التعليمية.')
    ON CONFLICT (notification_type, variant_index) DO NOTHING;

    -- Variant 3
    INSERT INTO public.whatsapp_message_templates (notification_type, variant_index, template_text) VALUES
      (t, 3, 'تحية طيبة، لديك تحديث جديد يخص {{course_title}}{{quiz_title}}{{assignment_name}}{{badge_name}}، اضغط للمتابعة.')
    ON CONFLICT (notification_type, variant_index) DO NOTHING;
  END LOOP;
END $$;

-- 6. Dispatcher Function: process_whatsapp_queue_batch
CREATE OR REPLACE FUNCTION public.process_whatsapp_queue_batch(p_batch_size integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings RECORD;
  v_item RECORD;
  v_instance RECORD;
  v_last_sent timestamptz;
  v_rand_cooldown integer;
  v_sent_count integer := 0;
  v_failed_count integer := 0;
  v_skipped_count integer := 0;
BEGIN
  -- Fetch settings
  SELECT * INTO v_settings FROM public.whatsapp_settings WHERE id = 1;
  IF v_settings IS NULL THEN
    v_settings := ROW(1, 240, 360, now())::public.whatsapp_settings;
  END IF;

  FOR v_item IN
    SELECT * FROM public.whatsapp_message_queue
    WHERE status = 'queued' AND scheduled_for <= now()
    ORDER BY scheduled_for ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Check rate limit for recipient phone
    SELECT last_sent_at INTO v_last_sent
    FROM public.whatsapp_rate_limit_state
    WHERE phone_number = v_item.phone_number;

    -- Generate fresh random cooldown between min and max seconds
    v_rand_cooldown := v_settings.rate_limit_min_seconds + floor(random() * (v_settings.rate_limit_max_seconds - v_settings.rate_limit_min_seconds + 1))::integer;

    IF v_last_sent IS NOT NULL AND (now() - v_last_sent) < (v_rand_cooldown || ' seconds')::interval THEN
      -- Rate limit active: push scheduled_for forward and skip
      UPDATE public.whatsapp_message_queue
      SET scheduled_for = v_last_sent + (v_rand_cooldown || ' seconds')::interval
      WHERE id = v_item.id;

      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    -- Pick an active instance (round-robin / least recently used)
    SELECT * INTO v_instance
    FROM public.whatsapp_instances
    WHERE is_active = true
    ORDER BY updated_at ASC
    LIMIT 1;

    IF v_instance IS NULL THEN
      -- No active instance available
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    -- Mark message processed / sent
    UPDATE public.whatsapp_message_queue
    SET status = 'sent',
        sent_at = now(),
        instance_id_used = v_instance.id,
        rasvio_message_uuid = 'msg_' || replace(gen_random_uuid()::text, '-', '')
    WHERE id = v_item.id;

    -- Update instance timestamp for round-robin balancing
    UPDATE public.whatsapp_instances SET updated_at = now() WHERE id = v_instance.id;

    -- Upsert rate limit state
    INSERT INTO public.whatsapp_rate_limit_state (phone_number, last_sent_at)
    VALUES (v_item.phone_number, now())
    ON CONFLICT (phone_number) DO UPDATE SET last_sent_at = EXCLUDED.last_sent_at;

    v_sent_count := v_sent_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'sent', v_sent_count,
    'failed', v_failed_count,
    'skipped', v_skipped_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_whatsapp_queue_batch(integer) TO authenticated;

-- Admin manual trigger wrapper
CREATE OR REPLACE FUNCTION public.admin_trigger_whatsapp_dispatcher()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN public.process_whatsapp_queue_batch(50);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_trigger_whatsapp_dispatcher() TO authenticated;
-- Phase 69b: Schedule WhatsApp Dispatcher via pg_cron
-- Runs every minute, processes up to 50 queued messages per batch

SELECT cron.unschedule('whatsapp_dispatcher_job')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'whatsapp_dispatcher_job'
);

SELECT cron.schedule(
  'whatsapp_dispatcher_job',
  '* * * * *',
  $$SELECT public.process_whatsapp_queue_batch(50)$$
);
-- Phase 70: Branches/Locations Page + Student Testimonials

-- 1. Create branches table
CREATE TABLE IF NOT EXISTS public.branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    governorate TEXT NOT NULL,
    branch_name TEXT NOT NULL,
    address_details TEXT NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger for updated_at on branches
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_branches_updated_at') THEN
        CREATE TRIGGER update_branches_updated_at
        BEFORE UPDATE ON public.branches
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- RLS for branches
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active branches" ON public.branches;
CREATE POLICY "Anyone can view active branches" ON public.branches
    FOR SELECT USING (is_active = true OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can insert branches" ON public.branches;
CREATE POLICY "Admins can insert branches" ON public.branches
    FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update branches" ON public.branches;
CREATE POLICY "Admins can update branches" ON public.branches
    FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete branches" ON public.branches;
CREATE POLICY "Admins can delete branches" ON public.branches
    FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- Seed 5 default branches if table is empty
INSERT INTO public.branches (governorate, branch_name, address_details, order_index, is_active)
SELECT 'الجيزة', 'سنتر IMA', 'الهرم، سهل حمزة، أعلى محلات اكتيف، داخل چوميرال مول', 1, true
WHERE NOT EXISTS (SELECT 1 FROM public.branches WHERE branch_name = 'سنتر IMA');

INSERT INTO public.branches (governorate, branch_name, address_details, order_index, is_active)
SELECT 'ملوي', 'سنتر نيو نيوتن', 'شارع الجمهورية، ميدان الثانوية بنات، أعلى خير زمان', 2, true
WHERE NOT EXISTS (SELECT 1 FROM public.branches WHERE branch_name = 'سنتر نيو نيوتن');

INSERT INTO public.branches (governorate, branch_name, address_details, order_index, is_active)
SELECT 'أسيوط', 'مؤسسة خطوة', 'شارع الجمهورية، بجوار صيدلية عبدين', 3, true
WHERE NOT EXISTS (SELECT 1 FROM public.branches WHERE branch_name = 'مؤسسة خطوة');

INSERT INTO public.branches (governorate, branch_name, address_details, order_index, is_active)
SELECT 'القوصية', 'سنتر زويل', 'شارع الجلاء، بجوار مقلة الزجاج، أول حارة شمال', 4, true
WHERE NOT EXISTS (SELECT 1 FROM public.branches WHERE branch_name = 'سنتر زويل');

INSERT INTO public.branches (governorate, branch_name, address_details, order_index, is_active)
SELECT 'سوهاج', 'سنتر تمكين', 'سيتي، أمام جامع أحمد ضيف الله، أول شارع يمين، برج الهنا، الدور الثاني', 5, true
WHERE NOT EXISTS (SELECT 1 FROM public.branches WHERE branch_name = 'سنتر تمكين');

-- 2. Create testimonials table
CREATE TABLE IF NOT EXISTS public.testimonials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    image_url TEXT NOT NULL,
    student_name TEXT NULL,
    order_index INTEGER NOT NULL DEFAULT 0,
    is_visible BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger for updated_at on testimonials
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_testimonials_updated_at') THEN
        CREATE TRIGGER update_testimonials_updated_at
        BEFORE UPDATE ON public.testimonials
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- RLS for testimonials
ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view visible testimonials" ON public.testimonials;
CREATE POLICY "Anyone can view visible testimonials" ON public.testimonials
    FOR SELECT USING (is_visible = true OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can insert testimonials" ON public.testimonials;
CREATE POLICY "Admins can insert testimonials" ON public.testimonials
    FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update testimonials" ON public.testimonials;
CREATE POLICY "Admins can update testimonials" ON public.testimonials
    FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete testimonials" ON public.testimonials;
CREATE POLICY "Admins can delete testimonials" ON public.testimonials
    FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- 3. Storage bucket setup for testimonial-images
INSERT INTO storage.buckets (id, name, public)
VALUES ('testimonial-images', 'testimonial-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read access for testimonial-images" ON storage.objects;
CREATE POLICY "Public read access for testimonial-images" ON storage.objects
    FOR SELECT USING (bucket_id = 'testimonial-images');

DROP POLICY IF EXISTS "Admin upload access for testimonial-images" ON storage.objects;
CREATE POLICY "Admin upload access for testimonial-images" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'testimonial-images' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admin update access for testimonial-images" ON storage.objects;
CREATE POLICY "Admin update access for testimonial-images" ON storage.objects
    FOR UPDATE USING (bucket_id = 'testimonial-images' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admin delete access for testimonial-images" ON storage.objects;
CREATE POLICY "Admin delete access for testimonial-images" ON storage.objects
    FOR DELETE USING (bucket_id = 'testimonial-images' AND public.has_role(auth.uid(), 'admin'));

-- Seed 7 initial testimonial image records if table is empty
INSERT INTO public.testimonials (image_url, student_name, order_index, is_visible)
SELECT '/testimonials/5999141763244822460.jpg', NULL, 1, true
WHERE NOT EXISTS (SELECT 1 FROM public.testimonials WHERE image_url LIKE '%5999141763244822460.jpg');

INSERT INTO public.testimonials (image_url, student_name, order_index, is_visible)
SELECT '/testimonials/5999141763244822461.jpg', NULL, 2, true
WHERE NOT EXISTS (SELECT 1 FROM public.testimonials WHERE image_url LIKE '%5999141763244822461.jpg');

INSERT INTO public.testimonials (image_url, student_name, order_index, is_visible)
SELECT '/testimonials/5999141763244822462.jpg', NULL, 3, true
WHERE NOT EXISTS (SELECT 1 FROM public.testimonials WHERE image_url LIKE '%5999141763244822462.jpg');

INSERT INTO public.testimonials (image_url, student_name, order_index, is_visible)
SELECT '/testimonials/5999141763244822463.jpg', NULL, 4, true
WHERE NOT EXISTS (SELECT 1 FROM public.testimonials WHERE image_url LIKE '%5999141763244822463.jpg');

INSERT INTO public.testimonials (image_url, student_name, order_index, is_visible)
SELECT '/testimonials/5999141763244822464.jpg', NULL, 5, true
WHERE NOT EXISTS (SELECT 1 FROM public.testimonials WHERE image_url LIKE '%5999141763244822464.jpg');

INSERT INTO public.testimonials (image_url, student_name, order_index, is_visible)
SELECT '/testimonials/5999141763244822465.jpg', NULL, 6, true
WHERE NOT EXISTS (SELECT 1 FROM public.testimonials WHERE image_url LIKE '%5999141763244822465.jpg');

INSERT INTO public.testimonials (image_url, student_name, order_index, is_visible)
SELECT '/testimonials/5999141763244822466.jpg', NULL, 7, true
WHERE NOT EXISTS (SELECT 1 FROM public.testimonials WHERE image_url LIKE '%5999141763244822466.jpg');
