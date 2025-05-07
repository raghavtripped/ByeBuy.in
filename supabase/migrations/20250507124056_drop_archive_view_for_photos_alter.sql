-- Migration 1: Drop all views depending on listings.photos
DROP VIEW IF EXISTS public.archived_listings_details;
DROP VIEW IF EXISTS public.listings_with_highest_bid;
DROP VIEW IF EXISTS public.listings_with_seller_email;