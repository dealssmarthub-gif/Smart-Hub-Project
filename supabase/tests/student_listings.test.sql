-- Checks for 20261021120000_student_listings_and_vendor_admin. Same format as
-- security_fixes.test.sql: plain SQL, one transaction, ROLLED BACK, one row per check.
BEGIN;

CREATE TEMP TABLE _results (n SERIAL, check_name TEXT, pass BOOLEAN, detail TEXT) ON COMMIT DROP;
GRANT ALL ON _results TO anon, authenticated;
GRANT USAGE ON SEQUENCE _results_n_seq TO anon, authenticated;

-- Fixtures (as postgres) ---------------------------------------------------
-- S lists an item, O is another user, A is an admin.
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
    ('00000000-0000-0000-0000-0000000005a1', 'sl.s@test.invalid', '{"full_name":"Student S"}'),
    ('00000000-0000-0000-0000-0000000005b1', 'sl.o@test.invalid', '{"full_name":"Other O"}'),
    ('00000000-0000-0000-0000-0000000005c1', 'sl.a@test.invalid', '{"full_name":"Admin A"}');
UPDATE public.profiles SET roles = ARRAY['buyer', 'admin'] WHERE id = '00000000-0000-0000-0000-0000000005c1';

-- Signed in as S -----------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000005a1","role":"authenticated"}', true);

INSERT INTO public.vendors (user_id, store_name, store_slug, contact_phone, status)
VALUES (auth.uid(), 'Student S', 'student-s-sl', '+233 24 123 4567', 'approved');

DO $$ BEGIN
    INSERT INTO public.products (vendor_id, title, price, stock, category, listing_type, campus, item_condition, meetup_location)
    SELECT id, 'Desk lamp', 40, 1, 'Dorm Essentials', 'student', 'UG - Legon', 'Like New', 'Akuafo Hall'
    FROM public.vendors WHERE user_id = auth.uid();
    INSERT INTO _results (check_name, pass, detail) VALUES ('#41 student listing saves with own vendor_id', true, 'insert succeeded');
EXCEPTION WHEN OTHERS THEN
    INSERT INTO _results (check_name, pass, detail) VALUES ('#41 student listing saves with own vendor_id', false, SQLERRM);
END $$;

DO $$ BEGIN
    INSERT INTO public.products (vendor_id, title, price, listing_type)
    SELECT id, 'No campus', 10, 'student' FROM public.vendors WHERE user_id = auth.uid();
    INSERT INTO _results (check_name, pass, detail) VALUES ('student listing needs a campus', false, 'insert succeeded');
EXCEPTION WHEN check_violation THEN
    INSERT INTO _results (check_name, pass, detail) VALUES ('student listing needs a campus', true, 'rejected (23514)');
END $$;

DO $$ BEGIN
    UPDATE public.vendors SET contact_phone = 'call me' WHERE user_id = auth.uid();
    INSERT INTO _results (check_name, pass, detail) VALUES ('contact phone must look like a phone number', false, 'update succeeded');
EXCEPTION WHEN check_violation THEN
    INSERT INTO _results (check_name, pass, detail) VALUES ('contact phone must look like a phone number', true, 'rejected (23514)');
END $$;

DO $$ BEGIN
    INSERT INTO public.vendors (user_id, store_name, store_slug)
    VALUES ('00000000-0000-0000-0000-0000000005b1', 'Not mine', 'not-mine-sl');
    INSERT INTO _results (check_name, pass, detail) VALUES ('non-admin cannot create a vendor for someone else', false, 'insert succeeded');
EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO _results (check_name, pass, detail) VALUES ('non-admin cannot create a vendor for someone else', true, 'rejected (42501)');
END $$;
RESET ROLE;

INSERT INTO _results (check_name, pass, detail)
SELECT 'new vendor starts pending (asked for approved)', status = 'pending', status::TEXT
FROM public.vendors WHERE user_id = '00000000-0000-0000-0000-0000000005a1';

-- Anonymous visitor: pending vendor and its listing are hidden --------------
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
INSERT INTO _results (check_name, pass, detail)
SELECT 'pending vendor listing hidden from the marketplace query', count(*) = 0, count(*)::TEXT || ' rows'
FROM public.products p JOIN public.vendors v ON v.id = p.vendor_id
WHERE p.listing_type = 'student' AND v.status = 'approved';
RESET ROLE;

-- Signed in as O: other users' pending vendors stay hidden ------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000005b1","role":"authenticated"}', true);
INSERT INTO _results (check_name, pass, detail)
SELECT 'non-admin cannot read another user''s pending vendor', count(*) = 0, count(*)::TEXT || ' rows'
FROM public.vendors WHERE user_id = '00000000-0000-0000-0000-0000000005a1';
UPDATE public.vendors SET status = 'approved' WHERE user_id = '00000000-0000-0000-0000-0000000005a1';
RESET ROLE;
INSERT INTO _results (check_name, pass, detail)
SELECT 'non-admin cannot approve a vendor', status = 'pending', status::TEXT
FROM public.vendors WHERE user_id = '00000000-0000-0000-0000-0000000005a1';

-- Signed in as A (admin) -----------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000005c1","role":"authenticated"}', true);
INSERT INTO _results (check_name, pass, detail)
SELECT 'admin reads pending vendors', count(*) = 1, count(*)::TEXT || ' rows'
FROM public.vendors WHERE status = 'pending';

UPDATE public.vendors SET status = 'approved' WHERE user_id = '00000000-0000-0000-0000-0000000005a1';

DO $$ BEGIN
    INSERT INTO public.vendors (user_id, store_name, store_slug, contact_phone)
    VALUES ('00000000-0000-0000-0000-0000000005b1', 'Other O Shop', 'other-o-sl', '0241234567');
    INSERT INTO _results (check_name, pass, detail) VALUES ('admin creates a vendor for another user', true, 'insert succeeded');
EXCEPTION WHEN OTHERS THEN
    INSERT INTO _results (check_name, pass, detail) VALUES ('admin creates a vendor for another user', false, SQLERRM);
END $$;
RESET ROLE;

INSERT INTO _results (check_name, pass, detail)
SELECT 'admin approves a vendor', status = 'approved', status::TEXT
FROM public.vendors WHERE user_id = '00000000-0000-0000-0000-0000000005a1';
INSERT INTO _results (check_name, pass, detail)
SELECT 'admin-created vendor starts pending and grants seller', v.status = 'pending' AND 'seller' = ANY (p.roles),
       v.status || ' ' || p.roles::TEXT
FROM public.vendors v JOIN public.profiles p ON p.id = v.user_id
WHERE v.user_id = '00000000-0000-0000-0000-0000000005b1';

-- Anonymous visitor: approved listing and contact phone visible --------------
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
INSERT INTO _results (check_name, pass, detail)
SELECT 'approved listing shows with the vendor''s phone', count(*) = 1 AND bool_and(v.contact_phone = '+233 24 123 4567'),
       coalesce(string_agg(p.title || ' / ' || coalesce(v.contact_phone, 'no phone'), ', '), 'none')
FROM public.products p JOIN public.vendors v ON v.id = p.vendor_id
WHERE p.listing_type = 'student' AND v.status = 'approved';
RESET ROLE;

SELECT n, CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END AS result, check_name, detail FROM _results ORDER BY n;

ROLLBACK;
