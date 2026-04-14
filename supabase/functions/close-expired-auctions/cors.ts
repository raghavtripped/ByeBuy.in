// supabase/functions/close-expired-auctions/cors.ts
// Defines reusable CORS headers for Edge Function responses

// This function is called server-to-server (pg_cron → edge function).
// CORS headers are irrelevant for that path but are included for any
// browser-initiated OPTIONS preflight. Restrict to the production domain
// so browsers cannot call this endpoint from arbitrary origins.
export const corsHeaders = {
    'Access-Control-Allow-Origin': 'https://byebuy.in',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };