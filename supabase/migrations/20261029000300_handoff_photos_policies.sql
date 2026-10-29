-- Migration: 20261029000300_handoff_photos_policies.sql
-- Purpose: Configure RLS policies and grants for handoff photo attachments.
-- NOTE: Work locally first. Do not apply to production without explicit review.

-- 1. Enable Row Level Security (if not already enabled)
ALTER TABLE public.handoff_photos ENABLE ROW LEVEL SECURITY;

-- 2. Explicit table privileges for the anon and authenticated roles
-- This resolves the "Data API access disabled" state for handoff_photos
GRANT SELECT, INSERT, UPDATE, DELETE ON public.handoff_photos TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.handoff_photos TO authenticated;

-- 3. Row Level Security policies matching public.handoffs anon model
-- Policy for SELECT: allow viewing photos metadata
CREATE POLICY "Allow anon to select handoff_photos"
  ON public.handoff_photos
  FOR SELECT
  TO anon
  USING (true);

-- Policy for INSERT: allow inserting photo metadata
CREATE POLICY "Allow anon to insert handoff_photos"
  ON public.handoff_photos
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Policy for DELETE: allow deleting photo metadata
CREATE POLICY "Allow anon to delete handoff_photos"
  ON public.handoff_photos
  FOR DELETE
  TO anon
  USING (true);

-- 4. Ensure private 'handoff-photos' storage bucket exists (idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'handoff-photos',
  'handoff-photos',
  false,
  1048576, -- 1 MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO NOTHING;

-- 5. Supabase Storage Policies for private 'handoff-photos' bucket
-- These policies allow the client to upload, sign URLs for, and delete
-- objects strictly within the 'handoff-photos' bucket under the 'handoffs/' folder.

-- Allow anon to read/create signed URLs for handoff photos
CREATE POLICY "Allow anon to select handoff photos"
  ON storage.objects
  FOR SELECT
  TO anon
  USING (bucket_id = 'handoff-photos');

-- Allow anon to upload photos under the handoffs/ directory
CREATE POLICY "Allow anon to upload handoff photos"
  ON storage.objects
  FOR INSERT
  TO anon
  WITH CHECK (
    bucket_id = 'handoff-photos'
    AND (storage.foldername(name))[1] = 'handoffs'
  );

-- Allow anon to delete photos under the handoffs/ directory
CREATE POLICY "Allow anon to delete handoff photos"
  ON storage.objects
  FOR DELETE
  TO anon
  USING (
    bucket_id = 'handoff-photos'
    AND (storage.foldername(name))[1] = 'handoffs'
  );
