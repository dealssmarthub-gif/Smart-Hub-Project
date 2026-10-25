-- 20261024120000_contact_phone_private.sql
-- A seller's contact phone and owner account id are no longer readable by
-- anonymous visitors, through any route. Signed-in users get a seller's phone
-- only from naflis_vendor_contact(): approved sellers only, at most 50
-- different sellers per rolling 24 hours, and every reveal is recorded.
-- Sellers still read and edit their own phone, and admins see everything,
-- through the same function, uncounted. Server code (service_role, e.g. the
-- payments Edge Function) is unaffected.
-- supabase/tests/contact_phone_private.test.sql checks all of this.

-- ============================================================================
-- 1. Column access on vendors
-- ============================================================================
-- Row access is unchanged (RLS: approved vendors are public; owners and admins
-- see more). Columns: everyone reads only the shop's public face; signed-in
-- users also read user_id, which the ownership policies and "my shop" need.
-- Nobody reads contact_phone directly: the function below is the only way.
REVOKE SELECT ON public.vendors FROM anon, authenticated;
GRANT SELECT (id, store_name, store_slug, description, logo_url, status, subscription_tier, created_at)
    ON public.vendors TO anon, authenticated;
GRANT SELECT (user_id) ON public.vendors TO authenticated;
-- Writing is unchanged: owners update their own row (incl. contact_phone) and
-- admins create and update vendors, as the existing policies allow.

-- ============================================================================
-- 2. Reveals: one row each time a signed-in user is shown a seller's phone
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.contact_reveals (
    id BIGSERIAL PRIMARY KEY,
    viewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
    revealed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contact_reveals_viewer_idx ON public.contact_reveals (viewer_id, revealed_at DESC);
ALTER TABLE public.contact_reveals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read contact reveals" ON public.contact_reveals;
CREATE POLICY "Admins read contact reveals" ON public.contact_reveals FOR SELECT TO authenticated
    USING (public.has_role('admin') OR public.has_role('super_admin'));
-- Rows are written only by naflis_vendor_contact (SECURITY DEFINER).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.contact_reveals FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.contact_reveals_id_seq FROM anon, authenticated;

-- The daily limit, in one place: different sellers per user per rolling 24 hours.
CREATE OR REPLACE FUNCTION public.naflis_contact_daily_limit()
RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$ SELECT 50 $$;

-- ============================================================================
-- 3. The only way to read a contact phone
-- ============================================================================
-- Errors (the app shows a message for each): sign_in_required, not_found
-- (no such vendor, or not approved), daily_limit. NULL = the seller gave none.
CREATE OR REPLACE FUNCTION public.naflis_vendor_contact(p_vendor UUID)
RETURNS TEXT AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_owner UUID;
    v_status TEXT;
    v_phone TEXT;
    v_used INTEGER;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'sign_in_required'; END IF;
    SELECT user_id, status::TEXT, contact_phone INTO v_owner, v_status, v_phone
    FROM public.vendors WHERE id = p_vendor;
    IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

    -- The seller themselves and admins: always, whatever the status, not counted.
    IF v_owner = v_uid OR public.has_role('admin') OR public.has_role('super_admin') THEN
        RETURN v_phone;
    END IF;

    IF v_status <> 'approved' THEN RAISE EXCEPTION 'not_found'; END IF;

    -- One viewer at a time, so parallel calls can't overshoot the limit.
    PERFORM pg_advisory_xact_lock(hashtextextended('naflis_vendor_contact:' || v_uid::TEXT, 0));
    -- Seeing the same seller again within the window doesn't use up the limit.
    IF NOT EXISTS (
        SELECT 1 FROM public.contact_reveals
        WHERE viewer_id = v_uid AND vendor_id = p_vendor AND revealed_at > now() - INTERVAL '24 hours'
    ) THEN
        SELECT count(DISTINCT vendor_id) INTO v_used FROM public.contact_reveals
        WHERE viewer_id = v_uid AND revealed_at > now() - INTERVAL '24 hours';
        IF v_used >= public.naflis_contact_daily_limit() THEN RAISE EXCEPTION 'daily_limit'; END IF;
    END IF;

    INSERT INTO public.contact_reveals (viewer_id, vendor_id) VALUES (v_uid, p_vendor);
    RETURN v_phone;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.naflis_vendor_contact(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.naflis_vendor_contact(UUID) TO authenticated;
