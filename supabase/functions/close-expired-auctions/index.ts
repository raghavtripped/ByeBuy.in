// supabase/functions/close-expired-auctions/index.ts

// NOTE: Triple-slash directive removed as per Vercel build fix.
// Relies on VS Code Deno Extension + supabase/functions/tsconfig.json for local editor types.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from './cors.ts';

// --- Environment Variables ---
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const functionSecret = Deno.env.get('CLOSE_EXPIRED_AUCTIONS_SECRET'); // CORRECTED KEY NAME

// --- Type Definitions ---
interface ListingToCheck {
  id: string;
  title?: string;
}
interface CloseResult {
    closed_auction_id: string;
    outcome_status: string;
    final_winning_bid_id?: string | null;
    final_winning_bidder_id?: string | null;
    final_winning_bid_amount?: number | null;
    message: string;
}

console.log("Function init: close-expired-auctions (Full Logic v1.5 - Updated Secret Key)");

// --- Main Request Handler ---
Deno.serve(async (req: Request) => {
  const requestStart = Date.now();
  const requestUrl = new URL(req.url);
  console.log(`[${new Date().toISOString()}] Request received: ${req.method} ${requestUrl.pathname}`);

  // --- CORS Preflight Handling ---
  if (req.method === 'OPTIONS') {
    console.log("Handling OPTIONS request (CORS preflight)");
    return new Response('ok', { headers: corsHeaders });
  }

  // --- Authorization Check ---
  const authHeader = req.headers.get('Authorization');
  if (!functionSecret) {
      // CORRECTED: Updated error message to reflect new secret name
      console.error("CONFIG ERROR: CLOSE_EXPIRED_AUCTIONS_SECRET env var not set/read.");
      return new Response(JSON.stringify({ error: 'Internal configuration error: Function authorization secret missing.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
  }
  if (authHeader !== `Bearer ${functionSecret}`) {
    console.error(`Authorization failed. Expected Bearer token. Received: ${authHeader ? 'Present but potentially incorrect' : 'Missing'}`);
    return new Response(JSON.stringify({ error: 'Unauthorized: Invalid or missing secret.' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  console.log("Authorization successful.");

  // --- Environment Variable Check for Supabase Client ---
  if (!supabaseUrl || !serviceRoleKey) {
      console.error('CONFIG ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env variables for Supabase client.');
      return new Response(JSON.stringify({ error: 'Internal configuration error: Backend client variables missing.' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
  }

  // --- Supabase Admin Client Initialization ---
  let supabaseAdmin: SupabaseClient;
  try {
      supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false }
      });
      console.log("Supabase admin client initialized.");
  } catch (clientError) {
      console.error("Failed to create Supabase admin client:", clientError);
       return new Response(JSON.stringify({ error: 'Internal configuration error: Failed to initialize backend client.' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
  }

  // --- Core Logic ---
  try {
    const now = new Date().toISOString();
    console.log(`Querying for active listings ended before ${now}...`);

    const { data: listingsToClose, error: queryError } = await supabaseAdmin
      .from('listings')
      .select('id, title')
      .eq('status', 'active')
      .lt('end_time', now)
      .returns<ListingToCheck[]>();

    if (queryError) {
      console.error("Database query error fetching listings:", queryError);
      throw new Error(`Failed to query listings: ${queryError.message}`);
    }

    if (!listingsToClose || listingsToClose.length === 0) {
      const message = "No expired active listings found to process at this time.";
      console.log(message);
      return new Response(JSON.stringify({ message: message, processed_count: 0, details: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    console.log(`Found ${listingsToClose.length} listing(s) needing closure:`, listingsToClose.map((l: ListingToCheck) => ({id: l.id, title: l.title || 'N/A'})));

    const processingResults: { id: string; outcome: string; detail: string }[] = [];
    const promises = listingsToClose.map(async (listing: ListingToCheck) => {
      console.log(`--> Processing listing ID: ${listing.id} (${listing.title || 'No Title'})`);
      try {
          const { data: rpcDataUntyped, error: rpcError } = await supabaseAdmin
            .rpc('close_auction', { auction_id_to_close: listing.id });

          if (rpcError) {
            console.error(`    RPC Error for ${listing.id}:`, rpcError);
            processingResults.push({ id: listing.id, outcome: 'rpc_error', detail: rpcError.message });
          } else if (Array.isArray(rpcDataUntyped) && rpcDataUntyped.length > 0 && rpcDataUntyped[0]) {
             const result = rpcDataUntyped[0] as CloseResult;
             console.log(`    RPC Success for ${listing.id}: ${result.outcome_status} - ${result.message}`);
             processingResults.push({ id: result.closed_auction_id, outcome: result.outcome_status, detail: result.message });
          } else {
              console.warn(`    RPC Warning for ${listing.id}: Unexpected or empty data returned from close_auction.`, rpcDataUntyped);
              processingResults.push({ id: listing.id, outcome: 'rpc_no_data', detail: 'No valid data returned from RPC.' });
          }
      } catch (rpcInvokeError) {
          console.error(`    RPC Exception for ${listing.id}:`, rpcInvokeError);
          processingResults.push({
            id: listing.id,
            outcome: 'rpc_exception',
            detail: rpcInvokeError instanceof Error ? rpcInvokeError.message : String(rpcInvokeError)
          });
      }
    });

    await Promise.all(promises);

    const duration = Date.now() - requestStart;
    console.log(`Finished processing ${listingsToClose.length} listings in ${duration}ms.`);
    console.log("Processing details:", processingResults);

    return new Response(JSON.stringify({
        message: `Processed ${listingsToClose.length} listings.`,
        processed_count: processingResults.length,
        duration_ms: duration,
        details: processingResults
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    const duration = Date.now() - requestStart;
    console.error(`Unhandled error in close-expired-auctions after ${duration}ms:`, error);
    return new Response(JSON.stringify({
        error: (error instanceof Error ? error.message : String(error)) || 'An unexpected server error occurred.'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});