// supabase/functions/close-expired-auctions/cors.ts
// Defines reusable CORS headers for Edge Function responses

export const corsHeaders = {
    // Allow requests from any origin. For production, you might restrict this
    // to your specific frontend domain(s) for better security.
    // Example: 'Access-Control-Allow-Origin': 'https://your-app-domain.com',
    'Access-Control-Allow-Origin': '*',
  
    // Specify allowed headers in requests, including custom ones and standard ones like Authorization.
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };