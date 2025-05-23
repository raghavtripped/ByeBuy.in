-- Migration to add JSONB columns and populate from existing TEXT[] columns

-- Step 1: Add new JSONB columns
ALTER TABLE public.listings
ADD COLUMN photos_jsonb JSONB,
ADD COLUMN tags_jsonb JSONB;

COMMENT ON COLUMN public.listings.photos_jsonb IS 'Stores listing photo URLs as a JSONB array. Migrated from existing TEXT[] photos column.';
COMMENT ON COLUMN public.listings.tags_jsonb IS 'Stores listing tags as a JSONB array. Migrated from existing TEXT[] tags column.';

-- Step 2: Populate new JSONB columns from existing TEXT[] columns
-- The function to_jsonb() can directly convert a text array (text[]) to a jsonb array.

-- For photos_jsonb
-- This will convert the existing TEXT[] 'photos' column to a JSONB array.
-- If the original 'photos' column was NULL, 'photos_jsonb' will be set to an empty JSONB array '[]'.
UPDATE public.listings
SET photos_jsonb = COALESCE(to_jsonb(photos), '[]'::jsonb)
WHERE photos_jsonb IS NULL; -- Process only rows where the new column hasn't been populated yet.

-- For tags_jsonb
-- This will convert the existing TEXT[] 'tags' column to a JSONB array.
-- If the original 'tags' column was NULL, 'tags_jsonb' will be set to an empty JSONB array '[]'.
UPDATE public.listings
SET tags_jsonb = COALESCE(to_jsonb(tags), '[]'::jsonb)
WHERE tags_jsonb IS NULL; -- Process only rows where the new column hasn't been populated yet.

-- Note:
-- The complex helper function 'is_valid_json_array_string' and the detailed CASE statements
-- from the previous version of this script are no longer needed. This is because we've
-- confirmed that your source 'photos' and 'tags' columns are already of an ARRAY type (likely TEXT[]),
-- not TEXT columns storing JSON strings. The `to_jsonb()` function handles the array conversion directly.
-- The DO $$ ... $$ logging block for reviewing transformations of single strings to arrays
-- is also not relevant in this text[] to jsonb conversion context.