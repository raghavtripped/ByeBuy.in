drop view if exists "public"."archived_listings_details";

drop view if exists "public"."listings_with_highest_bid";

drop view if exists "public"."listings_with_seller_email";

create table "public"."listing_chats" (
    "id" uuid not null default uuid_generate_v4(),
    "listing_id" uuid not null,
    "sender_id" uuid,
    "content" text not null,
    "created_at" timestamp with time zone not null default now()
);


alter table "public"."listing_chats" enable row level security;

create table "public"."watched_listings" (
    "id" uuid not null default uuid_generate_v4(),
    "user_id" uuid not null,
    "listing_id" uuid not null,
    "created_at" timestamp with time zone not null default now()
);


alter table "public"."watched_listings" enable row level security;

alter table "public"."bids" alter column "bid_price" drop not null;

alter table "public"."bids" enable row level security;

alter table "public"."listings" drop column "photos_jsonb";

alter table "public"."listings" drop column "tags_jsonb";

alter table "public"."listings" alter column "end_time" drop not null;

alter table "public"."listings" alter column "min_price" drop not null;

alter table "public"."listings" alter column "photos" set data type text[] using "photos"::text[];

alter table "public"."listings" alter column "tags" set data type text[] using "tags"::text[];

alter table "public"."listings" alter column "title" drop not null;

alter table "public"."listings" enable row level security;

alter table "public"."profiles" enable row level security;

CREATE INDEX idx_listing_chats_listing_id_created_at ON public.listing_chats USING btree (listing_id, created_at DESC);

CREATE INDEX idx_listing_chats_sender_id ON public.listing_chats USING btree (sender_id);

CREATE INDEX idx_listings_tags ON public.listings USING gin (tags);

CREATE INDEX idx_watched_listings_user_id ON public.watched_listings USING btree (user_id);

CREATE UNIQUE INDEX listing_chats_pkey ON public.listing_chats USING btree (id);

CREATE UNIQUE INDEX user_listing_unique ON public.watched_listings USING btree (user_id, listing_id);

CREATE UNIQUE INDEX watched_listings_pkey ON public.watched_listings USING btree (id);

alter table "public"."listing_chats" add constraint "listing_chats_pkey" PRIMARY KEY using index "listing_chats_pkey";

alter table "public"."watched_listings" add constraint "watched_listings_pkey" PRIMARY KEY using index "watched_listings_pkey";

alter table "public"."listing_chats" add constraint "listing_chats_content_check" CHECK (((char_length(content) > 0) AND (char_length(content) <= 1000))) not valid;

alter table "public"."listing_chats" validate constraint "listing_chats_content_check";

alter table "public"."listing_chats" add constraint "listing_chats_listing_id_fkey" FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE not valid;

alter table "public"."listing_chats" validate constraint "listing_chats_listing_id_fkey";

alter table "public"."listing_chats" add constraint "listing_chats_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."listing_chats" validate constraint "listing_chats_sender_id_fkey";

alter table "public"."watched_listings" add constraint "user_listing_unique" UNIQUE using index "user_listing_unique";

alter table "public"."watched_listings" add constraint "watched_listings_listing_id_fkey" FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE not valid;

alter table "public"."watched_listings" validate constraint "watched_listings_listing_id_fkey";

