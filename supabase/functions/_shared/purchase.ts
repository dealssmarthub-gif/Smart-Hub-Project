// ============================================================================
// PURCHASE ENGINE — purchase-method config, installment ledgers, reservations,
// credit eligibility and checkout quotes.
//
// Shared verbatim by the web app (previews) and the `payments` Edge Function
// (authoritative). The server recomputes every quote from database prices, so
// the browser's numbers are only ever a preview.
//
// All money is integer minor units (pesewas) to keep client and server in
// exact agreement. Keep this file free of runtime-specific imports.
// ============================================================================

export type PurchaseMethod = "full" | "credit" | "installment" | "reservation";
export type Frequency = "weekly" | "biweekly" | "monthly";
export type DeliveryRule = "on_deposit" | "after_installments" | "on_full_payment";

export const PURCHASE_METHODS: PurchaseMethod[] = ["full", "installment", "credit", "reservation"];

export const PURCHASE_METHOD_LABEL: Record<PurchaseMethod, string> = {
  full: "Pay in full",
  installment: "Installments",
  credit: "Pay later (credit)",
  reservation: "Reserve",
};

export interface PurchaseConfig {
  payInFull: { enabled: boolean };
  credit: {
    enabled: boolean;
    termCount: number;
    frequency: Frequency;
    financeChargePct: number;
    minCreditScore: number;
  };
  installment: {
    enabled: boolean;
    depositPct: number;
    frequency: Frequency;
    count: number;
    gracePeriodDays: number;
    lateFeePct: number;
    deliveryRule: DeliveryRule;
    /** Used when deliveryRule is "after_installments". */
    deliverAfterInstallments: number;
  };
  reservation: {
    enabled: boolean;
    feeType: "fixed" | "percent";
    /** GHS when fixed, % of price when percent. */
    feeValue: number;
    durationHours: number;
    autoExpire: boolean;
    /** Fee counts towards the price when the buyer completes the purchase. */
    feeCreditedToPrice: boolean;
    refundOnExpiry: boolean;
  };
}

export const DEFAULT_PURCHASE_CONFIG: PurchaseConfig = {
  payInFull: { enabled: true },
  credit: { enabled: false, termCount: 3, frequency: "monthly", financeChargePct: 4, minCreditScore: 600 },
  installment: {
    enabled: false,
    depositPct: 30,
    frequency: "monthly",
    count: 3,
    gracePeriodDays: 3,
    lateFeePct: 2,
    deliveryRule: "on_full_payment",
    deliverAfterInstallments: 1,
  },
  reservation: {
    enabled: false,
    feeType: "percent",
    feeValue: 10,
    durationHours: 48,
    autoExpire: true,
    feeCreditedToPrice: true,
    refundOnExpiry: false,
  },
};

const LIMITS = {
  depositPct: [10, 90],
  installmentCount: [2, 24],
  gracePeriodDays: [0, 30],
  lateFeePct: [0, 20],
  creditTermCount: [2, 12],
  financeChargePct: [0, 30],
  minCreditScore: [300, 900],
  reservationPct: [1, 50],
  durationHours: [1, 720],
} as const;

const FREQUENCIES: Frequency[] = ["weekly", "biweekly", "monthly"];
const DELIVERY_RULES: DeliveryRule[] = ["on_deposit", "after_installments", "on_full_payment"];
const FREQ_DAYS: Record<Frequency, number> = { weekly: 7, biweekly: 14, monthly: 30 };
const DAY_MS = 86_400_000;

