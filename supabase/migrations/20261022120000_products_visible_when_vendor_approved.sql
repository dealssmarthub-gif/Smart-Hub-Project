-- 20261022120000_products_visible_when_vendor_approved.sql
-- Products were readable by anyone (migration 01, USING (true)), so a listing
-- from a pending or rejected vendor was public through the API even though the
-- app hid it. Now:
--   - anyone: products of approved vendors only;
--   - a seller: also their own products, whatever their vendor's status;
--   - admins, super admins, finance and dispute staff: every product.
-- Clearing a seller's own contact phone needs no change here: "Users can update
-- their own vendor profile" (01) already allows it and contact_phone is nullable.
-- supabase/tests/product_visibility.test.sql checks both.

DROP POLICY IF EXISTS "Products are viewable by everyone" ON public.products;

DROP POLICY IF EXISTS "Products of approved vendors are public" ON public.products;
CREATE POLICY "Products of approved vendors are public" ON public.products FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.status = 'approved'));

DROP POLICY IF EXISTS "Vendors read own products" ON public.products;
CREATE POLICY "Vendors read own products" ON public.products FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid()));

DROP POLICY IF EXISTS "Staff read all products" ON public.products;
CREATE POLICY "Staff read all products" ON public.products FOR SELECT TO authenticated
    USING (public.has_role('admin') OR public.has_role('super_admin')
        OR public.has_role('finance') OR public.has_role('dispute'));
