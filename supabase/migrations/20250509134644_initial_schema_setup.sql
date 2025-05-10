-- Migration: Initial Schema Setup (Cleaned and with Corrected Function Permissions)
-- Timestamp: 20250509134644 (Simulated)

-- Ensure extensions required by table definitions are present
-- uuid-ossp is commonly used for uuid_generate_v4()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";

-- ========================================================================
-- Table Definitions
-- ========================================================================

-- Table: public.listings
CREATE TABLE IF NOT EXISTS "public"."listings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "min_price" numeric NOT NULL,
    "end_time" timestamp with time zone NOT NULL,
    "seller_id" "uuid",
    "photos" TEXT NULL, -- Storing JSON string array of photo URLs
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "winning_bid_id" "uuid",
    "winning_bidder_id" "uuid",
    "upper_cap" numeric,
    "rules" "text",
    "tags" TEXT NULL, -- Storing JSON string array of tags
    CONSTRAINT "check_listing_status" CHECK (("status" = ANY (ARRAY['active'::"text", 'closed'::"text", 'cancelled'::"text"])))
);

-- Table: public.bids
CREATE TABLE IF NOT EXISTS "public"."bids" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "item_id" "uuid",
    "bidder_id" "uuid",
    "bid_price" numeric NOT NULL,
    "timestamp" timestamp with time zone DEFAULT "now"()
);

-- Table: public.profiles
CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text", -- User's email, typically synced from auth.users
    "updated_at" timestamp with time zone DEFAULT "now"() -- Timestamp of the last profile update
);
COMMENT ON TABLE "public"."profiles" IS 'Stores public profile data for users.';
COMMENT ON COLUMN "public"."profiles"."id" IS 'References auth.users.id, making it a one-to-one extension.';


-- ========================================================================
-- Primary Keys & Unique Constraints
-- ========================================================================

ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "listings_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."bids"
    ADD CONSTRAINT "bids_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");

-- Unique constraint for profile email, ensuring no two profiles (even if theoretically possible) share the same email.
ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");


-- ========================================================================
-- Foreign Keys
-- ========================================================================
-- Note: We assume auth.users table exists from Supabase's internal Auth setup.

-- Listings Foreign Keys
ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "listings_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "fk_winning_bid" FOREIGN KEY ("winning_bid_id") REFERENCES "public"."bids"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "fk_winning_bidder" FOREIGN KEY ("winning_bidder_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

