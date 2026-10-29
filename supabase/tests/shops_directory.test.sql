-- Checks for the Shops section (/shops and /shops/<slug>): the app's own queries
-- (services/sellerApi.ts fetchApprovedShops, fetchApprovedShop) run as a visitor
-- and as a pending shop's owner. Approved shops only, a shop's page lists only
-- its own items, and a visitor gets no phone or owner id.
-- Same format as security_fixes.test.sql: plain SQL, one transaction, ROLLED BACK.
BEGIN;

CREATE TEMP TABLE _results (n SERIAL, check_name TEXT, pass BOOLEAN, detail TEXT) ON COMMIT DROP;
GRANT ALL ON _results TO anon, authenticated;
GRANT USAGE ON SEQUENCE _results_n_seq TO anon, authenticated;

-- Fixtures (as postgres) ---------------------------------------------------
-- Q and S are approved, P pending, R rejected. Each shop has items.
INSERT INTO auth.users (id, email) VALUES
    ('00000000-0000-0000-0000-0000000008a1', 'sd.p@test.invalid'),
    ('00000000-0000-0000-0000-0000000008b1', 'sd.q@test.invalid'),
    ('00000000-0000-0000-0000-0000000008c1', 'sd.r@test.invalid'),
    ('00000000-0000-0000-0000-0000000008d1', 'sd.s@test.invalid');
INSERT INTO public.vendors (id, user_id, store_name, store_slug, status, contact_phone) VALUES
    ('00000000-0000-0000-0000-00000000080a', '00000000-0000-0000-0000-0000000008a1', 'sd Pending', 'sd-pending', 'pending', '024 111 1111'),
    ('00000000-0000-0000-0000-00000000080b', '00000000-0000-0000-0000-0000000008b1', 'sd Quayson', 'sd-quayson', 'approved', '024 222 2222'),
    ('00000000-0000-0000-0000-00000000080c', '00000000-0000-0000-0000-0000000008c1', 'sd Rejected', 'sd-rejected', 'rejected', '024 333 3333'),
    ('00000000-0000-0000-0000-00000000080d', '00000000-0000-0000-0000-0000000008d1', 'sd Sika', 'sd-sika', 'approved', NULL);
INSERT INTO public.products (vendor_id, title, price, listing_type, campus) VALUES
    ('00000000-0000-0000-0000-00000000080a', 'sd pending item', 10, 'student', 'UG - Legon'),
    ('00000000-0000-0000-0000-00000000080b', 'sd quayson kettle', 20, 'mall', NULL),
    ('00000000-0000-0000-0000-00000000080b', 'sd quayson fan', 25, 'mall', NULL),
    ('00000000-0000-0000-0000-00000000080c', 'sd rejected item', 30, 'mall', NULL),
    ('00000000-0000-0000-0000-00000000080d', 'sd sika lamp', 40, 'student', 'KNUST - Kumasi');

-- Anonymous visitor ---------------------------------------------------------
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);

INSERT INTO _results (check_name, pass, detail)
SELECT 'directory query: visitor gets the approved shops only',
       count(*) = 2 AND bool_and(store_name IN ('sd Quayson', 'sd Sika')),
       coalesce(string_agg(store_name, ', ' ORDER BY store_name), 'none')
FROM (SELECT id, store_name, store_slug, description, logo_url FROM public.vendors
      WHERE status = 'approved' AND store_name LIKE 'sd %') d;

INSERT INTO _results (check_name, pass, detail)
SELECT 'shop page: a pending or rejected slug finds nothing', count(*) = 0, count(*)::TEXT || ' rows'
FROM public.vendors WHERE store_slug IN ('sd-pending', 'sd-rejected') AND status = 'approved';

INSERT INTO _results (check_name, pass, detail)
SELECT 'shop page: an approved slug finds its shop', count(*) = 1, coalesce(string_agg(store_name, ', '), 'none')
FROM public.vendors WHERE store_slug = 'sd-quayson' AND status = 'approved';

INSERT INTO _results (check_name, pass, detail)
SELECT 'shop page items: only that shop''s products', count(*) = 2 AND bool_and(title LIKE 'sd quayson %'),
       coalesce(string_agg(title, ', ' ORDER BY title), 'none')
FROM public.products WHERE vendor_id = '00000000-0000-0000-0000-00000000080b';

INSERT INTO _results (check_name, pass, detail)
SELECT 'a pending or rejected shop''s items are hidden from visitors', count(*) = 0,
       coalesce(string_agg(title, ', '), 'none')
FROM public.products WHERE vendor_id IN ('00000000-0000-0000-0000-00000000080a', '00000000-0000-0000-0000-00000000080c');

DO $$ BEGIN
    PERFORM user_id FROM public.vendors LIMIT 1;
    INSERT INTO _results (check_name, pass, detail) VALUES ('visitor cannot read owner ids', false, 'user_id readable');
EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO _results (check_name, pass, detail) VALUES ('visitor cannot read owner ids', true, SQLERRM);
END $$;
DO $$ BEGIN
    PERFORM contact_phone FROM public.vendors LIMIT 1;
    INSERT INTO _results (check_name, pass, detail) VALUES ('visitor cannot read phone numbers', false, 'contact_phone readable');
EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO _results (check_name, pass, detail) VALUES ('visitor cannot read phone numbers', true, SQLERRM);
END $$;
DO $$ DECLARE p TEXT; BEGIN
    p := public.naflis_vendor_contact('00000000-0000-0000-0000-00000000080b');
    INSERT INTO _results (check_name, pass, detail) VALUES ('visitor cannot get a phone from naflis_vendor_contact', p IS NULL, coalesce(p, 'null'));
EXCEPTION WHEN OTHERS THEN
    INSERT INTO _results (check_name, pass, detail) VALUES ('visitor cannot get a phone from naflis_vendor_contact', true, SQLERRM);
END $$;
RESET ROLE;

-- P, the pending shop's owner -------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000008a1","role":"authenticated"}', true);

-- Why the app filters on status: the policy itself shows owners their own pending shop.
INSERT INTO _results (check_name, pass, detail)
SELECT 'the owner''s policy view includes their pending shop (so the app must filter)',
       bool_or(store_name = 'sd Pending'), coalesce(string_agg(store_name, ', ' ORDER BY store_name), 'none')
FROM public.vendors WHERE store_name LIKE 'sd %';

INSERT INTO _results (check_name, pass, detail)
SELECT 'directory query: the owner still gets approved shops only',
       count(*) = 2 AND NOT bool_or(store_name = 'sd Pending'),
       coalesce(string_agg(store_name, ', ' ORDER BY store_name), 'none')
FROM (SELECT id, store_name, store_slug, description, logo_url FROM public.vendors
      WHERE status = 'approved' AND store_name LIKE 'sd %') d;

INSERT INTO _results (check_name, pass, detail)
SELECT 'shop page: the owner''s own pending slug finds nothing', count(*) = 0, count(*)::TEXT || ' rows'
FROM public.vendors WHERE store_slug = 'sd-pending' AND status = 'approved';
RESET ROLE;

SELECT n, CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END AS result, check_name, detail FROM _results ORDER BY n;

ROLLBACK;
