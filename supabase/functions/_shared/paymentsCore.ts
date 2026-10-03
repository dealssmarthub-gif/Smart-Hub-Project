// Server-only helpers for the payments Edge Functions (Deno runtime).
// Never import this from the web app: it reads service-role and Paystack secrets.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export class ApiError extends Error {
  status: number;
  code: string;
  retryable: boolean;
  details?: unknown;

  constructor(status: number, code: string, message: string, retryable = false, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

export function errorResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    return json({ error: { code: err.code, message: err.message, retryable: err.retryable, details: err.details } }, err.status);
  }
  console.error("payments: unhandled error", err);
  return json({ error: { code: "SERVICE_UNAVAILABLE", message: "The payments service hit an unexpected error.", retryable: true } }, 500);
}

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new ApiError(500, "SERVICE_UNAVAILABLE", `Server misconfigured: ${name} is not set.`);
  return v;
}

export function adminClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Maps errors raised by the naflis_* SQL functions onto API errors. */
export function sqlError(error: { message?: string } | null): never {
  const m = error?.message ?? "";
  if (m.includes("insufficient_funds")) throw new ApiError(402, "INSUFFICIENT_FUNDS", "Your NAFLIS Wallet balance is too low for this payment.");
  if (m.includes("idempotency_key_reused")) throw new ApiError(409, "IDEMPOTENCY_KEY_REUSED", "This payment key was already used for a different request.");
  if (m.includes("out_of_stock")) throw new ApiError(409, "QUOTE_INVALID", "An item in your cart just sold out.");
  if (m.includes("delivery_locked")) throw new ApiError(409, "INVALID_TRANSITION", "Dispatch is locked until the buyer's payment plan allows delivery.");
  if (m.includes("invalid_transition")) throw new ApiError(409, "INVALID_TRANSITION", m.replace(/^.*invalid_transition:/, "Not allowed: "));
  if (m.includes("not_found")) throw new ApiError(404, "NOT_FOUND", "Not found.");
  console.error("payments: sql error", error);
  throw new ApiError(500, "SERVICE_UNAVAILABLE", "The payments database rejected the request.", true);
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hmacSha512Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time string comparison for signatures. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface PaystackTransaction {
  status: "success" | "failed" | "abandoned" | "ongoing" | "pending" | "reversed" | "processing" | "queued";
  reference: string;
  amount: number;
  currency: string;
  gateway_response?: string;
}

/** Asks Paystack directly — the only source we trust for card / MoMo outcomes. */
export async function paystackVerify(reference: string): Promise<PaystackTransaction | null> {
  let res: Response;
  try {
    res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${env("PAYSTACK_SECRET_KEY")}` },
    });
  } catch {
    throw new ApiError(503, "PROVIDER_UNAVAILABLE", "Couldn't reach the card processor. Try again shortly.", true);
  }
  if (res.status === 404 || res.status === 400) return null; // never charged / unknown reference
  if (!res.ok) throw new ApiError(503, "PROVIDER_UNAVAILABLE", "The card processor is unavailable. Try again shortly.", true);
  const body = await res.json();
  return (body?.data ?? null) as PaystackTransaction | null;
}

export interface IntentRow {
  id: string;
  user_id: string;
  purpose: string;
  status: string;
  amount_minor: number;
  currency: string;
  method: "wallet" | "card" | "momo";
  provider_reference: string | null;
  failure_reason: string | null;
  order_id: string | null;
  plan_id?: string | null;
}

export async function loadIntent(db: SupabaseClient, intentId: string, userId?: string): Promise<IntentRow> {
  let q = db.from("payment_intents").select("*").eq("id", intentId);
  if (userId) q = q.eq("user_id", userId);
  const { data, error } = await q.maybeSingle();
  if (error) sqlError(error);
  if (!data) throw new ApiError(404, "NOT_FOUND", "Payment not found.");
  return data as IntentRow;
}

/** Verifies a card / MoMo intent with Paystack and settles it if Paystack confirms. */
export async function verifyProviderIntent(db: SupabaseClient, intent: IntentRow): Promise<IntentRow> {
  if (intent.status === "succeeded" || intent.status === "failed" || intent.status === "canceled") return intent;
  if (!intent.provider_reference) throw new ApiError(400, "UNKNOWN", "This payment isn't a card or Mobile Money payment.");

  const tx = await paystackVerify(intent.provider_reference);
  if (!tx) return intent; // not charged yet

  if (tx.status === "success") {
    if (tx.currency !== intent.currency) {
      await db.from("payment_intents").update({ status: "failed", failure_reason: "currency_mismatch" }).eq("id", intent.id);
    } else {
      const { error } = await db.rpc("naflis_mark_intent_succeeded", { p_intent: intent.id, p_provider_amount: tx.amount });
      if (error) sqlError(error);
    }
  } else if (tx.status === "failed" || tx.status === "reversed") {
    await db
      .from("payment_intents")
      .update({ status: "failed", failure_reason: tx.gateway_response?.toLowerCase().replaceAll(" ", "_") ?? "declined" })
      .eq("id", intent.id)
      .eq("status", "requires_payment");
  } else {
    await db.from("payment_intents").update({ status: "processing" }).eq("id", intent.id).eq("status", "requires_payment");
  }
  return loadIntent(db, intent.id);
}

/** Order + items + events + plans + reservations + wallet, in the shape the web app maps (mapServerSettlement). */
export async function loadSettlement(db: SupabaseClient, orderId: string) {
  const { data: order, error } = await db.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (error) sqlError(error);
  if (!order) throw new ApiError(404, "NOT_FOUND", "Order not found.");

  const [items, events, plans, reservations, wallet] = await Promise.all([
    db.from("order_items").select("product_id, quantity, unit_price_minor, purchase_method").eq("order_id", orderId),
    db.from("order_events").select("to_state, note, actor_role, created_at").eq("order_id", orderId).order("id"),
    db.from("installment_plans").select("*, entries:installment_entries(*)").eq("order_id", orderId),
    db.from("reservations").select("*").eq("order_id", orderId),
    db.from("wallet_accounts").select("balance_minor, escrow_minor").eq("user_id", order.buyer_id).maybeSingle(),
  ]);
  for (const r of [items, events, plans, reservations, wallet]) if (r.error) sqlError(r.error);

  return {
    order: { ...order, items: items.data ?? [], events: events.data ?? [] },
    plans: (plans.data ?? []).map((p: any) => ({ ...p, entries: [...(p.entries ?? [])].sort((a: any, b: any) => a.seq - b.seq) })),
    reservations: reservations.data ?? [],
    wallet: wallet.data ?? null,
  };
}
