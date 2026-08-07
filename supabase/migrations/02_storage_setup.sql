-- Create a public bucket named product-images if it does not exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'product-images',
    'product-images',
    true,
    5242880, -- 5MB limit
    ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- Ensure Row Level Security is enabled on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 1. Public policy to allow anyone to view/read uploaded product images
CREATE POLICY "Public read product images"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

-- 2. Policy to allow authenticated sellers to upload product images
CREATE POLICY "Authenticated insert product images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'product-images');

-- 3. Policy to allow authenticated sellers to update product images
CREATE POLICY "Authenticated update product images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'product-images');

-- 4. Policy to allow authenticated sellers to delete product images
CREATE POLICY "Authenticated delete product images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'product-images');
