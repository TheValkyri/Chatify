-- ─── Storage Bucket Creation & RLS policies ──────────────────────────────────
-- Creates public bucket 'attachments' and sets policies for select, insert, delete.

INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Drop existing policies if they already exist to prevent SQLSTATE 42710 errors
DROP POLICY IF EXISTS "Allow public read access to attachments" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to upload attachments" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to update/delete their own attachments" ON storage.objects;

-- Policies for storage.objects
CREATE POLICY "Allow public read access to attachments"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'attachments');

CREATE POLICY "Allow authenticated users to upload attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'attachments'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Allow users to update/delete their own attachments"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'attachments'
    AND auth.uid() = owner
  );
