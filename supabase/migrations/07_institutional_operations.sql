-- 07_institutional_operations.sql
-- P3: scoped staff invitations & grants, View-As session logging + audit_logs,
-- scoped SRC publishing (announcements / events / resources / timetables),
-- and QR-validated event tickets.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ============================================================================
-- 1. Institutions & campuses (ids mirror src/lib/naflis/permissions.ts)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.institutions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS public.campuses (
    id TEXT PRIMARY KEY, -- e.g. 'UG - Legon'
    institution_id TEXT NOT NULL REFERENCES public.institutions(id)
);
ALTER TABLE public.institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campuses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public institutions read" ON public.institutions FOR SELECT USING (true);
CREATE POLICY "Public campuses read" ON public.campuses FOR SELECT USING (true);

INSERT INTO public.institutions (id, name) VALUES
    ('ug', 'University of Ghana'),
    ('knust', 'Kwame Nkrumah University of Science & Technology'),
    ('ucc', 'University of Cape Coast'),
    ('upsa', 'University of Professional Studies'),
    ('atu', 'Accra Technical University'),
    ('ashesi', 'Ashesi University'),
    ('gimpa', 'GIMPA'),
    ('umat', 'University of Mines & Technology'),
    ('htu', 'Ho Technical University')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.campuses (id, institution_id) VALUES
    ('UG - Legon', 'ug'), ('KNUST - Kumasi', 'knust'), ('UCC - Cape Coast', 'ucc'), ('UPSA - Accra', 'upsa'),
    ('ATU - Accra', 'atu'), ('Ashesi University', 'ashesi'), ('GIMPA', 'gimpa'), ('UMaT - Tarkwa', 'umat'),
    ('Ho Technical University', 'htu')
ON CONFLICT (id) DO NOTHING;

-- Profiles may now hold the dean role.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_roles_known;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_roles_known CHECK (
    roles <@ ARRAY['buyer','seller','student','src_head','dean','delivery','finance','dispute','admin','super_admin']::TEXT[]
);

-- ============================================================================
-- 2. Audit log
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id BIGSERIAL PRIMARY KEY,
    actor_id UUID,
    action TEXT NOT NULL,
    target TEXT,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs (created_at DESC);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read audit_logs" ON public.audit_logs FOR SELECT
    USING (public.has_role('super_admin') OR public.has_role('admin'));
-- No write policies: rows are written by SECURITY DEFINER functions only.

CREATE OR REPLACE FUNCTION public.naflis_audit(p_action TEXT, p_target TEXT, p_details JSONB DEFAULT '{}'::jsonb)
RETURNS VOID AS $$
    INSERT INTO public.audit_logs (actor_id, action, target, details) VALUES (auth.uid(), p_action, p_target, p_details);
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.naflis_audit(TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 3. Staff grants & invitations
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.staff_grants (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    name TEXT,
    title TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('src_head', 'dean')),
    institution_id TEXT NOT NULL REFERENCES public.institutions(id),
    campus_id TEXT NOT NULL, -- a campus id, or '*' for every campus of the institution
    permissions TEXT[] NOT NULL CHECK (cardinality(permissions) > 0 AND permissions <@ ARRAY[
        'student.announcements.create','student.events.create','student.timetable.manage','student.resources.manage',
        'student.tickets.sell','student.tickets.validate','student.lostfound.manage'
    ]::TEXT[]),
    status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'revoked')),
    token_hash TEXT UNIQUE, -- sha256 of the invite token; cleared on accept / revoke
    expires_at TIMESTAMPTZ,
    invited_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    accepted_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_staff_grants_user ON public.staff_grants (user_id) WHERE status = 'active';
ALTER TABLE public.staff_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own or super admin reads grants" ON public.staff_grants FOR SELECT
    USING (user_id = auth.uid() OR public.has_role('super_admin'));

