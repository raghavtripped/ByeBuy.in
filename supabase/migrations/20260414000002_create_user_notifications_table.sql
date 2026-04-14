-- Fix H-4 / B-6: Create user_notifications table
-- The table is referenced throughout the frontend (Navbar unread badge,
-- notifications page) but was never created in any migration.

CREATE TABLE IF NOT EXISTS public.user_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('bid', 'listing', 'system')),
    read BOOLEAN NOT NULL DEFAULT FALSE,
    link TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup by user
CREATE INDEX IF NOT EXISTS idx_user_notifications_user_id
    ON public.user_notifications(user_id);

-- Fast unread badge count
CREATE INDEX IF NOT EXISTS idx_user_notifications_unread
    ON public.user_notifications(user_id, read)
    WHERE read = FALSE;

-- Enable RLS
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

-- Users can read their own notifications
CREATE POLICY "users_read_own_notifications"
    ON public.user_notifications FOR SELECT
    USING (auth.uid() = user_id);

-- Users can mark their own notifications as read (UPDATE)
CREATE POLICY "users_update_own_notifications"
    ON public.user_notifications FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Users can delete their own notifications
CREATE POLICY "users_delete_own_notifications"
    ON public.user_notifications FOR DELETE
    USING (auth.uid() = user_id);

-- Notifications are inserted by the service role (DB triggers / edge functions only)
-- No INSERT policy for authenticated/anon roles.

GRANT SELECT, UPDATE, DELETE ON public.user_notifications TO authenticated;

-- Trigger: notify seller when a bid is placed on their listing
CREATE OR REPLACE FUNCTION public.notify_seller_on_bid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_seller_id UUID;
    v_listing_title TEXT;
BEGIN
    SELECT seller_id, title
    INTO v_seller_id, v_listing_title
    FROM public.listings
    WHERE id = NEW.item_id;

    -- Don't notify if the seller placed the bid themselves
    IF v_seller_id IS NOT NULL AND v_seller_id <> NEW.bidder_id THEN
        INSERT INTO public.user_notifications (user_id, message, type, link)
        VALUES (
            v_seller_id,
            'A new bid of ₹' || NEW.bid_price || ' was placed on "' || COALESCE(v_listing_title, 'your listing') || '".',
            'bid',
            '/listings/' || NEW.item_id
        );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_seller_on_bid ON public.bids;
CREATE TRIGGER trg_notify_seller_on_bid
    AFTER INSERT ON public.bids
    FOR EACH ROW EXECUTE FUNCTION public.notify_seller_on_bid();

-- Trigger: notify winner when an auction closes
CREATE OR REPLACE FUNCTION public.notify_winner_on_close()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Only fire when status changes TO 'closed' and a winning bidder is set
    IF NEW.status = 'closed'
       AND OLD.status <> 'closed'
       AND NEW.winning_bidder_id IS NOT NULL
    THEN
        INSERT INTO public.user_notifications (user_id, message, type, link)
        VALUES (
            NEW.winning_bidder_id,
            'Congratulations! You won the auction for "' || COALESCE(NEW.title, 'a listing') || '".',
            'listing',
            '/listings/' || NEW.id
        );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_winner_on_close ON public.listings;
CREATE TRIGGER trg_notify_winner_on_close
    AFTER UPDATE ON public.listings
    FOR EACH ROW EXECUTE FUNCTION public.notify_winner_on_close();
