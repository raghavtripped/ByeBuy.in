-- Migration: Alter listings.photos and listings.tags to TEXT[]

-- Alter 'photos' column
ALTER TABLE public.listings
ALTER COLUMN photos TYPE TEXT[]
USING CASE
  WHEN photos IS NOT NULL AND photos <> '' THEN ARRAY[photos] -- Convert existing single URL to a single-element array
  ELSE NULL
END;

-- Alter 'tags' column
ALTER TABLE public.listings
ALTER COLUMN tags TYPE TEXT[]
USING CASE
  WHEN tags IS NOT NULL AND tags <> '' THEN string_to_array(tags, ',') -- Assuming current tags are comma-separated if multiple
  ELSE NULL
END;
-- If your existing 'tags' (TEXT) column was never intended for multiple values,
-- and you only ever stored one tag or it was always NULL, you could simplify the 'tags' USING clause to:
-- USING CASE WHEN tags IS NOT NULL AND tags <> '' THEN ARRAY[tags] ELSE NULL END;
-- Choose the USING clause for 'tags' that best fits your current data.
-- For now, string_to_array is a safe bet if you might have put comma-separated values.