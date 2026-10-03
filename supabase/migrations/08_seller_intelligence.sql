-- 08_seller_intelligence.sql
-- P4: subscription-gated Seller Intelligence over demand_logs.

-- ============================================================================
-- 1. Vendor plans
-- ============================================================================
ALTER TABLE public.vendors
    ADD COLUMN IF NOT EXISTS subscription_tier TEXT NOT NULL DEFAULT 'starter'
    CHECK (subscription_tier IN ('starter', 'growth', 'professional', 'enterprise'));

-- Vendors can update their own row (migration 01); the plan is not theirs to set.
CREATE OR REPLACE FUNCTION public.protect_vendor_plan()
RETURNS TRIGGER AS $$
BEGIN
    IF new.subscription_tier IS DISTINCT FROM old.subscription_tier
       AND auth.uid() IS NOT NULL
       AND NOT (public.has_role('admin') OR public.has_role('super_admin')) THEN
        new.subscription_tier := old.subscription_tier;
    END IF;
    -- Same for approval status: sellers can't approve themselves.
    IF new.status IS DISTINCT FROM old.status
       AND auth.uid() IS NOT NULL
       AND NOT (public.has_role('admin') OR public.has_role('super_admin')) THEN
        new.status := old.status;
    END IF;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS protect_vendor_plan ON public.vendors;
CREATE TRIGGER protect_vendor_plan BEFORE UPDATE ON public.vendors
    FOR EACH ROW EXECUTE FUNCTION public.protect_vendor_plan();

CREATE TABLE IF NOT EXISTS public.subscription_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
    tier TEXT NOT NULL CHECK (tier IN ('growth', 'professional', 'enterprise')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.subscription_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Vendor requests own upgrade" ON public.subscription_requests FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid()) AND status = 'pending');
CREATE POLICY "Vendor or admin reads requests" ON public.subscription_requests FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid())
    OR public.has_role('admin') OR public.has_role('super_admin')
);

-- ============================================================================
-- 2. Demand data privacy
-- ============================================================================
-- Raw search rows carry user ids; they were world-readable (migration 03).
-- The aggregated campus_market_demand view stays public.
DROP POLICY IF EXISTS "Public demand_logs read" ON public.demand_logs;
CREATE POLICY "Admins read demand_logs" ON public.demand_logs FOR SELECT
    USING (public.has_role('admin') OR public.has_role('super_admin'));

-- 28 days of searches for one campus, for approved vendors on Growth or above.
-- Searchers are pseudonymous: an md5 that changes daily, enough to detect
-- "same student searched both" within a day without exposing who.
CREATE OR REPLACE FUNCTION public.naflis_seller_demand(p_campus TEXT)
RETURNS TABLE (search_query TEXT, campus TEXT, results_count INTEGER, created_at TIMESTAMPTZ, searcher TEXT) AS $$
DECLARE
    v_tier TEXT;
BEGIN
    SELECT subscription_tier INTO v_tier FROM public.vendors
    WHERE user_id = auth.uid() AND status = 'approved'
    ORDER BY created_at LIMIT 1;
    IF v_tier IS NULL AND NOT public.has_role('super_admin') THEN
        RAISE EXCEPTION 'not_a_vendor' USING ERRCODE = '42501';
    END IF;
    IF v_tier = 'starter' AND NOT public.has_role('super_admin') THEN
        RAISE EXCEPTION 'subscription_required' USING ERRCODE = 'P0001';
    END IF;
    RETURN QUERY
        SELECT d.search_query, d.campus, d.results_count, d.created_at,
               CASE WHEN d.user_id IS NULL THEN NULL
                    ELSE md5(d.user_id::TEXT || to_char(d.created_at, 'YYYY-MM-DD') || 'naflis') END
        FROM public.demand_logs d
        WHERE d.created_at >= now() - INTERVAL '28 days'
          AND (p_campus = 'All Campuses' OR d.campus IN (p_campus, 'General'))
        ORDER BY d.created_at DESC
        LIMIT 20000;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.naflis_seller_demand(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.naflis_seller_demand(TEXT) TO authenticated;
