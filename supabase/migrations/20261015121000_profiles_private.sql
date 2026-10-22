-- 20261015121000_profiles_private.sql
-- Profiles were world-readable (migration 01), exposing every user's email,
-- phone, credit score and limit to anyone holding the public anon key.
-- The app only ever reads the signed-in user's own row.

DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;

CREATE POLICY "Own profile read" ON public.profiles FOR SELECT
    USING (id = auth.uid());

-- has_role() is SECURITY DEFINER, so this does not recurse through RLS.
CREATE POLICY "Staff read profiles" ON public.profiles FOR SELECT TO authenticated
    USING (
        public.has_role('admin') OR public.has_role('super_admin')
        OR public.has_role('finance') OR public.has_role('dispute')
    );
