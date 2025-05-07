--
-- PostgreSQL database dump
--

-- Dumped from database version 15.1 (Ubuntu 15.1-1.pgdg20.04+1)
-- Dumped by pg_dump version 15.8 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

-- Commented out internal Supabase schema setup that can cause issues locally
-- CREATE SCHEMA IF NOT EXISTS "graphql_public";
-- ALTER SCHEMA "graphql_public" OWNER TO "postgres";

-- CREATE SCHEMA IF NOT EXISTS "public";
-- ALTER SCHEMA "public" OWNER TO "pg_database_owner";
COMMENT ON SCHEMA "public" IS 'standard public schema';

-- CREATE SCHEMA IF NOT EXISTS "storage";
-- ALTER SCHEMA "storage" OWNER TO "postgres";

CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";
-- ALTER EXTENSION "pg_graphql" OWNER TO "postgres"; -- Might be problematic if graphql schema not fully replicated

CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
-- ALTER EXTENSION "pg_stat_statements" OWNER TO "postgres";

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
-- ALTER EXTENSION "pgcrypto" OWNER TO "postgres";

CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA "extensions";
-- ALTER EXTENSION "pgjwt" OWNER TO "postgres";

-- CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";
-- ALTER EXTENSION "supabase_vault" OWNER TO "postgres";

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
-- ALTER EXTENSION "uuid-ossp" OWNER TO "postgres";

-- Function definitions (yours) - These should be fine
CREATE OR REPLACE FUNCTION "public"."close_auction"("listing_id_to_close" "uuid", "closing_bidder_id" "uuid" DEFAULT NULL::"uuid", "closing_bid_price" numeric DEFAULT NULL::numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  highest_bid_record RECORD; 
  listing_record RECORD; 
BEGIN
  SELECT * INTO listing_record
  FROM public.listings
  WHERE id = listing_id_to_close AND status = 'active';

  IF NOT FOUND THEN
    RAISE WARNING 'Listing % not found or not active. Skipping close.', listing_id_to_close;
    RETURN;
  END IF;

  IF closing_bidder_id IS NOT NULL AND closing_bid_price IS NOT NULL THEN
    SELECT id INTO highest_bid_record
    FROM public.bids
    WHERE item_id = listing_id_to_close
      AND bidder_id = closing_bidder_id
      AND bid_price = closing_bid_price 
    ORDER BY timestamp DESC 
    LIMIT 1;
    RAISE LOG 'Closing listing % via Buy Now. Bidder: %, Price: %.', listing_id_to_close, closing_bidder_id, closing_bid_price;

  ELSE
    SELECT id, bidder_id INTO highest_bid_record
    FROM public.bids
    WHERE item_id = listing_id_to_close
    ORDER BY bid_price DESC, timestamp ASC 
    LIMIT 1;
    RAISE LOG 'Closing listing % via schedule. Found highest bid: % by bidder %', listing_id_to_close, highest_bid_record.id, highest_bid_record.bidder_id;
  END IF;

  UPDATE public.listings
  SET
    status = 'closed',
    winning_bid_id = highest_bid_record.id, 
    winning_bidder_id = COALESCE(closing_bidder_id, highest_bid_record.bidder_id) 
  WHERE
    id = listing_id_to_close;

  RAISE LOG 'Listing % status updated to closed.', listing_id_to_close;

END;
$$;
ALTER FUNCTION "public"."close_auction"("listing_id_to_close" "uuid", "closing_bidder_id" "uuid", "closing_bid_price" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_auction_outcome"("auction_id_to_close" "uuid") RETURNS TABLE("closed_auction_id" "uuid", "outcome_status" "text", "final_winning_bid_id" "uuid", "final_winning_bidder_id" "uuid", "final_winning_bid_amount" numeric, "message" "text")
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

    SELECT id, bidder_id, bid_price
    INTO highest_bid_record
    FROM public.bids
    WHERE item_id = auction_id_to_close
    ORDER BY bid_price DESC, "timestamp" ASC 
    LIMIT 1;

    IF highest_bid_record IS NOT NULL THEN
        UPDATE public.listings
        SET
            status = 'closed',
            winning_bid_id = highest_bid_record.id,
            winning_bidder_id = highest_bid_record.bidder_id
        WHERE id = auction_id_to_close;

        RETURN QUERY SELECT auction_id_to_close, 'closed_with_winner'::TEXT, highest_bid_record.id, highest_bid_record.bidder_id, highest_bid_record.bid_price, 'Auction closed. Winner determined.'::TEXT;
    ELSE
        UPDATE public.listings
        SET status = 'closed' 
        WHERE id = auction_id_to_close;

        RETURN QUERY SELECT auction_id_to_close, 'closed_no_bids'::TEXT, NULL::UUID, NULL::UUID, NULL::NUMERIC, 'Auction closed. No bids were placed.'::TEXT;
    END IF;

EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error in finalize_auction_outcome for auction %: %', auction_id_to_close, SQLERRM;
        RETURN QUERY SELECT auction_id_to_close, 'error'::TEXT, NULL::UUID, NULL::UUID, NULL::NUMERIC, 'An unexpected error occurred: ' || SQLERRM ::TEXT;
END;
$$;
ALTER FUNCTION "public"."finalize_auction_outcome"("auction_id_to_close" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_distinct_listing_ids_for_bidder"("p_bidder_id" "uuid") RETURNS TABLE("item_id" "uuid")
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT b.item_id
  FROM public.bids b
  WHERE b.bidder_id = p_bidder_id;
END;
$$;
ALTER FUNCTION "public"."get_distinct_listing_ids_for_bidder"("p_bidder_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$;
ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";

SET default_tablespace = '';
SET default_table_access_method = "heap";

-- Table definitions (yours) - These should be fine
CREATE TABLE IF NOT EXISTS "public"."bids" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "item_id" "uuid",
    "bidder_id" "uuid",
    "bid_price" numeric NOT NULL,
    "timestamp" timestamp with time zone DEFAULT "now"()
);
ALTER TABLE "public"."bids" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."listings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "min_price" numeric NOT NULL,
    "end_time" timestamp with time zone NOT NULL,
    "seller_id" "uuid",
    "photos" "text", -- This will be altered by a subsequent migration
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "winning_bid_id" "uuid",
    "winning_bidder_id" "uuid",
    "upper_cap" numeric,
    "rules" "text",
    "tags" "text"[],
    CONSTRAINT "check_listing_status" CHECK (("status" = ANY (ARRAY['active'::"text", 'closed'::"text", 'cancelled'::"text"])))
);
ALTER TABLE "public"."listings" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "updated_at" timestamp with time zone DEFAULT "now"()
);
ALTER TABLE "public"."profiles" OWNER TO "postgres";
COMMENT ON TABLE "public"."profiles" IS 'Stores public profile data for users.';
COMMENT ON COLUMN "public"."profiles"."id" IS 'References auth.users';


-- View definitions (yours)
CREATE OR REPLACE VIEW "public"."archived_listings_details" AS
 SELECT "l"."id",
    "l"."title",
    "l"."description",
    "l"."min_price",
    "l"."photos", -- At this point, photos is still TEXT
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
ALTER TABLE "public"."archived_listings_details" OWNER TO "postgres";

CREATE OR REPLACE VIEW "public"."bids_with_bidder_email" AS
 SELECT "b"."id",
    "b"."item_id",
    "b"."bidder_id",
    "b"."bid_price",
    "b"."timestamp",
    "u"."email" AS "bidder_email"
   FROM ("public"."bids" "b"
     LEFT JOIN "auth"."users" "u" ON (("b"."bidder_id" = "u"."id")));
ALTER TABLE "public"."bids_with_bidder_email" OWNER TO "postgres";

CREATE OR REPLACE VIEW "public"."listings_with_highest_bid" AS
 SELECT "l"."id",
    "l"."title",
    "l"."description",
    "l"."min_price",
    "l"."photos",
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
ALTER TABLE "public"."listings_with_highest_bid" OWNER TO "postgres";

CREATE OR REPLACE VIEW "public"."listings_with_seller_email" AS
 SELECT "l"."id",
    "l"."title",
    "l"."description",
    "l"."min_price",
    "l"."photos",
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
ALTER TABLE "public"."listings_with_seller_email" OWNER TO "postgres";


-- Primary Keys, Unique Constraints, Indexes (yours) - These should be fine
ALTER TABLE ONLY "public"."bids"
    ADD CONSTRAINT "bids_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "listings_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");
ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");
CREATE INDEX IF NOT EXISTS "idx_listings_status_end_time" ON "public"."listings" USING "btree" ("status", "end_time");
CREATE INDEX IF NOT EXISTS "idx_listings_tags" ON "public"."listings" USING "gin" ("tags");

-- Foreign Keys (yours) - These should be fine
ALTER TABLE ONLY "public"."bids"
    ADD CONSTRAINT "bids_bidder_id_fkey" FOREIGN KEY ("bidder_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."bids"
    ADD CONSTRAINT "bids_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "fk_winning_bid" FOREIGN KEY ("winning_bid_id") REFERENCES "public"."bids"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "fk_winning_bidder" FOREIGN KEY ("winning_bidder_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "listings_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

-- RLS Policies (yours) - These should be fine
CREATE POLICY "Allow authenticated users to insert bids on others' items" ON "public"."bids" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() <> ( SELECT "listings"."seller_id"
   FROM "public"."listings"
  WHERE ("listings"."id" = "bids"."item_id"))));
