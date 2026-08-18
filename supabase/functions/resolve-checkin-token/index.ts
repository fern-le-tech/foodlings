// Supabase Edge Function: resolve-checkin-token
// Deploy with: supabase functions deploy resolve-checkin-token
//
// Called by the staff portal right after a QR scan. Verifies the token's
// HMAC signature and expiry, then returns the customer's id + display name
// (not their full profile) plus their visit count at this restaurant, per
// the brief's "staff sees customer name + visit count, not full profile."

import { createClient } from "npm:@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.203.0/crypto/mod.ts";
import { encodeHex } from "https://deno.land/std@0.203.0/encoding/hex.ts";

// Browsers (the staff portal) send a CORS preflight before the real request
// and block the response entirely if these headers are missing. The mobile
// app never hits this because React Native doesn't enforce CORS — that's
// why this only showed up once the staff portal started calling it.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return encodeHex(new Uint8Array(sig));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const { token, restaurantId } = await req.json();
  if (!token || !restaurantId) {
    return jsonResponse({ error: "token and restaurantId required" }, 400);
  }

  const [userId, expiresAtStr, signature] = String(token).split(".");
  if (!userId || !expiresAtStr || !signature) {
    return jsonResponse({ error: "malformed token" }, 400);
  }

  const expiresAt = Number(expiresAtStr);
  if (Date.now() > expiresAt) {
    return jsonResponse({ error: "token expired — ask customer to reopen the QR screen" }, 400);
  }

  const secret = Deno.env.get("CHECKIN_TOKEN_SECRET")!;
  const expectedSignature = await sign(`${userId}.${expiresAt}`, secret);
  if (expectedSignature !== signature) {
    return jsonResponse({ error: "invalid signature" }, 400);
  }

  // Service role client — needed to read the customer's name/visit count
  // without the customer's own RLS-scoped session.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const [{ data: userRow }, { data: progressRow }] = await Promise.all([
    supabase.from("users").select("id, display_name").eq("id", userId).single(),
    supabase
      .from("user_restaurant_progress")
      .select("visit_count")
      .eq("user_id", userId)
      .eq("restaurant_id", restaurantId)
      .maybeSingle(),
  ]);

  if (!userRow) {
    return jsonResponse({ error: "customer not found" }, 404);
  }

  return jsonResponse({
    userId: userRow.id,
    displayName: userRow.display_name,
    visitCount: progressRow?.visit_count ?? 0,
  });
});