const clamp = (n: unknown, [lo, hi]: readonly [number, number], fallback: number) => {
  const v = typeof n === "number" && Number.isFinite(n) ? n : Number(n);
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
};
const int = (n: number) => Math.round(n);
const oneOf = <T extends string>(v: unknown, list: T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

export const toMinor = (ghs: number) => Math.round(ghs * 100);
export const fromMinor = (minor: number) => minor / 100;

/**
 * Coerces anything (DB jsonb, form state, legacy data) into a valid config.
 * Out-of-range numbers are clamped; if nothing is enabled, pay-in-full is.
 */
export function normalizePurchaseConfig(raw: unknown): PurchaseConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const d = DEFAULT_PURCHASE_CONFIG;
  const c = r.credit ?? {};
  const i = r.installment ?? {};
  const res = r.reservation ?? {};
  const feeType = oneOf(res.feeType, ["fixed", "percent"], d.reservation.feeType);
  const count = int(clamp(i.count, LIMITS.installmentCount, d.installment.count));

  const config: PurchaseConfig = {
    payInFull: { enabled: bool(r.payInFull?.enabled, d.payInFull.enabled) },
    credit: {
      enabled: bool(c.enabled, d.credit.enabled),
      termCount: int(clamp(c.termCount, LIMITS.creditTermCount, d.credit.termCount)),
      frequency: oneOf(c.frequency, FREQUENCIES, d.credit.frequency),
      financeChargePct: clamp(c.financeChargePct, LIMITS.financeChargePct, d.credit.financeChargePct),
      minCreditScore: int(clamp(c.minCreditScore, LIMITS.minCreditScore, d.credit.minCreditScore)),
    },
    installment: {
      enabled: bool(i.enabled, d.installment.enabled),
      depositPct: clamp(i.depositPct, LIMITS.depositPct, d.installment.depositPct),
      frequency: oneOf(i.frequency, FREQUENCIES, d.installment.frequency),
      count,
      gracePeriodDays: int(clamp(i.gracePeriodDays, LIMITS.gracePeriodDays, d.installment.gracePeriodDays)),
      lateFeePct: clamp(i.lateFeePct, LIMITS.lateFeePct, d.installment.lateFeePct),
      deliveryRule: oneOf(i.deliveryRule, DELIVERY_RULES, d.installment.deliveryRule),
      deliverAfterInstallments: int(clamp(i.deliverAfterInstallments, [1, count], 1)),
    },
    reservation: {
      enabled: bool(res.enabled, d.reservation.enabled),
      feeType,
      feeValue:
        feeType === "percent"
          ? clamp(res.feeValue, LIMITS.reservationPct, d.reservation.feeValue)
          : Math.max(0, Number(res.feeValue) || 0),
      durationHours: int(clamp(res.durationHours, LIMITS.durationHours, d.reservation.durationHours)),
      autoExpire: bool(res.autoExpire, d.reservation.autoExpire),
      feeCreditedToPrice: bool(res.feeCreditedToPrice, d.reservation.feeCreditedToPrice),
      refundOnExpiry: bool(res.refundOnExpiry, d.reservation.refundOnExpiry),
    },
  };
  if (!enabledMethods(config).length) config.payInFull.enabled = true;
  return config;
}

/** Strict check for the seller editor: reports what normalize would silently fix. */
export function validatePurchaseConfig(config: PurchaseConfig, priceGhs?: number): string[] {
  const errors: string[] = [];
  const inRange = (v: number, [lo, hi]: readonly [number, number]) => Number.isFinite(v) && v >= lo && v <= hi;
  if (!enabledMethods(config).length) errors.push("Enable at least one purchase method.");
  if (config.installment.enabled) {
    if (!inRange(config.installment.depositPct, LIMITS.depositPct)) errors.push("Installment deposit must be 10–90%.");
    if (!inRange(config.installment.count, LIMITS.installmentCount)) errors.push("Installments must be 2–24 payments.");
    if (!inRange(config.installment.gracePeriodDays, LIMITS.gracePeriodDays)) errors.push("Grace period must be 0–30 days.");
    if (!inRange(config.installment.lateFeePct, LIMITS.lateFeePct)) errors.push("Late fee must be 0–20%.");
    if (
      config.installment.deliveryRule === "after_installments" &&
      !inRange(config.installment.deliverAfterInstallments, [1, config.installment.count])
    ) {
      errors.push("Delivery must unlock after 1 to all installments.");
    }
  }
  if (config.credit.enabled) {
    if (!inRange(config.credit.termCount, LIMITS.creditTermCount)) errors.push("Credit term must be 2–12 payments.");
    if (!inRange(config.credit.financeChargePct, LIMITS.financeChargePct)) errors.push("Finance charge must be 0–30%.");
  }
  if (config.reservation.enabled) {
    const { feeType, feeValue, durationHours } = config.reservation;
    if (feeType === "percent" && !inRange(feeValue, LIMITS.reservationPct)) errors.push("Reservation fee must be 1–50% of the price.");
    if (feeType === "fixed" && (!(feeValue > 0) || (priceGhs !== undefined && feeValue >= priceGhs))) {
      errors.push("A fixed reservation fee must be above zero and below the price.");
    }
    if (!inRange(durationHours, LIMITS.durationHours)) errors.push("Reservations can be held for 1 hour to 30 days.");
  }
  return errors;
}