CREATE POLICY "Allow authenticated users to insert listings" ON "public"."listings" FOR INSERT TO "authenticated" WITH CHECK (true);
CREATE POLICY "Allow authenticated users to read bids" ON "public"."bids" FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "Allow authenticated users to read profiles" ON "public"."profiles" FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "Allow individual user update access" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));
CREATE POLICY "Allow public read access to listings" ON "public"."listings" FOR SELECT USING (true);
CREATE POLICY "Allow seller to delete their own listing" ON "public"."listings" FOR DELETE USING (("auth"."uid"() = "seller_id"));
CREATE POLICY "Allow seller to update their own listing" ON "public"."listings" FOR UPDATE USING (("auth"."uid"() = "seller_id")) WITH CHECK (("auth"."uid"() = "seller_id"));
ALTER TABLE "public"."bids" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."listings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


-- Realtime Publications - Corrected section
-- Comment out potentially problematic OWNER changes and the secondary "messages_publication"
-- The primary "supabase_realtime" publication and adding your tables to it is important.
-- ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres"; -- Should be fine, but can be commented if issues persist.

-- CREATE PUBLICATION "supabase_realtime_messages_publication" WITH (publish = 'insert, update, delete, truncate'); -- Commented out
-- ALTER PUBLICATION "supabase_realtime_messages_publication" OWNER TO "supabase_admin"; -- DEFINITELY COMMENTED OUT

-- Corrected: Removed invalid "IF NOT EXISTS"
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."bids";
-- ALTER PUBLICATION "supabase_realtime_messages_publication" ADD TABLE ONLY "public"."bids"; -- Commented out

-- Corrected: Removed invalid "IF NOT EXISTS"
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."listings";
-- ALTER PUBLICATION "supabase_realtime_messages_publication" ADD TABLE ONLY "public"."listings"; -- Commented out

-- Corrected: Removed invalid "IF NOT EXISTS"
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."profiles";
-- ALTER PUBLICATION "supabase_realtime_messages_publication" ADD TABLE ONLY "public"."profiles"; -- Commented out


-- Default GRANTS - Generally these should be fine as they grant to standard roles.
GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

GRANT ALL ON FUNCTION "public"."close_auction"("listing_id_to_close" "uuid", "closing_bidder_id" "uuid", "closing_bid_price" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."close_auction"("listing_id_to_close" "uuid", "closing_bidder_id" "uuid", "closing_bid_price" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."close_auction"("listing_id_to_close" "uuid", "closing_bidder_id" "uuid", "closing_bid_price" numeric) TO "service_role";
GRANT ALL ON FUNCTION "public"."finalize_auction_outcome"("auction_id_to_close" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."finalize_auction_outcome"("auction_id_to_close" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."finalize_auction_outcome"("auction_id_to_close" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_distinct_listing_ids_for_bidder"("p_bidder_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_distinct_listing_ids_for_bidder"("p_bidder_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_distinct_listing_ids_for_bidder"("p_bidder_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";

GRANT ALL ON TABLE "public"."bids" TO "anon";
GRANT ALL ON TABLE "public"."bids" TO "authenticated";
GRANT ALL ON TABLE "public"."bids" TO "service_role";
GRANT ALL ON TABLE "public"."listings" TO "anon";
GRANT ALL ON TABLE "public"."listings" TO "authenticated";
GRANT ALL ON TABLE "public"."listings" TO "service_role";

GRANT SELECT("status"),UPDATE("status") ON TABLE "public"."listings" TO "authenticated";
GRANT SELECT("winning_bid_id"),UPDATE("winning_bid_id") ON TABLE "public"."listings" TO "authenticated";
GRANT SELECT("winning_bidder_id"),UPDATE("winning_bidder_id") ON TABLE "public"."listings" TO "authenticated";
GRANT SELECT("upper_cap"),INSERT("upper_cap"),UPDATE("upper_cap") ON TABLE "public"."listings" TO "authenticated";
GRANT SELECT("rules"),INSERT("rules"),UPDATE("rules") ON TABLE "public"."listings" TO "authenticated";

GRANT ALL ON TABLE "public"."archived_listings_details" TO "anon";
GRANT ALL ON TABLE "public"."archived_listings_details" TO "authenticated";
GRANT ALL ON TABLE "public"."archived_listings_details" TO "service_role";
GRANT ALL ON TABLE "public"."bids_with_bidder_email" TO "anon";
GRANT ALL ON TABLE "public"."bids_with_bidder_email" TO "authenticated";
GRANT ALL ON TABLE "public"."bids_with_bidder_email" TO "service_role";
GRANT ALL ON TABLE "public"."listings_with_highest_bid" TO "anon";
GRANT ALL ON TABLE "public"."listings_with_highest_bid" TO "authenticated";
GRANT ALL ON TABLE "public"."listings_with_highest_bid" TO "service_role";
GRANT ALL ON TABLE "public"."listings_with_seller_email" TO "anon";
GRANT ALL ON TABLE "public"."listings_with_seller_email" TO "authenticated";
GRANT ALL ON TABLE "public"."listings_with_seller_email" TO "service_role";
GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";

RESET ALL;

--
-- PostgreSQL database dump complete
--