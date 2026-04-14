-- Fix B-1: Cron job sending wrong auth token — auctions never auto-close
-- ============================================================================
-- BEFORE APPLYING THIS FILE:
--   1. Go to Supabase Dashboard → Edge Functions → close-expired-auctions → Environment Variables
--   2. Copy the value of CLOSE_EXPIRED_AUCTIONS_SECRET
--   3. Replace <PASTE_SECRET_HERE> below with that value
--   4. Run this in the Supabase SQL Editor (do NOT commit the secret to git)
-- ============================================================================
--
-- NOTE: The .MANUAL.sql extension is intentional — this file should NOT be
-- applied by `supabase db push` automatically. Rename to .sql only after
-- you have substituted the real secret and are ready to apply it manually.
-- ============================================================================

SELECT cron.alter_job(
    job_id := 1,
    command := $cmd$
        SELECT net.http_post(
            url := 'https://efkggsqrpmilxfmszdlz.supabase.co/functions/v1/close-expired-auctions',
            headers := jsonb_build_object(
                'Authorization', 'Bearer <PASTE_SECRET_HERE>'
            ),
            timeout_milliseconds := 15000
        );
    $cmd$
);
