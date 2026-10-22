-- Security regression checks for migrations 09–12. Plain SQL (no pgTAP needed),
-- so it runs against any project. Everything happens inside one transaction and
-- is ROLLED BACK: no users, rows or files persist. Prints one row per check.
BEGIN;

CREATE TEMP TABLE _results (n SERIAL, check_name TEXT, pass BOOLEAN, detail TEXT) ON COMMIT DROP;
GRANT ALL ON _results TO anon, authenticated;
GRANT USAGE ON SEQUENCE _results_n_seq TO anon, authenticated;

-- Fixtures (as postgres) ---------------------------------------------------
-- A signs up asking for admin; B is a normal user.
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
    ('00000000-0000-0000-0000-00000000aa01', 'sec.a@test.invalid', '{"role":"admin","full_name":"Test A"}'),
    ('00000000-0000-0000-0000-00000000bb01', 'sec.b@test.invalid', '{"full_name":"Test B"}');
SELECT set_config('storage.allow_delete_query', 'true', true);
INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES
    ('product-images', '00000000-0000-0000-0000-00000000bb01/b.png', '00000000-0000-0000-0000-00000000bb01');

INSERT INTO _results (check_name, pass, detail)
SELECT '09 signup metadata cannot grant admin',
       role = 'buyer' AND roles = ARRAY['buyer']::TEXT[], role || ' ' || roles::TEXT
FROM public.profiles WHERE id = '00000000-0000-0000-0000-00000000aa01';

-- Anonymous visitor --------------------------------------------------------
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
INSERT INTO _results (check_name, pass, detail)
SELECT '10 anon cannot read any profile', count(*) = 0, count(*)::TEXT || ' rows visible' FROM public.profiles;
DO $$ BEGIN
    INSERT INTO storage.objects (bucket_id, name) VALUES ('campus-docs', 'uploads/anon.pdf');
    INSERT INTO _results (check_name, pass, detail) VALUES ('11 anon cannot upload to campus-docs', false, 'insert succeeded');
EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO _results (check_name, pass, detail) VALUES ('11 anon cannot upload to campus-docs', true, 'rejected (42501)');
END $$;
RESET ROLE;

-- Signed in as A -----------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000aa01","role":"authenticated"}', true);

INSERT INTO _results (check_name, pass, detail)
SELECT '10 user sees only own profile', count(*) = 1 AND bool_and(id = auth.uid()), count(*)::TEXT || ' rows visible'
FROM public.profiles;

UPDATE public.profiles SET roles = ARRAY['buyer','super_admin'], role = 'admin', email = 'sec.b@test.invalid'
WHERE id = auth.uid();

INSERT INTO public.vendors (user_id, store_name, store_slug, status, subscription_tier)
VALUES (auth.uid(), 'Sec Test Shop', 'sec-test-shop', 'approved', 'enterprise');

DO $$ BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner_id)
    VALUES ('product-images', '00000000-0000-0000-0000-00000000bb01/hijack.png', auth.uid()::TEXT);
    INSERT INTO _results (check_name, pass, detail) VALUES ('11 cannot upload into another user''s folder', false, 'insert succeeded');
EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO _results (check_name, pass, detail) VALUES ('11 cannot upload into another user''s folder', true, 'rejected (42501)');
END $$;

DO $$ BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner_id)
    VALUES ('product-images', '00000000-0000-0000-0000-00000000aa01/own.png', auth.uid()::TEXT);
    INSERT INTO _results (check_name, pass, detail) VALUES ('11 can upload into own folder', true, 'insert succeeded');
EXCEPTION WHEN OTHERS THEN
    INSERT INTO _results (check_name, pass, detail) VALUES ('11 can upload into own folder', false, SQLERRM);
END $$;

DO $$ BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES ('campus-docs', 'uploads/a.pdf', auth.uid()::TEXT);
    INSERT INTO _results (check_name, pass, detail) VALUES ('11 non-staff cannot upload to campus-docs', false, 'insert succeeded');
EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO _results (check_name, pass, detail) VALUES ('11 non-staff cannot upload to campus-docs', true, 'rejected (42501)');
END $$;

UPDATE storage.objects SET name = '00000000-0000-0000-0000-00000000bb01/replaced.png'
WHERE bucket_id = 'product-images' AND name = '00000000-0000-0000-0000-00000000bb01/b.png';
DELETE FROM storage.objects
WHERE bucket_id = 'product-images' AND name LIKE '00000000-0000-0000-0000-00000000bb01/%';
RESET ROLE;

-- Verify A's attempts as postgres -----------------------------------------
INSERT INTO _results (check_name, pass, detail)
SELECT '09 user cannot raise own roles', role = 'buyer' AND NOT ('super_admin' = ANY (roles)), role || ' ' || roles::TEXT
FROM public.profiles WHERE id = '00000000-0000-0000-0000-00000000aa01';
INSERT INTO _results (check_name, pass, detail)
SELECT '09 user cannot take another user''s email', email = 'sec.a@test.invalid', email
FROM public.profiles WHERE id = '00000000-0000-0000-0000-00000000aa01';
INSERT INTO _results (check_name, pass, detail)
SELECT '12 new shop cannot self-approve or self-upgrade', status = 'pending' AND subscription_tier = 'starter',
       status || ' / ' || subscription_tier
FROM public.vendors WHERE user_id = '00000000-0000-0000-0000-00000000aa01';
INSERT INTO _results (check_name, pass, detail)
SELECT '11 cannot rename or delete another user''s photo', count(*) = 1, coalesce(string_agg(name, ', '), 'gone')
FROM storage.objects WHERE bucket_id = 'product-images' AND name = '00000000-0000-0000-0000-00000000bb01/b.png';
INSERT INTO _results (check_name, pass, detail)
SELECT '11 product-images no longer accepts SVG', NOT ('image/svg+xml' = ANY (allowed_mime_types)), allowed_mime_types::TEXT
FROM storage.buckets WHERE id = 'product-images';

SELECT n, CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END AS result, check_name, detail FROM _results ORDER BY n;

ROLLBACK;
