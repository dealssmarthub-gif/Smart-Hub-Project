import { supabase } from "@/lib/supabase";
import { uid } from "@/lib/naflis/format";
import { assertTransition, type OrderState } from "@/lib/naflis/orderMachine";
import {
  canonicalCheckoutRequest,
  fromMinor,
  getPurchaseConfig,
  quoteCheckout,
  toMinor,
  type CheckoutQuote,
  type CheckoutRequest,
  type CreditSignals,
  type PurchaseMethod,
} from "@/lib/naflis/purchase";
import {
  orderDeliveryUnlocked,
  useNaflis,
  type CheckoutSettlement,
  type EscrowRecord,
  type InstallmentPlan,
  type LocalPaymentIntent,
  type Order,
  type OrderEvent,
  type Reservation,
  type WalletTx,
} from "@/lib/naflis/store";

// ============================================================================
// NAFLIS WALLET ORCHESTRATION
// ============================================================================
// The browser never decides that a payment succeeded. Every flow is:
//   1. create a payment intent on the server (idempotency key + request hash;
//      the server re-prices the cart from the database),
//   2. move the money (wallet debit on the server, or Paystack for card/MoMo),
//   3. ask the server to confirm — for Paystack it calls Paystack's verify API
//      with the secret key; the inline-widget callback is only a hint to poll.
// Only the server's confirmed settlement is written into the local store.
//
// Without Supabase configured (demo mode) a local processor plays the server's
// role with the same pricing engine. It moves no real money.
// ============================================================================

export type PaymentMethod = "wallet" | "card" | "momo";
export type PaymentMode = "server" | "demo";

export type PaymentErrorCode =
  | "UNAUTHENTICATED"
  | "QUOTE_INVALID"
  | "INSUFFICIENT_FUNDS"
  | "IDEMPOTENCY_KEY_REUSED"
  | "PAYMENT_DECLINED"
  | "PAYMENT_PENDING"
  | "PROVIDER_UNAVAILABLE"
  | "SERVICE_UNAVAILABLE"
  | "NOT_FOUND"
  | "INVALID_TRANSITION"
  | "VIEW_AS_READ_ONLY"
  | "UNKNOWN";

export class PaymentError extends Error {
  readonly code: PaymentErrorCode;
  /** Safe to retry with the same idempotency key. */
  readonly retryable: boolean;
  readonly details?: unknown;

  constructor(code: PaymentErrorCode, message: string, retryable = false, details?: unknown) {
    super(message);
    this.name = "PaymentError";
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
}

export interface PaymentOutcome {
  status: "succeeded" | "processing";
  intentId: string;
  orderId?: string;
  message: string;
}

export type PaymentStage = "creating_intent" | "awaiting_provider" | "confirming" | "verifying";

export const paymentMode = (): PaymentMode => (supabase ? "server" : "demo");

export function newIdempotencyKey(prefix = "chk"): string {
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${uid()}${uid()}`;
  return `${prefix}_${rand}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Exponential backoff with jitter; only retries errors flagged retryable. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseMs = 400): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (!(err instanceof PaymentError) || !err.retryable || i === attempts - 1) throw err;
      await sleep(baseMs * 2 ** i + Math.random() * baseMs);
    }
  }
  throw last;
}

// ---------------------------------------------------------------------------
// Server transport (Supabase Edge Function `payments`)
// ---------------------------------------------------------------------------

async function invokePayments<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new PaymentError("SERVICE_UNAVAILABLE", "Payments are not configured.");
  const client = supabase;
  return withRetry(async () => {
    const { data, error } = await client.functions.invoke("payments", { body: { action, ...payload } });
    if (!error) return data as T;
    // FunctionsHttpError carries the function's JSON error body; others are network/relay failures.
    const response: Response | undefined = (error as any).context instanceof Response ? (error as any).context : undefined;
    if (response) {
      let body: any = null;
      try {
        body = await response.clone().json();
      } catch {
        // non-JSON error body
      }
      const e = body?.error;
      if (e?.code) throw new PaymentError(e.code, e.message ?? "Payment failed.", Boolean(e.retryable), e.details);
      throw new PaymentError(
        response.status >= 500 ? "SERVICE_UNAVAILABLE" : "UNKNOWN",
        response.status === 404 ? "The payments service isn't deployed yet." : `Payments service error (${response.status}).`,
        response.status >= 500,
      );
    }
    throw new PaymentError("SERVICE_UNAVAILABLE", "Couldn't reach the payments service. Check your connection.", true);
  });
}

interface ServerIntent {
  id: string;
  status: LocalPaymentIntent["status"];
  amount_minor: number;
  method: PaymentMethod;
  provider_reference: string | null;
  failure_reason: string | null;
  order_id: string | null;
}

interface ServerTicket {
  id: string;
  event_id: string;
  tier_id: string;
  holder_id: string;
  holder_name: string;
  token: string;
  price_minor: number;
  status: "valid" | "checked_in" | "void";
  created_at: string;
}

type ServerResponse = { intent: ServerIntent; settlement?: ServerSettlement; ticket?: ServerTicket };