-- THE scope check: does the caller hold `p_perm` for content on campus `p_campus`?
-- Grants never cross institutions, so School A's SRC can't touch School B.
CREATE OR REPLACE FUNCTION public.naflis_has_permission(p_perm TEXT, p_campus TEXT)
RETURNS BOOLEAN AS $$
    SELECT public.has_role('super_admin') OR EXISTS (
        SELECT 1
        FROM public.staff_grants g
        JOIN public.campuses c ON c.id = p_campus
        WHERE g.user_id = auth.uid()
          AND g.status = 'active'
          AND g.institution_id = c.institution_id
          AND (g.campus_id = '*' OR g.campus_id = p_campus)
          AND p_perm = ANY (g.permissions)
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.naflis_invite_staff(
    p_email TEXT, p_name TEXT, p_title TEXT, p_role TEXT, p_institution TEXT, p_campus TEXT,
    p_permissions TEXT[], p_expires_days INTEGER DEFAULT 7
) RETURNS TABLE (grant_id UUID, token TEXT) AS $$
DECLARE
    v_token TEXT := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
    v_id UUID;
BEGIN
    IF NOT public.has_role('super_admin') THEN RAISE EXCEPTION 'not_authorized'; END IF;
    IF p_campus <> '*' AND NOT EXISTS (SELECT 1 FROM public.campuses WHERE id = p_campus AND institution_id = p_institution) THEN
        RAISE EXCEPTION 'campus % is not part of institution %', p_campus, p_institution;
    END IF;
    INSERT INTO public.staff_grants (email, name, title, role, institution_id, campus_id, permissions, token_hash, expires_at, invited_by)
    VALUES (lower(trim(p_email)), p_name, p_title, p_role, p_institution, p_campus, p_permissions,
            encode(extensions.digest(v_token, 'sha256'), 'hex'),
            now() + make_interval(days => greatest(1, least(p_expires_days, 30))), auth.uid())
    RETURNING id INTO v_id;
    PERFORM public.naflis_audit('staff.invite', lower(trim(p_email)),
        jsonb_build_object('grant', v_id, 'institution', p_institution, 'campus', p_campus, 'permissions', p_permissions));
    RETURN QUERY SELECT v_id, v_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- Knowing the token is the authorisation to preview it.
CREATE OR REPLACE FUNCTION public.naflis_preview_staff_invite(p_token TEXT)
RETURNS TABLE (email TEXT, title TEXT, institution_id TEXT, campus_id TEXT, permissions TEXT[], status TEXT, expires_at TIMESTAMPTZ) AS $$
    SELECT g.email, g.title, g.institution_id, g.campus_id, g.permissions, g.status, g.expires_at
    FROM public.staff_grants g
    WHERE g.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions;

CREATE OR REPLACE FUNCTION public.naflis_accept_staff_invite(p_token TEXT)
RETURNS UUID AS $$
DECLARE
    v_grant public.staff_grants%ROWTYPE;
    v_email TEXT;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authorized'; END IF;
    SELECT * INTO v_grant FROM public.staff_grants
    WHERE token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') AND status = 'invited'
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'invite_not_found'; END IF;
    IF v_grant.expires_at < now() THEN RAISE EXCEPTION 'invite_expired'; END IF;
    SELECT lower(email) INTO v_email FROM auth.users WHERE id = auth.uid();
    IF v_email IS DISTINCT FROM v_grant.email THEN RAISE EXCEPTION 'email_mismatch'; END IF;

    UPDATE public.staff_grants
    SET status = 'active', user_id = auth.uid(), accepted_at = now(), token_hash = NULL
    WHERE id = v_grant.id;
    PERFORM set_config('naflis.allow_role_change', 'on', true);
    UPDATE public.profiles SET roles = (SELECT ARRAY(SELECT DISTINCT unnest(roles || v_grant.role))) WHERE id = auth.uid();
    PERFORM set_config('naflis.allow_role_change', 'off', true);
    PERFORM public.naflis_audit('staff.accept', v_grant.id::TEXT, jsonb_build_object('role', v_grant.role));
    RETURN v_grant.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

CREATE OR REPLACE FUNCTION public.naflis_revoke_staff(p_grant UUID)
RETURNS VOID AS $$
BEGIN
    IF NOT public.has_role('super_admin') THEN RAISE EXCEPTION 'not_authorized'; END IF;
    UPDATE public.staff_grants SET status = 'revoked', revoked_at = now(), token_hash = NULL WHERE id = p_grant;
    PERFORM public.naflis_audit('staff.revoke', p_grant::TEXT);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.naflis_update_staff_permissions(p_grant UUID, p_permissions TEXT[])
RETURNS VOID AS $$
BEGIN
    IF NOT public.has_role('super_admin') THEN RAISE EXCEPTION 'not_authorized'; END IF;
    UPDATE public.staff_grants SET permissions = p_permissions WHERE id = p_grant AND status <> 'revoked';
    PERFORM public.naflis_audit('staff.update', p_grant::TEXT, jsonb_build_object('permissions', p_permissions));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 4. View-As sessions
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.impersonation_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    admin_id UUID NOT NULL REFERENCES public.profiles(id),
    target_user_id UUID NOT NULL REFERENCES public.profiles(id),
    role TEXT NOT NULL,
    reason TEXT NOT NULL CHECK (length(trim(reason)) >= 5),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    end_reason TEXT CHECK (end_reason IN ('exit', 'expired'))
);
ALTER TABLE public.impersonation_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins read impersonation_sessions" ON public.impersonation_sessions FOR SELECT
    USING (public.has_role('super_admin'));

