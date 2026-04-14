-- Fix B-5: Add tags column to listings_with_seller_email view
-- The column was intentionally left out in 20250524095325 but is needed by the
-- listing detail page to display tags for active/open auctions.

CREATE OR REPLACE VIEW public.listings_with_seller_email AS
SELECT l.id,
    l.title,
    l.description,
    l.min_price,
    l.photos,
    l.seller_id,
    l.end_time,
    l.created_at,
    l.upper_cap,
    l.rules,
    l.tags,
    l.status,
    l.winning_bid_id,
    l.winning_bidder_id,
    u.email AS seller_email
FROM public.listings l
    LEFT JOIN auth.users u ON l.seller_id = u.id;

GRANT SELECT ON public.listings_with_seller_email TO anon;
GRANT SELECT ON public.listings_with_seller_email TO authenticated;
