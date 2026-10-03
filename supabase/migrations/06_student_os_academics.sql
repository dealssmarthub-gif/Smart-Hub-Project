-- 06_student_os_academics.sql
-- P2 Student OS: structured timetable & exams, opportunities board, Lost & Found
-- with server-side privacy masking and claim lifecycle, campus context.

-- ============================================================================
-- 1. Campus context: registered institution vs. active campus
-- ============================================================================
-- profiles.institution_id (migration 04) is the REGISTERED institution.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active_campus TEXT;

-- The registered institution only changes through verification (or an admin).
CREATE OR REPLACE FUNCTION public.protect_profile_roles()
RETURNS TRIGGER AS $$
BEGIN
    IF auth.uid() IS NOT NULL
       AND coalesce(current_setting('naflis.allow_role_change', true), '') <> 'on'
       AND NOT public.has_role('super_admin') THEN
        new.roles := old.roles;
        new.role := old.role;
        IF NOT (public.has_role('finance') OR public.has_role('admin')) THEN
            new.kyc_verified := old.kyc_verified;
            new.credit_score := old.credit_score;
            new.credit_limit_minor := old.credit_limit_minor;
        END IF;
        IF NOT (public.has_role('src_head') OR public.has_role('admin')) THEN
            new.institution_id := old.institution_id;
        END IF;
    END IF;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Who may publish academic data / run the Lost & Found desk.
CREATE OR REPLACE FUNCTION public.is_campus_staff()
RETURNS BOOLEAN AS $$
    SELECT public.has_role('src_head') OR public.has_role('admin') OR public.has_role('super_admin');
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 2. Timetable & exams
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.timetable_entries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    institution TEXT NOT NULL,
    campus TEXT NOT NULL,
    course_code TEXT NOT NULL,
    course_title TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'lecture' CHECK (kind IN ('lecture','tutorial','lab','seminar')),
    lecturer TEXT,
    hall TEXT,
    location TEXT,
    programme TEXT NOT NULL DEFAULT 'All',
    level TEXT,
    weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6), -- 0 = Sunday
    start_time TIME NOT NULL,
    end_time TIME NOT NULL CHECK (end_time > start_time),
    starts_on DATE NOT NULL,
    ends_on DATE NOT NULL CHECK (ends_on >= starts_on),
    recurrence TEXT NOT NULL DEFAULT 'weekly' CHECK (recurrence IN ('weekly','biweekly','once')),
    exceptions DATE[] NOT NULL DEFAULT '{}',
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_timetable_campus ON public.timetable_entries (campus, weekday);

CREATE TABLE IF NOT EXISTS public.exam_entries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    institution TEXT NOT NULL,
    campus TEXT NOT NULL,
    course_code TEXT NOT NULL,
    course_title TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'final' CHECK (kind IN ('quiz','midsem','final','practical')),
    exam_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL CHECK (end_time > start_time),
    hall TEXT,
    location TEXT,
    invigilator TEXT,
    notes TEXT,
    programme TEXT NOT NULL DEFAULT 'All',
    level TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_exams_campus_date ON public.exam_entries (campus, exam_date);

-- ============================================================================
-- 3. Opportunities
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.opportunities (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('job','internship','scholarship')),
    title TEXT NOT NULL,
    organization TEXT NOT NULL,
    institution TEXT NOT NULL DEFAULT 'All Campuses',
    programmes TEXT[] NOT NULL DEFAULT '{}', -- empty = all programmes
    levels TEXT[] NOT NULL DEFAULT '{}',     -- empty = all levels
    location TEXT,
    mode TEXT NOT NULL DEFAULT 'on-site' CHECK (mode IN ('on-site','remote','hybrid')),
    value TEXT,
    deadline DATE NOT NULL,
    description TEXT,
    apply_url TEXT CHECK (apply_url IS NULL OR apply_url ~* '^https://'),
    posted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_opportunities_deadline ON public.opportunities (deadline);

ALTER TABLE public.timetable_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public timetable read" ON public.timetable_entries FOR SELECT USING (true);
CREATE POLICY "Staff manage timetable" ON public.timetable_entries FOR ALL TO authenticated
    USING (public.is_campus_staff()) WITH CHECK (public.is_campus_staff());
CREATE POLICY "Public exams read" ON public.exam_entries FOR SELECT USING (true);
CREATE POLICY "Staff manage exams" ON public.exam_entries FOR ALL TO authenticated
    USING (public.is_campus_staff()) WITH CHECK (public.is_campus_staff());
CREATE POLICY "Public opportunities read" ON public.opportunities FOR SELECT USING (true);
CREATE POLICY "Staff manage opportunities" ON public.opportunities FOR ALL TO authenticated
    USING (public.is_campus_staff()) WITH CHECK (public.is_campus_staff());

-- ============================================================================
-- 4. Lost & Found
-- ============================================================================

