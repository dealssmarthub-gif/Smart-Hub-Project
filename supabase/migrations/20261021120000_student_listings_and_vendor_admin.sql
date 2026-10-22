-- 20261021120000_student_listings_and_vendor_admin.sql
-- Student listings (known issue #41) become products owned by a vendor, like
-- any other item. Vendors can publish a contact phone that buyers see on their
-- listings. Admins can create, list and approve vendors: until now no policy let
-- them read a pending vendor or change its status.

-- ============================================================================
-- 1. Vendor contact phone (public on approved vendors, by the vendor's choice)
-- ============================================================================
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS contact_phone TEXT
    CHECK (contact_phone IS NULL OR contact_phone ~ '^\+?[0-9][0-9 ()-]{6,19}$');

-- ============================================================================
-- 2. Student listings in products
-- ============================================================================
ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS listing_type TEXT NOT NULL DEFAULT 'mall'
        CHECK (listing_type IN ('mall', 'student')),
    ADD COLUMN IF NOT EXISTS campus TEXT,
    ADD COLUMN IF NOT EXISTS item_condition TEXT
        CHECK (item_condition IS NULL OR item_condition IN ('Brand New', 'Like New', 'Used - Good', 'Used - Fair')),
    ADD COLUMN IF NOT EXISTS meetup_location TEXT,
    -- Seller-stated price when new; NULL when they didn't give one (never computed).
    ADD COLUMN IF NOT EXISTS original_price NUMERIC(10, 2)
        CHECK (original_price IS NULL OR original_price >= 0);

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_student_listing_campus;
ALTER TABLE public.products ADD CONSTRAINT products_student_listing_campus
    CHECK (listing_type <> 'student' OR campus IS NOT NULL);

CREATE INDEX IF NOT EXISTS products_listing_type_campus_idx ON public.products (listing_type, campus);

-- ============================================================================
-- 3. Admin vendor management
-- ============================================================================
-- protect_vendor_plan (20261015123000) already lets admins set status on INSERT
-- and UPDATE; these policies let the rows through RLS in the first place.
DROP POLICY IF EXISTS "Admins read vendors" ON public.vendors;
CREATE POLICY "Admins read vendors" ON public.vendors FOR SELECT TO authenticated
    USING (public.has_role('admin') OR public.has_role('super_admin'));

DROP POLICY IF EXISTS "Admins create vendors" ON public.vendors;
CREATE POLICY "Admins create vendors" ON public.vendors FOR INSERT TO authenticated
    WITH CHECK (public.has_role('admin') OR public.has_role('super_admin'));

DROP POLICY IF EXISTS "Admins update vendors" ON public.vendors;
CREATE POLICY "Admins update vendors" ON public.vendors FOR UPDATE TO authenticated
    USING (public.has_role('admin') OR public.has_role('super_admin'))
    WITH CHECK (public.has_role('admin') OR public.has_role('super_admin'));