interface ServerSettlement {
  order: {
    id: string;
    buyer_id: string;
    state: OrderState;
    total_minor: number;
    subtotal_minor: number;
    discount_minor: number;
    promo_code: string | null;
    delivery_fee_minor: number;
    escrow_fee_minor: number;
    amount_paid_minor: number;
    escrow_held_minor: number;
    outstanding_minor: number;
    delivery_unlocked: boolean;
    payment_method: PaymentMethod;
    address: string;
    idempotency_key: string;
    created_at: string;
    items: { product_id: string; quantity: number; unit_price_minor: number; purchase_method: PurchaseMethod }[];
    events: { to_state: string; note: string | null; actor_role: string | null; created_at: string }[];
  };
  plans: {
    id: string;
    kind: "installment" | "credit";
    product_id: string;
    principal_minor: number;
    charge_minor: number;
    total_minor: number;
    paid_minor: number;
    frequency: InstallmentPlan["frequency"];
    grace_period_days: number;
    late_fee_pct: number;
    delivery_rule: InstallmentPlan["deliveryRule"];
    deliver_after_installments: number;
    status: InstallmentPlan["status"];
    created_at: string;
    entries: { seq: number; kind: "deposit" | "installment"; due_at: string; grace_until: string; amount_minor: number; paid_at: string | null; status: string }[];
  }[];
  reservations: {
    id: string;
    product_id: string;
    quantity: number;
    fee_minor: number;
    balance_minor: number;
    expires_at: string;
    auto_expire: boolean;
    refund_on_expiry: boolean;
    status: Reservation["status"];
    created_at: string;
  }[];
  wallet: { balance_minor: number; escrow_minor: number } | null;
}

const ms = (iso: string) => new Date(iso).getTime();

function mapServerSettlement(st: ServerSettlement, kind: CheckoutSettlement["kind"] = "checkout"): CheckoutSettlement {
  const o = st.order;
  const plans: InstallmentPlan[] = st.plans.map((p) => ({
    id: p.id,
    kind: p.kind,
    buyerId: o.buyer_id,
    productId: p.product_id,
    orderId: o.id,
    principal: fromMinor(p.principal_minor),
    financeCharge: fromMinor(p.charge_minor),
    total: fromMinor(p.total_minor),
    paid: fromMinor(p.paid_minor),
    frequency: p.frequency,
    gracePeriodDays: p.grace_period_days,
    lateFeePct: Number(p.late_fee_pct),
    deliveryRule: p.delivery_rule,
    deliverAfterInstallments: p.deliver_after_installments,
    status: p.status,
    createdAt: ms(p.created_at),
    schedule: p.entries.map((e) => ({
      seq: e.seq,
      kind: e.kind,
      due: ms(e.due_at),
      graceUntil: ms(e.grace_until),
      amount: fromMinor(e.amount_minor),
      paid: e.status === "paid",
      paidAt: e.paid_at ? ms(e.paid_at) : undefined,
      late: e.status === "late",
    })),
  }));
  const reservations: Reservation[] = st.reservations.map((r) => ({
    id: r.id,
    buyerId: o.buyer_id,
    productId: r.product_id,
    orderId: o.id,
    qty: r.quantity,
    fee: fromMinor(r.fee_minor),
    balance: fromMinor(r.balance_minor),
    expiresAt: ms(r.expires_at),
    autoExpire: r.auto_expire,
    refundOnExpiry: r.refund_on_expiry,
    status: r.status,
    createdAt: ms(r.created_at),
  }));
  const order: Order = {
    id: o.id,
    buyerId: o.buyer_id,
    items: o.items.map((i) => ({ productId: i.product_id, qty: i.quantity, price: fromMinor(i.unit_price_minor), method: i.purchase_method })),
    subtotal: fromMinor(o.subtotal_minor),
    discount: fromMinor(o.discount_minor),
    promoCode: o.promo_code ?? undefined,
    delivery: fromMinor(o.delivery_fee_minor),
    escrowFee: fromMinor(o.escrow_fee_minor),
    total: fromMinor(o.total_minor),
    paymentOption: o.payment_method,
    status: o.state,
    address: o.address,
    createdAt: ms(o.created_at),
    timeline: o.events.map((e) => ({ at: ms(e.created_at), status: e.to_state, note: e.note ?? "", actor: e.actor_role ?? undefined })),
    planIds: plans.map((p) => p.id),
    reservationIds: reservations.map((r) => r.id),
    amountPaid: fromMinor(o.amount_paid_minor),
    escrowHeld: fromMinor(o.escrow_held_minor),
    amountOutstanding: fromMinor(o.outstanding_minor),
    deliveryUnlocked: o.delivery_unlocked,
    idempotencyKey: o.idempotency_key,
    serverBacked: true,
  };
  return {
    kind,
    order,
    plans,
    reservations,
    wallet: st.wallet ? { balance: fromMinor(st.wallet.balance_minor), escrow: fromMinor(st.wallet.escrow_minor) } : undefined,
  };
}

