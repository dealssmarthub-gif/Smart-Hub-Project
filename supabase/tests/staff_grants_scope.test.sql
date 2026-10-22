-- Stage 2c: the app now loads each staff member's grants from staff_grants to
-- scope the campus portal. These checks show what that read can return and
-- that the database, not the loaded copy, decides every write.
-- Same format as security_fixes.test.sql: plain SQL, one transaction, ROLLED
-- BACK, one row per check.
BEGIN;

CREATE TEMP TABLE _results (n SERIAL, check_name TEXT, pass BOOLEAN, detail TEXT) ON COMMIT DROP;
GRANT ALL ON _results TO anon, authenticated;
GRANT USAGE ON SEQUENCE _results_n_seq TO anon, authenticated;

-- Fixtures (as postgres) ---------------------------------------------------
-- A: UG SRC (active, UG - Legon). B: KNUST SRC (active). D: UG dean (active,
-- every UG campus). R: former UG SRC (revoked). X: super admin. Plus one
-- pending UG invite with no user yet.
INSERT INTO auth.users (id, email) VALUES
    ('00000000-0000-0000-0000-0000000009a1', 'gs.a@test.invalid'),
    ('00000000-0000-0000-0000-0000000009b1', 'gs.b@test.invalid'),
    ('00000000-0000-0000-0000-0000000009d1', 'gs.d@test.invalid'),
    ('00000000-0000-0000-0000-0000000009e1', 'gs.r@test.invalid'),
    ('00000000-0000-0000-0000-0000000009c1', 'gs.x@test.invalid');
UPDATE public.profiles SET roles = ARRAY['buyer', 'student', 'src_head']
    WHERE id IN ('00000000-0000-0000-0000-0000000009a1', '00000000-0000-0000-0000-0000000009b1', '00000000-0000-0000-0000-0000000009e1');
UPDATE public.profiles SET roles = ARRAY['buyer', 'dean'] WHERE id = '00000000-0000-0000-0000-0000000009d1';
UPDATE public.profiles SET roles = ARRAY['buyer', 'super_admin'] WHERE id = '00000000-0000-0000-0000-0000000009c1';
INSERT INTO public.staff_grants (id, user_id, email, title, role, institution_id, campus_id, permissions, status, token_hash) VALUES
    ('00000000-0000-0000-0000-00000000090a', '00000000-0000-0000-0000-0000000009a1', 'gs.a@test.invalid', 'SRC President', 'src_head', 'ug', 'UG - Legon',
     ARRAY['student.announcements.create', 'student.events.create'], 'active', NULL),
    ('00000000-0000-0000-0000-00000000090b', '00000000-0000-0000-0000-0000000009b1', 'gs.b@test.invalid', 'SRC President', 'src_head', 'knust', 'KNUST - Kumasi',
     ARRAY['student.announcements.create'], 'active', NULL),
    ('00000000-0000-0000-0000-00000000090d', '00000000-0000-0000-0000-0000000009d1', 'gs.d@test.invalid', 'Dean of Students', 'dean', 'ug', '*',
     ARRAY['student.announcements.create', 'student.timetable.manage'], 'active', NULL),
    ('00000000-0000-0000-0000-00000000090e', '00000000-0000-0000-0000-0000000009e1', 'gs.r@test.invalid', 'SRC President', 'src_head', 'ug', 'UG - Legon',
     ARRAY['student.announcements.create'], 'revoked', NULL),
    ('00000000-0000-0000-0000-00000000090f', NULL, 'gs.invitee@test.invalid', 'SRC Secretary', 'src_head', 'ug', 'UG - Legon',
     ARRAY['student.announcements.create'], 'invited', 'gs-secret-token-hash');

-- Anonymous visitor ---------------------------------------------------------
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
INSERT INTO _results (check_name, pass, detail)
SELECT 'anon loads no grants', count(*) = 0, count(*)::TEXT || ' rows' FROM public.staff_grants;
RESET ROLE;

-- A: UG SRC -------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000009a1","role":"authenticated"}', true);

INSERT INTO _results (check_name, pass, detail)
SELECT 'UG SRC loads exactly their own grant', count(*) = 1 AND bool_and(id = '00000000-0000-0000-0000-00000000090a'),
       coalesce(string_agg(campus_id, ', '), 'none')
FROM public.staff_grants;

INSERT INTO _results (check_name, pass, detail)
SELECT 'UG SRC cannot see a pending invite or its token hash', count(*) = 0, count(*)::TEXT || ' rows'
FROM public.staff_grants WHERE token_hash IS NOT NULL OR user_id IS NULL;

