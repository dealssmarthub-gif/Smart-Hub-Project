-- Stage 2b: the staff portal (/campus-admin) is no longer linked from any buyer
-- or student page; this checks that its server-side protection is unchanged.
-- A signed-in student who types the portal URL gets the UI shell at most: every
-- write and every staff read behind it is refused by the database.
-- Same format as security_fixes.test.sql: plain SQL, one transaction, ROLLED
-- BACK, one row per check.
BEGIN;

CREATE TEMP TABLE _results (n SERIAL, check_name TEXT, pass BOOLEAN, detail TEXT) ON COMMIT DROP;
GRANT ALL ON _results TO anon, authenticated;
GRANT USAGE ON SEQUENCE _results_n_seq TO anon, authenticated;

-- Fixtures (as postgres) ---------------------------------------------------
-- S is a plain student, G the University of Ghana SRC president, X a super admin.
INSERT INTO auth.users (id, email) VALUES
    ('00000000-0000-0000-0000-0000000008a1', 'sp.student@test.invalid'),
    ('00000000-0000-0000-0000-0000000008b1', 'sp.src.ug@test.invalid'),
    ('00000000-0000-0000-0000-0000000008c1', 'sp.super@test.invalid');
UPDATE public.profiles SET roles = ARRAY['buyer', 'student'] WHERE id = '00000000-0000-0000-0000-0000000008a1';
UPDATE public.profiles SET roles = ARRAY['buyer', 'student', 'src_head'] WHERE id = '00000000-0000-0000-0000-0000000008b1';
UPDATE public.profiles SET roles = ARRAY['buyer', 'super_admin'] WHERE id = '00000000-0000-0000-0000-0000000008c1';
INSERT INTO public.staff_grants (user_id, email, title, role, institution_id, campus_id, permissions, status) VALUES
    ('00000000-0000-0000-0000-0000000008b1', 'sp.src.ug@test.invalid', 'SRC President', 'src_head', 'ug', 'UG - Legon',
     ARRAY['student.announcements.create', 'student.events.create', 'student.resources.manage'], 'active');
INSERT INTO public.campus_events (id, kind, title, campus, pinned)
    VALUES ('00000000-0000-0000-0000-0000000008e1', 'announcement', 'sp existing notice', 'UG - Legon', false);
INSERT INTO public.audit_logs (action, target) VALUES ('sp.fixture', 'x');

-- Anonymous visitor ---------------------------------------------------------
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
DO $$ BEGIN
    INSERT INTO public.campus_events (kind, title, campus) VALUES ('announcement', 'sp anon', 'UG - Legon');
    INSERT INTO _results (check_name, pass, detail) VALUES ('anon cannot publish a notice', false, 'insert succeeded');
EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO _results (check_name, pass, detail) VALUES ('anon cannot publish a notice', true, 'rejected (42501)');
END $$;
RESET ROLE;

-- Signed-in student with no grant (typed the portal URL) --------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000008a1","role":"authenticated"}', true);

DO $$ BEGIN
    INSERT INTO public.campus_events (kind, title, campus) VALUES ('announcement', 'sp student notice', 'UG - Legon');
    INSERT INTO _results (check_name, pass, detail) VALUES ('student cannot publish a notice', false, 'insert succeeded');
EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO _results (check_name, pass, detail) VALUES ('student cannot publish a notice', true, 'rejected (42501)');
END $$;

DO $$ BEGIN
    INSERT INTO public.campus_events (kind, title, campus) VALUES ('event', 'sp student event', 'UG - Legon');
    INSERT INTO _results (check_name, pass, detail) VALUES ('student cannot publish an event', false, 'insert succeeded');
EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO _results (check_name, pass, detail) VALUES ('student cannot publish an event', true, 'rejected (42501)');
END $$;

DO $$ BEGIN
    INSERT INTO public.campus_resources (title, course_code, campus) VALUES ('sp notes', 'SP 101', 'UG - Legon');
    INSERT INTO _results (check_name, pass, detail) VALUES ('student cannot upload a resource', false, 'insert succeeded');
EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO _results (check_name, pass, detail) VALUES ('student cannot upload a resource', true, 'rejected (42501)');
END $$;

WITH u AS (UPDATE public.campus_events SET pinned = true WHERE id = '00000000-0000-0000-0000-0000000008e1' RETURNING 1)
INSERT INTO _results (check_name, pass, detail)
SELECT 'student cannot pin an existing notice', count(*) = 0, count(*)::TEXT || ' rows updated' FROM u;