/** Config for products created before purchase methods existed. */
export function legacyPurchaseConfig(paymentOptions?: string[]): PurchaseConfig {
  const opts = paymentOptions ?? [];
  return normalizePurchaseConfig({
    payInFull: { enabled: true },
    installment: { enabled: opts.includes("installment") },
    credit: { enabled: opts.includes("installment") },
    reservation: { enabled: opts.includes("reserve") },
  });
}

export function enabledMethods(config: PurchaseConfig): PurchaseMethod[] {
  const on: Record<PurchaseMethod, boolean> = {
    full: config.payInFull.enabled,
    installment: config.installment.enabled,
    credit: config.credit.enabled,
    reservation: config.reservation.enabled,
  };
  return PURCHASE_METHODS.filter((m) => on[m]);
}

// ---------------------------------------------------------------------------
// Ledgers
// ---------------------------------------------------------------------------

export interface ScheduleEntry {
  /** 0 is the deposit / first charge collected at checkout. */
  seq: number;
  kind: "deposit" | "installment";
  dueAt: number;
  /** Last moment the payment counts as on time. */
  graceUntil: number;
  amountMinor: number;
}

export interface PlanQuote {
  kind: "installment" | "credit";
  principalMinor: number;
  chargeMinor: number;
  totalMinor: number;
  dueNowMinor: number;
  frequency: Frequency;
  entries: ScheduleEntry[];
  gracePeriodDays: number;
  lateFeePct: number;
  deliveryRule: DeliveryRule;
  deliverAfterInstallments: number;
}

/** Splits `amount` into `n` parts that sum exactly; the last part takes the remainder. */
function split(amountMinor: number, n: number): number[] {
  const base = Math.floor(amountMinor / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? amountMinor - base * (n - 1) : base));
}

export function buildInstallmentPlan(priceMinor: number, cfg: PurchaseConfig["installment"], startAt: number): PlanQuote {
  const depositMinor = int((priceMinor * cfg.depositPct) / 100);
  const parts = split(priceMinor - depositMinor, cfg.count);
  const period = FREQ_DAYS[cfg.frequency] * DAY_MS;
  const grace = cfg.gracePeriodDays * DAY_MS;
  return {
    kind: "installment",
    principalMinor: priceMinor,
    chargeMinor: 0,
    totalMinor: priceMinor,
    dueNowMinor: depositMinor,
    frequency: cfg.frequency,
    entries: [
      { seq: 0, kind: "deposit", dueAt: startAt, graceUntil: startAt, amountMinor: depositMinor },
      ...parts.map((amountMinor, i) => {
        const dueAt = startAt + (i + 1) * period;
        return { seq: i + 1, kind: "installment" as const, dueAt, graceUntil: dueAt + grace, amountMinor };
      }),
    ],
    gracePeriodDays: cfg.gracePeriodDays,
    lateFeePct: cfg.lateFeePct,
    deliveryRule: cfg.deliveryRule,
    deliverAfterInstallments: cfg.deliverAfterInstallments,
  };
}

