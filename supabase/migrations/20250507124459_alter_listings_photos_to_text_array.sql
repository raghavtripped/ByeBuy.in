-- Migration 2: Alter the column type
ALTER TABLE public.listings
ALTER COLUMN photos TYPE TEXT[]
USING CASE
  WHEN photos IS NOT NULL AND photos <> '' THEN ARRAY[photos]
  ELSE NULL
END;