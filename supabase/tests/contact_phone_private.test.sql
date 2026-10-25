-- Checks for 20261024120000_contact_phone_private: anonymous visitors can't read
-- a seller's phone or owner id by any route; signed-in users get phones only
-- from naflis_vendor_contact (approved sellers, 50 different sellers a day,
-- every reveal recorded); sellers and admins are unaffected; server code
-- (service_role) is unaffected. Same format as security_fixes.test.sql: plain
-- SQL, one transaction, ROLLED BACK, one row per check.
BEGIN;

CREATE TEMP TABLE _results (n SERIAL, check_name TEXT, pass BOOLEAN, detail TEXT) ON COMMIT DROP;
GRANT ALL ON _results TO anon, authenticated, service_role;
GRANT USAGE ON SEQUENCE _results_n_seq TO anon, authenticated, service_role;
-- The limit test needs the vendor ids without reading vendors as that user.
CREATE TEMP TABLE _limit_vendors (id UUID) ON COMMIT DROP;
GRANT SELECT ON _limit_vendors TO authenticated;

-- Fixtures (as postgres) ---------------------------------------------------
-- O owns approved shop VA, P owns pending shop VP, U and W are shoppers, A an admin.
INSERT INTO auth.users (id, email) VALUES
    ('00000000-0000-0000-0000-00000000d0a1', 'cp.o@test.invalid'),
    ('00000000-0000-0000-0000-00000000d0b1', 'cp.p@test.invalid'),
    ('00000000-0000-0000-0000-00000000d0c1', 'cp.u@test.invalid'),
    ('00000000-0000-0000-0000-00000000d0d1', 'cp.w@test.invalid'),
    ('00000000-0000-0000-0000-00000000d0e1', 'cp.a@test.invalid');
UPDATE public.profiles SET roles = ARRAY['buyer', 'admin'] WHERE id = '00000000-0000-0000-0000-00000000d0e1';
INSERT INTO public.vendors (id, user_id, store_name, store_slug, status, contact_phone) VALUES
    ('00000000-0000-0000-0000-00000000d00a', '00000000-0000-0000-0000-00000000d0a1', 'CP Approved', 'cp-approved', 'approved', '024 111 2222'),
    ('00000000-0000-0000-0000-00000000d00b', '00000000-0000-0000-0000-00000000d0b1', 'CP Pending', 'cp-pending', 'pending', '024 333 4444');
INSERT INTO public.products (vendor_id, title, price) VALUES ('00000000-0000-0000-0000-00000000d00a', 'cp item', 10);
-- 51 more approved shops, for the daily limit.
INSERT INTO auth.users (id, email)
SELECT ('00000000-0000-0000-0001-' || lpad(g::TEXT, 12, '0'))::UUID, 'cp.shop' || g || '@test.invalid' FROM generate_series(1, 51) g;
INSERT INTO public.vendors (id, user_id, store_name, store_slug, status, contact_phone)
SELECT ('00000000-0000-0000-0002-' || lpad(g::TEXT, 12, '0'))::UUID, ('00000000-0000-0000-0001-' || lpad(g::TEXT, 12, '0'))::UUID,
       'CP Shop ' || g, 'cp-shop-' || g, 'approved', '020 000 ' || lpad(g::TEXT, 4, '0')
FROM generate_series(1, 51) g;
INSERT INTO _limit_vendors SELECT id FROM public.vendors WHERE store_slug LIKE 'cp-shop-%';

-- Anonymous visitor: no route to the phone or owner id -------------------------
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);

DO $$ BEGIN
    PERFORM contact_phone FROM public.vendors;
    INSERT INTO _results (check_name, pass, detail) VALUES ('anon: vendors.contact_phone', false, 'read succeeded');
EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO _results (check_name, pass, detail) VALUES ('anon: vendors.contact_phone', true, 'rejected (42501)');
END $$;
DO $$ BEGIN
    PERFORM user_id FROM public.vendors;
    INSERT INTO _results (check_name, pass, detail) VALUES ('anon: vendors.user_id', false, 'read succeeded');
EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO _results (check_name, pass, detail) VALUES ('anon: vendors.user_id', true, 'rejected (42501)');
END $$;
DO $$ BEGIN
    PERFORM * FROM public.vendors;
    INSERT INTO _results (check_name, pass, detail) VALUES ('anon: select * from vendors', false, 'read succeeded');
EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO _results (check_name, pass, detail) VALUES ('anon: select * from vendors', true, 'rejected (42501)');
END $$;
DO $$ BEGIN
    -- What a PostgREST embed (products?select=*,vendors(contact_phone)) runs.
    PERFORM v.contact_phone FROM public.products p JOIN public.vendors v ON v.id = p.vendor_id;
    INSERT INTO _results (check_name, pass, detail) VALUES ('anon: phone through a products join', false, 'read succeeded');
EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO _results (check_name, pass, detail) VALUES ('anon: phone through a products join', true, 'rejected (42501)');
END $$;
DO $$ BEGIN
    PERFORM public.naflis_vendor_contact('00000000-0000-0000-0000-00000000d00a');
    INSERT INTO _results (check_name, pass, detail) VALUES ('anon: naflis_vendor_contact', false, 'call succeeded');
EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO _results (check_name, pass, detail) VALUES ('anon: naflis_vendor_contact', true, 'rejected (42501)');
END $$;
INSERT INTO _results (check_name, pass, detail)
SELECT 'anon still browses: approved shops and their products, public columns only',
       (SELECT count(*) FROM public.vendors WHERE store_slug LIKE 'cp-%') = 52
       AND (SELECT count(*) FROM public.products p JOIN public.vendors v ON v.id = p.vendor_id
            WHERE p.title = 'cp item' AND v.status = 'approved') = 1,
       (SELECT count(*) FROM public.vendors WHERE store_slug LIKE 'cp-%')::TEXT || ' shops visible';
INSERT INTO _results (check_name, pass, detail)
SELECT 'anon sees no reveals', count(*) = 0, count(*)::TEXT FROM public.contact_reveals;
RESET ROLE;

-- Every other route, from the catalogue -------------------------------------------
INSERT INTO _results (check_name, pass, detail)
SELECT 'anon and signed-in users hold no column privilege on contact_phone',
       NOT has_column_privilege('anon', 'public.vendors', 'contact_phone', 'SELECT')
       AND NOT has_column_privilege('authenticated', 'public.vendors', 'contact_phone', 'SELECT')
       AND NOT has_column_privilege('anon', 'public.vendors', 'user_id', 'SELECT'), NULL;
INSERT INTO _results (check_name, pass, detail)
SELECT 'no view reads vendors', count(*) = 0, coalesce(string_agg(DISTINCT c.relname, ', '), 'none')
FROM pg_depend d
JOIN pg_rewrite r ON r.oid = d.objid
JOIN pg_class c ON c.oid = r.ev_class
WHERE d.refobjid = 'public.vendors'::regclass AND c.relkind IN ('v', 'm') AND d.classid = 'pg_rewrite'::regclass;
INSERT INTO _results (check_name, pass, detail)
SELECT 'no function anon can run mentions contact_phone', count(*) = 0, coalesce(string_agg(p.proname, ', '), 'none')
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosrc ~ 'contact_phone' AND has_function_privilege('anon', p.oid, 'EXECUTE');

-- Shopper U, signed in ------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d0c1","role":"authenticated"}', true);

DO $$ BEGIN
    PERFORM contact_phone FROM public.vendors;
    INSERT INTO _results (check_name, pass, detail) VALUES ('signed in: no direct read of contact_phone', false, 'read succeeded');
EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO _results (check_name, pass, detail) VALUES ('signed in: no direct read of contact_phone', true, 'rejected (42501)');
END $$;
INSERT INTO _results (check_name, pass, detail)
SELECT 'signed in: an approved seller''s phone, from the function',
       public.naflis_vendor_contact('00000000-0000-0000-0000-00000000d00a') = '024 111 2222', NULL;
DO $$ BEGIN
    PERFORM public.naflis_vendor_contact('00000000-0000-0000-0000-00000000d00b');
    INSERT INTO _results (check_name, pass, detail) VALUES ('signed in: a pending seller''s phone is not given', false, 'phone returned');
EXCEPTION WHEN raise_exception THEN
    INSERT INTO _results (check_name, pass, detail) VALUES ('signed in: a pending seller''s phone is not given', SQLERRM = 'not_found', SQLERRM);
END $$;
INSERT INTO _results (check_name, pass, detail)
SELECT 'signed in: seeing the same seller again works', public.naflis_vendor_contact('00000000-0000-0000-0000-00000000d00a') = '024 111 2222', NULL;
DO $$ BEGIN
    INSERT INTO public.contact_reveals (viewer_id, vendor_id) VALUES (auth.uid(), '00000000-0000-0000-0000-00000000d00a');
    INSERT INTO _results (check_name, pass, detail) VALUES ('signed in: cannot write the reveal log', false, 'insert succeeded');
EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO _results (check_name, pass, detail) VALUES ('signed in: cannot write the reveal log', true, 'rejected (42501)');
END $$;
INSERT INTO _results (check_name, pass, detail)
SELECT 'signed in: cannot read the reveal log', count(*) = 0, count(*)::TEXT FROM public.contact_reveals;
RESET ROLE;

