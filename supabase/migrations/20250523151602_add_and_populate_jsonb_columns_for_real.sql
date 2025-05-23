-- Migration: YYYYMMDDHHMMSS_add_and_populate_jsonb_columns_for_real.sql
-- Goal: Add photos_jsonb, tags_jsonb and populate them from existing TEXT[] photos/tags.

-- Step 1: Add new JSONB columns (with IF NOT EXISTS for safety, though they shouldn't exist on remote)
ALTER TABLE public.listings
ADD COLUMN IF NOT EXISTS photos_jsonb JSONB,
ADD COLUMN IF NOT EXISTS tags_jsonb JSONB;

COMMENT ON COLUMN public.listings.photos_jsonb IS 'Stores listing photo URLs as a JSONB array. Migrated from existing TEXT[] photos column.';
COMMENT ON COLUMN public.listings.tags_jsonb IS 'Stores listing tags as a JSONB array. Migrated from existing TEXT[] tags column.';

-- Step 2: Populate new JSONB columns from existing TEXT[] columns
-- Ensure this runs only if the columns were just added or are empty.

-- For photos_jsonb
UPDATE public.listings
SET photos_jsonb = COALESCE(to_jsonb(photos), '[]'::jsonb)
WHERE photos_jsonb IS NULL; -- Only populate if currently NULL (e.g., newly added or previously failed to populate)

-- For tags_jsonb
UPDATE public.listings
SET tags_jsonb = COALESCE(to_jsonb(tags), '[]'::jsonb)
WHERE tags_jsonb IS NULL; -- Only populate if currently NULL