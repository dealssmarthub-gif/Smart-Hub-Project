-- Shop slugs never give away the owner id (20261029120000): sellers' new shops
-- get a generated slug, sellers can't change it, old slugs built from the owner
-- id are replaced, and a constraint keeps the owner id out. Same format as
-- security_fixes.test.sql: plain SQL, one transaction, ROLLED BACK, one row per check.
BEGIN;

CREATE TEMP TABLE _results (n SERIAL, check_name TEXT, pass BOOLEAN, detail TEXT) ON COMMIT DROP;
GRANT ALL ON _results TO anon, authenticated;
GRANT USAGE ON SEQUENCE _results_n_seq TO anon, authenticated;

-- Fixtures (as postgres) ---------------------------------------------------
-- S signs up as a seller, A is an admin.
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
    ('7a51e000-0000-4000-8000-0000000000a1', 'ps.s@test.invalid', '{"full_name":"Seller S"}'),
    ('7a51e000-0000-4000-8000-0000000000c1', 'ps.a@test.invalid', '{"full_name":"Admin A"}');
UPDATE public.profiles SET roles = ARRAY['buyer', 'admin'] WHERE id = '7a51e000-0000-4000-8000-0000000000c1';

-- Signed in as S: asks for the old owner-id slug -----------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"7a51e000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
INSERT INTO public.vendors (user_id, store_name, store_slug)
VALUES (auth.uid(), 'Ama''s Kitchen & Co', 'seller-7a51e000-0000-4000-8000-0000000000a1');
RESET ROLE;

INSERT INTO _results (check_name, pass, detail)
SELECT 'seller''s new shop gets a generated slug from its name', store_slug ~ '^amas-kitchen-co-[a-z0-9]{6}$', store_slug
FROM public.vendors WHERE user_id = '7a51e000-0000-4000-8000-0000000000a1';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"7a51e000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
CREATE TEMP TABLE _before ON COMMIT DROP AS SELECT store_slug FROM public.vendors WHERE user_id = auth.uid();
UPDATE public.vendors SET store_slug = 'official-naflis', description = 'edited' WHERE user_id = auth.uid();
RESET ROLE;
INSERT INTO _results (check_name, pass, detail)
SELECT 'seller can''t change their slug (other fields still change)',
       v.store_slug = b.store_slug AND v.description = 'edited', v.store_slug
FROM public.vendors v, _before b WHERE v.user_id = '7a51e000-0000-4000-8000-0000000000a1';

-- Signed in as the admin ------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"7a51e000-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
UPDATE public.vendors SET store_slug = 'amas-kitchen' WHERE user_id = '7a51e000-0000-4000-8000-0000000000a1';
RESET ROLE;
INSERT INTO _results (check_name, pass, detail)
SELECT 'admin can set a slug', store_slug = 'amas-kitchen', store_slug
FROM public.vendors WHERE user_id = '7a51e000-0000-4000-8000-0000000000a1';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"7a51e000-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
DO $$ BEGIN
    UPDATE public.vendors SET store_slug = 'kitchen-7a51e000' WHERE user_id = '7a51e000-0000-4000-8000-0000000000a1';
    INSERT INTO _results (check_name, pass, detail) VALUES ('even an admin can''t put the owner id in a slug', false, 'update succeeded');
EXCEPTION WHEN check_violation THEN
    INSERT INTO _results (check_name, pass, detail) VALUES ('even an admin can''t put the owner id in a slug', true, 'rejected (23514)');
END $$;
RESET ROLE;

-- The backfill: an old owner-id slug, as on live before this migration --------
ALTER TABLE public.vendors DROP CONSTRAINT vendors_slug_hides_owner;
ALTER TABLE public.vendors DISABLE TRIGGER vendor_public_slug;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
    ('7a51e000-0000-4000-8000-0000000000b1', 'ps.o@test.invalid', '{"full_name":"Old O"}'),
    ('7a51e000-0000-4000-8000-0000000000d1', 'ps.p@test.invalid', '{"full_name":"Old P"}');
INSERT INTO public.vendors (user_id, store_name, store_slug, status) VALUES
    ('7a51e000-0000-4000-8000-0000000000b1', 'Old O', 'seller-7a51e000-0000-4000-8000-0000000000b1', 'approved'),
    ('7a51e000-0000-4000-8000-0000000000d1', 'Old P', 'old-p-7a51e000', 'approved');
ALTER TABLE public.vendors ENABLE TRIGGER vendor_public_slug;
-- The migration's step 3 and 4, as written.
UPDATE public.vendors
SET store_slug = public.naflis_store_slug(store_name)
WHERE position(left(user_id::TEXT, 8) IN store_slug) > 0
   OR position(replace(user_id::TEXT, '-', '') IN replace(store_slug, '-', '')) > 0;
ALTER TABLE public.vendors ADD CONSTRAINT vendors_slug_hides_owner
    CHECK (position(left(user_id::TEXT, 8) IN store_slug) = 0);
INSERT INTO _results (check_name, pass, detail)
SELECT 'old owner-id slugs are replaced',
       count(*) = 2 AND bool_and(store_slug ~ '^old-[op]-[a-z0-9]{6}$'), string_agg(store_slug, ', ')
FROM public.vendors WHERE user_id IN ('7a51e000-0000-4000-8000-0000000000b1', '7a51e000-0000-4000-8000-0000000000d1');
INSERT INTO _results (check_name, pass, detail)
SELECT 'no slug anywhere contains its owner''s id', count(*) = 0, coalesce(string_agg(store_slug, ', '), '')
FROM public.vendors WHERE position(left(user_id::TEXT, 8) IN store_slug) > 0;

-- Unchanged: visitors still read the slug, never the owner id -----------------
INSERT INTO _results (check_name, pass, detail)
SELECT 'visitors read store_slug but not user_id or contact_phone',
       has_column_privilege('anon', 'public.vendors', 'store_slug', 'SELECT')
       AND NOT has_column_privilege('anon', 'public.vendors', 'user_id', 'SELECT')
       AND NOT has_column_privilege('anon', 'public.vendors', 'contact_phone', 'SELECT'), NULL;
INSERT INTO _results (check_name, pass, detail)
SELECT 'the slug maker isn''t callable by visitors or users',
       NOT has_function_privilege('anon', 'public.naflis_store_slug(text)', 'EXECUTE')
       AND NOT has_function_privilege('authenticated', 'public.naflis_store_slug(text)', 'EXECUTE'), NULL;

SELECT n, CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END AS result, check_name, detail FROM _results ORDER BY n;

ROLLBACK;
