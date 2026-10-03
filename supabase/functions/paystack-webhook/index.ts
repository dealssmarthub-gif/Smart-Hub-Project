// Supabase Edge Function: paystack-webhook
//
// Settles card / MoMo payments even when the buyer's browser never reports
// back (tab closed, network lost). Paystack signs each event with HMAC-SHA512
// of the raw body using the secret key; unsigned or mis-signed calls are rejected.
//
// Deploy without JWT verification (Paystack can't send a Supabase JWT):
//   supabase functions deploy paystack-webhook --no-verify-jwt
// Then set the webhook URL in the Paystack dashboard to
//   https://<project-ref>.supabase.co/functions/v1/paystack-webhook
import { adminClient, hmacSha512Hex, json, safeEqual, verifyProviderIntent, type IntentRow } from "../_shared/paymentsCore.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false }, 405);

  const secret = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!secret) return json({ ok: false, error: "not configured" }, 500);

  const raw = await req.text();
  const signature = req.headers.get("x-paystack-signature") ?? "";
  if (!safeEqual(await hmacSha512Hex(secret, raw), signature)) return json({ ok: false }, 401);

  let event: any;
  try {
    event = JSON.parse(raw);
  } catch {
    return json({ ok: false }, 400);
  }

  if (event?.event === "charge.success" && typeof event.data?.reference === "string") {
    const db = adminClient();
    const { data: intent } = await db.from("payment_intents").select("*").eq("provider_reference", event.data.reference).maybeSingle();
    if (intent) {
      try {
        // Re-verify with Paystack rather than trusting the event payload's amount.
        await verifyProviderIntent(db, intent as IntentRow);
      } catch (err) {
        console.error("paystack-webhook: settlement failed", err);
        return json({ ok: false }, 500); // non-2xx → Paystack retries
      }
    }
  }
  return json({ ok: true });
});