CREATE OR REPLACE FUNCTION public.naflis_start_impersonation(p_target UUID, p_role TEXT, p_reason TEXT, p_minutes INTEGER DEFAULT 30)
RETURNS UUID AS $$
DECLARE
    v_roles TEXT[];
    v_id UUID;
BEGIN
    IF NOT public.has_role('super_admin') THEN RAISE EXCEPTION 'not_authorized'; END IF;
    IF p_target = auth.uid() THEN RAISE EXCEPTION 'cannot view as yourself'; END IF;
    SELECT roles || role::TEXT INTO v_roles FROM public.profiles WHERE id = p_target;
    IF v_roles IS NULL THEN RAISE EXCEPTION 'user not found'; END IF;
    IF 'super_admin' = ANY (v_roles) THEN RAISE EXCEPTION 'cannot view as another super admin'; END IF;
    IF NOT (p_role = ANY (v_roles) OR (p_role = 'seller' AND EXISTS (SELECT 1 FROM public.vendors WHERE user_id = p_target))) THEN
        RAISE EXCEPTION 'target does not hold role %', p_role;
    END IF;
    INSERT INTO public.impersonation_sessions (admin_id, target_user_id, role, reason, expires_at)
    VALUES (auth.uid(), p_target, p_role, trim(p_reason), now() + make_interval(mins => greatest(5, least(p_minutes, 60))))
    RETURNING id INTO v_id;
    PERFORM public.naflis_audit('impersonation.start', p_target::TEXT, jsonb_build_object('session', v_id, 'role', p_role, 'reason', trim(p_reason)));
    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.naflis_end_impersonation(p_session UUID, p_reason TEXT DEFAULT 'exit')
RETURNS VOID AS $$
BEGIN
    UPDATE public.impersonation_sessions
    SET ended_at = now(), end_reason = CASE WHEN p_reason = 'expired' THEN 'expired' ELSE 'exit' END
    WHERE id = p_session AND admin_id = auth.uid() AND ended_at IS NULL;
    IF FOUND THEN
        PERFORM public.naflis_audit('impersonation.end', p_session::TEXT, jsonb_build_object('reason', p_reason));
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 5. Scoped SRC publishing (replaces the "any authenticated user" policies)
-- ============================================================================
ALTER TABLE public.campus_events ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'event'
    CHECK (kind IN ('announcement', 'event'));

CREATE OR REPLACE FUNCTION public.naflis_event_permission(p_kind TEXT)
RETURNS TEXT AS $$
    SELECT CASE WHEN p_kind = 'announcement' THEN 'student.announcements.create' ELSE 'student.events.create' END;
$$ LANGUAGE sql IMMUTABLE;

DROP POLICY IF EXISTS "Authenticated campus_events insert" ON public.campus_events;
DROP POLICY IF EXISTS "Authenticated campus_events update" ON public.campus_events;
DROP POLICY IF EXISTS "Authenticated campus_events delete" ON public.campus_events;
CREATE POLICY "Scoped campus_events insert" ON public.campus_events FOR INSERT TO authenticated
    WITH CHECK (public.naflis_has_permission(public.naflis_event_permission(kind), campus));
CREATE POLICY "Scoped campus_events update" ON public.campus_events FOR UPDATE TO authenticated
    USING (public.naflis_has_permission(public.naflis_event_permission(kind), campus))
    WITH CHECK (public.naflis_has_permission(public.naflis_event_permission(kind), campus));
CREATE POLICY "Scoped campus_events delete" ON public.campus_events FOR DELETE TO authenticated
    USING (public.naflis_has_permission(public.naflis_event_permission(kind), campus));

DROP POLICY IF EXISTS "Authenticated campus_resources insert" ON public.campus_resources;
DROP POLICY IF EXISTS "Authenticated campus_resources delete" ON public.campus_resources;
-- This let anyone rewrite any column of any resource; downloads now go through an RPC.
DROP POLICY IF EXISTS "Public campus_resources download count update" ON public.campus_resources;
CREATE POLICY "Scoped campus_resources insert" ON public.campus_resources FOR INSERT TO authenticated
    WITH CHECK (public.naflis_has_permission('student.resources.manage', campus));
CREATE POLICY "Scoped campus_resources update" ON public.campus_resources FOR UPDATE TO authenticated
    USING (public.naflis_has_permission('student.resources.manage', campus))
    WITH CHECK (public.naflis_has_permission('student.resources.manage', campus));
CREATE POLICY "Scoped campus_resources delete" ON public.campus_resources FOR DELETE TO authenticated
    USING (public.naflis_has_permission('student.resources.manage', campus));

CREATE OR REPLACE FUNCTION public.naflis_count_download(p_resource UUID)
RETURNS VOID AS $$
    UPDATE public.campus_resources SET downloads = downloads + 1 WHERE id = p_resource;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;
GRANT EXECUTE ON FUNCTION public.naflis_count_download(UUID) TO anon, authenticated;

-- Timetables, exams, opportunities: from "any campus staff" (migration 06) to scoped.
DROP POLICY IF EXISTS "Staff manage timetable" ON public.timetable_entries;
DROP POLICY IF EXISTS "Staff manage exams" ON public.exam_entries;
DROP POLICY IF EXISTS "Staff manage opportunities" ON public.opportunities;
CREATE POLICY "Scoped timetable manage" ON public.timetable_entries FOR ALL TO authenticated
    USING (public.naflis_has_permission('student.timetable.manage', campus))
    WITH CHECK (public.naflis_has_permission('student.timetable.manage', campus));
CREATE POLICY "Scoped exams manage" ON public.exam_entries FOR ALL TO authenticated
    USING (public.naflis_has_permission('student.timetable.manage', campus))
    WITH CHECK (public.naflis_has_permission('student.timetable.manage', campus));
-- Cross-institution listings ('All Campuses') stay with super admins.
CREATE POLICY "Scoped opportunities manage" ON public.opportunities FOR ALL TO authenticated
    USING (public.naflis_has_permission('student.announcements.create', institution))
    WITH CHECK (public.naflis_has_permission('student.announcements.create', institution));

-- Lost & Found desk: scoped to the item's campus.
DROP POLICY IF EXISTS "Reporter or desk reads item" ON public.lost_found_items;
CREATE POLICY "Reporter or desk reads item" ON public.lost_found_items FOR SELECT
    USING (reporter_id = auth.uid() OR public.naflis_has_permission('student.lostfound.manage', campus));
DROP POLICY IF EXISTS "Claim parties read claims" ON public.lost_found_claims;
CREATE POLICY "Claim parties read claims" ON public.lost_found_claims FOR SELECT USING (
    claimant_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM public.lost_found_items i WHERE i.id = item_id
          AND (i.reporter_id = auth.uid() OR public.naflis_has_permission('student.lostfound.manage', i.campus))
    )
);
DROP POLICY IF EXISTS "Item parties read events" ON public.lost_found_events;
CREATE POLICY "Item parties read events" ON public.lost_found_events FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.lost_found_items i WHERE i.id = item_id
          AND (i.reporter_id = auth.uid() OR public.naflis_has_permission('student.lostfound.manage', i.campus))
    )
    OR EXISTS (SELECT 1 FROM public.lost_found_claims c WHERE c.item_id = lost_found_events.item_id AND c.claimant_id = auth.uid())
);

-- Same as migration 06, but the Lost & Found desk is scoped to the item's campus.
CREATE OR REPLACE FUNCTION public.naflis_lf_transition(p_item UUID, p_to TEXT, p_claim UUID, p_code TEXT, p_note TEXT)
RETURNS TEXT AS $$
DECLARE
    v_item public.lost_found_items%ROWTYPE;
    v_claim public.lost_found_claims%ROWTYPE;
    v_actor TEXT;
