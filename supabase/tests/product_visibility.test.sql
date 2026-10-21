-- Checks for 20261022120000_products_visible_when_vendor_approved, plus a
-- seller clearing their own contact phone. Same format as security_fixes.test.sql:
-- plain SQL, one transaction, ROLLED BACK, one row per check.
BEGIN;

CREATE TEMP TABLE _results (n SERIAL, check_name TEXT, pass BOOLEAN, detail TEXT) ON COMMIT DROP;
GRANT ALL ON _results TO anon, authenticated;
GRANT USAGE ON SEQUENCE _results_n_seq TO anon, authenticated;

-- Fixtures (as postgres) ---------------------------------------------------
-- P has a pending shop, Q an approved one, R a rejected one; O is another user,
-- A an admin, F finance staff. Each shop has one listing.
INSERT INTO auth.users (id, email) VALUES
    ('00000000-0000-0000-0000-0000000007a1', 'pv.p@test.invalid'),
    ('00000000-0000-0000-0000-0000000007b1', 'pv.q@test.invalid'),
    ('00000000-0000-0000-0000-0000000007c1', 'pv.r@test.invalid'),
    ('00000000-0000-0000-0000-0000000007d1', 'pv.o@test.invalid'),
    ('00000000-0000-0000-0000-0000000007e1', 'pv.a@test.invalid'),
    ('00000000-0000-0000-0000-0000000007f1', 'pv.f@test.invalid');
UPDATE public.profiles SET roles = ARRAY['buyer', 'admin'] WHERE id = '00000000-0000-0000-0000-0000000007e1';
UPDATE public.profiles SET roles = ARRAY['buyer', 'finance'] WHERE id = '00000000-0000-0000-0000-0000000007f1';
INSERT INTO public.vendors (id, user_id, store_name, store_slug, status, contact_phone) VALUES
    ('00000000-0000-0000-0000-00000000070a', '00000000-0000-0000-0000-0000000007a1', 'P', 'pv-p', 'pending', '024 111 1111'),
    ('00000000-0000-0000-0000-00000000070b', '00000000-0000-0000-0000-0000000007b1', 'Q', 'pv-q', 'approved', '024 222 2222'),
    ('00000000-0000-0000-0000-00000000070c', '00000000-0000-0000-0000-0000000007c1', 'R', 'pv-r', 'rejected', NULL);
INSERT INTO public.products (vendor_id, title, price, listing_type, campus) VALUES
    ('00000000-0000-0000-0000-00000000070a', 'pv pending item', 10, 'student', 'UG - Legon'),
    ('00000000-0000-0000-0000-00000000070b', 'pv approved item', 20, 'student', 'UG - Legon'),
    ('00000000-0000-0000-0000-00000000070c', 'pv rejected item', 30, 'mall', NULL);

-- Anonymous visitor ---------------------------------------------------------
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
INSERT INTO _results (check_name, pass, detail)
SELECT 'anon sees only the approved vendor''s listing', count(*) = 1 AND bool_and(title = 'pv approved item'),
       coalesce(string_agg(title, ', '), 'none')
FROM public.products WHERE title LIKE 'pv %';
RESET ROLE;

-- Another signed-in user ----------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000007d1","role":"authenticated"}', true);
INSERT INTO _results (check_name, pass, detail)
SELECT 'other users see only the approved vendor''s listing', count(*) = 1, coalesce(string_agg(title, ', '), 'none')
FROM public.products WHERE title LIKE 'pv %';
DO $$ DECLARE n INT; BEGIN
    UPDATE public.vendors SET contact_phone = NULL WHERE user_id = '00000000-0000-0000-0000-0000000007b1';
    GET DIAGNOSTICS n = ROW_COUNT;
    INSERT INTO _results (check_name, pass, detail) VALUES ('cannot clear another seller''s phone', n = 0, n || ' rows updated');
END $$;
RESET ROLE;

-- P, the pending seller ------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000007a1","role":"authenticated"}', true);
INSERT INTO _results (check_name, pass, detail)
SELECT 'pending seller sees own listing (and approved ones)', count(*) = 2, coalesce(string_agg(title, ', ' ORDER BY title), 'none')
FROM public.products WHERE title LIKE 'pv %';
DO $$ DECLARE t TEXT; BEGIN
    INSERT INTO public.products (vendor_id, title, price, listing_type, campus)
    VALUES ('00000000-0000-0000-0000-00000000070a', 'pv second item', 15, 'student', 'UG - Legon')
    RETURNING title INTO t;
    INSERT INTO _results (check_name, pass, detail) VALUES ('pending seller can list and read the row back', t = 'pv second item', t);
EXCEPTION WHEN OTHERS THEN
    INSERT INTO _results (check_name, pass, detail) VALUES ('pending seller can list and read the row back', false, SQLERRM);
END $$;
UPDATE public.vendors SET contact_phone = NULL WHERE user_id = auth.uid();
RESET ROLE;
INSERT INTO _results (check_name, pass, detail)
SELECT 'seller clears own contact phone', contact_phone IS NULL, coalesce(contact_phone, 'null')
FROM public.vendors WHERE user_id = '00000000-0000-0000-0000-0000000007a1';
INSERT INTO _results (check_name, pass, detail)
SELECT 'other seller''s phone unchanged', contact_phone = '024 222 2222', coalesce(contact_phone, 'null')
FROM public.vendors WHERE user_id = '00000000-0000-0000-0000-0000000007b1';

-- Staff -----------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000007e1","role":"authenticated"}', true);
INSERT INTO _results (check_name, pass, detail)
SELECT 'admin sees every listing', count(*) = 4, count(*)::TEXT || ' rows' FROM public.products WHERE title LIKE 'pv %';
UPDATE public.vendors SET status = 'approved' WHERE user_id = '00000000-0000-0000-0000-0000000007a1';
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000007f1","role":"authenticated"}', true);
INSERT INTO _results (check_name, pass, detail)
SELECT 'finance staff see every listing', count(*) = 4, count(*)::TEXT || ' rows' FROM public.products WHERE title LIKE 'pv %';
RESET ROLE;

-- Anonymous visitor after the admin approved P ---------------------------------
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
INSERT INTO _results (check_name, pass, detail)
SELECT 'approval makes P''s listings public; rejected stays hidden', count(*) = 3 AND NOT bool_or(title = 'pv rejected item'),
       coalesce(string_agg(title, ', ' ORDER BY title), 'none')
FROM public.products WHERE title LIKE 'pv %';
RESET ROLE;

INSERT INTO _results (check_name, pass, detail)
SELECT 'no products read policy is open to all rows', count(*) = 0, coalesce(string_agg(policyname, ', '), 'none')
FROM pg_policies WHERE schemaname = 'public' AND tablename = 'products' AND cmd = 'SELECT' AND qual = 'true';

SELECT n, CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END AS result, check_name, detail FROM _results ORDER BY n;

ROLLBACK;
