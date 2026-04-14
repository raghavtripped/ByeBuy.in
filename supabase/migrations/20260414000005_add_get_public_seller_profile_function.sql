-- Fix B-7: Capture get_public_seller_profile in migrations
-- This function exists on the live DB but was never in a migration file.
-- Without this, a fresh `supabase db reset` would break the public seller profile page.

CREATE OR REPLACE FUNCTION public.get_public_seller_profile(profile_id_to_fetch uuid)
RETURNS TABLE(
    full_name text,
    avatar_url text,
    hostel text,
    batch text,
    bio text,
    active_listings_count bigint,
    items_sold_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.full_name,
        p.avatar_url,
        p.hostel,
        p.batch,
        p.bio,
        (SELECT COUNT(*) FROM public.listings l
         WHERE l.seller_id = profile_id_to_fetch AND l.status = 'active')::bigint,
        (SELECT COUNT(*) FROM public.listings l
         WHERE l.seller_id = profile_id_to_fetch
           AND l.status = 'closed'
           AND l.winning_bidder_id IS NOT NULL)::bigint
    FROM public.profiles p
    WHERE p.id = profile_id_to_fetch;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_seller_profile(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_seller_profile(uuid) TO authenticated;
