-- supabase/migrations/YYYYMMDDHHMMSS_update_listing_views_for_jsonb_columns.sql

BEGIN; -- Start a transaction

-- View 1: listings_with_highest_bid
DROP VIEW IF EXISTS public.listings_with_highest_bid; -- <<< ADD THIS LINE
CREATE OR REPLACE VIEW public.listings_with_highest_bid AS
SELECT
    l.id,
    l.title,
    l.description,
    l.min_price,
    l.photos_jsonb AS photos,
    l.seller_id,
    l.end_time,
    l.created_at,
    l.upper_cap,
    l.rules,
    l.tags_jsonb AS tags,
    l.status,
    l.winning_bid_id,
    l.winning_bidder_id,
    (SELECT max(bids.bid_price)
     FROM public.bids
     WHERE bids.item_id = l.id) AS current_highest_bid
FROM
    public.listings l;

-- View 2: archived_listings_details
DROP VIEW IF EXISTS public.archived_listings_details; -- <<< ADD THIS LINE
CREATE OR REPLACE VIEW public.archived_listings_details AS
SELECT l.id,
    l.title,
    l.description,
    l.min_price,
    l.photos_jsonb AS photos,
    l.end_time,
    l.created_at,
    l.status,
    l.upper_cap,
    l.rules,
    l.tags_jsonb AS tags,
    l.seller_id,
    seller.email AS seller_email,
    l.winning_bid_id,
    l.winning_bidder_id,
    winner.email AS winner_email,
    winning_bid.bid_price AS final_sale_price
FROM public.listings l
    LEFT JOIN auth.users seller ON l.seller_id = seller.id
    LEFT JOIN public.bids winning_bid ON l.winning_bid_id = winning_bid.id
    LEFT JOIN auth.users winner ON l.winning_bidder_id = winner.id
WHERE l.status = ANY (ARRAY['closed'::text, 'cancelled'::text]);

-- View 3: listings_with_seller_email
DROP VIEW IF EXISTS public.listings_with_seller_email; -- <<< ADD THIS LINE
CREATE OR REPLACE VIEW public.listings_with_seller_email AS
SELECT l.id,
    l.title,
    l.description,
    l.min_price,
    l.photos_jsonb AS photos,
    l.seller_id,
    l.end_time,
    l.created_at,
    l.upper_cap,
    l.rules,
    l.tags_jsonb AS tags,
    l.status,
    l.winning_bid_id,
    l.winning_bidder_id,
    u.email AS seller_email
FROM public.listings l
    LEFT JOIN auth.users u ON l.seller_id = u.id;

-- Grant permissions again
GRANT SELECT ON public.listings_with_highest_bid TO anon;
GRANT SELECT ON public.listings_with_highest_bid TO authenticated;

GRANT SELECT ON public.archived_listings_details TO anon;
GRANT SELECT ON public.archived_listings_details TO authenticated;

GRANT SELECT ON public.listings_with_seller_email TO anon;
GRANT SELECT ON public.listings_with_seller_email TO authenticated;

COMMIT; -- End transaction