export function buildCreditPlan(priceMinor: number, cfg: PurchaseConfig["credit"], startAt: number): PlanQuote {
  const chargeMinor = int((priceMinor * cfg.financeChargePct) / 100);
  const totalMinor = priceMinor + chargeMinor;
  const period = FREQ_DAYS[cfg.frequency] * DAY_MS;
  return {
    kind: "credit",
    principalMinor: priceMinor,
    chargeMinor,
    totalMinor,
    dueNowMinor: 0,
    frequency: cfg.frequency,
    entries: split(totalMinor, cfg.termCount).map((amountMinor, i) => {
      const dueAt = startAt + (i + 1) * period;
      return { seq: i + 1, kind: "installment" as const, dueAt, graceUntil: dueAt + 3 * DAY_MS, amountMinor };
    }),
    gracePeriodDays: 3,
    lateFeePct: 0,
    deliveryRule: "on_deposit", // credit sales ship immediately
    deliverAfterInstallments: 0,
  };
}

/** Whether goods may be dispatched yet under the plan's delivery rule. */
export function deliveryUnlocked(plan: Pick<PlanQuote, "deliveryRule" | "deliverAfterInstallments" | "entries">, paidSeqs: number[]): boolean {
  const paidInstallments = paidSeqs.filter((s) => s > 0).length;
  switch (plan.deliveryRule) {
    case "on_deposit":
      return true;
    case "after_installments":
      return paidSeqs.includes(0) && paidInstallments >= plan.deliverAfterInstallments;
    case "on_full_payment":
      return plan.entries.every((e) => paidSeqs.includes(e.seq));
  }
}

export const DELIVERY_RULE_LABEL: Record<DeliveryRule, string> = {
  on_deposit: "Ships once the deposit clears",
  after_installments: "Ships after the set number of installments",
  on_full_payment: "Ships after the final installment",
};

export interface ReservationQuote {
  feeMinor: number;
  /** What is still owed to complete the purchase. */
  balanceMinor: number;
  expiresAt: number;
  durationHours: number;
  autoExpire: boolean;
  refundOnExpiry: boolean;
}

export function quoteReservation(priceMinor: number, cfg: PurchaseConfig["reservation"], startAt: number): ReservationQuote {
  const raw = cfg.feeType === "percent" ? int((priceMinor * cfg.feeValue) / 100) : toMinor(cfg.feeValue);
  const feeMinor = Math.max(1, Math.min(raw, priceMinor - 1));
  return {
    feeMinor,
    balanceMinor: priceMinor - (cfg.feeCreditedToPrice ? feeMinor : 0),
    expiresAt: startAt + cfg.durationHours * 3_600_000,
    durationHours: cfg.durationHours,
    autoExpire: cfg.autoExpire,
    refundOnExpiry: cfg.refundOnExpiry,
  };
}

// ---------------------------------------------------------------------------
// Credit eligibility
// ---------------------------------------------------------------------------

export interface CreditSignals {
  kycVerified: boolean;
  walletAgeDays: number;
  completedOrders: number;
  lateInstallments: number;
  defaultedPlans: number;
  outstandingCreditMinor: number;
  /** Limit set by a finance officer; overrides the score-based limit. */
  approvedLimitMinor?: number | null;
  /** Bureau / historical score, blended with the computed one. */
  priorScore?: number | null;
}

export interface CreditCheck {
  code: "kyc" | "score" | "wallet_age" | "no_defaults" | "limit";
  label: string;
  passed: boolean;
  detail: string;
}

export interface CreditDecision {
  eligible: boolean;
  score: number;
  band: "excellent" | "good" | "fair" | "poor";
  limitMinor: number;
  availableMinor: number;
  requestedMinor: number;
  checks: CreditCheck[];
}