-- Bids Foreign Keys
ALTER TABLE ONLY "public"."bids"
    ADD CONSTRAINT "bids_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."bids"
    ADD CONSTRAINT "bids_bidder_id_fkey" FOREIGN KEY ("bidder_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

-- Profiles Foreign Key
ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


-- ========================================================================
-- Database Functions & Triggers
-- ========================================================================

-- Function: handle_new_user (Populates public.profiles when a new user signs up in auth.users)
CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    -- SET search_path = public; -- Generally not needed if objects are schema-qualified or search_path is correctly set for the function execution context.
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$;

-- Trigger: on_auth_user_created (Invokes handle_new_user after a new user is inserted into auth.users)
-- Ensure this trigger does not already exist if you are re-running. Supabase might manage this via UI too.
DROP TRIGGER IF EXISTS "on_auth_user_created" ON "auth"."users"; -- Add this if you want the migration to be fully idempotent for the trigger
CREATE TRIGGER "on_auth_user_created"
  AFTER INSERT ON "auth"."users"
  FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_user"();
-- Note: If Supabase UI manages this trigger, creating it here might be redundant or could conflict.
-- Check your Supabase Dashboard -> Authentication -> Triggers. If it's there, you might not need to define it in migrations.
-- However, for full schema-as-code, including it here with a DROP IF EXISTS is common.


-- Function: get_distinct_listing_ids_for_bidder (Fetches unique listing IDs a user has bid on)
-- This is the CORRECTED definition with appropriate language and permissions.
CREATE OR REPLACE FUNCTION "public"."get_distinct_listing_ids_for_bidder"("p_bidder_id" "uuid")
RETURNS TABLE("item_id" "uuid")
    LANGUAGE "sql" STABLE -- Using "sql" for simple SELECT; STABLE indicates no side effects and same result for same input in a transaction.
    AS $$
  SELECT DISTINCT b.item_id
  FROM public.bids b
  WHERE b.bidder_id = p_bidder_id;
$$;

-- Permissions for get_distinct_listing_ids_for_bidder:
-- Grant EXECUTE to authenticated users (so they can see their bids).
GRANT EXECUTE ON FUNCTION "public"."get_distinct_listing_ids_for_bidder"("uuid") TO authenticated;
-- Revoke EXECUTE from PUBLIC (which includes anon) to prevent unauthenticated access.
REVOKE EXECUTE ON FUNCTION "public"."get_distinct_listing_ids_for_bidder"("uuid") FROM PUBLIC;
-- Optional: Explicitly revoke from anon, though covered by revoking from PUBLIC.
-- REVOKE EXECUTE ON FUNCTION "public"."get_distinct_listing_ids_for_bidder"("uuid") FROM anon;


-- Function: finalize_auction_outcome (Manually triggered by a seller to close their auction)
-- This function allows a seller to finalize an auction that has passed its end_time.
CREATE OR REPLACE FUNCTION "public"."finalize_auction_outcome"("auction_id_to_close" "uuid")
RETURNS TABLE("closed_auction_id" "uuid", "outcome_status" "text", "final_winning_bid_id" "uuid", "final_winning_bidder_id" "uuid", "final_winning_bid_amount" numeric, "message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER -- SECURITY DEFINER allows it to run with definer's privileges, carefully manage what it can do.
    AS $$
DECLARE
    listing_record RECORD;
    highest_bid_record RECORD;
    current_user_id UUID := auth.uid(); -- Get the ID of the user calling the function.
BEGIN
    -- Select the listing for update to lock the row and prevent race conditions.
    SELECT * INTO listing_record FROM public.listings WHERE id = auction_id_to_close FOR UPDATE;

    -- Check if listing exists
    IF listing_record IS NULL THEN
        RETURN QUERY SELECT auction_id_to_close, 'error'::TEXT, NULL::UUID, NULL::UUID, NULL::NUMERIC, 'Listing not found.'::TEXT;
        RETURN;
    END IF;

    -- Authorization: Check if the current user is the seller of the listing.
    IF listing_record.seller_id IS DISTINCT FROM current_user_id THEN
        RETURN QUERY SELECT auction_id_to_close, 'error'::TEXT, NULL::UUID, NULL::UUID, NULL::NUMERIC, 'Unauthorized: Only the seller can finalize this auction.'::TEXT;
        RETURN;
    END IF;

    -- Check if auction is already closed or cancelled.
    IF listing_record.status <> 'active' THEN
        RETURN QUERY SELECT auction_id_to_close, 'no_action'::TEXT, listing_record.winning_bid_id, listing_record.winning_bidder_id, NULL::NUMERIC, 'Auction is already ' || listing_record.status || '.'::TEXT;
        RETURN;
    END IF;

    -- Check if auction end time has passed.
    IF listing_record.end_time IS NOT NULL AND listing_record.end_time > NOW() THEN
        RETURN QUERY SELECT auction_id_to_close, 'error'::TEXT, NULL::UUID, NULL::UUID, NULL::NUMERIC, 'Auction has not ended yet.'::TEXT;
        RETURN;
    END IF;

    -- Find the highest bid for the auction.
    SELECT id, bidder_id, bid_price INTO highest_bid_record
    FROM public.bids
    WHERE item_id = auction_id_to_close
    ORDER BY bid_price DESC, "timestamp" ASC -- Highest bid, then earliest if bids are tied.
    LIMIT 1;

    -- If a highest bid exists, mark as closed with winner.
    IF highest_bid_record IS NOT NULL THEN
        UPDATE public.listings
        SET status = 'closed', winning_bid_id = highest_bid_record.id, winning_bidder_id = highest_bid_record.bidder_id
        WHERE id = auction_id_to_close;
        RETURN QUERY SELECT auction_id_to_close, 'closed_with_winner'::TEXT, highest_bid_record.id, highest_bid_record.bidder_id, highest_bid_record.bid_price, 'Auction closed. Winner determined.'::TEXT;
    ELSE
        -- If no bids, mark as closed without a winner.
        UPDATE public.listings SET status = 'closed' WHERE id = auction_id_to_close;
        RETURN QUERY SELECT auction_id_to_close, 'closed_no_bids'::TEXT, NULL::UUID, NULL::UUID, NULL::NUMERIC, 'Auction closed. No bids were placed.'::TEXT;
    END IF;

EXCEPTION WHEN OTHERS THEN
    -- Basic error handling to catch unexpected issues.
    RAISE NOTICE 'Error in finalize_auction_outcome for auction %: %', auction_id_to_close, SQLERRM;
    RETURN QUERY SELECT auction_id_to_close, 'error'::TEXT, NULL::UUID, NULL::UUID, NULL::NUMERIC, 'An unexpected error occurred: ' || SQLERRM ::TEXT;
END;
$$;
-- Permissions for finalize_auction_outcome (Sellers need to execute this)
GRANT EXECUTE ON FUNCTION "public"."finalize_auction_outcome"("uuid") TO authenticated;


-- ========================================================================
-- Database Views
-- ========================================================================
-- These views simplify querying complex data relationships.

CREATE OR REPLACE VIEW "public"."archived_listings_details" AS
 SELECT "l"."id",
    "l"."title",
    "l"."description",
    "l"."min_price",
    "l"."photos", -- TEXT column storing JSON string of URLs
    "l"."end_time",
    "l"."created_at",
    "l"."status",
    "l"."upper_cap",
    "l"."rules",
    "l"."tags",   -- TEXT column storing JSON string of tags
    "l"."seller_id",
    "seller"."email" AS "seller_email",
    "l"."winning_bid_id",
    "l"."winning_bidder_id",
    "winner"."email" AS "winner_email",
    "winning_bid"."bid_price" AS "final_sale_price"
   FROM ((("public"."listings" "l"
     LEFT JOIN "auth"."users" "seller" ON (("l"."seller_id" = "seller"."id")))
     LEFT JOIN "public"."bids" "winning_bid" ON (("l"."winning_bid_id" = "winning_bid"."id")))
     LEFT JOIN "auth"."users" "winner" ON (("l"."winning_bidder_id" = "winner"."id")))
  WHERE ("l"."status" = ANY (ARRAY['closed'::"text", 'cancelled'::"text"]));

CREATE OR REPLACE VIEW "public"."bids_with_bidder_email" AS
 SELECT "b"."id",
    "b"."item_id",
    "b"."bidder_id",
    "b"."bid_price",
    "b"."timestamp",
    "u"."email" AS "bidder_email"
   FROM ("public"."bids" "b"
     LEFT JOIN "auth"."users" "u" ON (("b"."bidder_id" = "u"."id")));

CREATE OR REPLACE VIEW "public"."listings_with_highest_bid" AS
 SELECT "l"."id",
    "l"."title",
    "l"."description",
    "l"."min_price",
    "l"."photos", -- TEXT column
    "l"."seller_id",
    "l"."end_time",
    "l"."created_at",
    "l"."upper_cap",
    "l"."rules",
    "l"."tags",   -- TEXT column
    "l"."status",
    "l"."winning_bid_id",
    "l"."winning_bidder_id",
    ( SELECT "max"("bids"."bid_price") -- Subquery to get the current highest bid for the listing
           FROM "public"."bids"
          WHERE ("bids"."item_id" = "l"."id")) AS "current_highest_bid"
   FROM "public"."listings" "l";

CREATE OR REPLACE VIEW "public"."listings_with_seller_email" AS
 SELECT "l"."id",
    "l"."title",
    "l"."description",
    "l"."min_price",
    "l"."photos", -- TEXT column
    "l"."seller_id",
    "l"."end_time",
    "l"."created_at",
    "l"."upper_cap",
    "l"."rules",
    "l"."tags",   -- TEXT column
    "l"."status",
    "l"."winning_bid_id",
    "l"."winning_bidder_id",
    "u"."email" AS "seller_email"
   FROM ("public"."listings" "l"
     LEFT JOIN "auth"."users" "u" ON (("l"."seller_id" = "u"."id")));

-- ========================================================================
-- Indexes
-- ========================================================================

-- Index for efficient querying of listings by status and end_time (e.g., for finding active, expired auctions).
CREATE INDEX IF NOT EXISTS "idx_listings_status_end_time" ON "public"."listings" USING "btree" ("status", "end_time");

-- Note on GIN index for 'tags':
-- If 'tags' remains TEXT storing a JSON string, a GIN index on it for full-text search or JSON operations
-- would be different than a GIN index on a native TEXT[] array.
-- For now, with 'tags' as TEXT, specific indexing strategies for tag searching (e.g., LIKE '%tag%')
-- might involve other index types or full-text search capabilities if performance becomes an issue.
-- A GIN index for TEXT[] would be added in a later migration if the column type changes.
-- Example of what it might look like IF tags were TEXT[]:
-- CREATE INDEX IF NOT EXISTS "idx_listings_tags_gin" ON "public"."listings" USING "gin" ("tags" "public"."_text_ops");

-- Consider adding other indexes as needed based on query patterns, e.g.:
-- CREATE INDEX IF NOT EXISTS idx_bids_item_id ON public.bids USING btree (item_id);
-- CREATE INDEX IF NOT EXISTS idx_bids_bidder_id ON public.bids USING btree (bidder_id);
-- CREATE INDEX IF NOT EXISTS idx_listings_seller_id ON public.listings USING btree (seller_id);

-- End of Initial Schema Setup