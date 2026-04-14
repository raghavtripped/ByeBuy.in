-- Fix B-2: listing-images bucket storage security
-- Problems:
--   1. INSERT policy had no path-ownership check — any authed user could upload
--      to another user's folder path.
--   2. No DELETE policy — sellers couldn't delete their own photos.
--   3. No file size limit — unlimited uploads.

-- 1. Replace overly-permissive INSERT policy with one that enforces
--    that uploads go into the uploading user's own folder: {user_id}/...
DROP POLICY IF EXISTS "allow_uploads" ON storage.objects;

CREATE POLICY "listing_images_insert_own_folder"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'listing-images'
        AND auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- 2. Add DELETE policy so sellers can remove their own listing photos
DROP POLICY IF EXISTS "listing_images_delete_own" ON storage.objects;

CREATE POLICY "listing_images_delete_own"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'listing-images'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

-- 3. Set a 5 MB file size limit and restrict to image MIME types
UPDATE storage.buckets
SET
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
WHERE id = 'listing-images';
