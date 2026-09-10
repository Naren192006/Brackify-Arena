-- =========================================================================
-- Brackify Arena: Storage Buckets & Access Control Policies
-- Migration: 20260903000004_storage_buckets.sql
-- =========================================================================

-- 1. Insert Storage Buckets into storage.buckets (Idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'avatars',
    'avatars',
    true,
    2097152, -- 2 MB
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  ),
  (
    'team-logos',
    'team-logos',
    true,
    5242880, -- 5 MB
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
  ),
  (
    'tournament-banners',
    'tournament-banners',
    true,
    10485760, -- 10 MB
    ARRAY['image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'match-evidence',
    'match-evidence',
    false, -- Private bucket (dispute evidence)
    26214400, -- 25 MB
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']
  )
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Enable RLS on storage.objects (if not already enabled)
do $$ begin
  execute 'ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY';
exception when others then null; end $$;

-- ---------------------------------------------------------------------------
-- Bucket 1: Avatars Policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can view avatars" ON storage.objects;
CREATE POLICY "Public can view avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Authenticated users can upload own avatar" ON storage.objects;
CREATE POLICY "Authenticated users can upload own avatar"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars' AND
    (auth.uid()::text = (storage.foldername(name))[1] OR auth.uid()::text = name)
  );

DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
CREATE POLICY "Users can update own avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars' AND
    (auth.uid()::text = (storage.foldername(name))[1] OR auth.uid()::text = name)
  );

DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;
CREATE POLICY "Users can delete own avatar"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars' AND
    (auth.uid()::text = (storage.foldername(name))[1] OR auth.uid()::text = name)
  );

-- ---------------------------------------------------------------------------
-- Bucket 2: Team Logos Policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can view team logos" ON storage.objects;
CREATE POLICY "Public can view team logos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'team-logos');

DROP POLICY IF EXISTS "Authenticated captains can upload team logos" ON storage.objects;
CREATE POLICY "Authenticated captains can upload team logos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'team-logos' AND
    EXISTS (
      SELECT 1 FROM public.teams
      WHERE id::text = (storage.foldername(name))[1]
        AND captain_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Captains can update team logos" ON storage.objects;
CREATE POLICY "Captains can update team logos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'team-logos' AND
    EXISTS (
      SELECT 1 FROM public.teams
      WHERE id::text = (storage.foldername(name))[1]
        AND captain_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Bucket 3: Tournament Banners Policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can view tournament banners" ON storage.objects;
CREATE POLICY "Public can view tournament banners"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'tournament-banners');

DROP POLICY IF EXISTS "Organizers and admins can upload tournament banners" ON storage.objects;
CREATE POLICY "Organizers and admins can upload tournament banners"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'tournament-banners' AND (
      EXISTS (
        SELECT 1 FROM public.admin_roles
        WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
      )
      OR EXISTS (
        SELECT 1 FROM public.tournaments
        WHERE id::text = (storage.foldername(name))[1]
          AND created_by = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Organizers and admins can update tournament banners" ON storage.objects;
CREATE POLICY "Organizers and admins can update tournament banners"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'tournament-banners' AND (
      EXISTS (
        SELECT 1 FROM public.admin_roles
        WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
      )
      OR EXISTS (
        SELECT 1 FROM public.tournaments
        WHERE id::text = (storage.foldername(name))[1]
          AND created_by = auth.uid()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Bucket 4: Match Dispute Evidence Policies (Private)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Participants and admins can view match evidence" ON storage.objects;
CREATE POLICY "Participants and admins can view match evidence"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'match-evidence' AND (
      EXISTS (
        SELECT 1 FROM public.admin_roles
        WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin', 'moderator')
      )
      OR auth.uid()::text = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS "Authenticated players can upload match evidence" ON storage.objects;
CREATE POLICY "Authenticated players can upload match evidence"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'match-evidence' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