// ---------------------------------------------------------------------------
// Paystack (card / MoMo) — the widget only collects the payment.
// ---------------------------------------------------------------------------

function loadPaystack(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).PaystackPop) return resolve();
    const script = document.createElement("script");
    script.src = "https://js.paystack.co/v1/inline.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new PaymentError("PROVIDER_UNAVAILABLE", "Couldn't load the card payment window.", true));
    document.body.appendChild(script);
  });
}

/** Resolves "submitted" when Paystack reports a charge attempt, "closed" if the buyer dismissed it. */
async function collectWithPaystack(opts: { reference: string; amountMinor: number; email: string; method: PaymentMethod }): Promise<"submitted" | "closed"> {
  const key = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY as string | undefined;
  if (!key) throw new PaymentError("PROVIDER_UNAVAILABLE", "Card payments aren't configured (VITE_PAYSTACK_PUBLIC_KEY).");
  await loadPaystack();
  return new Promise((resolve) => {
    const handler = (window as any).PaystackPop.setup({
      key,
      email: opts.email,
      amount: opts.amountMinor,
      currency: "GHS",
      ref: opts.reference,
      channels: opts.method === "momo" ? ["mobile_money"] : ["card"],
      callback: () => resolve("submitted"),
      onClose: () => resolve("closed"),
    });
    handler.openIframe();
  });
}

/** Polls the server until the provider payment settles or attempts run out. */
async function verifyUntilSettled(intentId: string, attempts = 6): Promise<ServerResponse> {
  let last: ServerResponse | undefined;
  for (let i = 0; i < attempts; i++) {
    last = await invokePayments<ServerResponse>("verify_provider_payment", { intentId });
    if (last.intent.status === "succeeded" || last.intent.status === "failed" || last.intent.status === "canceled") return last;
    await sleep(Math.min(1_000 * 2 ** i, 8_000));
  }
  return last!;
}

function failIntent(intent: ServerIntent): never {
  const code: PaymentErrorCode = intent.failure_reason === "insufficient_funds" ? "INSUFFICIENT_FUNDS" : "PAYMENT_DECLINED";
  throw new PaymentError(code, failureMessage(intent.failure_reason));
}

function failureMessage(reason: string | null | undefined): string {
  switch (reason) {
    case "insufficient_funds":
      return "Your NAFLIS Wallet balance is too low for this payment. Top up and try again.";
    case "amount_mismatch":
      return "The amount charged didn't match your order, so it wasn't accepted. You won't be charged twice.";
    case "abandoned":
      return "The payment window was closed before paying.";
    default:
      return reason ? `Payment failed: ${reason.replaceAll("_", " ")}.` : "Payment failed.";
  }
}

async function currentUserEmail(): Promise<string> {
  const { data } = await supabase!.auth.getUser();
  if (!data.user) throw new PaymentError("UNAUTHENTICATED", "Please sign in to pay.");
  return data.user.email ?? "buyer@naflis.app";
}

/** Steps 2 + 3 for any server intent (order, installment, reservation balance). */
async function settleServerIntent(
  intent: ServerIntent,
  settlement: ServerSettlement | undefined,
  onProgress?: (s: PaymentStage) => void,
): Promise<ServerResponse> {
  if (intent.status === "succeeded") return { intent, settlement };
  if (intent.status === "failed" || intent.status === "canceled") failIntent(intent);

  if (intent.method === "wallet") {
    onProgress?.("confirming");
    const res = await invokePayments<ServerResponse>("confirm_wallet_payment", { intentId: intent.id });
    if (res.intent.status !== "succeeded") failIntent(res.intent);
    return res;
  }

  onProgress?.("awaiting_provider");
  const outcome = await collectWithPaystack({
    reference: intent.provider_reference!,
    amountMinor: intent.amount_minor,
    email: await currentUserEmail(),
    method: intent.method,
  });
  onProgress?.("verifying");
  // Verify even when the window was closed: the buyer may have paid first.
  const res = await verifyUntilSettled(intent.id, outcome === "closed" ? 1 : 6);
  if (res.intent.status === "succeeded") return res;
  if (res.intent.status === "failed" || res.intent.status === "canceled") failIntent(res.intent);
  if (outcome === "closed") throw new PaymentError("PAYMENT_DECLINED", failureMessage("abandoned"), true);
  throw new PaymentError(
    "PAYMENT_PENDING",
    "Your payment is still being confirmed. We'll update the order as soon as the provider settles it.",
    true,
  );
}

// ---------------------------------------------------------------------------
// Demo processor — same pricing engine, local state, no real money.
// ---------------------------------------------------------------------------

