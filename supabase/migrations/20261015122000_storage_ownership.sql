-- 20261015122000_storage_ownership.sql
-- product-images (02): any signed-in user could overwrite or delete anyone's photos.
-- campus-docs (03): anonymous visitors could upload, and any signed-in user could
-- replace or delete published resources.

-- ============================================================================
-- 1. product-images: writes only inside the uploader's own folder ({uid}/...)
-- ============================================================================
DROP POLICY IF EXISTS "Authenticated insert product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete product images" ON storage.objects;

CREATE POLICY "Owner insert product images" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'product-images' AND (storage.foldername(name))[1] = auth.uid()::TEXT);
CREATE POLICY "Owner update product images" ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'product-images' AND (storage.foldername(name))[1] = auth.uid()::TEXT)
    WITH CHECK (bucket_id = 'product-images' AND (storage.foldername(name))[1] = auth.uid()::TEXT);
CREATE POLICY "Owner delete product images" ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'product-images' AND (storage.foldername(name))[1] = auth.uid()::TEXT);

-- SVG can carry script; photos never need it.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
WHERE id = 'product-images';

-- ============================================================================
-- 2. campus-docs: SRC publishers only; each manages their own uploads
-- ============================================================================
-- Paths carry no campus, so this checks for any active publishing grant;
-- the campus scope is enforced on the campus_events / campus_resources rows.
CREATE OR REPLACE FUNCTION public.naflis_is_publisher()
RETURNS BOOLEAN AS $$
    SELECT public.has_role('super_admin') OR EXISTS (
        SELECT 1 FROM public.staff_grants g
        WHERE g.user_id = auth.uid()
          AND g.status = 'active'
          AND g.permissions && ARRAY['student.resources.manage','student.announcements.create','student.events.create']::TEXT[]
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

DROP POLICY IF EXISTS "Public or Authenticated insert campus-docs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update campus-docs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete campus-docs" ON storage.objects;

CREATE POLICY "Publisher insert campus-docs" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'campus-docs' AND public.naflis_is_publisher());
CREATE POLICY "Publisher update own campus-docs" ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'campus-docs' AND public.naflis_is_publisher()
           AND (owner_id = auth.uid()::TEXT OR public.has_role('super_admin')))
    WITH CHECK (bucket_id = 'campus-docs' AND public.naflis_is_publisher());
CREATE POLICY "Publisher delete own campus-docs" ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'campus-docs' AND public.naflis_is_publisher()
           AND (owner_id = auth.uid()::TEXT OR public.has_role('super_admin')));
