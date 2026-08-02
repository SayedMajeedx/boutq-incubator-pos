DROP POLICY IF EXISTS "Public read invoice assets" ON storage.objects;

CREATE POLICY "Owners read own invoice assets"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'invoice-assets'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);