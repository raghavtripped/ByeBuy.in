/// <reference types="https://esm.sh/v135/@deno/shim-deno@0.16.0/dist/server/deno.d.ts" /> 

// .supabase/functions/close-expired-auctions/index.ts (Simplified Test v2 - No Supabase Client)

// Only import CORS headers for this test
import { corsHeaders } from '../_shared/cors.ts'; 

// Read only the function secret for auth check
const functionSecret = Deno.env.get('SUPABASE_FUNCTION_SECRET'); 

console.log("Function init: close-expired-auctions (Simplified Test v2)");
console.log("Read FUNCTION_SECRET:", functionSecret ? 'OK' : 'MISSING!'); // Check if secret is read

// --- Main Request Handler ---
Deno.serve(async (req: Request) => {
  console.log(`Request received: ${req.method}`);

  // --- CORS Preflight ---
  if (req.method === 'OPTIONS') {
    console.log("Handling OPTIONS request (CORS preflight)");
    return new Response('ok', { headers: corsHeaders });
  }

  // --- Authorization Check ---
  const authHeader = req.headers.get('Authorization');
  // Ensure functionSecret was actually read from env
  if (!functionSecret) {
      console.error("CONFIG ERROR: SUPABASE_FUNCTION_SECRET env var not loaded!");
       return new Response(JSON.stringify({ error: 'Internal configuration error: Missing secret.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
  }
  // Perform the check
  if (authHeader !== `Bearer ${functionSecret}`) {
    console.error(`Authorization failed. Expected Bearer token matching secret. Received: ${authHeader ? 'Present' : 'Missing'}`);
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  console.log("Authorization successful.");

  // --- Simple Success Response ---
  try {
      const responseBody = JSON.stringify({ 
          message: "Simplified test function v2 executed successfully (No Supabase Client used).",
          secret_check: 'OK' // If we got here, secret was read and matched
      });
      
      console.log("Sending success response...");
      
      return new Response(responseBody, {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
      });

  } catch (error) {
      // Catch potential errors during simple response creation
      console.error("Error creating simple response:", error);
      return new Response(JSON.stringify({ error: 'Internal error during response generation.' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
  }
});