-- Create storage buckets for file uploads
INSERT INTO storage.buckets (id, name, public) VALUES
  ('documents', 'documents', true),
  ('job-photos', 'job-photos', true),
  ('org-logos', 'org-logos', true),
  ('engineer-documents', 'engineer-documents', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: authenticated users can manage files
CREATE POLICY "auth_upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_read" ON storage.objects FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_update" ON storage.objects FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth_delete" ON storage.objects FOR DELETE TO authenticated USING (true);
CREATE POLICY "public_read" ON storage.objects FOR SELECT TO anon USING (bucket_id IN ('documents', 'job-photos', 'org-logos', 'engineer-documents'));