DO $$ BEGIN
    INSERT INTO public.staff_grants (user_id, email, title, role, institution_id, campus_id, permissions, status)
    VALUES (auth.uid(), 'gs.a@test.invalid', 'Self-made', 'src_head', 'knust', 'KNUST - Kumasi', ARRAY['student.announcements.create'], 'active');
    INSERT INTO _results (check_name, pass, detail) VALUES ('UG SRC cannot create a grant for themselves', false, 'insert succeeded');
EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO _results (check_name, pass, detail) VALUES ('UG SRC cannot create a grant for themselves', true, 'rejected (42501)');
END $$;

WITH u AS (
    UPDATE public.staff_grants
    SET campus_id = '*', institution_id = 'knust', permissions = permissions || ARRAY['student.resources.manage']
    WHERE id = '00000000-0000-0000-0000-00000000090a' RETURNING 1
)
INSERT INTO _results (check_name, pass, detail)
SELECT 'UG SRC cannot widen their own grant', count(*) = 0, count(*)::TEXT || ' rows updated' FROM u;

WITH d AS (DELETE FROM public.staff_grants WHERE id = '00000000-0000-0000-0000-00000000090b' RETURNING 1)
INSERT INTO _results (check_name, pass, detail)
SELECT 'UG SRC cannot delete another grant', count(*) = 0, count(*)::TEXT || ' rows deleted' FROM d;

DO $$ BEGIN
    INSERT INTO public.campus_events (kind, title, campus) VALUES ('announcement', 'gs knust', 'KNUST - Kumasi');
    INSERT INTO _results (check_name, pass, detail) VALUES ('UG SRC still cannot publish at KNUST', false, 'insert succeeded');
EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO _results (check_name, pass, detail) VALUES ('UG SRC still cannot publish at KNUST', true, 'rejected (42501)');
END $$;
RESET ROLE;

INSERT INTO _results (check_name, pass, detail)
SELECT 'UG SRC grant unchanged after the attempts', campus_id = 'UG - Legon' AND institution_id = 'ug' AND cardinality(permissions) = 2,
       institution_id || ' / ' || campus_id || ' / ' || permissions::TEXT
FROM public.staff_grants WHERE id = '00000000-0000-0000-0000-00000000090a';

-- D: UG dean, every UG campus -------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000009d1","role":"authenticated"}', true);
INSERT INTO _results (check_name, pass, detail)
SELECT 'dean loads exactly their own grant', count(*) = 1 AND bool_and(campus_id = '*'), count(*)::TEXT || ' rows' FROM public.staff_grants;
DO $$ BEGIN
    INSERT INTO public.campus_events (kind, title, campus) VALUES ('announcement', 'gs dean ug', 'UG - Legon');
    INSERT INTO _results (check_name, pass, detail) VALUES ('dean can publish at a UG campus', true, 'insert succeeded');
EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO _results (check_name, pass, detail) VALUES ('dean can publish at a UG campus', false, 'rejected (42501)');
END $$;
DO $$ BEGIN
    INSERT INTO public.campus_events (kind, title, campus) VALUES ('announcement', 'gs dean knust', 'KNUST - Kumasi');
    INSERT INTO _results (check_name, pass, detail) VALUES ('dean''s all-campus grant stops at their institution', false, 'insert succeeded');
EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO _results (check_name, pass, detail) VALUES ('dean''s all-campus grant stops at their institution', true, 'rejected (42501)');
END $$;
RESET ROLE;

-- R: revoked UG SRC -------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000009e1","role":"authenticated"}', true);
INSERT INTO _results (check_name, pass, detail)
SELECT 'revoked SRC loads their grant marked revoked', count(*) = 1 AND bool_and(status = 'revoked'), coalesce(string_agg(status, ', '), 'none')
FROM public.staff_grants;
DO $$ BEGIN
    INSERT INTO public.campus_events (kind, title, campus) VALUES ('announcement', 'gs revoked', 'UG - Legon');
    INSERT INTO _results (check_name, pass, detail) VALUES ('revoked SRC can no longer publish', false, 'insert succeeded');
EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO _results (check_name, pass, detail) VALUES ('revoked SRC can no longer publish', true, 'rejected (42501)');
END $$;
RESET ROLE;

-- X: super admin ------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000009c1","role":"authenticated"}', true);
INSERT INTO _results (check_name, pass, detail)
SELECT 'super admin loads every grant', count(*) = 5, count(*)::TEXT || ' rows' FROM public.staff_grants WHERE email LIKE 'gs.%';
RESET ROLE;

SELECT n, CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END AS result, check_name, detail FROM _results ORDER BY n;

ROLLBACK;
