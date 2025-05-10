-- supabase/migrations/<timestamp>_fix_listings_with_highest_bid_view_add_tags.sql
CREATE OR REPLACE VIEW public.listings_with_highest_bid AS
SELECT
    l.id,
    l.title,
    l.description,
    l.min_price,
    l.photos,
    l.seller_id,
    l.end_time,
    l.created_at,
    l.upper_cap,
    l.rules,
    l.tags,  -- <<< THIS IS THE KEY ADDITION
    l.status,
    l.winning_bid_id,
    l.winning_bidder_id,
    (SELECT max(bids.bid_price)
     FROM public.bids
     WHERE bids.item_id = l.id) AS current_highest_bid
FROM
    public.listings l;

GRANT SELECT ON public.listings_with_highest_bid TO anon;
GRANT SELECT ON public.listings_with_highest_bid TO authenticated;