BEGIN
    SELECT * INTO v_item FROM public.lost_found_items WHERE id = p_item FOR UPDATE;
    IF NOT FOUND OR v_item.kind <> 'found' THEN RAISE EXCEPTION 'not_found'; END IF;
    IF p_claim IS NOT NULL THEN
        SELECT * INTO v_claim FROM public.lost_found_claims WHERE id = p_claim AND item_id = p_item FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'claim_not_found'; END IF;
    END IF;

    v_actor := CASE
        WHEN v_item.reporter_id = auth.uid() THEN 'finder'
        WHEN public.naflis_has_permission('student.lostfound.manage', v_item.campus) THEN 'desk'
        WHEN v_claim.claimant_id = auth.uid() THEN 'claimant'
        ELSE NULL END;
    IF v_actor IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.lost_found_transitions
        WHERE from_status = v_item.status AND to_status = p_to AND v_actor = ANY (actors)
    ) THEN
        RAISE EXCEPTION 'invalid_transition:% -> % as %', v_item.status, p_to, coalesce(v_actor, 'stranger');
    END IF;

    IF p_to = 'verification_required' THEN
        UPDATE public.lost_found_claims SET status = 'verification_required' WHERE id = p_claim;
    ELSIF p_to = 'found' AND p_claim IS NOT NULL THEN
        UPDATE public.lost_found_claims SET status = 'rejected', collection_code = NULL WHERE id = p_claim;
    ELSIF p_to = 'claim_approved' THEN
        IF v_claim.proof_answer IS NULL THEN RAISE EXCEPTION 'proof_missing'; END IF;
        UPDATE public.lost_found_claims
        SET status = 'approved', collection_code = upper(substr(md5(gen_random_uuid()::TEXT), 1, 6))
        WHERE id = p_claim;
        UPDATE public.lost_found_claims SET status = 'rejected'
        WHERE item_id = p_item AND id <> p_claim AND status <> 'rejected';
    ELSIF p_to = 'collected' THEN
        IF v_claim.status <> 'approved' OR v_claim.collection_code IS DISTINCT FROM upper(trim(p_code)) THEN
            RAISE EXCEPTION 'bad_collection_code';
        END IF;
        UPDATE public.lost_found_claims SET status = 'collected' WHERE id = p_claim;
    END IF;

    UPDATE public.lost_found_items SET status = p_to WHERE id = p_item;
    INSERT INTO public.lost_found_events (item_id, from_status, to_status, actor_role, actor_id, note)
    VALUES (p_item, v_item.status, p_to, v_actor, auth.uid(), p_note);
    RETURN p_to;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 6. Event tickets
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ticket_tiers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_id UUID NOT NULL REFERENCES public.campus_events(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price_minor BIGINT NOT NULL CHECK (price_minor >= 0),
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    sold INTEGER NOT NULL DEFAULT 0,
    sales_end_at TIMESTAMPTZ,
    CHECK (sold BETWEEN 0 AND capacity)
);
CREATE TABLE IF NOT EXISTS public.tickets (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_id UUID NOT NULL REFERENCES public.campus_events(id) ON DELETE CASCADE,
    tier_id UUID NOT NULL REFERENCES public.ticket_tiers(id),
    holder_id UUID NOT NULL REFERENCES public.profiles(id),
    holder_name TEXT,
    -- 128-bit random token in the QR code (Crockford base32, 26 chars).
    token TEXT NOT NULL UNIQUE,
    price_minor BIGINT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'valid', 'checked_in', 'void')),
    intent_id UUID REFERENCES public.payment_intents(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    checked_in_at TIMESTAMPTZ,
    checked_in_by UUID
);
ALTER TABLE public.ticket_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public ticket_tiers read" ON public.ticket_tiers FOR SELECT USING (true);
CREATE POLICY "Scoped ticket_tiers manage" ON public.ticket_tiers FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.campus_events e WHERE e.id = event_id AND public.naflis_has_permission('student.tickets.sell', e.campus)))
    WITH CHECK (EXISTS (SELECT 1 FROM public.campus_events e WHERE e.id = event_id AND public.naflis_has_permission('student.tickets.sell', e.campus)));
CREATE POLICY "Holder or gate staff reads tickets" ON public.tickets FOR SELECT USING (
    holder_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.campus_events e WHERE e.id = event_id AND public.naflis_has_permission('student.tickets.validate', e.campus))
);
-- No client writes: tickets are issued by the payments service and checked in by RPC.

ALTER TABLE public.payment_intents DROP CONSTRAINT IF EXISTS payment_intents_purpose_check;
ALTER TABLE public.payment_intents ADD CONSTRAINT payment_intents_purpose_check
    CHECK (purpose IN ('order', 'installment', 'reservation_balance', 'topup', 'ticket'));
