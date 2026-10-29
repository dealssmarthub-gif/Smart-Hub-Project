-- 20261029120000_vendor_public_slugs.sql
-- A shop's store_slug is public (anyone reads it, and it becomes the shop's
-- address, /shops/<slug>), but sellers who signed up got 'seller-<owner id>' and
-- admin-created shops ended in the first 8 characters of the owner id. Owner ids
-- must never be visible to visitors (20261024120000), so:
--   1. the database makes the slug for every shop a seller creates, from the
--      shop name plus a random suffix, whatever the app sends;
--   2. only admins (or server code) can change a slug afterwards;
--   3. existing slugs that contain any part of the owner id are replaced;
--   4. a constraint keeps the owner id out of the slug for good.
-- Nothing else about vendors changes: same columns, grants and policies.
-- supabase/tests/vendor_public_slugs.test.sql checks all of this.

-- ============================================================================
-- 1. Slug maker: "Ama's Kitchen" -> 'amas-kitchen-k3f9qz', unique
-- ============================================================================
CREATE OR REPLACE FUNCTION public.naflis_store_slug(p_name TEXT)
RETURNS TEXT AS $$
DECLARE
    v_base TEXT;
    v_slug TEXT;
BEGIN
    -- Apostrophes vanish ("Ama's" -> "amas"); every other run of symbols becomes one '-'.
    v_base := regexp_replace(lower(coalesce(p_name, '')), '[''’]', '', 'g');
    v_base := trim(BOTH '-' FROM regexp_replace(v_base, '[^a-z0-9]+', '-', 'g'));
    v_base := trim(BOTH '-' FROM left(v_base, 40));
    IF v_base = '' THEN v_base := 'shop'; END IF;
    LOOP
        -- 6 random characters from [a-z0-9]: not derived from any id.
        v_slug := v_base || '-' || (
            SELECT string_agg(substr('abcdefghijklmnopqrstuvwxyz0123456789', 1 + floor(random() * 36)::INT, 1), '')
            FROM generate_series(1, 6)
        );
        EXIT WHEN NOT EXISTS (SELECT 1 FROM public.vendors WHERE store_slug = v_slug);
    END LOOP;
    RETURN v_slug;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public;

-- Only the trigger below (and admins through it) use it.
REVOKE ALL ON FUNCTION public.naflis_store_slug(TEXT) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 2. Sellers' new shops always get a generated slug; only admins change one later
-- ============================================================================
-- Admins and server code (no signed-in user) may give a slug; the constraint in
-- step 4 still rejects one that contains the owner id. Empty -> generated.
CREATE OR REPLACE FUNCTION public.vendor_public_slug()
RETURNS TRIGGER AS $$
DECLARE
    v_admin BOOLEAN := auth.uid() IS NULL OR public.has_role('admin') OR public.has_role('super_admin');
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NOT v_admin OR coalesce(trim(new.store_slug), '') = '' THEN
            new.store_slug := public.naflis_store_slug(new.store_name);
        END IF;
        RETURN new;
    END IF;
    -- UPDATE: sellers keep their slug (links to the shop keep working).
    IF new.store_slug IS DISTINCT FROM old.store_slug AND NOT v_admin THEN
        new.store_slug := old.store_slug;
    END IF;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS vendor_public_slug ON public.vendors;
CREATE TRIGGER vendor_public_slug BEFORE INSERT OR UPDATE OF store_slug ON public.vendors
    FOR EACH ROW EXECUTE FUNCTION public.vendor_public_slug();

-- ============================================================================
-- 3. Replace the slugs that give away the owner id
-- ============================================================================
UPDATE public.vendors
SET store_slug = public.naflis_store_slug(store_name)
WHERE position(left(user_id::TEXT, 8) IN store_slug) > 0
   OR position(replace(user_id::TEXT, '-', '') IN replace(store_slug, '-', '')) > 0;

-- ============================================================================
-- 4. And keep it out: no slug may contain the start of its owner's id
-- ============================================================================
ALTER TABLE public.vendors DROP CONSTRAINT IF EXISTS vendors_slug_hides_owner;
ALTER TABLE public.vendors ADD CONSTRAINT vendors_slug_hides_owner
    CHECK (position(left(user_id::TEXT, 8) IN store_slug) = 0);
