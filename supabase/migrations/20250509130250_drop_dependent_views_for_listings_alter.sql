-- Migration: Drop views dependent on the listings table

DROP VIEW IF EXISTS public.archived_listings_details;
DROP VIEW IF EXISTS public.listings_with_highest_bid;
DROP VIEW IF EXISTS public.listings_with_seller_email;
-- Add any other views you have that directly select from 'listings'