ALTER TABLE public.wallet_ledger DROP CONSTRAINT IF EXISTS wallet_ledger_entry_type_check;
ALTER TABLE public.wallet_ledger ADD CONSTRAINT wallet_ledger_entry_type_check CHECK (entry_type IN (
    'topup','payment','escrow_release','refund','settlement','reservation_forfeit','credit_repayment','ticket_purchase'
));

-- Holds a seat (sold + 1) and creates a pending ticket + intent. Idempotent on (user, key).
CREATE OR REPLACE FUNCTION public.naflis_create_ticket_intent(
    p_user UUID, p_key TEXT, p_tier UUID, p_method TEXT, p_token TEXT, p_holder_name TEXT
) RETURNS UUID AS $$
DECLARE
    v_existing UUID;
    v_tier public.ticket_tiers%ROWTYPE;
    v_intent UUID := gen_random_uuid();
    v_held INTEGER;
BEGIN
    SELECT id INTO v_existing FROM public.payment_intents WHERE user_id = p_user AND idempotency_key = p_key;
    IF FOUND THEN RETURN v_existing; END IF;

    SELECT * INTO v_tier FROM public.ticket_tiers WHERE id = p_tier FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
    IF v_tier.sales_end_at IS NOT NULL AND v_tier.sales_end_at < now() THEN RAISE EXCEPTION 'sales_closed'; END IF;
    IF v_tier.sold >= v_tier.capacity THEN RAISE EXCEPTION 'sold_out'; END IF;
    SELECT count(*) INTO v_held FROM public.tickets WHERE event_id = v_tier.event_id AND holder_id = p_user AND status <> 'void';
    IF v_held >= 4 THEN RAISE EXCEPTION 'ticket_limit'; END IF;

    UPDATE public.ticket_tiers SET sold = sold + 1 WHERE id = p_tier;
    INSERT INTO public.payment_intents (id, user_id, idempotency_key, request_hash, purpose, amount_minor, method, provider_reference)
    VALUES (v_intent, p_user, p_key, 'ticket:' || p_tier, 'ticket', v_tier.price_minor, p_method,
            CASE WHEN p_method IN ('card','momo') THEN 'nfl_' || replace(v_intent::TEXT, '-', '') END);
    INSERT INTO public.tickets (event_id, tier_id, holder_id, holder_name, token, price_minor, intent_id)
    VALUES (v_tier.event_id, p_tier, p_user, p_holder_name, p_token, v_tier.price_minor, v_intent);
    IF v_tier.price_minor = 0 THEN
        PERFORM public.naflis_mark_intent_succeeded(v_intent, NULL);
    END IF;
    RETURN v_intent;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Same as migration 05, plus ticket purchases (purpose 'ticket').
CREATE OR REPLACE FUNCTION public.naflis_mark_intent_succeeded(p_intent UUID, p_provider_amount BIGINT)
RETURNS BOOLEAN AS $$
DECLARE
    v_i public.payment_intents%ROWTYPE;
    v_plan public.installment_plans%ROWTYPE;
    v_escrow BOOLEAN;
    v_has_reservation BOOLEAN;
