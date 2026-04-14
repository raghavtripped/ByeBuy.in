-- Fix B-3: Consolidate duplicate/conflicting RLS policies on profiles table
--
-- Problems found:
--   SELECT: two policies OR'd together — effectively allows all authenticated users
--     to read all profiles (intentional for contact/seller display), but the
--     "own only" policy was a confusing redundant leftover.
--   UPDATE: three policies — one authenticated + two identical public-role duplicates.
--
-- Intent: authenticated users CAN view all profiles (needed for seller/bidder display).
--         Users can only UPDATE their own profile.

-- Remove redundant SELECT policy (the broad one is intentional)
DROP POLICY IF EXISTS "Users can read their own profile only" ON public.profiles;

-- Remove the two duplicate public-role UPDATE policies
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile data" ON public.profiles;

-- The remaining policies after cleanup:
--   SELECT: "Authenticated users can view other user profiles for contact" (USING: true)
--   UPDATE: "Enable users to update their own profile" (authenticated, auth.uid() = id)
-- These two are clean and correct — no further changes needed.
