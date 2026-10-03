-- 04_core_architecture.sql
-- P0 core architecture: unified multi-role identity, dynamic categories, feature flags.

-- ============================================================================
-- 1. Unified identity: one profile, many roles
-- ============================================================================
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS roles TEXT[] NOT NULL DEFAULT ARRAY['buyer']::TEXT[],
    ADD COLUMN IF NOT EXISTS institution_id TEXT;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_roles_known;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_roles_known CHECK (
    roles <@ ARRAY['buyer','seller','student','src_head','delivery','finance','dispute','admin','super_admin']::TEXT[]
);

-- Backfill: everyone is a buyer, plus whatever single role they already had.
UPDATE public.profiles
SET roles = (SELECT ARRAY(SELECT DISTINCT unnest(ARRAY['buyer', role::TEXT] || roles)));

CREATE OR REPLACE FUNCTION public.has_role(check_role TEXT)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND check_role = ANY (p.roles)
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- New signups: buyer + the role chosen at registration.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    primary_role public.user_role := coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'buyer'::public.user_role);
BEGIN
    INSERT INTO public.profiles (id, email, full_name, phone, role, roles)
    VALUES (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
        coalesce(new.raw_user_meta_data->>'phone', new.raw_user_meta_data->>'phone_number', new.phone, ''),
        primary_role,
        (SELECT ARRAY(SELECT DISTINCT unnest(ARRAY['buyer', primary_role::TEXT])))
    );
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Profiles are self-updatable, so role columns must be protected: only a
-- super admin (or a trusted server-side function, via the local flag below)
-- may change them.
CREATE OR REPLACE FUNCTION public.protect_profile_roles()
RETURNS TRIGGER AS $$
BEGIN
    IF (new.roles IS DISTINCT FROM old.roles OR new.role IS DISTINCT FROM old.role)
       AND auth.uid() IS NOT NULL
       AND coalesce(current_setting('naflis.allow_role_change', true), '') <> 'on'
       AND NOT public.has_role('super_admin') THEN
        new.roles := old.roles;
        new.role := old.role;
    END IF;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS protect_profile_roles ON public.profiles;
CREATE TRIGGER protect_profile_roles
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.protect_profile_roles();

-- Adding a shop unlocks the seller role.
CREATE OR REPLACE FUNCTION public.grant_seller_on_vendor()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM set_config('naflis.allow_role_change', 'on', true);
    UPDATE public.profiles
    SET roles = array_append(roles, 'seller')
    WHERE id = new.user_id AND NOT ('seller' = ANY (roles));
    PERFORM set_config('naflis.allow_role_change', 'off', true);
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS grant_seller_on_vendor ON public.vendors;
CREATE TRIGGER grant_seller_on_vendor
    AFTER INSERT ON public.vendors
    FOR EACH ROW EXECUTE FUNCTION public.grant_seller_on_vendor();

UPDATE public.profiles p
SET roles = array_append(p.roles, 'seller')
WHERE EXISTS (SELECT 1 FROM public.vendors v WHERE v.user_id = p.id)
  AND NOT ('seller' = ANY (p.roles));

-- ============================================================================
-- 2. Dynamic category hierarchy
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    parent_id UUID REFERENCES public.categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    icon TEXT,
    scope TEXT NOT NULL DEFAULT 'mall' CHECK (scope IN ('mall', 'student', 'both')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (scope, slug)
);

CREATE INDEX IF NOT EXISTS idx_categories_parent ON public.categories (parent_id, sort_order);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public categories read"
    ON public.categories FOR SELECT
    USING (true);

CREATE POLICY "Admins manage categories"
    ON public.categories FOR ALL
    TO authenticated
    USING (public.has_role('admin') OR public.has_role('super_admin'))
    WITH CHECK (public.has_role('admin') OR public.has_role('super_admin'));

