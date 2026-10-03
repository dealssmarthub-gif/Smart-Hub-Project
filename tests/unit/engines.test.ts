// Pure engines from P1–P2: pricing / ledgers / credit, order state machine,
// timetable recurrence, privacy shield, Lost & Found lifecycle.
import { describe, expect, it } from "vitest";
import * as P from "@/lib/naflis/purchase";
import * as M from "@/lib/naflis/orderMachine";
import * as T from "@/lib/naflis/timetable";
import { maskSensitive, photoNeedsShield } from "@/lib/naflis/privacyShield";
import { canClaimTransition, collectionCode } from "@/lib/naflis/lostFound";
import { SEED_EXAMS, SEED_TIMETABLE } from "@/lib/naflis/studentSeed";

const now = Date.UTC(2026, 9, 3);
const cfg = P.normalizePurchaseConfig({
  installment: { enabled: true, depositPct: 30, count: 3, frequency: "monthly", gracePeriodDays: 3 },
  credit: { enabled: true, termCount: 3, financeChargePct: 4 },
  reservation: { enabled: true, feeType: "percent", feeValue: 10, durationHours: 48 },
});

describe("purchase engine", () => {
  it("installment ledgers sum exactly to the price", () => {
    const plan = P.buildInstallmentPlan(1_000_001, cfg.installment, now);
    expect(plan.entries.reduce((a, e) => a + e.amountMinor, 0)).toBe(1_000_001);
    expect(plan.dueNowMinor).toBe(300_000);
    expect(plan.entries[1].graceUntil - plan.entries[1].dueAt).toBe(3 * 86_400_000);
  });

  it("delivery rules gate dispatch", () => {
    const plan = P.buildInstallmentPlan(100_000, cfg.installment, now);
    expect(P.deliveryUnlocked(plan, [0])).toBe(false);
    expect(P.deliveryUnlocked(plan, [0, 1, 2, 3])).toBe(true);
  });

  it("credit engine approves good history and explains declines", () => {
    const good = { kycVerified: true, walletAgeDays: 90, completedOrders: 5, lateInstallments: 0, defaultedPlans: 0, outstandingCreditMinor: 0 };
    expect(P.assessCredit(good, 104_000).eligible).toBe(true);
    const young = P.assessCredit({ ...good, walletAgeDays: 5 }, 104_000);
    expect(young.eligible).toBe(false);
    expect(young.checks.find((c) => c.code === "wallet_age")?.passed).toBe(false);
  });

  it("quotes apply promos to pay-in-full lines only and reject mixed reservations", () => {
    const lines = [
      { productId: "a", name: "A", unitPriceMinor: 100_000, qty: 2, method: "full" as const, config: cfg },
      { productId: "b", name: "B", unitPriceMinor: 1_000_000, qty: 1, method: "installment" as const, config: cfg },
    ];
    const promo = { code: "NAFLIS10", type: "percent" as const, value: 10, minSpend: 200, maxDiscount: 500, active: true };
    const q = P.quoteCheckout({ lines, promo, promoCode: "naflis10", deliveryMethod: "standard", now });
    expect(q.errors).toEqual([]);
    expect(q.discountMinor).toBe(20_000);
    const mixed = P.quoteCheckout({ lines: [{ ...lines[1], method: "reservation" }, lines[0]], deliveryMethod: "standard", now });
    expect(mixed.errors.map((e) => e.code)).toContain("MIXED_RESERVATION");
  });

  it("idempotency canonical form ignores line order and whitespace", () => {
    const req = { lines: [{ productId: "b", qty: 1, method: "installment" as const }, { productId: "a", qty: 2, method: "full" as const }], deliveryMethod: "standard" as const, paymentMethod: "wallet" as const, address: " x " };
    expect(P.canonicalCheckoutRequest(req)).toBe(P.canonicalCheckoutRequest({ ...req, lines: [...req.lines].reverse(), address: "x" }));
  });
});

describe("order state machine", () => {
  it("allows only listed edges for the right actor", () => {
    expect(M.canTransition("paid", "accepted", "seller")).toBe(true);
    expect(M.canTransition("paid", "accepted", "buyer")).toBe(false);
    expect(M.canTransition("created", "paid")).toBe(false);
    expect(() => M.assertTransition("delivered", "paid")).toThrow(M.InvalidTransitionError);
    expect(M.toOrderState("funds-released")).toBe("completed");
  });
});

describe("academic calendar", () => {
  it("expands weekly classes, skipping holidays and reading week", () => {
    const mon = SEED_TIMETABLE.find((e) => e.id === "tt_dcit201")!;
    const occ = T.expandTimetable([mon], T.dateOnly("2026-08-10"), T.addDays(T.dateOnly("2026-11-27"), 1));
    expect(occ.every((o) => new Date(o.start).getDay() === 1)).toBe(true);
    expect(occ.some((o) => T.toIsoDate(o.start) === "2026-10-12")).toBe(false);
    expect(occ).toHaveLength(14);
  });

  it("returns exams within a window", () => {
    const wk = T.startOfWeek(T.dateOnly("2026-10-05"));
    expect(T.examOccurrences(SEED_EXAMS, wk, T.addDays(wk, 7)).map((e) => e.courseCode)).toEqual(["MATH 223"]);
  });
});

describe("privacy shield & lost and found", () => {
  it("masks ID, card, phone, email and passport numbers", () => {
    const m = maskSensitive("GHA-728361945-3, 10984577, 024 555 1201, 4111 1111 1111 1234, kofi.mensah@ug.edu.gh, G1234567");
    for (const leak of ["728361945", "10984577", "555 1201", "4111", "kofi.mensah", "G1234567"]) expect(m.text).not.toContain(leak);
    expect(maskSensitive("JQB 23, level 200").text).toBe("JQB 23, level 200");
    expect(photoNeedsShield("ID / Student card", "")).toBe(true);
  });

  it("claim lifecycle can't skip verification and codes are well-formed", () => {
    expect(canClaimTransition("found", "claim_requested", "claimant")).toBe(true);
    expect(canClaimTransition("found", "claim_approved", "finder")).toBe(false);
    expect(canClaimTransition("verification_required", "claim_approved", "claimant")).toBe(false);
    expect(collectionCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });
});
