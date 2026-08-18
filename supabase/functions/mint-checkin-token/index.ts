// Supabase Edge Function: mint-checkin-token
// Deploy with: supabase functions deploy mint-checkin-token
// Requires a CHECKIN_TOKEN_SECRET set via: supabase secrets set CHECKIN_TOKEN_SECRET=...
//
// Called by the customer app (CheckInQRScreen) every ~3 min. Returns a
// signed token encoding {userId, expiresAt} so the QR code payload can't be
// screenshotted and reused after rotation, and doesn't leak the raw user id.

import { createClient } from "npm:@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.203.0/crypto/mod.ts";
import { encodeHex } from "https://deno.land/std@0.203.0/encoding/hex.ts";

const TOKEN_TTL_MS = 3 * 60 * 1000;

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

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "missing auth" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return jsonResponse({ error: "invalid session" }, 401);
  }

  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const payload = `${user.id}.${expiresAt}`;
  const secret = Deno.env.get("CHECKIN_TOKEN_SECRET")!;
  const signature = await sign(payload, secret);
  const token = `${payload}.${signature}`;

  return jsonResponse({ token, expiresAt });
});