export const CREDIT_POLICY = { minWalletAgeDays: 30, requireKyc: true } as const;

export function creditScore(s: CreditSignals): number {
  // 350 base · +150 KYC · up to +150 for 90 days of wallet history · +15 per completed order (max 10)
  const computed =
    350 +
    (s.kycVerified ? 150 : 0) +
    Math.round((Math.min(Math.max(s.walletAgeDays, 0), 90) / 90) * 150) +
    Math.min(s.completedOrders, 10) * 15 -
    s.lateInstallments * 40 -
    s.defaultedPlans * 200;
  const blended = s.priorScore ? Math.round((s.priorScore + computed) / 2) : computed;
  return Math.max(0, Math.min(1000, blended));
}

function scoreLimitMinor(score: number): number {
  if (score >= 800) return toMinor(20_000);
  if (score >= 700) return toMinor(8_000);
  if (score >= 600) return toMinor(3_000);
  return 0;
}

export function assessCredit(signals: CreditSignals, requestedMinor: number, minScore = 600): CreditDecision {
  const score = creditScore(signals);
  const limitMinor = signals.approvedLimitMinor && signals.approvedLimitMinor > 0 ? signals.approvedLimitMinor : scoreLimitMinor(score);
  const availableMinor = Math.max(0, limitMinor - signals.outstandingCreditMinor);
  const ghs = (m: number) => `GHS ${fromMinor(m).toLocaleString("en-GH", { maximumFractionDigits: 2 })}`;
  const checks: CreditCheck[] = [
    {
      code: "kyc",
      label: "Identity verified",
      passed: !CREDIT_POLICY.requireKyc || signals.kycVerified,
      detail: signals.kycVerified ? "KYC complete" : "Complete identity verification",
    },
    { code: "score", label: `Credit score ≥ ${minScore}`, passed: score >= minScore, detail: `Score ${score}` },
    {
      code: "wallet_age",
      label: `Wallet history ≥ ${CREDIT_POLICY.minWalletAgeDays} days`,
      passed: signals.walletAgeDays >= CREDIT_POLICY.minWalletAgeDays,
      detail: `${Math.floor(signals.walletAgeDays)} days`,
    },
    {
      code: "no_defaults",
      label: "No defaulted plans",
      passed: signals.defaultedPlans === 0,
      detail: signals.defaultedPlans ? `${signals.defaultedPlans} defaulted` : "Clean record",
    },
    {
      code: "limit",
      label: "Within available credit",
      passed: requestedMinor <= availableMinor,
      detail: `${ghs(requestedMinor)} of ${ghs(availableMinor)} available`,
    },
  ];
  return {
    eligible: checks.every((c) => c.passed),
    score,
    band: score >= 800 ? "excellent" : score >= 700 ? "good" : score >= 600 ? "fair" : "poor",
    limitMinor,
    availableMinor,
    requestedMinor,
    checks,
  };
}

// ---------------------------------------------------------------------------
// Checkout quote
// ---------------------------------------------------------------------------

export type DeliveryMethod = "standard" | "express";
export const DELIVERY_FEE_MINOR: Record<DeliveryMethod, number> = { standard: 2_500, express: 6_000 };
/** 0.5% escrow fee on money collected now. */
export const ESCROW_FEE_BPS = 50;

export interface PromoRule {
  code: string;
  type: "percent" | "fixed" | "free-shipping";
  /** % for percent, GHS for fixed. */
  value: number;
  minSpend?: number | null;
  maxDiscount?: number | null;
  active: boolean;
}

export interface QuoteLineInput {
  productId: string;
  name: string;
  unitPriceMinor: number;
  qty: number;
  method: PurchaseMethod;
  config: PurchaseConfig;
  /** Units available to sell; omit to skip the stock check. */
  stock?: number;
}