INSERT INTO _results (check_name, pass, detail)
SELECT 'each reveal is recorded', count(*) = 2, count(*)::TEXT || ' rows'
FROM public.contact_reveals WHERE viewer_id = '00000000-0000-0000-0000-00000000d0c1';

-- Shopper W: the daily limit ----------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d0d1","role":"authenticated"}', true);
DO $$
DECLARE v UUID; n INT := 0; last_err TEXT := 'none';
BEGIN
    FOR v IN SELECT id FROM _limit_vendors ORDER BY id LOOP
        BEGIN
            PERFORM public.naflis_vendor_contact(v);
            n := n + 1;
        EXCEPTION WHEN raise_exception THEN
            last_err := SQLERRM;
        END;
    END LOOP;
    INSERT INTO _results (check_name, pass, detail)
    VALUES ('limit: 50 different sellers a day, the 51st refused', n = public.naflis_contact_daily_limit() AND last_err = 'daily_limit',
            n || ' revealed, then ' || last_err);
END $$;
INSERT INTO _results (check_name, pass, detail)
SELECT 'limit: a seller already seen today still works',
       public.naflis_vendor_contact((SELECT id FROM _limit_vendors ORDER BY id LIMIT 1)) IS NOT NULL, NULL;
RESET ROLE;

-- Seller P: own pending shop -------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d0b1","role":"authenticated"}', true);
INSERT INTO _results (check_name, pass, detail)
SELECT 'seller: reads own phone while pending', public.naflis_vendor_contact('00000000-0000-0000-0000-00000000d00b') = '024 333 4444', NULL;
UPDATE public.vendors SET contact_phone = '024 555 6666' WHERE user_id = auth.uid();
INSERT INTO _results (check_name, pass, detail)
SELECT 'seller: edits own phone', public.naflis_vendor_contact('00000000-0000-0000-0000-00000000d00b') = '024 555 6666', NULL;
UPDATE public.vendors SET contact_phone = NULL WHERE user_id = auth.uid();
INSERT INTO _results (check_name, pass, detail)
SELECT 'seller: removes own phone', public.naflis_vendor_contact('00000000-0000-0000-0000-00000000d00b') IS NULL, NULL;
WITH u AS (UPDATE public.vendors SET contact_phone = '024 999 9999' WHERE id = '00000000-0000-0000-0000-00000000d00a' RETURNING 1)
INSERT INTO _results (check_name, pass, detail)
SELECT 'seller: cannot change another shop''s phone', count(*) = 0, count(*)::TEXT || ' rows updated' FROM u;
RESET ROLE;

-- Admin A: everything, uncounted -----------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d0e1","role":"authenticated"}', true);
INSERT INTO _results (check_name, pass, detail)
SELECT 'admin: any shop''s phone, pending included',
       public.naflis_vendor_contact('00000000-0000-0000-0000-00000000d00a') = '024 111 2222'
       AND public.naflis_vendor_contact('00000000-0000-0000-0000-00000000d00b') IS NULL, NULL;
INSERT INTO _results (check_name, pass, detail)
SELECT 'admin: reads pending shops and the reveal log',
       (SELECT count(*) FROM public.vendors WHERE status = 'pending' AND store_slug = 'cp-pending') = 1
       AND (SELECT count(*) FROM public.contact_reveals) > 0, NULL;
RESET ROLE;
INSERT INTO _results (check_name, pass, detail)
SELECT 'sellers and admins are not counted', count(*) = 0, count(*)::TEXT || ' rows'
FROM public.contact_reveals WHERE viewer_id IN ('00000000-0000-0000-0000-00000000d0b1', '00000000-0000-0000-0000-00000000d0e1');

-- Server code (service_role, e.g. the payments Edge Function): unaffected ----------------
SET LOCAL ROLE service_role;
INSERT INTO _results (check_name, pass, detail)
SELECT 'service_role still reads every vendor column',
       count(*) FILTER (WHERE contact_phone IS NOT NULL AND user_id IS NOT NULL) = 52, count(*)::TEXT
FROM public.vendors WHERE store_slug LIKE 'cp-%';
INSERT INTO _results (check_name, pass, detail)
SELECT 'payments: approved-product lookup works as before', count(*) = 1, count(*)::TEXT
FROM public.products p JOIN public.vendors v ON v.id = p.vendor_id
WHERE p.title = 'cp item' AND v.status = 'approved' AND v.user_id IS NOT NULL;
RESET ROLE;

SELECT n, CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END AS result, check_name, detail FROM _results ORDER BY n;

ROLLBACK;
