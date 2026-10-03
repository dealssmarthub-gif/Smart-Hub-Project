-- pgTAP: cross-institution isolation at the database (run with `supabase test db`).
-- A KNUST SRC executive must not create, change or delete University of Ghana
-- content, must not validate UG tickets, and must not read the UG Lost & Found desk.
-- Everything runs in a transaction and is rolled back.
BEGIN;
SELECT plan(9);

-- Fixtures ----------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
    ('00000000-0000-0000-0000-0000000000a1', 'src.ug@test.gh'),
    ('00000000-0000-0000-0000-0000000000b1', 'src.knust@test.gh');
-- handle_new_user() created the profiles.
INSERT INTO public.staff_grants (user_id, email, title, role, institution_id, campus_id, permissions, status) VALUES
    ('00000000-0000-0000-0000-0000000000a1', 'src.ug@test.gh', 'SRC President', 'src_head', 'ug', 'UG - Legon',
     ARRAY['student.announcements.create','student.events.create','student.tickets.validate','student.lostfound.manage'], 'active'),
    ('00000000-0000-0000-0000-0000000000b1', 'src.knust@test.gh', 'SRC President', 'src_head', 'knust', 'KNUST - Kumasi',
     ARRAY['student.announcements.create','student.events.create','student.tickets.validate','student.lostfound.manage'], 'active');
INSERT INTO public.campus_events (id, kind, title, campus, pinned)
    VALUES ('00000000-0000-0000-0000-0000000000e1', 'announcement', 'UG notice', 'UG - Legon', false);

-- Act as the KNUST executive.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);

SELECT ok(public.naflis_has_permission('student.announcements.create', 'KNUST - Kumasi'), 'KNUST SRC may publish at KNUST');
SELECT ok(NOT public.naflis_has_permission('student.announcements.create', 'UG - Legon'), 'KNUST SRC may not publish at UG');

SELECT throws_ok(
    $$ INSERT INTO public.campus_events (kind, title, campus, pinned) VALUES ('announcement', 'Hijack', 'UG - Legon', true) $$,
    '42501', NULL, 'insert into another institution is rejected by RLS (PostgREST: 403)'
);
SELECT lives_ok(
    $$ INSERT INTO public.campus_events (kind, title, campus, pinned) VALUES ('announcement', 'Own notice', 'KNUST - Kumasi', false) $$,
    'insert for own campus succeeds'
);

-- Updates/deletes on rows hidden by RLS affect nothing.
UPDATE public.campus_events SET pinned = true WHERE id = '00000000-0000-0000-0000-0000000000e1';
DELETE FROM public.campus_events WHERE id = '00000000-0000-0000-0000-0000000000e1';
RESET ROLE;
SELECT is(
    (SELECT pinned FROM public.campus_events WHERE id = '00000000-0000-0000-0000-0000000000e1'), false,
    'cross-institution update changed nothing'
);
SELECT is(
    (SELECT count(*)::INT FROM public.campus_events WHERE id = '00000000-0000-0000-0000-0000000000e1'), 1,
    'cross-institution delete removed nothing'
);

-- Ticket validation across institutions.
INSERT INTO public.ticket_tiers (id, event_id, name, price_minor, capacity)
    VALUES ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1', 'Regular', 0, 10);
INSERT INTO public.tickets (event_id, tier_id, holder_id, token, price_minor, status)
    VALUES ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f1',
            '00000000-0000-0000-0000-0000000000a1', 'TESTTOKEN0000000000000000A', 0, 'valid');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
SELECT is(
    (SELECT ok FROM public.naflis_check_in_ticket('TESTTOKEN0000000000000000A')), false,
    'KNUST gate cannot check in a UG ticket'
);

-- Lost & Found desk scope.
RESET ROLE;
INSERT INTO public.lost_found_items (kind, reporter_id, title, description, category, campus, location, happened_on, status)
    VALUES ('found', '00000000-0000-0000-0000-0000000000a1', 'ID card', 'GHA-123456789-0', 'ID / Student card', 'UG - Legon', 'Library', current_date, 'found');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
SELECT is((SELECT count(*)::INT FROM public.lost_found_items WHERE campus = 'UG - Legon'), 0, 'KNUST desk cannot read UG raw Lost & Found rows');
SELECT is((SELECT count(*)::INT FROM public.lost_found_public WHERE campus = 'UG - Legon' AND description LIKE '%123456789%'), 0, 'public view never exposes the raw number');

SELECT * FROM finish();
ROLLBACK;