/** Credit inputs from local state (the server derives these from its own tables). */
export function localCreditSignals(userId: string | null): CreditSignals {
  const s = useNaflis.getState();
  const user = s.users.find((u) => u.id === userId);
  const wallet = userId ? s.wallets[userId] : undefined;
  const firstTx = wallet?.transactions.reduce((min, t) => Math.min(min, t.createdAt), Date.now()) ?? Date.now();
  const plans = s.installments.filter((p) => p.buyerId === userId);
  return {
    kycVerified: Boolean(user?.verified),
    walletAgeDays: (Date.now() - firstTx) / 86_400_000,
    completedOrders: s.orders.filter((o) => o.buyerId === userId && o.status === "completed").length,
    lateInstallments: plans.reduce((a, p) => a + p.schedule.filter((e) => e.late).length, 0),
    defaultedPlans: plans.filter((p) => p.status === "defaulted").length,
    outstandingCreditMinor: plans
      .filter((p) => p.kind === "credit" && p.status !== "completed" && p.status !== "cancelled")
      .reduce((a, p) => a + toMinor(p.total - p.paid), 0),
    approvedLimitMinor: user?.creditLimit ? toMinor(user.creditLimit) : null,
    priorScore: user?.creditScore ?? null,
  };
}

/** Prices a checkout request against local catalog data (preview, and the demo processor's source of truth). */
export function quoteLocally(request: CheckoutRequest, userId: string | null, now = Date.now()): CheckoutQuote {
  const s = useNaflis.getState();
  const promo = request.promoCode ? s.promos.find((p) => p.code.toUpperCase() === request.promoCode!.toUpperCase()) : null;
  return quoteCheckout({
    lines: request.lines.map((l) => {
      const p = s.products.find((x) => x.id === l.productId);
      return {
        productId: l.productId,
        name: p?.name ?? "Unavailable item",
        unitPriceMinor: toMinor(p?.price ?? 0),
        qty: l.qty,
        method: l.method,
        config: getPurchaseConfig(p ?? {}),
        stock: p?.stock,
      };
    }),
    promo: promo ?? null,
    promoCode: request.promoCode,
    deliveryMethod: request.deliveryMethod,
    credit: localCreditSignals(userId),
    now,
  });
}

function demoUser(): string {
  const id = useNaflis.getState().currentUserId;
  if (!id) throw new PaymentError("UNAUTHENTICATED", "Please sign in to pay.");
  return id;
}

/** Looks up / records the intent for an idempotency key. Returns an existing one for replays. */
function demoIntent(
  userId: string,
  key: string,
  requestHash: string,
  init: Omit<LocalPaymentIntent, "id" | "idempotencyKey" | "userId" | "requestHash" | "status" | "createdAt">,
): { intent: LocalPaymentIntent; replay: boolean } {
  const existing = useNaflis.getState().paymentIntents[`${userId}:${key}`];
  if (existing) {
    if (existing.requestHash !== requestHash) {
      throw new PaymentError("IDEMPOTENCY_KEY_REUSED", "This payment key was already used for a different request.");
    }
    return { intent: existing, replay: true };
  }
  const intent: LocalPaymentIntent = {
    ...init,
    id: "pi_" + uid() + uid(),
    idempotencyKey: key,
    userId,
    requestHash,
    status: "processing",
    createdAt: Date.now(),
  };
  useNaflis.getState().recordPaymentIntent(intent);
  return { intent, replay: false };
}

function finishDemoIntent(intent: LocalPaymentIntent, patch: Partial<LocalPaymentIntent>) {
  useNaflis.getState().recordPaymentIntent({ ...intent, ...patch });
}

/** Debits (wallet) or records a simulated provider charge; returns the wallet snapshot + ledger rows. */
async function demoCollect(userId: string, amount: number, method: PaymentMethod, escrow: boolean, description: string, orderId?: string) {
  const s = useNaflis.getState();
  const w = s.wallets[userId];
  if (!w) throw new PaymentError("NOT_FOUND", "No NAFLIS Wallet found for this account.");
  if (method === "wallet" && w.balance < amount) {
    throw new PaymentError("INSUFFICIENT_FUNDS", failureMessage("insufficient_funds"));
  }
  if (method !== "wallet") await sleep(900); // simulated provider round-trip
  const balance = method === "wallet" ? w.balance - amount : w.balance;
  const escrowBal = escrow ? w.escrow + amount : w.escrow;
  const tx: WalletTx = {
    id: uid(),
    type: escrow ? "escrow-in" : "debit",
    amount,
    balanceAfter: balance,
    description: method === "wallet" ? description : `${description} (${method === "momo" ? "Mobile Money" : "card"}, simulated)`,
    createdAt: Date.now(),
    orderId,
  };
  return { wallet: { balance, escrow: escrowBal }, walletTx: [tx] };
}

function demoTimeline(now: number, path: OrderState[], notes: Record<string, string>): { status: OrderState; events: OrderEvent[] } {
  const events: OrderEvent[] = [];
  let state: OrderState = "created";
  events.push({ at: now, status: "created", note: notes.created ?? "Order created", actor: "system" });
  for (const next of path) {
    assertTransition(state, next, "system");
    state = next;
    events.push({ at: now + events.length, status: next, note: notes[next] ?? "", actor: "system" });
  }
  return { status: state, events };
}