-- Seed: top-level categories
INSERT INTO public.categories (name, slug, icon, scope, sort_order) VALUES
    ('Food & Meals',              'food-and-meals',              'UtensilsCrossed', 'mall',    0),
    ('Electronics',               'electronics',                 'Smartphone',      'mall',    1),
    ('Fashion',                   'fashion',                     'Shirt',           'mall',    2),
    ('Home & Living',             'home-and-living',             'Sofa',            'mall',    3),
    ('Laundry Services',          'laundry-services',            'WashingMachine',  'mall',    4),
    ('Accommodation',             'accommodation',               'BedDouble',       'mall',    5),
    ('School Supplies',           'school-supplies',             'BookOpen',        'mall',    6),
    ('Health & Wellness',         'health-and-wellness',         'HeartPulse',      'mall',    7),
    ('Baby Products',             'baby-products',               'Baby',            'mall',    8),
    ('Automotive',                'automotive',                  'Car',             'mall',    9),
    ('Travel',                    'travel',                      'Plane',           'mall',   10),
    ('Textbooks & Course Notes',  'textbooks-and-course-notes',  'BookOpen',        'student', 0),
    ('Laptops & Tech Gadgets',    'laptops-and-tech-gadgets',    'Laptop',          'student', 1),
    ('Hostel & Room Essentials',  'hostel-and-room-essentials',  'BedDouble',       'student', 2),
    ('Campus Thrift & Fashion',   'campus-thrift-and-fashion',   'Shirt',           'student', 3),
    ('Electronics & Accessories', 'electronics-and-accessories', 'Smartphone',      'student', 4),
    ('Bikes & Commuting',         'bikes-and-commuting',         'Bike',            'student', 5),
    ('Services & Tutoring',       'services-and-tutoring',       'GraduationCap',   'student', 6)
ON CONFLICT (scope, slug) DO NOTHING;

-- Seed: sub-categories
INSERT INTO public.categories (parent_id, name, slug, scope, sort_order)
SELECT p.id, c.name, c.slug, 'mall', c.sort_order
FROM (VALUES
    ('food-and-meals',   'Groceries',        'groceries',        0),
    ('food-and-meals',   'Cooked Meals',     'cooked-meals',     1),
    ('food-and-meals',   'Snacks & Drinks',  'snacks-and-drinks', 2),
    ('electronics',      'Phones',           'phones',           0),
    ('electronics',      'Laptops',          'laptops',          1),
    ('electronics',      'Gaming',           'gaming',           2),
    ('electronics',      'Office Equipment', 'office-equipment', 3),
    ('fashion',          'Shoes',            'shoes',            0),
    ('fashion',          'Beauty',           'beauty',           1),
    ('home-and-living',  'Home Appliances',  'home-appliances',  0),
    ('home-and-living',  'Furniture',        'furniture',        1),
    ('home-and-living',  'Home Improvement', 'home-improvement', 2),
    ('laundry-services', 'Wash & Fold',      'wash-and-fold',    0),
    ('laundry-services', 'Dry Cleaning',     'dry-cleaning',     1),
    ('laundry-services', 'Ironing',          'ironing',          2),
    ('accommodation',    'Hostels',          'hostels',          0),
    ('accommodation',    'Apartments',       'apartments',       1),
    ('accommodation',    'Short Stays',      'short-stays',      2)
) AS c(parent_slug, name, slug, sort_order)
JOIN public.categories p ON p.slug = c.parent_slug AND p.scope = 'mall'
ON CONFLICT (scope, slug) DO NOTHING;

-- ============================================================================
-- 3. Engine room: feature flags
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.feature_flags (
    key TEXT PRIMARY KEY,
    label TEXT,
    description TEXT,
    enabled BOOLEAN NOT NULL DEFAULT false,
    roles TEXT[],            -- NULL = all roles
    institution_ids TEXT[],  -- NULL = all institutions
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public feature_flags read"
    ON public.feature_flags FOR SELECT
    USING (true);

CREATE POLICY "Super admins manage feature_flags"
    ON public.feature_flags FOR ALL
    TO authenticated
    USING (public.has_role('super_admin'))
    WITH CHECK (public.has_role('super_admin'));

INSERT INTO public.feature_flags (key, label, description, enabled) VALUES
    ('student_os',            'Student OS',                 'Student workspace: campus marketplace, deals, resources and calendar.', true),
    ('src_portal',            'SRC / Institutional Portal', 'Campus notices and academic resource publishing for SRC heads.',        true),
    ('role_switcher',         'Workspace Switcher',         'Let multi-role accounts switch context from the top bar.',              true),
    ('reserve_and_pay',       'Reserve & Pay',              'Allow buyers to pre-pay in installments before delivery.',              true),
    ('take_now_pay_later',    'Take Now Pay Later',         'Credit-based instant purchase with repayment plan.',                    true),
    ('auto_settlements',      'Auto Settlements',           'Automatically release seller funds 24h after delivery.',                true),
    ('regional_flash_sales',  'Regional Flash Sales',       'Show flash sales personalised by buyer region.',                        true),
    ('seller_ai_price_intel', 'AI Price Intelligence',      'Enable AI-driven price recommendation for sellers.',                    true),
    ('brand_studio_beta',     'Brand Studio (Beta)',        'Automated store & catalog generator (beta cohort).',                    false),
    ('fraud_hard_block',      'Fraud Hard Block',           'Auto-suspend accounts with high risk score.',                           false)
ON CONFLICT (key) DO NOTHING;