export interface LineQuote {
  productId: string;
  name: string;
  qty: number;
  method: PurchaseMethod;
  lineTotalMinor: number;
  dueNowMinor: number;
  /** Owed after checkout (installments, credit repayments, reservation balance). */
  laterMinor: number;
  plan?: PlanQuote;
  reservation?: ReservationQuote;
}

export interface QuoteError {
  code: "METHOD_DISABLED" | "OUT_OF_STOCK" | "INVALID_QTY" | "CREDIT_DECLINED" | "PROMO_INVALID" | "EMPTY" | "MIXED_RESERVATION";
  message: string;
  productId?: string;
}

export interface CheckoutQuote {
  lines: LineQuote[];
  subtotalMinor: number;
  discountMinor: number;
  promoCode?: string;
  promoMessage?: string;
  deliveryMinor: number;
  deliveryDeferred: boolean;
  escrowFeeMinor: number;
  dueNowMinor: number;
  laterMinor: number;
  credit?: CreditDecision;
  errors: QuoteError[];
}

export interface QuoteInput {
  lines: QuoteLineInput[];
  promo?: PromoRule | null;
  promoCode?: string;
  deliveryMethod: DeliveryMethod;
  credit?: CreditSignals;
  now: number;
}

export function quoteCheckout(input: QuoteInput): CheckoutQuote {
  const errors: QuoteError[] = [];
  if (!input.lines.length) errors.push({ code: "EMPTY", message: "Your cart is empty." });
  if (input.lines.length > 1 && input.lines.some((l) => l.method === "reservation")) {
    errors.push({ code: "MIXED_RESERVATION", message: "Reservations hold stock on their own — check them out separately." });
  }

  const lines: LineQuote[] = input.lines.map((l) => {
    const qty = Number.isInteger(l.qty) && l.qty > 0 ? l.qty : 0;
    if (!qty) errors.push({ code: "INVALID_QTY", message: `Invalid quantity for ${l.name}.`, productId: l.productId });
    if (l.stock !== undefined && qty > l.stock) {
      errors.push({ code: "OUT_OF_STOCK", message: `Only ${l.stock} of ${l.name} left.`, productId: l.productId });
    }
    if (!enabledMethods(l.config).includes(l.method)) {
      errors.push({
        code: "METHOD_DISABLED",
        message: `${PURCHASE_METHOD_LABEL[l.method]} isn't offered for ${l.name}.`,
        productId: l.productId,
      });
    }
    const lineTotalMinor = l.unitPriceMinor * qty;
    const base = { productId: l.productId, name: l.name, qty, method: l.method, lineTotalMinor };
    switch (l.method) {
      case "installment": {
        const plan = buildInstallmentPlan(lineTotalMinor, l.config.installment, input.now);
        return { ...base, plan, dueNowMinor: plan.dueNowMinor, laterMinor: plan.totalMinor - plan.dueNowMinor };
      }
      case "credit": {
        const plan = buildCreditPlan(lineTotalMinor, l.config.credit, input.now);
        return { ...base, plan, dueNowMinor: 0, laterMinor: plan.totalMinor };
      }
      case "reservation": {
        const reservation = quoteReservation(lineTotalMinor, l.config.reservation, input.now);
        return { ...base, reservation, dueNowMinor: reservation.feeMinor, laterMinor: reservation.balanceMinor };
      }
      default:
        return { ...base, dueNowMinor: lineTotalMinor, laterMinor: 0 };
    }
  });

  const subtotalMinor = lines.reduce((a, l) => a + l.lineTotalMinor, 0);
  const deliveryDeferred = lines.length > 0 && lines.every((l) => l.method === "reservation");
  const deliveryFee = DELIVERY_FEE_MINOR[input.deliveryMethod] ?? DELIVERY_FEE_MINOR.standard;
  const deliveryMinor = deliveryDeferred ? 0 : deliveryFee;

  // Promo codes only discount items paid in full today.
  let discountMinor = 0;
  let promoMessage: string | undefined;
  if (input.promoCode) {
    const promo = input.promo;
    const baseMinor = lines.filter((l) => l.method === "full").reduce((a, l) => a + l.lineTotalMinor, 0);
    if (!promo || !promo.active || promo.code.toUpperCase() !== input.promoCode.toUpperCase()) {
      errors.push({ code: "PROMO_INVALID", message: "Promo code not found or expired." });
    } else if (baseMinor === 0) {
      errors.push({ code: "PROMO_INVALID", message: "Promo codes apply to items paid in full." });
    } else if (promo.minSpend && baseMinor < toMinor(promo.minSpend)) {
      errors.push({ code: "PROMO_INVALID", message: `Minimum spend of GHS ${promo.minSpend} on pay-in-full items required.` });
    } else {
      if (promo.type === "percent") {
        discountMinor = int((baseMinor * promo.value) / 100);
        if (promo.maxDiscount) discountMinor = Math.min(discountMinor, toMinor(promo.maxDiscount));
      } else if (promo.type === "fixed") {
        discountMinor = Math.min(toMinor(promo.value), baseMinor);
      } else {
        discountMinor = deliveryMinor;
      }
      promoMessage = `Applied ${promo.code.toUpperCase()}`;
    }
  }

  const itemsNowMinor = lines.reduce((a, l) => a + l.dueNowMinor, 0);
  const escrowFeeMinor = int((Math.max(0, itemsNowMinor - discountMinor) * ESCROW_FEE_BPS) / 10_000);
  const dueNowMinor = Math.max(0, itemsNowMinor - discountMinor + deliveryMinor + escrowFeeMinor);
  const laterMinor = lines.reduce((a, l) => a + l.laterMinor, 0) + (deliveryDeferred ? deliveryFee : 0);

  let credit: CreditDecision | undefined;
  const creditLines = lines.filter((l) => l.method === "credit");
  if (creditLines.length) {
    const requested = creditLines.reduce((a, l) => a + (l.plan?.totalMinor ?? 0), 0);
    const minScore = Math.max(...input.lines.filter((l) => l.method === "credit").map((l) => l.config.credit.minCreditScore));
    credit = input.credit
      ? assessCredit(input.credit, requested, minScore)
      : assessCredit(
          { kycVerified: false, walletAgeDays: 0, completedOrders: 0, lateInstallments: 0, defaultedPlans: 0, outstandingCreditMinor: 0 },
          requested,
          minScore,
        );
    if (!credit.eligible) {
      const failed = credit.checks.filter((c) => !c.passed).map((c) => c.label.toLowerCase());
      errors.push({ code: "CREDIT_DECLINED", message: `Pay-later not approved: ${failed.join(", ")}.` });
    }
  }

  return {
    lines,
    subtotalMinor,
    discountMinor,
    promoCode: promoMessage ? input.promoCode?.toUpperCase() : undefined,
    promoMessage,
    deliveryMinor,
    deliveryDeferred,
    escrowFeeMinor,
    dueNowMinor,
    laterMinor,
    credit,
    errors,
  };
}

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

export interface CheckoutRequest {
  lines: { productId: string; qty: number; method: PurchaseMethod }[];
  promoCode?: string;
  deliveryMethod: DeliveryMethod;
  paymentMethod: "wallet" | "card" | "momo";
  address: string;
}

/**
 * Canonical JSON of a checkout request. The server stores a hash of this next
 * to the idempotency key and rejects a reused key carrying a different request.
 */
export function canonicalCheckoutRequest(req: CheckoutRequest): string {
  return JSON.stringify({
    lines: [...req.lines]
      .map((l) => ({ productId: l.productId, qty: l.qty, method: l.method }))
      .sort((a, b) => (a.productId + a.method).localeCompare(b.productId + b.method)),
    promoCode: (req.promoCode ?? "").trim().toUpperCase(),
    deliveryMethod: req.deliveryMethod,
    paymentMethod: req.paymentMethod,
    address: req.address.trim(),
  });
}
