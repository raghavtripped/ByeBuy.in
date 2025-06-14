-- Up Migration
DROP VIEW IF EXISTS public.listings_with_highest_bid;
CREATE OR REPLACE VIEW public.listings_with_highest_bid AS
SELECT
    l.*,
    (SELECT MAX(b.bid_price) FROM public.bids b WHERE b.item_id = l.id) AS current_highest_bid,
    (SELECT COUNT(b.id) FROM public.bids b WHERE b.item_id = l.id) AS bid_count
FROM
    public.listings l;

-- Down Migration
-- CREATE OR REPLACE VIEW public.listings_with_highest_bid AS
-- SELECT
--     l.*,
--     (SELECT MAX(b.bid_price) FROM public.bids b WHERE b.item_id = l.id) AS current_highest_bid
-- FROM
--     public.listings l; 