BEGIN
    SELECT * INTO v_i FROM public.payment_intents WHERE id = p_intent FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'intent_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF v_i.status = 'succeeded' THEN
        RETURN true;
    END IF;
    IF p_provider_amount IS NOT NULL AND p_provider_amount <> v_i.amount_minor THEN
        UPDATE public.payment_intents SET status = 'failed', failure_reason = 'amount_mismatch', updated_at = now() WHERE id = p_intent;
        RETURN false;
    END IF;

    IF v_i.purpose = 'installment' THEN
        SELECT * INTO v_plan FROM public.installment_plans WHERE id = v_i.plan_id FOR UPDATE;
    END IF;
    -- Credit repayments go to NAFLIS, everything else is held in the buyer's escrow.
    v_escrow := v_i.purpose IN ('order', 'reservation_balance') OR (v_i.purpose = 'installment' AND v_plan.kind = 'installment');

    IF v_i.amount_minor > 0 THEN
        IF v_i.purpose = 'topup' THEN
            PERFORM public.naflis_wallet_post(v_i.user_id, 'topup', v_i.amount_minor, 0, NULL, v_i.id, 'intent:' || v_i.id, 'Wallet top-up');
        ELSE
            PERFORM public.naflis_wallet_post(
                v_i.user_id,
                CASE WHEN v_escrow THEN 'payment' WHEN v_i.purpose = 'ticket' THEN 'ticket_purchase' ELSE 'credit_repayment' END,
                CASE WHEN v_i.method = 'wallet' THEN -v_i.amount_minor ELSE 0 END,
                CASE WHEN v_escrow THEN v_i.amount_minor ELSE 0 END,
                v_i.order_id, v_i.id, 'intent:' || v_i.id,
                CASE WHEN v_i.method = 'wallet' THEN 'Paid from NAFLIS Wallet' ELSE 'Paid by ' || v_i.method END
            );
        END IF;
    END IF;

    UPDATE public.payment_intents SET status = 'succeeded', confirmed_at = now(), updated_at = now(), failure_reason = NULL
    WHERE id = p_intent;

    IF v_i.purpose = 'order' THEN
        UPDATE public.orders SET
            amount_paid_minor = amount_paid_minor + v_i.amount_minor,
            escrow_held_minor = escrow_held_minor + v_i.amount_minor
        WHERE id = v_i.order_id;
        UPDATE public.installment_entries e SET status = 'paid', paid_minor = e.amount_minor, paid_at = now()
        FROM public.installment_plans p
        WHERE p.order_id = v_i.order_id AND e.plan_id = p.id AND e.seq = 0;
        UPDATE public.installment_plans SET status = 'active',
            paid_minor = (SELECT coalesce(sum(paid_minor), 0) FROM public.installment_entries WHERE plan_id = installment_plans.id)
        WHERE order_id = v_i.order_id;
        UPDATE public.reservations SET status = 'active' WHERE order_id = v_i.order_id AND status = 'pending';
        SELECT EXISTS (SELECT 1 FROM public.reservations WHERE order_id = v_i.order_id AND status = 'active') INTO v_has_reservation;
        PERFORM public.naflis_refresh_delivery_gate(v_i.order_id);
        IF NOT v_has_reservation THEN
            PERFORM public.naflis_transition_order(v_i.order_id, 'paid', 'system', NULL, 'Payment confirmed — funds in escrow');
        ELSE
            INSERT INTO public.order_events (order_id, from_state, to_state, actor_role, note)
            VALUES (v_i.order_id, 'awaiting_payment', 'awaiting_payment', 'system', 'Reservation fee paid — stock held');
        END IF;

    ELSIF v_i.purpose = 'installment' THEN
        UPDATE public.installment_entries SET status = 'paid', paid_minor = amount_minor, paid_at = now()
        WHERE plan_id = v_i.plan_id AND seq = v_i.entry_seq;
        UPDATE public.installment_plans SET
            paid_minor = paid_minor + v_i.amount_minor,
            status = CASE
                WHEN NOT EXISTS (SELECT 1 FROM public.installment_entries WHERE plan_id = v_i.plan_id AND status <> 'paid') THEN 'completed'
                WHEN EXISTS (SELECT 1 FROM public.installment_entries WHERE plan_id = v_i.plan_id AND status = 'late') THEN 'late'
                ELSE 'active' END
        WHERE id = v_i.plan_id;
        UPDATE public.orders SET
            amount_paid_minor = amount_paid_minor + v_i.amount_minor,
            escrow_held_minor = escrow_held_minor + CASE WHEN v_escrow THEN v_i.amount_minor ELSE 0 END,
            outstanding_minor = greatest(0, outstanding_minor - v_i.amount_minor)
        WHERE id = v_i.order_id;
        PERFORM public.naflis_refresh_delivery_gate(v_i.order_id);

    ELSIF v_i.purpose = 'reservation_balance' THEN
        UPDATE public.reservations SET status = 'converted', balance_minor = 0 WHERE id = v_i.reservation_id;
        UPDATE public.orders SET
            amount_paid_minor = amount_paid_minor + v_i.amount_minor,
            escrow_held_minor = escrow_held_minor + v_i.amount_minor,
            outstanding_minor = greatest(0, outstanding_minor - v_i.amount_minor)
        WHERE id = v_i.order_id;
        PERFORM public.naflis_refresh_delivery_gate(v_i.order_id);
        PERFORM public.naflis_transition_order(v_i.order_id, 'paid', 'system', NULL, 'Reservation balance paid — funds in escrow');

    ELSIF v_i.purpose = 'ticket' THEN
        UPDATE public.tickets SET status = 'valid' WHERE intent_id = v_i.id AND status = 'pending';
    END IF;
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Gate check-in: atomic, so a ticket admits exactly once even with two scanners.
CREATE OR REPLACE FUNCTION public.naflis_check_in_ticket(p_token TEXT)
RETURNS TABLE (ok BOOLEAN, message TEXT, holder_name TEXT, tier TEXT) AS $$
DECLARE
    v_t public.tickets%ROWTYPE;
    v_campus TEXT;
    v_tier TEXT;
