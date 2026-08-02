
CREATE POLICY "Users manage own invoice assets" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'invoice-assets' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'invoice-assets' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Public read invoice assets" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'invoice-assets');
