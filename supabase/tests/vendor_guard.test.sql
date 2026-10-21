-- The vendor guard (protect_vendor_plan, 20261015123000) still holds with the
-- admin vendor policies of 20261021120000: new shops start pending / starter,
-- and only admins change status or plan. Same format as security_fixes.test.sql:
-- plain SQL, one transaction, ROLLED BACK, one row per check.
-- Checks marked [admin] need 20261021120000; every other check must pass with or without it.
BEGIN;

CREATE TEMP TABLE _results (n SERIAL, check_name TEXT, pass BOOLEAN, detail TEXT) ON COMMIT DROP;
GRANT ALL ON _results TO anon, authenticated;
GRANT USAGE ON SEQUENCE _results_n_seq TO anon, authenticated;

-- Fixtures (as postgres) ---------------------------------------------------
-- S and O are ordinary users, A is an admin. O already has an approved shop.
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
    ('00000000-0000-0000-0000-0000000006a1', 'vg.s@test.invalid', '{"full_name":"Seller S","role":"admin"}'),
    ('00000000-0000-0000-0000-0000000006b1', 'vg.o@test.invalid', '{"full_name":"Other O"}'),
    ('00000000-0000-0000-0000-0000000006c1', 'vg.a@test.invalid', '{"full_name":"Admin A"}');
UPDATE public.profiles SET roles = ARRAY['buyer', 'admin'] WHERE id = '00000000-0000-0000-0000-0000000006c1';
INSERT INTO public.vendors (id, user_id, store_name, store_slug, status, subscription_tier) VALUES
    ('00000000-0000-0000-0000-0000000006f1', '00000000-0000-0000-0000-0000000006b1', 'O Shop', 'vg-o-shop', 'approved', 'starter');

-- Signed in as S (signed up asking for admin; holds no admin role) ----------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000006a1","role":"authenticated"}', true);

INSERT INTO public.vendors (user_id, store_name, store_slug, status, subscription_tier)
VALUES (auth.uid(), 'S Shop', 'vg-s-shop', 'approved', 'enterprise');

-- Own row: status and plan are kept; a plain field (description) changes.
UPDATE public.vendors SET status = 'approved', subscription_tier = 'enterprise', description = 'edited by owner'
WHERE user_id = auth.uid();

DO $$ DECLARE n INT; BEGIN
    UPDATE public.vendors SET status = 'rejected', store_name = 'hijacked' WHERE user_id = '00000000-0000-0000-0000-0000000006b1';
    GET DIAGNOSTICS n = ROW_COUNT;
    INSERT INTO _results (check_name, pass, detail) VALUES ('non-admin cannot update another user''s shop', n = 0, n || ' rows updated');
END $$;

DO $$ BEGIN
    INSERT INTO public.vendors (user_id, store_name, store_slug)
    VALUES ('00000000-0000-0000-0000-0000000006b1', 'Second O shop', 'vg-o-2');
    INSERT INTO _results (check_name, pass, detail) VALUES ('non-admin cannot create a shop for someone else', false, 'insert succeeded');
EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO _results (check_name, pass, detail) VALUES ('non-admin cannot create a shop for someone else', true, 'rejected (42501)');
END $$;

DO $$ DECLARE n INT; BEGIN
    DELETE FROM public.vendors WHERE user_id = '00000000-0000-0000-0000-0000000006b1';
    GET DIAGNOSTICS n = ROW_COUNT;
    INSERT INTO _results (check_name, pass, detail) VALUES ('non-admin cannot delete another user''s shop', n = 0, n || ' rows deleted');
END $$;

DO $$ BEGIN
    INSERT INTO public.products (vendor_id, title, price)
    VALUES ('00000000-0000-0000-0000-0000000006f1', 'Under O''s name', 10);
    INSERT INTO _results (check_name, pass, detail) VALUES ('non-admin cannot list under another user''s shop', false, 'insert succeeded');
EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO _results (check_name, pass, detail) VALUES ('non-admin cannot list under another user''s shop', true, 'rejected (42501)');
END $$;

INSERT INTO _results (check_name, pass, detail)
SELECT 'non-admin sees no other pending shop', count(*) = 0, count(*)::TEXT || ' rows'
FROM public.vendors WHERE status = 'pending' AND user_id <> auth.uid();
RESET ROLE;

INSERT INTO _results (check_name, pass, detail)
SELECT 'new shop forced pending / starter (asked approved / enterprise)', status = 'pending' AND subscription_tier = 'starter',
       status || ' / ' || subscription_tier
FROM public.vendors WHERE user_id = '00000000-0000-0000-0000-0000000006a1';
INSERT INTO _results (check_name, pass, detail)
SELECT 'owner update keeps status and plan, changes description',
       status = 'pending' AND subscription_tier = 'starter' AND description = 'edited by owner',
       status || ' / ' || subscription_tier || ' / ' || coalesce(description, 'null')
FROM public.vendors WHERE user_id = '00000000-0000-0000-0000-0000000006a1';
INSERT INTO _results (check_name, pass, detail)
SELECT 'other user''s shop untouched', status = 'approved' AND store_name = 'O Shop', status || ' / ' || store_name
FROM public.vendors WHERE user_id = '00000000-0000-0000-0000-0000000006b1';
INSERT INTO _results (check_name, pass, detail)
SELECT 'S still holds no admin role', NOT ('admin' = ANY (roles)), roles::TEXT
FROM public.profiles WHERE id = '00000000-0000-0000-0000-0000000006a1';

-- Anonymous visitor ---------------------------------------------------------
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
INSERT INTO _results (check_name, pass, detail)
SELECT 'anon sees approved shops only', count(*) = 1 AND bool_and(status = 'approved'), count(*)::TEXT || ' rows'
FROM public.vendors WHERE store_slug LIKE 'vg-%';
DO $$ BEGIN
    INSERT INTO public.vendors (user_id, store_name, store_slug) VALUES ('00000000-0000-0000-0000-0000000006b1', 'anon', 'vg-anon');
    INSERT INTO _results (check_name, pass, detail) VALUES ('anon cannot create a shop', false, 'insert succeeded');
EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO _results (check_name, pass, detail) VALUES ('anon cannot create a shop', true, 'rejected (42501)');
END $$;
RESET ROLE;

-- Signed in as A (admin) -----------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000006c1","role":"authenticated"}', true);
UPDATE public.vendors SET status = 'approved', subscription_tier = 'growth' WHERE user_id = '00000000-0000-0000-0000-0000000006a1';
RESET ROLE;
INSERT INTO _results (check_name, pass, detail)
SELECT '[admin] admin approves a shop and changes its plan', status = 'approved' AND subscription_tier = 'growth',
       status || ' / ' || subscription_tier
FROM public.vendors WHERE user_id = '00000000-0000-0000-0000-0000000006a1';

-- The three new policies are limited to signed-in admins / super admins.
INSERT INTO _results (check_name, pass, detail)
SELECT '[admin] new vendor policies are authenticated-only and admin-gated',
       count(*) = 3 AND bool_and(roles = '{authenticated}'
           AND coalesce(qual, with_check) LIKE '%has_role(''admin''%' AND coalesce(qual, with_check) LIKE '%has_role(''super_admin''%'),
       string_agg(policyname || ' ' || roles::TEXT, ', ')
FROM pg_policies WHERE schemaname = 'public' AND tablename = 'vendors' AND policyname LIKE 'Admins %';

SELECT n, CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END AS result, check_name, detail FROM _results ORDER BY n;

ROLLBACK;
