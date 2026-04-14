// supabase/functions/email-domain-validation/index.ts
//
// ⚠️  STUB — SOURCE NOT YET PULLED FROM PRODUCTION
//
// This function exists on the live Supabase project (verify_jwt: true) but was
// never checked into source control. To fill in the real implementation:
//
//   1. Go to Supabase Dashboard → Edge Functions → email-domain-validation → Code
//   2. Copy the full source and replace everything below the dashed line.
//   3. Then run: supabase functions deploy email-domain-validation
//
// Do NOT deploy this stub — it will overwrite the working live function.
//
// Known behaviour (from audit):
//   - verify_jwt: true  (requires a valid Supabase JWT to call)
//   - Likely validates that a user's email belongs to @iimidr.ac.in at the
//     application level (possibly duplicates the DB trigger
//     before_user_insert_validate_email / validate_new_user_email).
//   - Before redeploying, confirm it doesn't conflict with the DB trigger.
//
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

serve(async (_req) => {
  return new Response(
    JSON.stringify({ error: 'Stub — replace with real source from Supabase dashboard' }),
    { status: 501, headers: { 'Content-Type': 'application/json' } }
  );
});