BEGIN
    SELECT * INTO v_t FROM public.tickets WHERE token = upper(trim(p_token));
    IF NOT FOUND THEN RETURN QUERY SELECT false, 'Not a valid NAFLIS ticket.', NULL::TEXT, NULL::TEXT; RETURN; END IF;
    SELECT e.campus INTO v_campus FROM public.campus_events e WHERE e.id = v_t.event_id;
    IF NOT public.naflis_has_permission('student.tickets.validate', v_campus) THEN
        RETURN QUERY SELECT false, 'You''re not authorised to validate tickets for this event.', NULL::TEXT, NULL::TEXT; RETURN;
    END IF;
    SELECT name INTO v_tier FROM public.ticket_tiers WHERE id = v_t.tier_id;

    UPDATE public.tickets SET status = 'checked_in', checked_in_at = now(), checked_in_by = auth.uid()
    WHERE id = v_t.id AND status = 'valid';
    IF FOUND THEN
        PERFORM public.naflis_audit('ticket.check_in', v_t.id::TEXT);
        RETURN QUERY SELECT true, 'Admit ' || coalesce(v_t.holder_name, 'holder') || ' · ' || v_tier, v_t.holder_name, v_tier;
    ELSIF v_t.status = 'checked_in' THEN
        RETURN QUERY SELECT false, 'Already used at ' || to_char(v_t.checked_in_at AT TIME ZONE 'UTC', 'HH24:MI') || '.', v_t.holder_name, v_tier;
    ELSIF v_t.status = 'pending' THEN
        RETURN QUERY SELECT false, 'Payment for this ticket has not completed.', v_t.holder_name, v_tier;
    ELSE
        RETURN QUERY SELECT false, 'This ticket was voided.', v_t.holder_name, v_tier;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Releases seats held by ticket payments that never completed.
CREATE OR REPLACE FUNCTION public.naflis_expire_stale_tickets()
RETURNS INTEGER AS $$
DECLARE
    v_n INTEGER := 0;
    v_t RECORD;
BEGIN
    FOR v_t IN
        SELECT t.id, t.tier_id, t.intent_id FROM public.tickets t
        JOIN public.payment_intents pi ON pi.id = t.intent_id
        WHERE t.status = 'pending' AND pi.status IN ('requires_payment', 'failed', 'canceled')
          AND pi.created_at < now() - INTERVAL '30 minutes'
        FOR UPDATE OF t SKIP LOCKED
    LOOP
        UPDATE public.tickets SET status = 'void' WHERE id = v_t.id;
        UPDATE public.ticket_tiers SET sold = greatest(0, sold - 1) WHERE id = v_t.tier_id;
        UPDATE public.payment_intents SET status = 'canceled', failure_reason = coalesce(failure_reason, 'expired') WHERE id = v_t.intent_id AND status <> 'succeeded';
        v_n := v_n + 1;
    END LOOP;
    RETURN v_n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 7. Function privileges
-- ============================================================================
DO $$
DECLARE
    f TEXT;
BEGIN
    -- Called by signed-in users; each function checks its own authorisation.
    FOREACH f IN ARRAY ARRAY[
        'naflis_invite_staff(text,text,text,text,text,text,text[],integer)',
        'naflis_accept_staff_invite(text)',
        'naflis_revoke_staff(uuid)',
        'naflis_update_staff_permissions(uuid,text[])',
        'naflis_start_impersonation(uuid,text,text,integer)',
        'naflis_end_impersonation(uuid,text)',
        'naflis_check_in_ticket(text)'
    ] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
        EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
    END LOOP;
    -- Invite links are opened before signing in.
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.naflis_preview_staff_invite(text) TO anon, authenticated';
    -- Money paths: service role (payments Edge Function) only.
    FOREACH f IN ARRAY ARRAY[
        'naflis_create_ticket_intent(uuid,text,uuid,text,text,text)',
        'naflis_mark_intent_succeeded(uuid,bigint)',
        'naflis_expire_stale_tickets()'
    ] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
        EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
    END LOOP;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.schedule('naflis-stale-tickets', '*/10 * * * *', 'SELECT public.naflis_expire_stale_tickets()');
    END IF;
END $$;
