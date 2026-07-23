-- ─── Fix Storage Bucket Privacy & RLS Policies ──────────────────────────────────
-- Change attachments bucket to private and set member-restricted policies.

-- Set bucket to private
UPDATE storage.buckets SET public = false WHERE id = 'attachments';

-- Drop old public policies
DROP POLICY IF EXISTS "Allow public read access to attachments" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to upload attachments" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to update/delete their own attachments" ON storage.objects;

-- Create new secure policies
CREATE POLICY "attachments_select_member"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'attachments'
    AND public.is_conversation_member(split_part(name, '/', 1))
  );

CREATE POLICY "attachments_insert_member"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'attachments'
    AND auth.role() = 'authenticated'
    AND public.is_conversation_member(split_part(name, '/', 1))
  );

CREATE POLICY "attachments_delete_own"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'attachments'
    AND auth.uid() = owner
  );