async function demoCheckout(input: CheckoutInput, onProgress?: (s: PaymentStage) => void): Promise<PaymentOutcome> {
  const userId = demoUser();
  const requestHash = canonicalCheckoutRequest(input.request);
  onProgress?.("creating_intent");
  const now = Date.now();
  const quote = quoteLocally(input.request, userId, now);
  if (quote.errors.length) throw new PaymentError("QUOTE_INVALID", quote.errors[0].message, false, quote.errors);

  const dueNow = fromMinor(quote.dueNowMinor);
  const { intent, replay } = demoIntent(userId, input.idempotencyKey, requestHash, {
    purpose: "order",
    amount: dueNow,
    method: input.request.paymentMethod,
  });
  if (replay) {
    if (intent.status === "succeeded") return { status: "succeeded", intentId: intent.id, orderId: intent.orderId, message: "Payment already confirmed." };
    if (intent.status === "failed") throw new PaymentError("PAYMENT_DECLINED", failureMessage(intent.failureReason));
    throw new PaymentError("PAYMENT_PENDING", "This payment is already being processed.", true);
  }

  const orderId = "o_" + uid();
  onProgress?.(input.request.paymentMethod === "wallet" ? "confirming" : "awaiting_provider");
  let collected;
  try {
    collected = dueNow > 0
      ? await demoCollect(userId, dueNow, input.request.paymentMethod, true, `Escrow hold for order ${orderId}`, orderId)
      : { wallet: undefined, walletTx: [] as WalletTx[] };
  } catch (err) {
    finishDemoIntent(intent, { status: "failed", failureReason: err instanceof PaymentError && err.code === "INSUFFICIENT_FUNDS" ? "insufficient_funds" : "declined" });
    throw err;
  }

  const s = useNaflis.getState();
  const reservationLine = quote.lines.find((l) => l.reservation);
  const { status, events } = demoTimeline(now, reservationLine ? ["awaiting_payment"] : ["awaiting_payment", "paid"], {
    awaiting_payment: `Payment intent ${intent.id.slice(0, 10)} created for GHS ${dueNow.toLocaleString()}`,
    paid: `GHS ${dueNow.toLocaleString()} confirmed and secured in NAFLIS escrow`,
  });
  if (reservationLine) {
    events.push({ at: now + events.length, status, note: `Reservation fee of GHS ${fromMinor(reservationLine.reservation!.feeMinor).toLocaleString()} paid — stock held`, actor: "system" });
  }

  const plans: InstallmentPlan[] = quote.lines
    .filter((l) => l.plan)
    .map((l) => ({
      id: "ip_" + uid(),
      kind: l.plan!.kind,
      buyerId: userId,
      productId: l.productId,
      orderId,
      principal: fromMinor(l.plan!.principalMinor),
      financeCharge: fromMinor(l.plan!.chargeMinor),
      total: fromMinor(l.plan!.totalMinor),
      paid: fromMinor(l.plan!.dueNowMinor),
      frequency: l.plan!.frequency,
      gracePeriodDays: l.plan!.gracePeriodDays,
      lateFeePct: l.plan!.lateFeePct,
      deliveryRule: l.plan!.deliveryRule,
      deliverAfterInstallments: l.plan!.deliverAfterInstallments,
      status: "active",
      createdAt: now,
      schedule: l.plan!.entries.map((e) => ({
        seq: e.seq,
        kind: e.kind,
        due: e.dueAt,
        graceUntil: e.graceUntil,
        amount: fromMinor(e.amountMinor),
        paid: e.kind === "deposit",
        paidAt: e.kind === "deposit" ? now : undefined,
      })),
    }));
  const reservations: Reservation[] = reservationLine
    ? [{
        id: "rs_" + uid(),
        buyerId: userId,
        productId: reservationLine.productId,
        orderId,
        qty: reservationLine.qty,
        fee: fromMinor(reservationLine.reservation!.feeMinor),
        balance: fromMinor(quote.laterMinor),
        expiresAt: reservationLine.reservation!.expiresAt,
        autoExpire: reservationLine.reservation!.autoExpire,
        refundOnExpiry: reservationLine.reservation!.refundOnExpiry,
        status: "active",
        createdAt: now,
      }]
    : [];

  // Escrow records: what each seller is owed on completion (financed parts are fronted by NAFLIS).
  const sellerGroups = new Map<string, number>();
  for (const l of quote.lines) {
    const p = s.products.find((x) => x.id === l.productId);
    const seller = s.stores.find((st) => st.id === p?.storeId)?.ownerId ?? "u_seller1";
    sellerGroups.set(seller, (sellerGroups.get(seller) ?? 0) + l.lineTotalMinor);
  }
  const escrowRecords: EscrowRecord[] = [...sellerGroups].map(([sellerId, grossMinor]) => {
    const share = quote.subtotalMinor ? grossMinor / quote.subtotalMinor : 0;
    const platformFee = fromMinor(Math.round(quote.escrowFeeMinor * share));
    return {
      id: "esc_" + uid(),
      orderId,
      buyerId: userId,
      sellerId,
      gross: fromMinor(grossMinor),
      platformFee,
      deliveryFee: fromMinor(Math.round((quote.deliveryMinor || 0) * share)),
      sellerNet: Math.max(0, fromMinor(grossMinor) - platformFee),
      status: "held",
      createdAt: now,
    };
  });

  const order: Order = {
    id: orderId,
    buyerId: userId,
    items: quote.lines.map((l) => ({
      productId: l.productId,
      qty: l.qty,
      price: fromMinor(l.lineTotalMinor / l.qty),
      method: l.method,
    })),
    subtotal: fromMinor(quote.subtotalMinor),
    discount: fromMinor(quote.discountMinor),
    promoCode: quote.promoCode,
    delivery: fromMinor(quote.deliveryMinor),
    escrowFee: fromMinor(quote.escrowFeeMinor),
    total: fromMinor(quote.dueNowMinor + quote.laterMinor),
    paymentOption: input.request.paymentMethod,
    status,
    address: input.request.address,
    createdAt: now,
    timeline: events,
    planIds: plans.map((p) => p.id),
    reservationIds: reservations.map((r) => r.id),
    amountPaid: dueNow,
    escrowHeld: dueNow,
    amountOutstanding: fromMinor(quote.laterMinor),
    paymentIntentId: intent.id,
    idempotencyKey: input.idempotencyKey,
    serverBacked: false,
  };
  order.deliveryUnlocked = orderDeliveryUnlocked(order, plans, reservations);

  useNaflis.getState().applySettlement({
    order,
    plans,
    reservations,
    wallet: collected.wallet,
    walletTx: collected.walletTx,
    escrowRecords,
    stockDeltas: quote.lines.map((l) => ({ productId: l.productId, delta: -l.qty })),
  });
  finishDemoIntent(intent, { status: "succeeded", orderId, confirmedAt: Date.now() });
  return {
    status: "succeeded",
    intentId: intent.id,
    orderId,
    message: reservationLine ? "Reservation confirmed — stock is held for you." : "Payment confirmed and secured in escrow.",
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface CheckoutInput {
  request: CheckoutRequest;
  /** Reuse the same key for retries of the same checkout; rotate it after a definitive failure. */
  idempotencyKey: string;
}

/** View-As is read-only for money: the admin's session must never pay as someone else. */
function assertNotViewingAs() {
  if (useNaflis.getState().impersonation) {
    throw new PaymentError("VIEW_AS_READ_ONLY", "Payments are disabled while viewing as another user. Exit the view first.");
  }
}

/** Runs a checkout end to end. Resolves only once the server (or demo processor) confirmed payment. */
export async function checkout(input: CheckoutInput, onProgress?: (s: PaymentStage) => void): Promise<PaymentOutcome> {
  assertNotViewingAs();
  try {
    if (paymentMode() === "demo") return await demoCheckout(input, onProgress);

    onProgress?.("creating_intent");
    const created = await invokePayments<ServerResponse>("create_checkout", {
      idempotencyKey: input.idempotencyKey,
      request: input.request,
    });
    const { intent, settlement } = await settleServerIntent(created.intent, created.settlement, onProgress);
    if (settlement) useNaflis.getState().applySettlement(mapServerSettlement(settlement));
    return {
      status: "succeeded",
      intentId: intent.id,
      orderId: intent.order_id ?? settlement?.order.id,
      message: settlement?.order.state === "awaiting_payment" ? "Reservation confirmed — stock is held for you." : "Payment confirmed and secured in escrow.",
    };
  } catch (err) {
    notifyFailure(err, "Checkout payment failed");
    throw err;
  }
}

/** Pays the next unpaid entry (or `seq`) of an installment / credit plan. */
export async function payPlanEntry(opts: { planId: string; seq: number; method: PaymentMethod }): Promise<PaymentOutcome> {
  // Deterministic key: double-clicks and retries can never pay the same entry twice.
  const idempotencyKey = `plan_${opts.planId}_${opts.seq}_${opts.method}`;
  assertNotViewingAs();
  try {
    if (paymentMode() === "server") {
      const created = await invokePayments<ServerResponse>("create_plan_payment", {
        idempotencyKey,
        planId: opts.planId,
        seq: opts.seq,
        method: opts.method,
      });
      const { intent, settlement } = await settleServerIntent(created.intent, created.settlement);
      if (settlement) useNaflis.getState().applySettlement(mapServerSettlement(settlement, "update"));
      return { status: "succeeded", intentId: intent.id, orderId: intent.order_id ?? undefined, message: "Payment received." };
    }

    const userId = demoUser();
    const plan = useNaflis.getState().installments.find((p) => p.id === opts.planId && p.buyerId === userId);
    const entry = plan?.schedule.find((e) => e.seq === opts.seq);
    if (!plan || !entry) throw new PaymentError("NOT_FOUND", "That payment couldn't be found.");
    const late = Date.now() > entry.graceUntil;
    const amount = entry.amount + (late ? Math.round(entry.amount * plan.lateFeePct) / 100 : 0);
    const { intent, replay } = demoIntent(userId, idempotencyKey, `${plan.id}:${entry.seq}`, { purpose: "installment", amount, method: opts.method, planId: plan.id });
    if (replay && intent.status === "succeeded") return { status: "succeeded", intentId: intent.id, orderId: plan.orderId, message: "Already paid." };
    if (replay) throw new PaymentError("PAYMENT_PENDING", "This payment is already being processed.", true);
    if (entry.paid) throw new PaymentError("INVALID_TRANSITION", "This installment is already paid.");
    try {
      const collected = await demoCollect(userId, amount, opts.method, plan.kind === "installment", `${plan.kind === "credit" ? "Credit repayment" : "Installment"} ${entry.seq} · order ${plan.orderId.slice(0, 8)}`, plan.orderId);
      useNaflis.getState().applyPlanPayment({ planId: plan.id, seqs: [entry.seq], amount, at: Date.now(), ...collected });
      finishDemoIntent(intent, { status: "succeeded", confirmedAt: Date.now(), orderId: plan.orderId });
    } catch (err) {
      finishDemoIntent(intent, { status: "failed", failureReason: err instanceof PaymentError && err.code === "INSUFFICIENT_FUNDS" ? "insufficient_funds" : "declined" });
      // Free the key so the buyer can retry after topping up.
      const s = useNaflis.getState();
      const { [`${userId}:${idempotencyKey}`]: _drop, ...rest } = s.paymentIntents;
      useNaflis.setState({ paymentIntents: rest });
      throw err;
    }
    return { status: "succeeded", intentId: intent.id, orderId: plan.orderId, message: late ? "Payment received (late fee applied)." : "Payment received." };
  } catch (err) {
    notifyFailure(err, "Installment payment failed");
    throw err;
  }
}

/** Pays the remaining balance on a reservation, converting it into a paid order. */
export async function payReservationBalance(opts: { reservationId: string; method: PaymentMethod }): Promise<PaymentOutcome> {
  const idempotencyKey = `res_${opts.reservationId}_${opts.method}`;
  assertNotViewingAs();
  try {
    if (paymentMode() === "server") {
      const created = await invokePayments<ServerResponse>("create_reservation_payment", {
        idempotencyKey,
        reservationId: opts.reservationId,
        method: opts.method,
      });
      const { intent, settlement } = await settleServerIntent(created.intent, created.settlement);
      if (settlement) useNaflis.getState().applySettlement(mapServerSettlement(settlement, "update"));
      return { status: "succeeded", intentId: intent.id, orderId: intent.order_id ?? undefined, message: "Purchase completed." };
    }

    const userId = demoUser();
    const r = useNaflis.getState().reservations.find((x) => x.id === opts.reservationId && x.buyerId === userId);
    if (!r) throw new PaymentError("NOT_FOUND", "That reservation couldn't be found.");
    if (r.status !== "active") throw new PaymentError("INVALID_TRANSITION", `This reservation is ${r.status}.`);
    if (Date.now() > r.expiresAt) {
      useNaflis.getState().runSchedulers();
      throw new PaymentError("INVALID_TRANSITION", "This reservation has expired.");
    }
    const { intent, replay } = demoIntent(userId, idempotencyKey, r.id, { purpose: "reservation_balance", amount: r.balance, method: opts.method, reservationId: r.id });
    if (replay && intent.status === "succeeded") return { status: "succeeded", intentId: intent.id, orderId: r.orderId, message: "Already paid." };
    if (replay) throw new PaymentError("PAYMENT_PENDING", "This payment is already being processed.", true);
    try {
      const collected = await demoCollect(userId, r.balance, opts.method, true, `Reservation balance · order ${r.orderId.slice(0, 8)}`, r.orderId);
      useNaflis.getState().applyReservationPayment({ reservationId: r.id, amount: r.balance, at: Date.now(), ...collected });
      finishDemoIntent(intent, { status: "succeeded", confirmedAt: Date.now(), orderId: r.orderId });
    } catch (err) {
      const s = useNaflis.getState();
      const { [`${userId}:${idempotencyKey}`]: _drop, ...rest } = s.paymentIntents;
      useNaflis.setState({ paymentIntents: rest });
      throw err;
    }
    return { status: "succeeded", intentId: intent.id, orderId: r.orderId, message: "Purchase completed — the seller has been notified." };
  } catch (err) {
    notifyFailure(err, "Reservation payment failed");
    throw err;
  }
}

/** 128-bit random ticket token (Crockford base32), the value encoded in the QR code. */
export function newTicketToken(): string {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
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

export const ticketQrPayload = (token: string) => `naflis:ticket:${token}`;

/** Buys one event ticket. Paid tickets settle through the payments service like any other purchase. */
export async function buyTicket(opts: { eventId: string; tierId: string; method: PaymentMethod; idempotencyKey: string }): Promise<PaymentOutcome & { ticketId?: string }> {
  assertNotViewingAs();
  try {
    if (paymentMode() === "server") {
      const created = await invokePayments<ServerResponse>("create_ticket_payment", {
        idempotencyKey: opts.idempotencyKey,
        eventId: opts.eventId,
        tierId: opts.tierId,
        method: opts.method,
      });
      const res = await settleServerIntent(created.intent, created.settlement);
      const t = res.ticket ?? created.ticket;
      if (t) {
        useNaflis.getState().issueTicket({
          id: t.id, eventId: t.event_id, tierId: t.tier_id, holderId: t.holder_id, holderName: t.holder_name, token: t.token,
          price: fromMinor(t.price_minor), status: t.status, purchasedAt: new Date(t.created_at).getTime(), serverBacked: true,
        });
      }
      return { status: "succeeded", intentId: res.intent.id, ticketId: t?.id, message: "Ticket confirmed." };
    }

    const userId = demoUser();
    const s = useNaflis.getState();
    const event = s.campusEvents.find((e) => e.id === opts.eventId);
    const tier = event?.ticketing?.tiers.find((t) => t.id === opts.tierId);
    if (!event || !tier) throw new PaymentError("NOT_FOUND", "That ticket type isn't available.");
    if (event.ticketing?.salesEndAt && Date.now() > new Date(event.ticketing.salesEndAt).getTime()) {
      throw new PaymentError("QUOTE_INVALID", "Ticket sales for this event have closed.");
    }
    if (tier.sold >= tier.capacity) throw new PaymentError("QUOTE_INVALID", `${tier.name} tickets are sold out.`);
    const held = s.tickets.filter((t) => t.eventId === event.id && t.holderId === userId && t.status !== "void").length;
    if (held >= 4) throw new PaymentError("QUOTE_INVALID", "You can hold up to 4 tickets per event.");

    const { intent, replay } = demoIntent(userId, opts.idempotencyKey, `${event.id}:${tier.id}`, { purpose: "order", amount: tier.price, method: opts.method });
    if (replay && intent.status === "succeeded") return { status: "succeeded", intentId: intent.id, message: "Ticket already issued." };
    if (replay) throw new PaymentError("PAYMENT_PENDING", "This payment is already being processed.", true);
    try {
      if (tier.price > 0) {
        const collected = await demoCollect(userId, tier.price, opts.method, false, `Ticket · ${event.title} (${tier.name})`);
        useNaflis.setState((st) => {
          const w = st.wallets[userId];
          return { wallets: { ...st.wallets, [userId]: { ...w, ...collected.wallet, transactions: [...collected.walletTx, ...w.transactions] } } };
        });
      }
    } catch (err) {
      finishDemoIntent(intent, { status: "failed", failureReason: err instanceof PaymentError && err.code === "INSUFFICIENT_FUNDS" ? "insufficient_funds" : "declined" });
      throw err;
    }
    const me = s.users.find((u) => u.id === userId);
    const ticket = {
      id: "tk_" + uid() + uid(), eventId: event.id, tierId: tier.id, holderId: userId, holderName: me?.name ?? "Student",
      token: newTicketToken(), price: tier.price, status: "valid" as const, purchasedAt: Date.now(),
    };
    useNaflis.getState().issueTicket(ticket);
    finishDemoIntent(intent, { status: "succeeded", confirmedAt: Date.now() });
    return { status: "succeeded", intentId: intent.id, ticketId: ticket.id, message: "Ticket confirmed." };
  } catch (err) {
    notifyFailure(err, "Ticket payment failed");
    throw err;
  }
}

/** Fetches the authoritative wallet balance (server mode) and mirrors it locally. */
export async function refreshWallet(): Promise<{ balance: number; escrow: number } | null> {
  if (paymentMode() === "demo") {
    const s = useNaflis.getState();
    const w = s.currentUserId ? s.wallets[s.currentUserId] : undefined;
    return w ? { balance: w.balance, escrow: w.escrow } : null;
  }
  const res = await invokePayments<{ wallet: { balance_minor: number; escrow_minor: number } | null }>("get_wallet", {});
  if (!res.wallet) return null;
  const snap = { balance: fromMinor(res.wallet.balance_minor), escrow: fromMinor(res.wallet.escrow_minor) };
  useNaflis.setState((s) => {
    const id = s.currentUserId;
    if (!id || !s.wallets[id]) return {};
    return { wallets: { ...s.wallets, [id]: { ...s.wallets[id], ...snap } } };
  });
  return snap;
}

/** Server-validated order transition; returns the server's resulting state. */
export async function requestServerTransition(orderId: string, to: OrderState, note?: string): Promise<OrderState> {
  const res = await invokePayments<{ state: OrderState }>("transition_order", { orderId, to, note });
  return res.state;
}

export function describePaymentError(err: unknown): { message: string; retryable: boolean } {
  if (err instanceof PaymentError) return { message: err.message, retryable: err.retryable };
  return { message: err instanceof Error ? err.message : "Something went wrong with the payment.", retryable: true };
}

function notifyFailure(err: unknown, title: string) {
  const s = useNaflis.getState();
  if (!s.currentUserId) return;
  const { message } = describePaymentError(err);
  if (err instanceof PaymentError && (err.code === "QUOTE_INVALID" || err.code === "PAYMENT_PENDING")) return;
  s.pushNotif({ userId: s.currentUserId, type: "payment", title, body: message, link: "/buyer/wallet" });
}
