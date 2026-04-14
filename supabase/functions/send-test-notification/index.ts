// supabase/functions/send-test-notification/index.ts
//
// ⚠️  STUB — SOURCE NOT YET PULLED FROM PRODUCTION
//
// This function exists on the live Supabase project (verify_jwt: false) but was
// never checked into source control. To fill in the real implementation:
//
//   1. Go to Supabase Dashboard → Edge Functions → send-test-notification → Code
//   2. Copy the full source and replace everything below the dashed line.
//   3. Then run: supabase functions deploy send-test-notification
//
// Do NOT deploy this stub — it will overwrite the working live function.
//
// Known behaviour (from audit):
//   - verify_jwt: false  (can be called without a JWT — treat calls as untrusted)
//   - Likely sends a browser push notification to a user via the push_subscriptions
//     table and a VAPID key stored in environment variables.
//   - Related to the notification pipeline (H-4/B-6). Once user_notifications table
//     is created (migration 20260414000002), this function should be wired into
//     the notify_seller_on_bid and notify_winner_on_close triggers.
//
// Environment variables likely needed (check Supabase Dashboard → Edge Functions
// → send-test-notification → Environment Variables):
//   - VAPID_PUBLIC_KEY
//   - VAPID_PRIVATE_KEY
//   - VAPID_SUBJECT  (e.g. mailto:admin@byebuy.in)
//
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

serve(async (_req) => {
  return new Response(
    JSON.stringify({ error: 'Stub — replace with real source from Supabase dashboard' }),
    { status: 501, headers: { 'Content-Type': 'application/json' } }
  );
});
