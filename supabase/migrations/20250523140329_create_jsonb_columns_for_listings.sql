-- supabase/migrations/20250523140329_create_jsonb_columns_for_listings.sql

-- Step 1: Add new columns
ALTER TABLE public.listings
ADD COLUMN photos_jsonb JSONB,
ADD COLUMN tags_jsonb JSONB;

COMMENT ON COLUMN public.listings.photos_jsonb IS 'Temporary column to store listing photos as JSONB (array of strings or objects). Will replace the existing TEXT photos column.';
COMMENT ON COLUMN public.listings.tags_jsonb IS 'Temporary column to store listing tags as JSONB (array of strings). Will replace the existing TEXT tags column.';

-- Step 2: Define helper function to check for valid JSON array strings
-- This function is crucial for safely attempting to cast TEXT to JSONB array.
-- If you are using PostgreSQL 16+, you could potentially use JSON_IS_VALID() and jsonb_typeof() directly in the CASE statement,
-- but this function provides a robust way for older versions or more complex validation.
CREATE OR REPLACE FUNCTION public.is_valid_json_array_string(p_text TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE AS
$$
BEGIN
    -- An empty string or NULL is not considered a valid JSON array string for our direct casting purpose.
    -- The UPDATE statement will handle these by defaulting to '[]'::jsonb.
    IF p_text IS NULL OR p_text = '' THEN
        RETURN FALSE;
    END IF;

    -- Attempt to cast to JSONB. If it fails, it's not valid JSON.
    PERFORM p_text::JSONB;

    -- If casting succeeds, check if the JSONB type is 'array'.
    IF jsonb_typeof(p_text::JSONB) = 'array' THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
EXCEPTION
    WHEN OTHERS THEN
        -- Any error during casting or type checking means it's not a valid JSON array string.
        RETURN FALSE;
END
$$;
COMMENT ON FUNCTION public.is_valid_json_array_string(TEXT) IS 'Checks if a text string is a valid JSON string that represents a JSON array.';

-- Step 3: Populate new JSONB columns with transformed data
-- For photos_jsonb
UPDATE public.listings
SET photos_jsonb =
    CASE
        -- If 'photos' field contains a valid JSON array string (e.g., '["url1", "url2"]'), cast it directly.
        WHEN public.is_valid_json_array_string(photos) THEN
            photos::jsonb
        -- If 'photos' field is a non-empty string but not a JSON array (e.g., a single URL "http://..."),
        -- wrap it into a JSONB array containing that single string.
        WHEN photos IS NOT NULL AND photos <> '' THEN
            jsonb_build_array(photos::TEXT) -- Explicitly cast to TEXT before building array if it's just a plain string
        -- For all other cases (NULL, empty string, or unhandled malformed JSON), default to an empty JSONB array.
        ELSE
            '[]'::jsonb
    END
WHERE photos_jsonb IS NULL; -- Process only rows not yet updated (idempotency)

-- For tags_jsonb (similar logic)
UPDATE public.listings
SET tags_jsonb =
    CASE
        -- If 'tags' field contains a valid JSON array string (e.g., '["tag1", "tag2"]'), cast it directly.
        WHEN public.is_valid_json_array_string(tags) THEN
            tags::jsonb
        -- If 'tags' field is a non-empty string but not a JSON array (e.g., a single tag "electronics"),
        -- wrap it into a JSONB array containing that single string.
        WHEN tags IS NOT NULL AND tags <> '' THEN
            jsonb_build_array(tags::TEXT)
        -- For all other cases (NULL, empty string, or unhandled malformed JSON), default to an empty JSONB array.
        ELSE
            '[]'::jsonb
    END
WHERE tags_jsonb IS NULL; -- Process only rows not yet updated

-- Step 4: Optional Logging (for data review after migration)
-- This block helps identify rows where the original TEXT field was treated as a single string
-- and wrapped into an array, which might be expected or might indicate data that needs review.
DO $$
DECLARE
    r RECORD;
BEGIN
    RAISE NOTICE 'Reviewing transformations for photos...';
    FOR r IN SELECT id, photos, photos_jsonb FROM public.listings
             WHERE photos IS NOT NULL AND photos <> ''
               AND NOT public.is_valid_json_array_string(photos)
               AND photos_jsonb = jsonb_build_array(photos::TEXT) LOOP
        RAISE NOTICE 'Listing ID %: Original photos field "%" was not a JSON array string; transformed to JSONB array: %', r.id, r.photos, r.photos_jsonb;
    END LOOP;

    RAISE NOTICE 'Reviewing transformations for tags...';
    FOR r IN SELECT id, tags, tags_jsonb FROM public.listings
             WHERE tags IS NOT NULL AND tags <> ''
               AND NOT public.is_valid_json_array_string(tags)
               AND tags_jsonb = jsonb_build_array(tags::TEXT) LOOP
        RAISE NOTICE 'Listing ID %: Original tags field "%" was not a JSON array string; transformed to JSONB array: %', r.id, r.tags, r.tags_jsonb;
    END LOOP;
    RAISE NOTICE 'Transformation review complete.';
END $$;