alter table "public"."watched_listings" add constraint "watched_listings_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."watched_listings" validate constraint "watched_listings_user_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.close_auction(auction_id_to_close uuid)
 RETURNS TABLE(closed_auction_id uuid, outcome_status text, final_winning_bid_id uuid, final_winning_bidder_id uuid, final_winning_bid_amount numeric, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.close_auction(listing_id_to_close uuid, closing_bidder_id uuid DEFAULT NULL::uuid, closing_bid_price numeric DEFAULT NULL::numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  highest_bid_record RECORD; -- Variable to hold the winning bid details
  listing_record RECORD; -- Variable to hold listing details
BEGIN
  -- Ensure the function runs with elevated privileges ONLY when necessary.
  -- Check if the listing exists and is currently active before proceeding.
  SELECT * INTO listing_record
  FROM public.listings
  WHERE id = listing_id_to_close AND status = 'active';

  -- If listing not found or not active, exit gracefully.
  IF NOT FOUND THEN
    RAISE WARNING 'Listing % not found or not active. Skipping close.', listing_id_to_close;
    RETURN;
  END IF;

  -- Determine the winning bid
  IF closing_bidder_id IS NOT NULL AND closing_bid_price IS NOT NULL THEN
    -- Buy Now scenario: Winner details are provided, find the corresponding bid ID (optional but good practice)
    -- This assumes a bid was (or will be) inserted at the closing_bid_price by closing_bidder_id
    SELECT id INTO highest_bid_record
    FROM public.bids
    WHERE item_id = listing_id_to_close
      AND bidder_id = closing_bidder_id
      AND bid_price = closing_bid_price -- Match the exact Buy Now price
    ORDER BY timestamp DESC -- Get the latest if multiple exist (shouldn't happen)
    LIMIT 1;
    RAISE LOG 'Closing listing % via Buy Now. Bidder: %, Price: %.', listing_id_to_close, closing_bidder_id, closing_bid_price;

  ELSE
    -- Scheduled close scenario: Find the highest bid organically
    SELECT id, bidder_id INTO highest_bid_record
    FROM public.bids
    WHERE item_id = listing_id_to_close
    ORDER BY bid_price DESC, timestamp ASC -- Highest price, earliest timestamp wins ties
    LIMIT 1;
    RAISE LOG 'Closing listing % via schedule. Found highest bid: % by bidder %', listing_id_to_close, highest_bid_record.id, highest_bid_record.bidder_id;
  END IF;

  -- Update the listing table
  UPDATE public.listings
  SET
    status = 'closed',
    winning_bid_id = highest_bid_record.id, -- Will be NULL if no bids found or Buy Now bid ID not found
    winning_bidder_id = COALESCE(closing_bidder_id, highest_bid_record.bidder_id) -- Use provided winner or highest bidder
  WHERE
    id = listing_id_to_close;

  RAISE LOG 'Listing % status updated to closed.', listing_id_to_close;

END;
$function$
;

create or replace view "public"."listing_chats_with_sender_email" as  SELECT lc.id,
    lc.listing_id,
    lc.sender_id,
    lc.content,
    lc.created_at,
    u.email AS sender_email
   FROM (listing_chats lc
     LEFT JOIN auth.users u ON ((lc.sender_id = u.id)));


CREATE OR REPLACE FUNCTION public.validate_new_user_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- Whitelist
    IF NEW.email IN (
        'raghavtripathi2408@gmail.com',
        'raghavtripathi2203@gmail.com'
    ) THEN
        RETURN NEW; 
    END IF;

    -- Domain check
    IF NEW.email !~* '@iimidr\.ac\.in$' THEN
        RAISE EXCEPTION 'Signup blocked: Only @iimidr.ac.in email addresses are allowed. Your email: %', NEW.email
        USING HINT = 'Please use your IIM Indore institutional email address or contact admin if you believe this is an error.';
    END IF;

    RETURN NEW;
END;
$function$
;

create or replace view "public"."archived_listings_details" as  SELECT l.id,
    l.title,
    l.description,
    l.min_price,
    l.photos,
    l.end_time,
    l.created_at,
    l.status,
    l.upper_cap,
    l.rules,
    l.seller_id,
    seller.email AS seller_email,
    l.winning_bid_id,
    l.winning_bidder_id,
    winner.email AS winner_email,
    winning_bid.bid_price AS final_sale_price
   FROM (((listings l
     LEFT JOIN auth.users seller ON ((l.seller_id = seller.id)))
     LEFT JOIN bids winning_bid ON ((l.winning_bid_id = winning_bid.id)))
     LEFT JOIN auth.users winner ON ((l.winning_bidder_id = winner.id)))
  WHERE (l.status = ANY (ARRAY['closed'::text, 'cancelled'::text]));


CREATE OR REPLACE FUNCTION public.finalize_auction_outcome(auction_id_to_close uuid)
 RETURNS TABLE(closed_auction_id uuid, outcome_status text, final_winning_bid_id uuid, final_winning_bidder_id uuid, final_winning_bid_amount numeric, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    listing_record RECORD;
    highest_bid_record RECORD;
    current_user_id UUID := auth.uid(); -- Get the ID of the user calling this function
BEGIN
    -- Lock the listing row to prevent race conditions
    SELECT * INTO listing_record FROM public.listings WHERE id = auction_id_to_close FOR UPDATE;

    -- Check if the listing exists
    IF listing_record IS NULL THEN
        RETURN QUERY SELECT auction_id_to_close, 'error'::TEXT, NULL::UUID, NULL::UUID, NULL::NUMERIC, 'Listing not found.'::TEXT;
        RETURN;
    END IF;

    -- Check if the calling user is the seller
    IF listing_record.seller_id IS DISTINCT FROM current_user_id THEN
        RETURN QUERY SELECT auction_id_to_close, 'error'::TEXT, NULL::UUID, NULL::UUID, NULL::NUMERIC, 'Unauthorized: Only the seller can finalize this auction.'::TEXT;
        RETURN;
    END IF;

    -- Check if the auction is already closed or cancelled
    IF listing_record.status <> 'active' THEN
        RETURN QUERY SELECT auction_id_to_close, 'no_action'::TEXT, listing_record.winning_bid_id, listing_record.winning_bidder_id, NULL::NUMERIC, 'Auction is already ' || listing_record.status || '.'::TEXT;
        RETURN;
    END IF;

    -- Check if the auction end time has passed
    IF listing_record.end_time IS NOT NULL AND listing_record.end_time > NOW() THEN
        RETURN QUERY SELECT auction_id_to_close, 'error'::TEXT, NULL::UUID, NULL::UUID, NULL::NUMERIC, 'Auction has not ended yet.'::TEXT;
        RETURN;
    END IF;

    -- Find the highest bid for this auction
    SELECT id, bidder_id, bid_price
    INTO highest_bid_record
    FROM public.bids
    WHERE item_id = auction_id_to_close
    ORDER BY bid_price DESC, "timestamp" ASC -- Highest price, earliest timestamp if tied
    LIMIT 1;

    -- Update the listing based on whether a winning bid was found
    IF highest_bid_record IS NOT NULL THEN
        UPDATE public.listings
        SET
            status = 'closed',
            winning_bid_id = highest_bid_record.id,
            winning_bidder_id = highest_bid_record.bidder_id
        WHERE id = auction_id_to_close;

        RETURN QUERY SELECT auction_id_to_close, 'closed_with_winner'::TEXT, highest_bid_record.id, highest_bid_record.bidder_id, highest_bid_record.bid_price, 'Auction closed. Winner determined.'::TEXT;
    ELSE
        -- No bids, or some other issue if highest_bid_record is null
        UPDATE public.listings
        SET status = 'closed' -- Still close it, but without a winner
        WHERE id = auction_id_to_close;

        RETURN QUERY SELECT auction_id_to_close, 'closed_no_bids'::TEXT, NULL::UUID, NULL::UUID, NULL::NUMERIC, 'Auction closed. No bids were placed.'::TEXT;
    END IF;

EXCEPTION
    WHEN OTHERS THEN
        -- Log the error (e.g., using RAISE NOTICE or to a custom error log table)
        RAISE NOTICE 'Error in finalize_auction_outcome for auction %: %', auction_id_to_close, SQLERRM;
        RETURN QUERY SELECT auction_id_to_close, 'error'::TEXT, NULL::UUID, NULL::UUID, NULL::NUMERIC, 'An unexpected error occurred: ' || SQLERRM ::TEXT;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_distinct_listing_ids_for_bidder(p_bidder_id uuid)
 RETURNS TABLE(item_id uuid)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT DISTINCT b.item_id
  FROM public.bids b
  WHERE b.bidder_id = p_bidder_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Insert a new row into public.profiles
  -- Use the email from the new auth.users record
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$function$
;

create or replace view "public"."listings_with_highest_bid" as  SELECT l.id,
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
    ( SELECT max(bids.bid_price) AS max
           FROM bids
          WHERE (bids.item_id = l.id)) AS current_highest_bid
   FROM listings l;


create or replace view "public"."listings_with_seller_email" as  SELECT l.id,
    l.title,
    l.description,
    l.min_price,
    l.photos,
    l.seller_id,
    l.end_time,
    l.created_at,
    l.upper_cap,
    l.rules,
    l.status,
    l.winning_bid_id,
    l.winning_bidder_id,
    u.email AS seller_email
   FROM (listings l
     LEFT JOIN auth.users u ON ((l.seller_id = u.id)));


grant delete on table "public"."listing_chats" to "anon";

grant insert on table "public"."listing_chats" to "anon";

grant references on table "public"."listing_chats" to "anon";

grant select on table "public"."listing_chats" to "anon";

grant trigger on table "public"."listing_chats" to "anon";

grant truncate on table "public"."listing_chats" to "anon";

grant update on table "public"."listing_chats" to "anon";

grant delete on table "public"."listing_chats" to "authenticated";

grant insert on table "public"."listing_chats" to "authenticated";

grant references on table "public"."listing_chats" to "authenticated";

grant select on table "public"."listing_chats" to "authenticated";

grant trigger on table "public"."listing_chats" to "authenticated";

grant truncate on table "public"."listing_chats" to "authenticated";

grant update on table "public"."listing_chats" to "authenticated";

grant delete on table "public"."listing_chats" to "service_role";

grant insert on table "public"."listing_chats" to "service_role";

grant references on table "public"."listing_chats" to "service_role";

grant select on table "public"."listing_chats" to "service_role";

grant trigger on table "public"."listing_chats" to "service_role";

grant truncate on table "public"."listing_chats" to "service_role";

grant update on table "public"."listing_chats" to "service_role";

grant delete on table "public"."watched_listings" to "anon";

grant insert on table "public"."watched_listings" to "anon";

grant references on table "public"."watched_listings" to "anon";

grant select on table "public"."watched_listings" to "anon";

grant trigger on table "public"."watched_listings" to "anon";

grant truncate on table "public"."watched_listings" to "anon";

grant update on table "public"."watched_listings" to "anon";

grant delete on table "public"."watched_listings" to "authenticated";

grant insert on table "public"."watched_listings" to "authenticated";

grant references on table "public"."watched_listings" to "authenticated";

grant select on table "public"."watched_listings" to "authenticated";

grant trigger on table "public"."watched_listings" to "authenticated";

grant truncate on table "public"."watched_listings" to "authenticated";

grant update on table "public"."watched_listings" to "authenticated";

grant delete on table "public"."watched_listings" to "service_role";

grant insert on table "public"."watched_listings" to "service_role";

grant references on table "public"."watched_listings" to "service_role";

grant select on table "public"."watched_listings" to "service_role";

grant trigger on table "public"."watched_listings" to "service_role";

grant truncate on table "public"."watched_listings" to "service_role";

grant update on table "public"."watched_listings" to "service_role";

create policy "Allow authenticated users to read bids"
on "public"."bids"
as permissive
for select
to authenticated
using (true);


create policy "Enable authenticated users to insert bids on others' items (as "
on "public"."bids"
as permissive
for insert
to authenticated
with check (((auth.uid() = bidder_id) AND (auth.uid() <> ( SELECT listings.seller_id
   FROM listings
  WHERE (listings.id = bids.item_id)))));


create policy "Allow authenticated read access to all listing chats"
on "public"."listing_chats"
as permissive
for select
to authenticated
using (true);


create policy "Allow authenticated users to send messages in listing chats"
on "public"."listing_chats"
as permissive
for insert
to authenticated
with check (((auth.uid() = sender_id) AND (listing_id IS NOT NULL) AND (content IS NOT NULL)));


create policy "Disallow deletions of listing chat messages by users"
on "public"."listing_chats"
as permissive
for delete
to authenticated
using (false);


create policy "Disallow updates to listing chat messages by users"
on "public"."listing_chats"
as permissive
for update
to authenticated
using (false);


create policy "Allow public read access to listings"
on "public"."listings"
as permissive
for select
to public
using (true);


create policy "Enable authenticated users to insert their own new listings"
on "public"."listings"
as permissive
for insert
to authenticated
with check ((auth.uid() = seller_id));


create policy "Enable sellers to delete own listings (if no bids)"
on "public"."listings"
as permissive
for delete
to authenticated
using (((auth.uid() = seller_id) AND (NOT (EXISTS ( SELECT 1
   FROM bids
  WHERE (bids.item_id = listings.id))))));


create policy "Enable sellers to update own active listings"
on "public"."listings"
as permissive
for update
to authenticated
using (((auth.uid() = seller_id) AND (status = 'active'::text)))
with check (((auth.uid() = seller_id) AND (status = 'active'::text)));


create policy "Allow authenticated users to read profiles"
on "public"."profiles"
as permissive
for select
to authenticated
using (true);


create policy "Enable users to update their own profile"
on "public"."profiles"
as permissive
for update
to authenticated
using ((auth.uid() = id))
with check ((auth.uid() = id));


create policy "Allow authenticated users to add to their own watchlist"
on "public"."watched_listings"
as permissive
for insert
to authenticated
with check ((auth.uid() = user_id));


create policy "Allow authenticated users to read their own watchlist"
on "public"."watched_listings"
as permissive
for select
to authenticated
using ((auth.uid() = user_id));


create policy "Allow authenticated users to remove from their own watchlist"
on "public"."watched_listings"
as permissive
for delete
to authenticated
using ((auth.uid() = user_id));



