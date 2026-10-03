// Supabase Edge Function: payments
//
// The single authority for NAFLIS checkout, wallet and order-state changes.
// The browser sends intentions; this function re-prices from the database,
// enforces idempotency, moves money through SECURITY DEFINER SQL functions,
// and confirms card / MoMo payments with Paystack's verify API.
//
// Deploy:   supabase functions deploy payments
// Secrets:  supabase secrets set PAYSTACK_SECRET_KEY=sk_...
//           (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform)
import {
  canonicalCheckoutRequest,
  normalizePurchaseConfig,
  quoteCheckout,
  type CheckoutRequest,
  type CreditSignals,
  type PurchaseMethod,
} from "../_shared/purchase.ts";
import { ORDER_STATES, type OrderActor, type OrderState } from "../_shared/orderMachine.ts";
import {
  ApiError,
  adminClient,
  corsHeaders,
  errorResponse,
  json,
  loadIntent,
  loadSettlement,
  sha256Hex,
  sqlError,
  verifyProviderIntent,
} from "../_shared/paymentsCore.ts";

type Db = ReturnType<typeof adminClient>;

const METHODS = ["wallet", "card", "momo"] as const;
const PURCHASE_METHODS: PurchaseMethod[] = ["full", "credit", "installment", "reservation"];

function str(v: unknown, field: string, max = 200): string {
  if (typeof v !== "string" || !v.trim() || v.length > max) throw new ApiError(400, "UNKNOWN", `Invalid ${field}.`);
  return v.trim();
}

function parseCheckoutRequest(raw: any): CheckoutRequest {
  if (!raw || !Array.isArray(raw.lines) || raw.lines.length === 0 || raw.lines.length > 50) {
    throw new ApiError(400, "QUOTE_INVALID", "Your cart is empty.");
  }
  const paymentMethod = METHODS.find((m) => m === raw.paymentMethod);
  if (!paymentMethod) throw new ApiError(400, "UNKNOWN", "Unsupported payment method.");
  return {
    lines: raw.lines.map((l: any) => {
      const method = PURCHASE_METHODS.find((m) => m === l?.method);
      if (!method || !Number.isInteger(l?.qty) || l.qty < 1 || l.qty > 100) throw new ApiError(400, "QUOTE_INVALID", "Invalid cart line.");
      return { productId: str(l.productId, "product", 64), qty: l.qty, method };
    }),
    promoCode: typeof raw.promoCode === "string" && raw.promoCode.trim() ? raw.promoCode.trim().slice(0, 40) : undefined,
    deliveryMethod: raw.deliveryMethod === "express" ? "express" : "standard",
    paymentMethod,
    address: str(raw.address, "address", 500),
  };
}

async function creditSignals(db: Db, userId: string): Promise<CreditSignals> {
  const [profile, wallet, completed, plans] = await Promise.all([
    db.from("profiles").select("kyc_verified, credit_score, credit_limit_minor, created_at").eq("id", userId).maybeSingle(),
    db.from("wallet_accounts").select("created_at").eq("user_id", userId).maybeSingle(),
    db.from("orders").select("id", { count: "exact", head: true }).eq("buyer_id", userId).eq("state", "completed"),
    db.from("installment_plans").select("kind, status, total_minor, paid_minor, entries:installment_entries(status)").eq("user_id", userId),
  ]);
  const since = wallet.data?.created_at ?? profile.data?.created_at ?? new Date().toISOString();
  const rows = (plans.data ?? []) as any[];
  return {
    kycVerified: Boolean(profile.data?.kyc_verified),
    walletAgeDays: (Date.now() - new Date(since).getTime()) / 86_400_000,
    completedOrders: completed.count ?? 0,
    lateInstallments: rows.reduce((a, p) => a + (p.entries ?? []).filter((e: any) => e.status === "late").length, 0),
    defaultedPlans: rows.filter((p) => p.status === "defaulted").length,
    outstandingCreditMinor: rows
      .filter((p) => p.kind === "credit" && ["pending", "active", "late"].includes(p.status))
      .reduce((a, p) => a + (p.total_minor - p.paid_minor), 0),
    approvedLimitMinor: profile.data?.credit_limit_minor ?? null,
    priorScore: profile.data?.credit_score ?? null,
  };
}

