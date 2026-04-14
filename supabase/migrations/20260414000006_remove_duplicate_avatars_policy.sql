-- Fix B-8: Remove duplicate UPDATE policy on avatars storage bucket.
-- "Authenticated users can manage their own avatar" and
-- "Authenticated users can update their own avatar" are functionally identical.
-- Keep the "update" one (clearer name), drop the "manage" one.

DROP POLICY IF EXISTS "Authenticated users can manage their own avatar" ON storage.objects;