WITH d AS (DELETE FROM public.campus_events WHERE id = '00000000-0000-0000-0000-0000000008e1' RETURNING 1)
INSERT INTO _results (check_name, pass, detail)
SELECT 'student cannot delete an existing notice', count(*) = 0, count(*)::TEXT || ' rows deleted' FROM d;

INSERT INTO _results (check_name, pass, detail)
SELECT 'student sees no staff grants', count(*) = 0, count(*)::TEXT || ' rows visible' FROM public.staff_grants;

INSERT INTO _results (check_name, pass, detail)
SELECT 'student cannot read the audit log', count(*) = 0, count(*)::TEXT || ' rows visible' FROM public.audit_logs;

DO $$ BEGIN
    PERFORM public.naflis_invite_staff('sp.self@test.invalid', 'Me', 'SRC President', 'src_head', 'ug', 'UG - Legon',
        ARRAY['student.announcements.create']);
    INSERT INTO _results (check_name, pass, detail) VALUES ('student cannot invite staff', false, 'invite created');
EXCEPTION WHEN raise_exception THEN
    INSERT INTO _results (check_name, pass, detail) VALUES ('student cannot invite staff', SQLERRM = 'not_authorized', SQLERRM);
END $$;

DO $$ BEGIN
    PERFORM public.naflis_start_impersonation('00000000-0000-0000-0000-0000000008b1', 'src_head', 'sp test reason');
    INSERT INTO _results (check_name, pass, detail) VALUES ('student cannot start View-As', false, 'session started');
EXCEPTION WHEN raise_exception THEN
    INSERT INTO _results (check_name, pass, detail) VALUES ('student cannot start View-As', SQLERRM = 'not_authorized', SQLERRM);
END $$;

WITH u AS (UPDATE public.feature_flags SET enabled = NOT enabled WHERE key = 'src_portal' RETURNING 1)
INSERT INTO _results (check_name, pass, detail)
SELECT 'student cannot change feature flags', count(*) = 0, count(*)::TEXT || ' rows updated' FROM u;

UPDATE public.profiles SET roles = ARRAY['buyer', 'student', 'src_head', 'super_admin'] WHERE id = auth.uid();
INSERT INTO _results (check_name, pass, detail)
SELECT 'student cannot give themselves a staff role', roles = ARRAY['buyer', 'student']::TEXT[], roles::TEXT
FROM public.profiles WHERE id = auth.uid();

INSERT INTO _results (check_name, pass, detail)
SELECT 'student holds no publishing permission', NOT public.naflis_has_permission('student.announcements.create', 'UG - Legon'), NULL;
RESET ROLE;

-- UG SRC president: own campus only -----------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000008b1","role":"authenticated"}', true);

DO $$ BEGIN
    INSERT INTO public.campus_events (kind, title, campus) VALUES ('announcement', 'sp ug notice', 'UG - Legon');
    INSERT INTO _results (check_name, pass, detail) VALUES ('UG SRC can publish at UG', true, 'insert succeeded');
EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO _results (check_name, pass, detail) VALUES ('UG SRC can publish at UG', false, 'rejected (42501)');
END $$;

DO $$ BEGIN
    INSERT INTO public.campus_events (kind, title, campus) VALUES ('announcement', 'sp knust notice', 'KNUST - Kumasi');
    INSERT INTO _results (check_name, pass, detail) VALUES ('UG SRC cannot publish at KNUST', false, 'insert succeeded');
EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO _results (check_name, pass, detail) VALUES ('UG SRC cannot publish at KNUST', true, 'rejected (42501)');
END $$;

INSERT INTO _results (check_name, pass, detail)
SELECT 'UG SRC sees only their own grant', count(*) = 1 AND bool_and(user_id = auth.uid()), count(*)::TEXT || ' rows visible'
FROM public.staff_grants;
RESET ROLE;

-- Super admin: unchanged ------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000008c1","role":"authenticated"}', true);
DO $$ BEGIN
    INSERT INTO public.campus_events (kind, title, campus) VALUES ('announcement', 'sp super notice', 'KNUST - Kumasi');
    INSERT INTO _results (check_name, pass, detail) VALUES ('super admin can publish anywhere', true, 'insert succeeded');
EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO _results (check_name, pass, detail) VALUES ('super admin can publish anywhere', false, 'rejected (42501)');
END $$;
RESET ROLE;

SELECT n, CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END AS result, check_name, detail FROM _results ORDER BY n;

ROLLBACK;
