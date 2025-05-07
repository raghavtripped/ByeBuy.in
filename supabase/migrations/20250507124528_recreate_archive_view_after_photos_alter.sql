-- Migration 3: Recreate all dropped views

-- Recreate archived_listings_details
CREATE OR REPLACE VIEW public.archived_listings_details AS
SELECT
    l.id, l.title, l.description, l.min_price, l.photos, l.end_time,
    l.created_at, l.status, l.upper_cap, l.rules, l.seller_id,
    seller.email AS seller_email, l.winning_bid_id, l.winning_bidder_id,
    winner.email AS winner_email, winning_bid.bid_price AS final_sale_price
FROM public.listings l
LEFT JOIN auth.users seller ON l.seller_id = seller.id
LEFT JOIN public.bids winning_bid ON l.winning_bid_id = winning_bid.id
LEFT JOIN auth.users winner ON l.winning_bidder_id = winner.id
WHERE l.status IN ('closed', 'cancelled');

-- Recreate listings_with_highest_bid
CREATE OR REPLACE VIEW public.listings_with_highest_bid AS
SELECT l.id, l.title, l.description, l.min_price, l.photos, l.seller_id,
       l.end_time, l.created_at, l.upper_cap, l.rules, l.status,
       l.winning_bid_id, l.winning_bidder_id,
       (SELECT max(bids.bid_price) FROM public.bids WHERE bids.item_id = l.id) AS current_highest_bid
FROM public.listings l;

-- Recreate listings_with_seller_email
CREATE OR REPLACE VIEW public.listings_with_seller_email AS
SELECT l.id, l.title, l.description, l.min_price, l.photos, l.seller_id,
       l.end_time, l.created_at, l.upper_cap, l.rules, l.status,
       l.winning_bid_id, l.winning_bidder_id, u.email AS seller_email
FROM public.listings l
LEFT JOIN auth.users u ON l.seller_id = u.id;

-- Re-grant permissions for all recreated views
GRANT SELECT ON public.archived_listings_details TO authenticated;
GRANT SELECT ON public.archived_listings_details TO anon;

GRANT SELECT ON public.listings_with_highest_bid TO authenticated;
GRANT SELECT ON public.listings_with_highest_bid TO anon;

GRANT SELECT ON public.listings_with_seller_email TO authenticated;
GRANT SELECT ON public.listings_with_seller_email TO anon;