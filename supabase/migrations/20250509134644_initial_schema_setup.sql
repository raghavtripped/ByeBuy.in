-- Migration: Initial Schema Setup (Cleaned)

-- Ensure extensions required by table definitions are present
-- uuid-ossp is commonly used for uuid_generate_v4()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";

-- Table: public.listings
CREATE TABLE IF NOT EXISTS "public"."listings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "min_price" numeric NOT NULL,
    "end_time" timestamp with time zone NOT NULL,
    "seller_id" "uuid",
    "photos" TEXT NULL, -- DEFINED AS TEXT
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "winning_bid_id" "uuid",
    "winning_bidder_id" "uuid",
    "upper_cap" numeric,
    "rules" "text",
    "tags" TEXT NULL, -- DEFINED AS TEXT
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
    "email" "text",
    "updated_at" timestamp with time zone DEFAULT "now"()
);
COMMENT ON TABLE "public"."profiles" IS 'Stores public profile data for users.';
COMMENT ON COLUMN "public"."profiles"."id" IS 'References auth.users';


-- Primary Keys
ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "listings_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."bids"
    ADD CONSTRAINT "bids_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");

-- Unique Constraints (Example if needed, profiles_email_key from your dump)
ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");


-- Foreign Keys
-- Note: We assume auth.users table exists from Supabase's internal setup.
ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "listings_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "fk_winning_bid" FOREIGN KEY ("winning_bid_id") REFERENCES "public"."bids"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "fk_winning_bidder" FOREIGN KEY ("winning_bidder_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."bids"
    ADD CONSTRAINT "bids_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."bids"
    ADD CONSTRAINT "bids_bidder_id_fkey" FOREIGN KEY ("bidder_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


-- Functions (Only include functions that are stable and correct in your production)
-- Function: handle_new_user (This is a common Supabase trigger function)
CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    -- SET search_path = public; -- Usually not needed if objects are schema-qualified
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$;
-- If you have a trigger using this function, add it here:
-- CREATE TRIGGER on_auth_user_created
--   AFTER INSERT ON auth.users
--   FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- Function: get_distinct_listing_ids_for_bidder
-- IMPORTANT: Using the CORRECTED definition for this function.
CREATE OR REPLACE FUNCTION "public"."get_distinct_listing_ids_for_bidder"("p_bidder_id" "uuid")
RETURNS TABLE("item_id" "uuid")
    LANGUAGE "sql" STABLE -- SQL functions are often STABLE if they don't modify data
    AS $$
  SELECT DISTINCT b.item_id
  FROM public.bids b
  WHERE b.bidder_id = p_bidder_id;
$$;


-- Function: finalize_auction_outcome (Your manually triggered one)
-- This function should be fine to include if its logic is stable.
CREATE OR REPLACE FUNCTION "public"."finalize_auction_outcome"("auction_id_to_close" "uuid")
RETURNS TABLE("closed_auction_id" "uuid", "outcome_status" "text", "final_winning_bid_id" "uuid", "final_winning_bidder_id" "uuid", "final_winning_bid_amount" numeric, "message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    listing_record RECORD;
    highest_bid_record RECORD;
    current_user_id UUID := auth.uid();
BEGIN
    SELECT * INTO listing_record FROM public.listings WHERE id = auction_id_to_close FOR UPDATE;
    IF listing_record IS NULL THEN
        RETURN QUERY SELECT auction_id_to_close, 'error'::TEXT, NULL::UUID, NULL::UUID, NULL::NUMERIC, 'Listing not found.'::TEXT;
        RETURN;
    END IF;
    IF listing_record.seller_id IS DISTINCT FROM current_user_id THEN
        RETURN QUERY SELECT auction_id_to_close, 'error'::TEXT, NULL::UUID, NULL::UUID, NULL::NUMERIC, 'Unauthorized: Only the seller can finalize this auction.'::TEXT;
        RETURN;
    END IF;
    IF listing_record.status <> 'active' THEN
        RETURN QUERY SELECT auction_id_to_close, 'no_action'::TEXT, listing_record.winning_bid_id, listing_record.winning_bidder_id, NULL::NUMERIC, 'Auction is already ' || listing_record.status || '.'::TEXT;
        RETURN;
    END IF;
    IF listing_record.end_time IS NOT NULL AND listing_record.end_time > NOW() THEN
        RETURN QUERY SELECT auction_id_to_close, 'error'::TEXT, NULL::UUID, NULL::UUID, NULL::NUMERIC, 'Auction has not ended yet.'::TEXT;
        RETURN;
    END IF;
    SELECT id, bidder_id, bid_price INTO highest_bid_record FROM public.bids WHERE item_id = auction_id_to_close ORDER BY bid_price DESC, "timestamp" ASC LIMIT 1;
    IF highest_bid_record IS NOT NULL THEN
        UPDATE public.listings SET status = 'closed', winning_bid_id = highest_bid_record.id, winning_bidder_id = highest_bid_record.bidder_id WHERE id = auction_id_to_close;
        RETURN QUERY SELECT auction_id_to_close, 'closed_with_winner'::TEXT, highest_bid_record.id, highest_bid_record.bidder_id, highest_bid_record.bid_price, 'Auction closed. Winner determined.'::TEXT;
    ELSE
        UPDATE public.listings SET status = 'closed' WHERE id = auction_id_to_close;
        RETURN QUERY SELECT auction_id_to_close, 'closed_no_bids'::TEXT, NULL::UUID, NULL::UUID, NULL::NUMERIC, 'Auction closed. No bids were placed.'::TEXT;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error in finalize_auction_outcome for auction %: %', auction_id_to_close, SQLERRM;
    RETURN QUERY SELECT auction_id_to_close, 'error'::TEXT, NULL::UUID, NULL::UUID, NULL::NUMERIC, 'An unexpected error occurred: ' || SQLERRM ::TEXT;
END;
$$;


-- Views (These will depend on the tables defined above)
-- Make sure 'photos' and 'tags' are just l.photos and l.tags
CREATE OR REPLACE VIEW "public"."archived_listings_details" AS
 SELECT "l"."id",
    "l"."title",
    "l"."description",
    "l"."min_price",
    "l"."photos", -- This will be TEXT initially
    "l"."end_time",
    "l"."created_at",
    "l"."status",
    "l"."upper_cap",
    "l"."rules",
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
    "l"."photos", -- This will be TEXT initially
    "l"."seller_id",
    "l"."end_time",
    "l"."created_at",
    "l"."upper_cap",
    "l"."rules",
    "l"."status",
    "l"."winning_bid_id",
    "l"."winning_bidder_id",
    ( SELECT "max"("bids"."bid_price") AS "max"
           FROM "public"."bids"
          WHERE ("bids"."item_id" = "l"."id")) AS "current_highest_bid"
   FROM "public"."listings" "l";

CREATE OR REPLACE VIEW "public"."listings_with_seller_email" AS
 SELECT "l"."id",
    "l"."title",
    "l"."description",
    "l"."min_price",
    "l"."photos", -- This will be TEXT initially
    "l"."seller_id",
    "l"."end_time",
    "l"."created_at",
    "l"."upper_cap",
    "l"."rules",
    "l"."status",
    "l"."winning_bid_id",
    "l"."winning_bidder_id",
    "u"."email" AS "seller_email"
   FROM ("public"."listings" "l"
     LEFT JOIN "auth"."users" "u" ON (("l"."seller_id" = "u"."id")));

-- Indexes (from your dump, should be fine if tables/columns exist)
CREATE INDEX IF NOT EXISTS "idx_listings_status_end_time" ON "public"."listings" USING "btree" ("status", "end_time");
-- For "idx_listings_tags", this index requires the 'tags' column to exist.
-- It will be created on TEXT[] later, but we define 'tags' as TEXT here initially.
-- So, we either omit this index here and add it in a later migration AFTER 'tags' is TEXT[],
-- OR we define 'tags' as TEXT[] from the start if we are certain about its initial empty state.
-- For a clean initial setup with TEXT, let's omit this index here. It can be added
-- by the ...alter_listings_photos_tags_to_arrays_final.sql migration.
-- CREATE INDEX IF NOT EXISTS "idx_listings_tags" ON "public"."listings" USING "gin" ("tags");