-- Mirrors maskSensitive() in src/lib/naflis/privacyShield.ts. Runs in a trigger,
-- so the public columns are masked even if a client skips its own masking.
CREATE OR REPLACE FUNCTION public.naflis_mask_sensitive(p TEXT)
RETURNS TEXT AS $$
DECLARE
    t TEXT := coalesce(p, '');
BEGIN
    t := regexp_replace(t, 'GHA[-[:space:]]?[0-9]{9}[-[:space:]]?[0-9]', 'GHA-•••••••••-•', 'gi');
    t := regexp_replace(t, '([A-Za-z0-9])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})', '\1•••@\2', 'g');
    t := regexp_replace(t, '(?:[0-9][ -]?){9,15}([0-9]{4})\M', '•••• •••• \1', 'g');
    t := regexp_replace(t, '(?:\+?233|\m0)[[:space:]-]?[0-9]{2}[[:space:]-]?[0-9]{3}[[:space:]-]?[0-9]{2}([0-9]{2})\M', '••• ••• ••\1', 'g');
    t := regexp_replace(t, '\m[A-Z][0-9]{7,8}\M', '••••••••', 'g');
    t := regexp_replace(t, '\m[0-9]{5,10}([0-9]{2})\M', '•••••\1', 'g');
    RETURN t;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE TABLE IF NOT EXISTS public.lost_found_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('lost','found')),
    reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    public_title TEXT,
    public_description TEXT,
    category TEXT NOT NULL,
    campus TEXT NOT NULL,
    location TEXT NOT NULL,
    happened_on DATE NOT NULL,
    -- Storage paths: private bucket holds the original, public bucket the shielded copy.
    photo_private_path TEXT,
    photo_public_path TEXT,
    photo_shielded BOOLEAN NOT NULL DEFAULT false,
    verification_question TEXT,
    verification_answer TEXT,
    handover_point TEXT,
    status TEXT NOT NULL CHECK (status IN (
        'open','matched',                                                                   -- lost reports
        'found','claim_requested','verification_required','claim_approved','collected',     -- found items
        'closed'
    )),
    matched_with UUID REFERENCES public.lost_found_items(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lost_found_campus ON public.lost_found_items (campus, kind, status);

CREATE OR REPLACE FUNCTION public.naflis_lf_shield()
RETURNS TRIGGER AS $$
BEGIN
    new.public_title := public.naflis_mask_sensitive(new.title);
    new.public_description := public.naflis_mask_sensitive(new.description);
    new.photo_shielded := new.photo_shielded
        OR new.category IN ('ID / Student card', 'Bank card', 'Passport', 'Wallet / Purse')
        OR new.public_description <> new.description;
    new.updated_at := now();
    RETURN new;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS lost_found_shield ON public.lost_found_items;
CREATE TRIGGER lost_found_shield BEFORE INSERT OR UPDATE ON public.lost_found_items
    FOR EACH ROW EXECUTE FUNCTION public.naflis_lf_shield();

CREATE TABLE IF NOT EXISTS public.lost_found_claims (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    item_id UUID NOT NULL REFERENCES public.lost_found_items(id) ON DELETE CASCADE,
    claimant_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    proof_answer TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','verification_required','approved','rejected','collected')),
    collection_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS lost_found_one_live_claim
    ON public.lost_found_claims (item_id, claimant_id) WHERE status <> 'rejected';

CREATE TABLE IF NOT EXISTS public.lost_found_events (
    id BIGSERIAL PRIMARY KEY,
    item_id UUID NOT NULL REFERENCES public.lost_found_items(id) ON DELETE CASCADE,
    from_status TEXT,
    to_status TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    actor_id UUID,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Mirrors CLAIM_TRANSITIONS in src/lib/naflis/lostFound.ts.
CREATE TABLE IF NOT EXISTS public.lost_found_transitions (
    from_status TEXT NOT NULL,
    to_status TEXT NOT NULL,
    actors TEXT[] NOT NULL,
    PRIMARY KEY (from_status, to_status)
);
INSERT INTO public.lost_found_transitions (from_status, to_status, actors) VALUES
    ('found',                 'claim_requested',       ARRAY['claimant']),
    ('found',                 'closed',                ARRAY['finder','desk']),
    ('claim_requested',       'verification_required', ARRAY['finder','desk']),
    ('claim_requested',       'found',                 ARRAY['finder','desk']),
    ('verification_required', 'claim_approved',        ARRAY['finder','desk']),
    ('verification_required', 'found',                 ARRAY['finder','desk']),
    ('claim_approved',        'collected',             ARRAY['finder','desk']),
    ('claim_approved',        'found',                 ARRAY['desk']),
    ('collected',             'closed',                ARRAY['finder','claimant','desk'])
ON CONFLICT (from_status, to_status) DO UPDATE SET actors = EXCLUDED.actors;

ALTER TABLE public.lost_found_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lost_found_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lost_found_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lost_found_transitions ENABLE ROW LEVEL SECURITY;

-- Raw rows (unmasked text, verification answer, private photo) — reporter and desk only.
CREATE POLICY "Reporter or desk reads item" ON public.lost_found_items FOR SELECT
    USING (reporter_id = auth.uid() OR public.is_campus_staff());
CREATE POLICY "Report own item" ON public.lost_found_items FOR INSERT TO authenticated
    WITH CHECK (reporter_id = auth.uid() AND status IN ('open', 'found'));
-- Lost reports can be closed / edited by their reporter; found-item status moves via naflis_lf_transition only.
CREATE POLICY "Reporter edits lost report" ON public.lost_found_items FOR UPDATE TO authenticated
    USING (reporter_id = auth.uid() AND kind = 'lost') WITH CHECK (reporter_id = auth.uid() AND kind = 'lost');

CREATE POLICY "Claim parties read claims" ON public.lost_found_claims FOR SELECT USING (
    claimant_id = auth.uid() OR public.is_campus_staff()
    OR EXISTS (SELECT 1 FROM public.lost_found_items i WHERE i.id = item_id AND i.reporter_id = auth.uid())
);
CREATE POLICY "Item parties read events" ON public.lost_found_events FOR SELECT USING (
    public.is_campus_staff()
    OR EXISTS (SELECT 1 FROM public.lost_found_items i WHERE i.id = item_id AND i.reporter_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.lost_found_claims c WHERE c.item_id = lost_found_events.item_id AND c.claimant_id = auth.uid())
);
CREATE POLICY "Public lf transitions read" ON public.lost_found_transitions FOR SELECT USING (true);

-- The public board: masked fields only. Runs as the view owner, so it can read past RLS.
CREATE OR REPLACE VIEW public.lost_found_public AS
SELECT id, kind, public_title AS title, public_description AS description, category, campus, location,
       happened_on, photo_public_path, photo_shielded, handover_point, status, created_at,
       verification_question -- the question is public; the answer never is
FROM public.lost_found_items
WHERE status <> 'closed';
GRANT SELECT ON public.lost_found_public TO anon, authenticated;

-- Claimant opens a claim on a found item.
CREATE OR REPLACE FUNCTION public.naflis_lf_request_claim(p_item UUID, p_message TEXT)
RETURNS UUID AS $$
DECLARE
    v_item public.lost_found_items%ROWTYPE;
    v_claim UUID;
BEGIN
    SELECT * INTO v_item FROM public.lost_found_items WHERE id = p_item FOR UPDATE;
    IF NOT FOUND OR v_item.kind <> 'found' THEN RAISE EXCEPTION 'not_found'; END IF;
    IF v_item.reporter_id = auth.uid() THEN RAISE EXCEPTION 'own_item'; END IF;
    IF v_item.status <> 'found' THEN RAISE EXCEPTION 'not_claimable'; END IF;
    INSERT INTO public.lost_found_claims (item_id, claimant_id, message) VALUES (p_item, auth.uid(), left(p_message, 1000))
    RETURNING id INTO v_claim;
    UPDATE public.lost_found_items SET status = 'claim_requested' WHERE id = p_item;
    INSERT INTO public.lost_found_events (item_id, from_status, to_status, actor_role, actor_id, note)
    VALUES (p_item, 'found', 'claim_requested', 'claimant', auth.uid(), 'Claim requested');
    RETURN v_claim;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Claimant answers the verification question.
CREATE OR REPLACE FUNCTION public.naflis_lf_submit_proof(p_claim UUID, p_answer TEXT)
RETURNS VOID AS $$
BEGIN
    UPDATE public.lost_found_claims SET proof_answer = left(p_answer, 500)
    WHERE id = p_claim AND claimant_id = auth.uid() AND status = 'verification_required';
    IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Finder / desk moves a found item along the lifecycle.
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
        WHEN public.is_campus_staff() THEN 'desk'
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

REVOKE ALL ON FUNCTION public.naflis_lf_request_claim(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.naflis_lf_submit_proof(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.naflis_lf_transition(UUID, TEXT, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.naflis_lf_request_claim(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.naflis_lf_submit_proof(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.naflis_lf_transition(UUID, TEXT, UUID, TEXT, TEXT) TO authenticated;

-- Photo buckets: originals are private (signed URLs for finder / desk / approved owner),
-- shielded copies are public.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
    ('lost-found-private', 'lost-found-private', false, 5242880, ARRAY['image/jpeg','image/png','image/webp']),
    ('lost-found-public',  'lost-found-public',  true,  5242880, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Upload own lost-found photos" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id IN ('lost-found-private', 'lost-found-public') AND (storage.foldername(name))[1] = auth.uid()::TEXT);
CREATE POLICY "Read own private lost-found photos" ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'lost-found-private' AND ((storage.foldername(name))[1] = auth.uid()::TEXT OR public.is_campus_staff()));
CREATE POLICY "Public lost-found photos" ON storage.objects FOR SELECT
    USING (bucket_id = 'lost-found-public');
