-- Checks for the production-safety edits to migrations 01–05: seeds, pg_cron,
-- the orders policy recursion fix and the order delete rules. Plain SQL, like
-- security_fixes.test.sql: one transaction, ROLLED BACK, one row per check.
BEGIN;

CREATE TEMP TABLE _results (n SERIAL, check_name TEXT, pass BOOLEAN, detail TEXT) ON COMMIT DROP;
GRANT ALL ON _results TO anon, authenticated;
GRANT USAGE ON SEQUENCE _results_n_seq TO anon, authenticated;

-- Seeds and schedule -------------------------------------------------------
INSERT INTO _results (check_name, pass, detail)
SELECT '04 only the shipped surfaces are on',
       coalesce(array_agg(key ORDER BY key) FILTER (WHERE enabled), '{}') = ARRAY['role_switcher','src_portal','student_os'],
       coalesce(string_agg(key, ', ' ORDER BY key) FILTER (WHERE enabled), 'none')
FROM public.feature_flags;
INSERT INTO _results (check_name, pass, detail)
SELECT '05 no seeded promo codes', count(*) = 0, count(*)::TEXT || ' codes' FROM public.promo_codes;
INSERT INTO _results (check_name, pass, detail)
SELECT '05 pg_cron installed and 4 jobs scheduled',
       count(*) = 4, coalesce(string_agg(jobname, ', ' ORDER BY jobname), 'none')
FROM cron.job WHERE jobname IN ('naflis-expire-reservations', 'naflis-late-installments',
                                'naflis-stale-checkouts', 'naflis-stale-tickets');
INSERT INTO _results (check_name, pass, detail)
SELECT '02 storage.objects still has RLS on', relrowsecurity, relrowsecurity::TEXT
FROM pg_class WHERE oid = 'storage.objects'::regclass;

-- Fixtures (as postgres): S sells, B buys one item -------------------------
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
    ('00000000-0000-0000-0000-00000000c501', 'reset.s@test.invalid', '{"full_name":"Seller S"}'),
    ('00000000-0000-0000-0000-00000000c0b1', 'reset.b@test.invalid', '{"full_name":"Buyer B"}');
INSERT INTO public.vendors (id, user_id, store_name, store_slug)
VALUES ('00000000-0000-0000-0000-00000000cf01', '00000000-0000-0000-0000-00000000c501', 'Reset Shop', 'reset-test-shop');
INSERT INTO public.products (id, vendor_id, title, price, stock)
VALUES ('00000000-0000-0000-0000-00000000cd01', '00000000-0000-0000-0000-00000000cf01', 'Reset Item', 10, 5);
INSERT INTO public.orders (id, buyer_id, total_amount)
VALUES ('00000000-0000-0000-0000-00000000ce01', '00000000-0000-0000-0000-00000000c0b1', 10);
INSERT INTO public.order_items (order_id, product_id, vendor_id, quantity, price)
VALUES ('00000000-0000-0000-0000-00000000ce01', '00000000-0000-0000-0000-00000000cd01',
        '00000000-0000-0000-0000-00000000cf01', 1, 10);

-- F3: reading orders no longer recurses ------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c501","role":"authenticated"}', true);
DO $$ DECLARE c INT; BEGIN
    SELECT count(*) INTO c FROM public.orders;
    INSERT INTO _results (check_name, pass, detail) VALUES ('05 seller reads the order they sell into', c = 1, c || ' rows visible');
    SELECT count(*) INTO c FROM public.order_events;
    INSERT INTO _results (check_name, pass, detail) VALUES ('05 seller can query order_events', true, c || ' rows visible');
EXCEPTION WHEN OTHERS THEN
    INSERT INTO _results (check_name, pass, detail) VALUES ('05 seller reads the order they sell into', false, SQLERRM);
END $$;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c0b1","role":"authenticated"}', true);
DO $$ DECLARE c INT; BEGIN
    SELECT count(*) INTO c FROM public.orders;
    INSERT INTO _results (check_name, pass, detail) VALUES ('05 buyer reads own order', c = 1, c || ' rows visible');
EXCEPTION WHEN OTHERS THEN
    INSERT INTO _results (check_name, pass, detail) VALUES ('05 buyer reads own order', false, SQLERRM);
END $$;
RESET ROLE;

-- 01: delete cascades -------------------------------------------------------
DO $$ BEGIN
    DELETE FROM public.products WHERE id = '00000000-0000-0000-0000-00000000cd01';
    INSERT INTO _results (check_name, pass, detail) VALUES ('01 an ordered product cannot be hard-deleted', false, 'delete succeeded');
EXCEPTION WHEN foreign_key_violation THEN
    INSERT INTO _results (check_name, pass, detail) VALUES ('01 an ordered product cannot be hard-deleted', true, 'rejected (23503)');
END $$;

DO $$ BEGIN
    DELETE FROM auth.users WHERE id = '00000000-0000-0000-0000-00000000c0b1';
    INSERT INTO _results (check_name, pass, detail) VALUES ('01 buyer with an order can delete their account', true, 'deleted');
EXCEPTION WHEN OTHERS THEN
    INSERT INTO _results (check_name, pass, detail) VALUES ('01 buyer with an order can delete their account', false, SQLERRM);
END $$;
INSERT INTO _results (check_name, pass, detail)
SELECT '01 the order and its line survive, unlinked', count(*) = 1 AND bool_and(o.buyer_id IS NULL),
       count(*)::TEXT || ' order(s), buyer_id ' || coalesce(max(o.buyer_id::TEXT), 'null')
FROM public.orders o JOIN public.order_items oi ON oi.order_id = o.id
WHERE o.id = '00000000-0000-0000-0000-00000000ce01';

SELECT n, CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END AS result, check_name, detail FROM _results ORDER BY n;

ROLLBACK;