/** Returns the intent plus, once paid, the settlement (or ticket) to mirror client-side. */
async function respondWithIntent(db: Db, intentId: string) {
  const intent = await loadIntent(db, intentId);
  const settlement = intent.status === "succeeded" && intent.order_id ? await loadSettlement(db, intent.order_id) : undefined;
  let ticket;
  if (intent.purpose === "ticket" && intent.status === "succeeded") {
    const { data } = await db.from("tickets").select("*").eq("intent_id", intent.id).maybeSingle();
    ticket = data ?? undefined;
  }
  return json({ intent, settlement, ticket });
}

/** 128-bit random ticket token, Crockford base32 (matches newTicketToken in the web app). */
function ticketToken(): string {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of crypto.getRandomValues(new Uint8Array(16))) {
    value = ((value << 8) | b) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
  return out;
}

async function createTicketPayment(db: Db, userId: string, body: any) {
  const idempotencyKey = str(body.idempotencyKey, "idempotency key", 120);
  const method = METHODS.find((m) => m === body.method);
  if (!method) throw new ApiError(400, "UNKNOWN", "Unsupported payment method.");
  const tierId = str(body.tierId, "ticket type", 64);
  const { data: profile } = await db.from("profiles").select("full_name, email").eq("id", userId).maybeSingle();
  const { data: intentId, error } = await db.rpc("naflis_create_ticket_intent", {
    p_user: userId,
    p_key: idempotencyKey,
    p_tier: tierId,
    p_method: method,
    p_token: ticketToken(),
    p_holder_name: profile?.full_name || profile?.email || "Ticket holder",
  });
  if (error) {
    const m = error.message ?? "";
    if (m.includes("sold_out")) throw new ApiError(409, "QUOTE_INVALID", "That ticket type is sold out.");
    if (m.includes("sales_closed")) throw new ApiError(409, "QUOTE_INVALID", "Ticket sales for this event have closed.");
    if (m.includes("ticket_limit")) throw new ApiError(409, "QUOTE_INVALID", "You can hold up to 4 tickets per event.");
    sqlError(error);
  }
  return respondWithIntent(db, intentId as string);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function createCheckout(db: Db, userId: string, body: any) {
  const idempotencyKey = str(body.idempotencyKey, "idempotency key", 120);
  const request = parseCheckoutRequest(body.request);
  const requestHash = await sha256Hex(canonicalCheckoutRequest(request));

  // Replays of the same key short-circuit before any pricing or stock work.
  const { data: existing } = await db
    .from("payment_intents")
    .select("id, request_hash")
    .eq("user_id", userId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (existing) {
    if (existing.request_hash !== requestHash) {
      throw new ApiError(409, "IDEMPOTENCY_KEY_REUSED", "This payment key was already used for a different request.");
    }
    return respondWithIntent(db, existing.id);
  }

  // Price from the database — never from the client.
  const ids = [...new Set(request.lines.map((l) => l.productId))];
  const { data: products, error } = await db
    .from("products")
    .select("id, title, price, stock, purchase_config, vendors!inner(status)")
    .in("id", ids)
    .eq("vendors.status", "approved");
  if (error) sqlError(error);
  const byId = new Map((products ?? []).map((p: any) => [p.id, p]));
  if (byId.size !== ids.length) throw new ApiError(409, "QUOTE_INVALID", "Some items are no longer available.");

  let promo = null;
  if (request.promoCode) {
    const { data } = await db.from("promo_codes").select("*").ilike("code", request.promoCode).maybeSingle();
    if (data) {
      promo = { code: data.code, type: data.type, value: Number(data.value), minSpend: data.min_spend, maxDiscount: data.max_discount, active: data.active };
    }
  }
  const needsCredit = request.lines.some((l) => l.method === "credit");

  const quote = quoteCheckout({
    lines: request.lines.map((l) => {
      const p: any = byId.get(l.productId);
      return {
        productId: l.productId,
        name: p.title,
        unitPriceMinor: Math.round(Number(p.price) * 100),
        qty: l.qty,
        method: l.method,
        config: normalizePurchaseConfig(p.purchase_config),
        stock: p.stock,
      };
    }),
    promo,
    promoCode: request.promoCode,
    deliveryMethod: request.deliveryMethod,
    credit: needsCredit ? await creditSignals(db, userId) : undefined,
    now: Date.now(),
  });
  if (quote.errors.length) throw new ApiError(422, "QUOTE_INVALID", quote.errors[0].message, false, quote.errors);

  const { data: intentId, error: rpcError } = await db.rpc("naflis_create_checkout", {
    p_user: userId,
    p_key: idempotencyKey,
    p_request_hash: requestHash,
    p_quote: quote,
    p_method: request.paymentMethod,
    p_address: request.address,
    p_delivery_method: request.deliveryMethod,
  });
  if (rpcError) sqlError(rpcError);
  return respondWithIntent(db, intentId as string);
}

async function confirmWalletPayment(db: Db, userId: string, body: any) {
  const intent = await loadIntent(db, str(body.intentId, "payment"), userId);
  if (intent.method !== "wallet") throw new ApiError(400, "UNKNOWN", "This payment isn't a wallet payment.");
  const { error } = await db.rpc("naflis_pay_intent_with_wallet", { p_intent: intent.id });
  if (error) sqlError(error);
  return respondWithIntent(db, intent.id);
}

async function verifyProviderPayment(db: Db, userId: string, body: any) {
  const intent = await loadIntent(db, str(body.intentId, "payment"), userId);
  const updated = await verifyProviderIntent(db, intent);
  return respondWithIntent(db, updated.id);
}

/** Creates (or replays) an intent for an installment entry or reservation balance. */
async function createFollowUpIntent(
  db: Db,
  userId: string,
  body: any,
  purpose: "installment" | "reservation_balance",
) {
  const idempotencyKey = str(body.idempotencyKey, "idempotency key", 120);
  const method = METHODS.find((m) => m === body.method);
  if (!method) throw new ApiError(400, "UNKNOWN", "Unsupported payment method.");

  let orderId: string;
  let amountMinor: number;
  let hashInput: string;
  const extra: Record<string, unknown> = {};

  if (purpose === "installment") {
    const planId = str(body.planId, "plan", 64);
    const seq = Number(body.seq);
    const { data: plan } = await db.from("installment_plans").select("*").eq("id", planId).eq("user_id", userId).maybeSingle();
    if (!plan) throw new ApiError(404, "NOT_FOUND", "Plan not found.");
    const { data: entry } = await db.from("installment_entries").select("*").eq("plan_id", planId).eq("seq", seq).maybeSingle();
    if (!entry) throw new ApiError(404, "NOT_FOUND", "Installment not found.");
    if (entry.status === "paid") throw new ApiError(409, "INVALID_TRANSITION", "This installment is already paid.");
    const late = Date.now() > new Date(entry.grace_until).getTime();
    amountMinor = entry.amount_minor + (late ? Math.round((entry.amount_minor * Number(plan.late_fee_pct)) / 100) : 0);
    orderId = plan.order_id;
    hashInput = `${planId}:${seq}:${method}`;
    Object.assign(extra, { plan_id: planId, entry_seq: seq });
  } else {
    const reservationId = str(body.reservationId, "reservation", 64);
    const { data: r } = await db.from("reservations").select("*").eq("id", reservationId).eq("user_id", userId).maybeSingle();
    if (!r) throw new ApiError(404, "NOT_FOUND", "Reservation not found.");
    if (r.status !== "active") throw new ApiError(409, "INVALID_TRANSITION", `This reservation is ${r.status}.`);
    if (Date.now() > new Date(r.expires_at).getTime()) throw new ApiError(409, "INVALID_TRANSITION", "This reservation has expired.");
    amountMinor = r.balance_minor;
    orderId = r.order_id;
    hashInput = `${reservationId}:${method}`;
    extra.reservation_id = reservationId;
  }

  const requestHash = await sha256Hex(hashInput);
  const { data: existing } = await db
    .from("payment_intents")
    .select("id, request_hash, status")
    .eq("user_id", userId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (existing) {
    if (existing.request_hash !== requestHash) throw new ApiError(409, "IDEMPOTENCY_KEY_REUSED", "This payment key was already used for a different request.");
    // A failed attempt (e.g. insufficient funds) can be retried with the same key after a top-up.
    if (existing.status === "failed") {
      await db.from("payment_intents").update({ status: "requires_payment", failure_reason: null, amount_minor: amountMinor }).eq("id", existing.id);
    }
    return respondWithIntent(db, existing.id);
  }

  const id = crypto.randomUUID();
  const { error } = await db.from("payment_intents").insert({
    id,
    user_id: userId,
    idempotency_key: idempotencyKey,
    request_hash: requestHash,
    purpose,
    order_id: orderId,
    amount_minor: amountMinor,
    method,
    provider_reference: method === "wallet" ? null : `nfl_${id.replaceAll("-", "")}`,
    ...extra,
  });
  if (error) {
    // Lost a race with a concurrent request using the same key: replay it.
    if ((error as any).code === "23505") {
      const { data } = await db.from("payment_intents").select("id").eq("user_id", userId).eq("idempotency_key", idempotencyKey).single();
      return respondWithIntent(db, data!.id);
    }
    sqlError(error);
  }
  return respondWithIntent(db, id);
}

async function getWallet(db: Db, userId: string) {
  await db.from("wallet_accounts").upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });
  const { data, error } = await db.from("wallet_accounts").select("balance_minor, escrow_minor").eq("user_id", userId).maybeSingle();
  if (error) sqlError(error);
  return json({ wallet: data });
}

/** Works out which role the caller acts in for this order. */
async function actorFor(db: Db, userId: string, orderId: string, to: OrderState): Promise<OrderActor> {
  const { data: order } = await db.from("orders").select("buyer_id").eq("id", orderId).maybeSingle();
  if (!order) throw new ApiError(404, "NOT_FOUND", "Order not found.");
  const { data: profile } = await db.from("profiles").select("roles").eq("id", userId).maybeSingle();
  const roles: string[] = profile?.roles ?? [];
  const { data: sells } = await db
    .from("order_items")
    .select("vendors!inner(user_id)")
    .eq("order_id", orderId)
    .eq("vendors.user_id", userId)
    .limit(1);

  // Prefer the role that the transition table allows for this move.
  const candidates: OrderActor[] = [];
  if (order.buyer_id === userId) candidates.push("buyer");
  if (sells?.length) candidates.push("seller");
  if (roles.includes("delivery")) candidates.push("delivery");
  if (roles.includes("dispute")) candidates.push("dispute");
  if (roles.includes("admin") || roles.includes("super_admin")) candidates.push("admin");
  if (!candidates.length) throw new ApiError(403, "INVALID_TRANSITION", "You're not a party to this order.");

  const { data: edges } = await db.from("order_transitions").select("from_state, actors").eq("to_state", to);
  const allowed = new Set((edges ?? []).flatMap((e: any) => e.actors as string[]));
  return candidates.find((c) => allowed.has(c)) ?? candidates[0];
}

async function transitionOrder(db: Db, userId: string, body: any) {
  const orderId = str(body.orderId, "order", 64);
  const to = ORDER_STATES.find((s) => s === body.to);
  if (!to) throw new ApiError(400, "INVALID_TRANSITION", "Unknown order state.");
  if (to === "paid") throw new ApiError(403, "INVALID_TRANSITION", "Orders are marked paid by the payment processor only.");
  const actor = await actorFor(db, userId, orderId, to);
  const note = typeof body.note === "string" ? body.note.slice(0, 300) : null;
  const { data, error } = await db.rpc("naflis_transition_order", {
    p_order: orderId,
    p_to: to,
    p_actor_role: actor,
    p_actor: userId,
    p_note: note,
  });
  if (error) sqlError(error);
  return json({ state: data });
}

// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: { code: "UNKNOWN", message: "Method not allowed" } }, 405);

  try {
    const db = adminClient();
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: auth } = await db.auth.getUser(jwt);
    if (!auth?.user) throw new ApiError(401, "UNAUTHENTICATED", "Please sign in to pay.");
    const userId = auth.user.id;

    const body = await req.json().catch(() => ({}));
    switch (body.action) {
      case "create_checkout":
        return await createCheckout(db, userId, body);
      case "confirm_wallet_payment":
        return await confirmWalletPayment(db, userId, body);
      case "verify_provider_payment":
        return await verifyProviderPayment(db, userId, body);
      case "create_plan_payment":
        return await createFollowUpIntent(db, userId, body, "installment");
      case "create_reservation_payment":
        return await createFollowUpIntent(db, userId, body, "reservation_balance");
      case "create_ticket_payment":
        return await createTicketPayment(db, userId, body);
      case "get_wallet":
        return await getWallet(db, userId);
      case "transition_order":
        return await transitionOrder(db, userId, body);
      default:
        throw new ApiError(400, "UNKNOWN", "Unknown action.");
    }
  } catch (err) {
    return errorResponse(err);
  }
});
