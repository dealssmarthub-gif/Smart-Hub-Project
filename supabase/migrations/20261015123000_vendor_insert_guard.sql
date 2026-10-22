-- 20261015123000_vendor_insert_guard.sql
-- protect_vendor_plan (08) only ran on UPDATE, so a seller could INSERT their
-- shop as status = 'approved', subscription_tier = 'enterprise' and skip both
-- approval and the paid plan. New shops now always start pending / starter.

CREATE OR REPLACE FUNCTION public.protect_vendor_plan()
RETURNS TRIGGER AS $$
BEGIN
    IF auth.uid() IS NULL OR public.has_role('admin') OR public.has_role('super_admin') THEN
        RETURN new;
    END IF;
    IF TG_OP = 'INSERT' THEN
        new.status := 'pending';
        new.subscription_tier := 'starter';
        RETURN new;
    END IF;
    -- Sellers can't change their own plan or approve themselves.
    new.subscription_tier := old.subscription_tier;
    new.status := old.status;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS protect_vendor_plan ON public.vendors;
CREATE TRIGGER protect_vendor_plan BEFORE INSERT OR UPDATE ON public.vendors
    FOR EACH ROW EXECUTE FUNCTION public.protect_vendor_plan();
