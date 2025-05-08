-- Function to close a single auction after its end time has passed
CREATE OR REPLACE FUNCTION public.close_auction(
    auction_id_to_close UUID
)
RETURNS TABLE ( -- Returns a table structure for clarity
    closed_auction_id UUID,
    outcome_status TEXT, -- e.g., 'closed_with_winner', 'closed_no_bids', 'already_closed', 'not_ended_yet', 'not_found', 'error'
    final_winning_bid_id UUID,
    final_winning_bidder_id UUID,
    final_winning_bid_amount NUMERIC,
    message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER -- IMPORTANT: Run with definer's permissions to update table
-- SET search_path = public; -- Optional: Ensure schema context if needed
AS $$
DECLARE
    listing_record RECORD;
    highest_bid_record RECORD;
BEGIN
    -- Select the listing row and lock it for update to prevent race conditions
    SELECT * INTO listing_record
    FROM public.listings
    WHERE id = auction_id_to_close
    FOR UPDATE;

    -- 1. Check if listing exists
    IF listing_record IS NULL THEN
        RETURN QUERY SELECT auction_id_to_close, 'not_found'::TEXT, NULL::UUID, NULL::UUID, NULL::NUMERIC, 'Listing not found.'::TEXT;
        RETURN;
    END IF;

    -- 2. Check if listing is already non-active
    IF listing_record.status <> 'active' THEN
        RETURN QUERY SELECT auction_id_to_close, 'already_processed'::TEXT, listing_record.winning_bid_id, listing_record.winning_bidder_id, NULL::NUMERIC, 'Auction already ' || listing_record.status || '.'::TEXT;
        RETURN;
    END IF;

    -- 3. Check if end time has actually passed
    IF listing_record.end_time IS NULL OR listing_record.end_time > NOW() THEN
         RETURN QUERY SELECT auction_id_to_close, 'not_ended_yet'::TEXT, NULL::UUID, NULL::UUID, NULL::NUMERIC, 'Auction end time has not passed yet.'::TEXT;
        RETURN;
    END IF;

    -- 4. Find the highest valid bid
    SELECT id, bidder_id, bid_price
    INTO highest_bid_record
    FROM public.bids
    WHERE item_id = auction_id_to_close
    ORDER BY bid_price DESC, "timestamp" ASC -- Highest bid, tie-break by earliest time
    LIMIT 1;

    -- 5. Update listing status based on bids
    IF highest_bid_record IS NOT NULL THEN
        -- Found a winner
        UPDATE public.listings
        SET
            status = 'closed',
            winning_bid_id = highest_bid_record.id,
            winning_bidder_id = highest_bid_record.bidder_id
            -- Optionally set final_price here too if you add that column
        WHERE id = auction_id_to_close;

        RETURN QUERY SELECT auction_id_to_close, 'closed_with_winner'::TEXT, highest_bid_record.id, highest_bid_record.bidder_id, highest_bid_record.bid_price, 'Auction closed. Winner determined.'::TEXT;

    ELSE
        -- No bids placed
        UPDATE public.listings
        SET status = 'closed'
        WHERE id = auction_id_to_close;

        RETURN QUERY SELECT auction_id_to_close, 'closed_no_bids'::TEXT, NULL::UUID, NULL::UUID, NULL::NUMERIC, 'Auction closed. No bids were placed.'::TEXT;
    END IF;

EXCEPTION
    WHEN OTHERS THEN
        -- Log error details (visible in Supabase logs if function fails)
        RAISE WARNING 'Error in close_auction for auction %: %', auction_id_to_close, SQLERRM;
        RETURN QUERY SELECT auction_id_to_close, 'error'::TEXT, NULL::UUID, NULL::UUID, NULL::NUMERIC, 'An unexpected error occurred: ' || SQLERRM ::TEXT;
END;
$$;

-- Grant EXECUTE permission to the role that the Edge Function will use.
-- 'service_role' is appropriate if the Edge Function uses the SERVICE_ROLE_KEY.
-- 'supabase_functions' role might also be relevant depending on exact setup.
-- Using service_role is common for background tasks.
GRANT EXECUTE ON FUNCTION public.close_auction(uuid) TO service_role;

-- Optional: If you ever needed authenticated users to call it (e.g., for manual trigger)
-- GRANT EXECUTE ON FUNCTION public.close_auction(uuid) TO authenticated;