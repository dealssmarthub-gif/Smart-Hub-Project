-- 20261023120000_student_profile_fields.sql
-- "Are you a student?" at sign-up, saved as profile fields. Self-declared and
-- for display and filtering only: Student OS links, the "Student seller"
-- label, and the campus a student's marketplace starts at. Nothing that
-- publishes, scopes staff or decides access may read these columns:
-- has_role(), naflis_has_permission() and every RLS policy stay as they are,
-- and sign-up still only ever creates a buyer.
-- They are separate from profiles.institution_id, which protect_profile_roles
-- keeps for SRC and admins.

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS is_student BOOLEAN NOT NULL DEFAULT false,
    -- One of public.campuses; the institution follows from the campus.
    ADD COLUMN IF NOT EXISTS student_campus TEXT
        REFERENCES public.campuses(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- A campus only means something for a student.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_student_campus_needs_student;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_student_campus_needs_student
    CHECK (student_campus IS NULL OR is_student);

-- Accounts that already hold the student role are students.
UPDATE public.profiles SET is_student = true WHERE 'student' = ANY (roles) AND NOT is_student;

-- Sign-up: same as 20261015120000 (always a buyer, never a role from metadata),
-- plus the two self-declared fields. An unknown campus is dropped, not an error,
-- so a stale form can't block sign-up.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_student BOOLEAN := lower(coalesce(new.raw_user_meta_data->>'is_student', '')) IN ('true', 't', '1', 'yes');
    v_campus TEXT := nullif(trim(coalesce(new.raw_user_meta_data->>'student_campus', '')), '');
BEGIN
    IF NOT v_student OR NOT EXISTS (SELECT 1 FROM public.campuses c WHERE c.id = v_campus) THEN
        v_campus := NULL;
    END IF;
    INSERT INTO public.profiles (id, email, full_name, phone, role, roles, is_student, student_campus)
    VALUES (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
        coalesce(new.raw_user_meta_data->>'phone', new.raw_user_meta_data->>'phone_number', new.phone, ''),
        'buyer'::public.user_role,
        ARRAY['buyer']::TEXT[],
        v_student,
        v_campus
    );
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
