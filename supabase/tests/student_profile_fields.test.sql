-- Checks for 20261023120000_student_profile_fields: sign-up saves "Are you a
-- student?" and a campus as profile fields, never a role; users edit only their
-- own; and the fields are display-only: no policy or function uses them to
-- decide access. Same format as security_fixes.test.sql: plain SQL, one
-- transaction, ROLLED BACK, one row per check.
BEGIN;

CREATE TEMP TABLE _results (n SERIAL, check_name TEXT, pass BOOLEAN, detail TEXT) ON COMMIT DROP;
GRANT ALL ON _results TO anon, authenticated;
GRANT USAGE ON SEQUENCE _results_n_seq TO anon, authenticated;

-- Sign-ups (as the auth service: raw_user_meta_data is whatever the browser sent)
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
    ('00000000-0000-0000-0000-000000000ca1', 'sp.student@test.invalid',
     '{"full_name":"Ama","is_student":"true","student_campus":"UG - Legon","role":"super_admin","roles":["admin","src_head"]}'),
    ('00000000-0000-0000-0000-000000000ca2', 'sp.badcampus@test.invalid',
     '{"full_name":"Kofi","is_student":true,"student_campus":"Hogwarts"}'),
    ('00000000-0000-0000-0000-000000000ca3', 'sp.notstudent@test.invalid',
     '{"full_name":"Efua","is_student":"false","student_campus":"UG - Legon"}'),
    ('00000000-0000-0000-0000-000000000ca4', 'sp.plain@test.invalid', '{}');

INSERT INTO _results (check_name, pass, detail)
SELECT 'sign-up as a student saves the fields and still grants only buyer',
       role = 'buyer' AND roles = ARRAY['buyer']::TEXT[] AND is_student AND student_campus = 'UG - Legon',
       role || ' ' || roles::TEXT || ' ' || is_student || ' ' || coalesce(student_campus, 'null')
FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000ca1';

INSERT INTO _results (check_name, pass, detail)
SELECT 'an unknown campus is dropped, the student answer kept', is_student AND student_campus IS NULL,
       is_student || ' ' || coalesce(student_campus, 'null')
FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000ca2';

INSERT INTO _results (check_name, pass, detail)
SELECT 'not a student: no campus saved', NOT is_student AND student_campus IS NULL,
       is_student || ' ' || coalesce(student_campus, 'null')
FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000ca3';

INSERT INTO _results (check_name, pass, detail)
SELECT 'no answer: not a student', NOT is_student AND student_campus IS NULL AND roles = ARRAY['buyer']::TEXT[], roles::TEXT
FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000ca4';

-- Kofi (ca2) edits his own profile -------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000ca2","role":"authenticated"}', true);

UPDATE public.profiles SET student_campus = 'KNUST - Kumasi' WHERE id = auth.uid();
INSERT INTO _results (check_name, pass, detail)
SELECT 'a student can set their own campus', student_campus = 'KNUST - Kumasi', coalesce(student_campus, 'null')
FROM public.profiles WHERE id = auth.uid();

DO $$ BEGIN
    UPDATE public.profiles SET is_student = false WHERE id = auth.uid();
    INSERT INTO _results (check_name, pass, detail) VALUES ('a campus without the student answer is refused', false, 'update succeeded');
EXCEPTION WHEN check_violation THEN
    INSERT INTO _results (check_name, pass, detail) VALUES ('a campus without the student answer is refused', true, 'rejected (23514)');
END $$;

UPDATE public.profiles SET is_student = false, student_campus = NULL WHERE id = auth.uid();
INSERT INTO _results (check_name, pass, detail)
SELECT 'a student can withdraw the answer', NOT is_student AND student_campus IS NULL, is_student::TEXT
FROM public.profiles WHERE id = auth.uid();

WITH u AS (
    UPDATE public.profiles SET is_student = true, student_campus = 'UCC - Cape Coast'
    WHERE id = '00000000-0000-0000-0000-000000000ca3' RETURNING 1
)
INSERT INTO _results (check_name, pass, detail)
SELECT 'nobody can change someone else''s answer', count(*) = 0, count(*)::TEXT || ' rows updated' FROM u;
RESET ROLE;

-- Ama (ca1): a self-declared UG student gains nothing ---------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000ca1","role":"authenticated"}', true);

INSERT INTO _results (check_name, pass, detail)
SELECT 'being a student is not a role', NOT public.has_role('student') AND NOT public.has_role('src_head'), NULL;

INSERT INTO _results (check_name, pass, detail)
SELECT 'a student has no publishing permission at their campus',
       NOT public.naflis_has_permission('student.announcements.create', 'UG - Legon'), NULL;

DO $$ BEGIN
    INSERT INTO public.campus_events (kind, title, campus) VALUES ('announcement', 'sp notice', 'UG - Legon');
    INSERT INTO _results (check_name, pass, detail) VALUES ('a student cannot publish at their own campus', false, 'insert succeeded');
EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO _results (check_name, pass, detail) VALUES ('a student cannot publish at their own campus', true, 'rejected (42501)');
END $$;

INSERT INTO _results (check_name, pass, detail)
SELECT 'a student reads only their own profile', count(*) = 1, count(*)::TEXT || ' rows visible' FROM public.profiles;

UPDATE public.profiles SET roles = ARRAY['buyer', 'student', 'src_head'] WHERE id = auth.uid();
INSERT INTO _results (check_name, pass, detail)
SELECT 'editing the profile still can''t add a role', roles = ARRAY['buyer']::TEXT[], roles::TEXT
FROM public.profiles WHERE id = auth.uid();
RESET ROLE;

-- Nothing that decides access reads the new columns -----------------------------
INSERT INTO _results (check_name, pass, detail)
SELECT 'no RLS policy reads is_student or student_campus', count(*) = 0,
       coalesce(string_agg(tablename || '.' || policyname, ', '), 'none')
FROM pg_policies
WHERE coalesce(qual, '') ~ '(is_student|student_campus)' OR coalesce(with_check, '') ~ '(is_student|student_campus)';

INSERT INTO _results (check_name, pass, detail)
SELECT 'no function reads them except sign-up (handle_new_user writes them)', count(*) = 0,
       coalesce(string_agg(p.proname, ', '), 'none')
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosrc ~ '(is_student|student_campus)' AND p.proname <> 'handle_new_user';

SELECT n, CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END AS result, check_name, detail FROM _results ORDER BY n;

ROLLBACK;
