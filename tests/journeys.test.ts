// End-to-end journey audit (demo mode: real store + services, no network).
//
// NOTE: "Section 57" of the product spec wasn't available while writing this.
// Journeys A–P below are this codebase's own acceptance journeys, one per
// feature area built in P0–P4. Re-letter / extend them to match Section 57.
import { beforeEach, describe, expect, it } from "vitest";
import { useNaflis } from "@/lib/naflis/store";
import { resolveRoles } from "@/lib/naflis/roles";
import { buildCategoryTree, categoryFamily, fetchCategories, FALLBACK_CATEGORIES } from "@/services/categories";
import { isFeatureEnabled, setFeatureFlag } from "@/lib/featureFlags";
import { normalizePurchaseConfig } from "@/lib/naflis/purchase";
import * as W from "@/services/walletService";
import * as S from "@/services/staffService";
import * as C from "@/services/campusContent";
import { applyProductChange, fetchSellerDemand } from "@/services/intelligenceService";
import { AccessDeniedError } from "@/lib/naflis/errors";
import { buildReport, hasFeature } from "@/lib/naflis/intelligence";
import { addDays, dateOnly, examOccurrences, expandTimetable, startOfWeek } from "@/lib/naflis/timetable";
import { SEED_EXAMS, SEED_OPPORTUNITIES, SEED_TIMETABLE } from "@/lib/naflis/studentSeed";
import { filterOpportunities } from "@/lib/naflis/opportunities";

const st = () => useNaflis.getState();
const as = (userId: string, role: Parameters<ReturnType<typeof st>["setRole"]>[0]) =>
  useNaflis.setState({ currentUserId: userId, role, impersonation: null, adminReturn: null });
const base = { deliveryMethod: "standard" as const, paymentMethod: "wallet" as const, address: "Osu, Accra" };
const product = (prefix: string) => st().products.find((p) => p.name.startsWith(prefix))!;
const configure = (id: string, raw: unknown) =>
  useNaflis.setState((s) => ({ products: s.products.map((p) => (p.id === id ? { ...p, purchaseConfig: normalizePurchaseConfig(raw) } : p)) }));

beforeEach(() => {
  localStorage.clear();
  st().resetDemo();
});

describe("Journey A — guest browses the mall by dynamic category", () => {
  it("loads the category hierarchy offline and parent categories include their children", async () => {
    const cats = await fetchCategories();
    expect(cats).toEqual(FALLBACK_CATEGORIES);
    const tree = buildCategoryTree(cats, "mall");
    expect(tree.map((n) => n.name)).toEqual(expect.arrayContaining(["Food & Meals", "Electronics", "Laundry Services", "Accommodation"]));
    expect(categoryFamily(tree, "Electronics")).toEqual(expect.arrayContaining(["Phones", "Laptops"]));
  });
  it("guests can't enter role workspaces", () => {
    expect(st().role).toBe("guest");
    expect(st().enterContext(["buyer"])).toBe(false);
  });
});

describe("Journey B — one account, many roles, no re-authentication", () => {
  it("a buyer who is a student switches context; opening a shop unlocks seller", () => {
    st().setRole("buyer"); // Ama
    const me = () => st().users.find((u) => u.id === st().currentUserId);
    expect(resolveRoles(me(), st().stores)).toEqual(["buyer", "student"]);
    expect(st().switchRole("student")).toBe(true);
    expect(st().role).toBe("student");
    expect(st().switchRole("seller")).toBe(false);
    st().openShop();
    expect(resolveRoles(me(), st().stores)).toContain("seller");
    expect(st().role).toBe("seller");
    expect(st().currentUserId).toBe("u_buyer1"); // same account throughout
  });
});

describe("Journey C — pay in full from the wallet, safely retried", () => {
  it("charges once per idempotency key and holds funds in escrow", async () => {
    st().setRole("buyer");
    const cheap = st().products.find((p) => p.price < 300)!;
    const before = st().wallets.u_buyer1.balance;
    const request = { ...base, lines: [{ productId: cheap.id, qty: 1, method: "full" as const }] };
    const key = W.newIdempotencyKey();
    const out = await W.checkout({ request, idempotencyKey: key });
    const again = await W.checkout({ request, idempotencyKey: key });
    expect(again.orderId).toBe(out.orderId);
    const order = st().orders.find((o) => o.id === out.orderId)!;
    expect(order.status).toBe("paid");
    expect(before - st().wallets.u_buyer1.balance).toBeCloseTo(order.amountPaid!);
    await expect(W.checkout({ request: { ...request, address: "elsewhere" }, idempotencyKey: key })).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
  });
});

describe("Journey D — fulfilment through the order state machine", () => {
  it("seller → courier → delivery code completes the order and releases escrow", async () => {
    st().setRole("buyer");
    const cheap = st().products.find((p) => p.price < 300)!;
    const { orderId } = await W.checkout({ request: { ...base, lines: [{ productId: cheap.id, qty: 1, method: "full" }] }, idempotencyKey: W.newIdempotencyKey() });
    expect(st().advanceOrder(orderId!, "delivered", "skip", "admin")).toBe(false);
    st().sellerAcceptOrder(orderId!);
    st().sellerStartPreparing(orderId!);
    st().sellerMarkReady(orderId!);
    st().deliveryAcceptJob(orderId!, "u_delivery1");
    expect(st().deliveryConfirmPickup(orderId!, "u_delivery1").ok).toBe(true);
    const escrow = st().wallets.u_buyer1.escrow;
    const code = st().orders.find((o) => o.id === orderId)!.deliveryCode!;
    expect(st().deliveryComplete(orderId!, "u_delivery1", code).ok).toBe(true);
    expect(st().orders.find((o) => o.id === orderId)!.status).toBe("completed");
    expect(st().wallets.u_buyer1.escrow).toBeLessThan(escrow);
  });
});

describe("Journey E — installments with a delivery gate", () => {
  it("deposit now, dispatch locked until the ledger is paid off", async () => {
    st().setRole("buyer");
    st().fundWallet(20_000, "test");
    const laptop = product("HP EliteBook");
    configure(laptop.id, { installment: { enabled: true, depositPct: 30, count: 3, deliveryRule: "on_full_payment" } });
    const { orderId } = await W.checkout({ request: { ...base, lines: [{ productId: laptop.id, qty: 1, method: "installment" }] }, idempotencyKey: W.newIdempotencyKey() });
    const plan = st().installments.find((p) => p.orderId === orderId)!;
    st().sellerAcceptOrder(orderId!); st().sellerStartPreparing(orderId!); st().sellerMarkReady(orderId!);
    expect(st().deliveryConfirmPickup(orderId!, "u_delivery1").ok).toBe(false);
    for (const seq of [1, 2, 3]) await W.payPlanEntry({ planId: plan.id, seq, method: "wallet" });
    expect(st().installments.find((p) => p.id === plan.id)!.status).toBe("completed");
    expect(st().deliveryConfirmPickup(orderId!, "u_delivery1").ok).toBe(true);
  });
});

describe("Journey F — credit sale (pay later) eligibility", () => {
  it("approves a verified buyer with history and declines an unverified one", async () => {
    const laptop = product("HP EliteBook");
    configure(laptop.id, { credit: { enabled: true } });
    st().setRole("buyer");
    const ok = await W.checkout({ request: { ...base, lines: [{ productId: laptop.id, qty: 1, method: "credit" }] }, idempotencyKey: W.newIdempotencyKey() });
    expect(st().installments.find((p) => p.orderId === ok.orderId)!.kind).toBe("credit");
    useNaflis.setState({ currentUserId: "u_buyer2" });
    await expect(W.checkout({ request: { ...base, lines: [{ productId: laptop.id, qty: 1, method: "credit" }] }, idempotencyKey: W.newIdempotencyKey() }))
      .rejects.toMatchObject({ code: "QUOTE_INVALID" });
  });
});

describe("Journey G — reservation hold, expiry and conversion", () => {
  it("holds stock for a fee, expires on time, and converts when the balance is paid", async () => {
    st().setRole("buyer");
    st().fundWallet(40_000, "test");
    const phone = product("Samsung Galaxy");
    configure(phone.id, { reservation: { enabled: true, feeValue: 10, durationHours: 48 } });
    const stock = phone.stock;
    const req = { ...base, lines: [{ productId: phone.id, qty: 1, method: "reservation" as const }] };
    const first = await W.checkout({ request: req, idempotencyKey: W.newIdempotencyKey() });
    const r = st().reservations.find((x) => x.orderId === first.orderId)!;
    expect(st().products.find((p) => p.id === phone.id)!.stock).toBe(stock - 1);
    st().runSchedulers(r.expiresAt + 1);
    expect(st().orders.find((o) => o.id === first.orderId)!.status).toBe("cancelled");
    expect(st().products.find((p) => p.id === phone.id)!.stock).toBe(stock);
    const second = await W.checkout({ request: req, idempotencyKey: W.newIdempotencyKey() });
    const r2 = st().reservations.find((x) => x.orderId === second.orderId)!;
    await W.payReservationBalance({ reservationId: r2.id, method: "wallet" });
    expect(st().orders.find((o) => o.id === second.orderId)!.status).toBe("paid");
  });
});

describe("Journey H — student calendar and opportunities", () => {
  it("shows this week's classes and exams for the campus and filters opportunities", () => {
    const wk = startOfWeek(dateOnly("2026-10-05"));
    const ug = SEED_TIMETABLE.filter((e) => e.campus === "UG - Legon");
    const classes = expandTimetable(ug, wk, addDays(wk, 7));
    expect(classes.length).toBeGreaterThan(0);
    expect(classes.every((c) => c.lecturer && c.hall && c.location && c.recurrenceLabel)).toBe(true);
    expect(examOccurrences(SEED_EXAMS, wk, addDays(wk, 7)).map((e) => e.courseCode)).toEqual(["MATH 223"]);
    const today = dateOnly("2026-10-03");
    const f = { type: "internship" as const, institution: "UG - Legon", programme: "Computer Science", level: "Level 300", deadline: "30" as const, showClosed: false, savedOnly: false, saved: [], query: "" };
    const res = filterOpportunities(SEED_OPPORTUNITIES, f, today);
    expect(res.length).toBeGreaterThan(0);
    expect(res.every((o) => o.type === "internship" && dateOnly(o.deadline) >= today)).toBe(true);
    expect(filterOpportunities(SEED_OPPORTUNITIES, { ...f, institution: "KNUST - Kumasi", type: "job", programme: "any", level: "any" }, today).map((o) => o.id)).toContain("op_knust_ta");
  });
});

describe("Journey I — Lost & Found with privacy shield", () => {
  it("masks numbers publicly and walks the full claim lifecycle", () => {
    as("u_buyer3", "buyer");
    const item = st().reportLostFound({
      kind: "found", title: "Samsung phone", category: "Phone", description: "Owner's number 0245551201 on the case.",
      campus: "UG - Legon", location: "Night Market", date: "2026-10-02", photoShielded: false,
      verificationQuestion: "Lock screen?", verificationAnswer: "a dog", handoverPoint: "Porter's desk",
    })!;
    expect(item.publicDescription).not.toContain("0245551201");
    as("u_buyer2", "buyer");
    st().requestClaim(item.id, "mine");
    const claimId = () => st().lostFound.find((x) => x.id === item.id)!.claims[0].id;
    as("u_buyer3", "buyer");
    st().requireVerification(item.id, claimId());
    as("u_buyer2", "buyer");
    st().submitClaimProof(item.id, claimId(), "A dog");
    as("u_buyer3", "buyer");
    st().approveClaim(item.id, claimId());
    const code = st().lostFound.find((x) => x.id === item.id)!.claims[0].collectionCode!;
    expect(st().confirmCollection(item.id, code).ok).toBe(true);
    expect(st().closeLostFound(item.id).ok).toBe(true);
    expect(st().lostFound.find((x) => x.id === item.id)!.timeline.map((e) => e.status)).toEqual(
      ["found", "claim_requested", "verification_required", "verification_required", "claim_approved", "collected", "closed"],
    );
  });
});

describe("Journey J — campus context switch with Switch / Not now", () => {
  it("keeps registered institution and active campus separate", () => {
    useNaflis.setState({ selectedCampus: "KNUST - Kumasi", registeredInstitution: "UG - Legon" });
    st().requestCampusSwitch("UG - Legon", "registered");
    st().resolveCampusPrompt(false);
    expect(st().selectedCampus).toBe("KNUST - Kumasi");
    st().requestCampusSwitch("UG - Legon", "registered");
    expect(st().campusPrompt).toBeNull(); // snoozed
    st().requestCampusSwitch("UG - Legon", "manual");
    st().resolveCampusPrompt(true);
    expect(st().selectedCampus).toBe("UG - Legon");
    expect(st().registeredInstitution).toBe("UG - Legon");
  });
});

describe("Journey K — Super Admin feature flags", () => {
  it("defaults work offline and role targeting switches features per context", async () => {
    expect(isFeatureEnabled("reserve_and_pay")).toBe(true);
    expect(isFeatureEnabled("does_not_exist")).toBe(false);
    const res = await setFeatureFlag("student_os", { enabled: true, roles: ["student"] });
    expect(res.persisted).toBe(false); // demo mode: local only, reported honestly
    expect(isFeatureEnabled("student_os", "buyer")).toBe(false);
    expect(isFeatureEnabled("student_os", "student")).toBe(true);
    await setFeatureFlag("student_os", { roles: null });
  });
});

describe("Journey L — staff invitation with scoped permissions", () => {
  it("invites by email, stores only a token hash, accepts once, and revokes", async () => {
    as("u_super1", "super_admin");
    const inv = await S.inviteStaff({ email: "ama@demo.gh", name: "Ama", title: "SRC Events Officer", role: "src_head", institutionId: "ug", campusId: "UG - Legon", permissions: ["student.events.create"] });
    expect(inv.ok).toBe(true);
    const token = new URL(inv.ok ? inv.data!.link : "", "http://x").searchParams.get("token")!;
    expect(JSON.stringify(st().staffGrants)).not.toContain(token);
    as("u_buyer2", "buyer");
    expect((await S.acceptInvite(token)).ok).toBe(false);
    as("u_buyer1", "buyer");
    expect((await S.acceptInvite(token)).ok).toBe(true);
    expect(st().hasPermission("student.events.create", "UG - Legon")).toBe(true);
    expect(st().hasPermission("student.events.create", "KNUST - Kumasi")).toBe(false);
    expect((await S.acceptInvite(token)).ok).toBe(false);
  });
});

describe("Journey M — cross-institution modifications are denied with 403", () => {
  const ugNotice = { kind: "announcement" as const, title: "UG notice", description: "", eventDate: new Date().toISOString(), venue: "JQB", campus: "UG - Legon", pinned: false, organizer: "UG SRC" };

  it("KNUST SRC publishing for UG → 403", async () => {
    as("u_src2", "src_head");
    const err = await C.publishCampusEvent(ugNotice).catch((e) => e);
    expect(err).toBeInstanceOf(AccessDeniedError);
    expect(err.status).toBe(403);
  });

  it("KNUST SRC pinning or deleting a UG notice → 403, and nothing changes", async () => {
    as("u_src1", "src_head");
    const created = await C.publishCampusEvent(ugNotice);
    as("u_src2", "src_head");
    await expect(C.togglePinCampusEvent(created.id)).rejects.toMatchObject({ status: 403 });
    await expect(C.removeCampusEvent(created.id)).rejects.toMatchObject({ status: 403 });
    const after = st().campusEvents.find((e) => e.id === created.id)!;
    expect(after.pinned).toBe(false);
  });

  it("KNUST SRC uploading or deleting UG resources → 403", async () => {
    as("u_src2", "src_head");
    await expect(
      C.publishCampusResource({ title: "x", description: "", resourceType: "Past Questions", courseCode: "X 1", department: "", campus: "UG - Legon" }),
    ).rejects.toMatchObject({ status: 403 });
    const ugRes = st().campusResources.find((r) => r.campus === "UG - Legon")!;
    await expect(C.removeCampusResource(ugRes.id)).rejects.toMatchObject({ status: 403 });
    expect(st().campusResources.some((r) => r.id === ugRes.id)).toBe(true);
  });

  it("an institution-wide Dean can't reach another institution either", async () => {
    as("u_dean1", "dean"); // UG, all campuses
    expect(st().hasPermission("student.timetable.manage", "UG - Legon")).toBe(true);
    await expect(C.publishCampusEvent({ ...ugNotice, campus: "KNUST - Kumasi" })).rejects.toMatchObject({ status: 403 });
  });

  it("a seller editing another store's product → 403", async () => {
    as("u_seller2", "seller");
    const other = st().products.find((p) => p.storeId === "s_trendtech")!;
    await expect(applyProductChange(other.id, { price: 1 })).rejects.toMatchObject({ status: 403 });
    expect(st().products.find((p) => p.id === other.id)!.price).toBe(other.price);
  });
});

describe("Journey N — Super Admin View-As is audited and read-only for money", () => {
  it("logs the session, blocks payments and privilege changes, and restores on exit", async () => {
    as("u_super1", "super_admin");
    expect((await S.startViewAs({ targetUserId: "u_src1", role: "src_head", reason: "Support #12", minutes: 15 })).ok).toBe(true);
    expect(st().currentUserId).toBe("u_src1");
    await expect(W.checkout({ request: { ...base, lines: [{ productId: st().products[0].id, qty: 1, method: "full" }] }, idempotencyKey: "k" }))
      .rejects.toMatchObject({ code: "VIEW_AS_READ_ONLY" });
    expect(st().hasPermission("student.announcements.create", "KNUST - Kumasi")).toBe(false);
    await S.endViewAs("exit");
    expect(st().currentUserId).toBe("u_super1");
    expect(st().impersonationSessions[0].endReason).toBe("exit");
    expect(st().auditLog.map((a) => a.action)).toEqual(expect.arrayContaining(["impersonation.start", "impersonation.end"]));
  });
});

describe("Journey O — ticketed event with QR check-in", () => {
  it("buys once per key and admits once at an in-scope gate", async () => {
    st().setRole("buyer");
    const key = W.newIdempotencyKey("tkt");
    const bought = await W.buyTicket({ eventId: "ce_srcweek", tierId: "tier_regular", method: "wallet", idempotencyKey: key });
    await W.buyTicket({ eventId: "ce_srcweek", tierId: "tier_regular", method: "wallet", idempotencyKey: key });
    expect(st().tickets).toHaveLength(1);
    const token = st().tickets.find((t) => t.id === bought.ticketId)!.token;
    as("u_src2", "src_head");
    expect((await S.validateTicket(W.ticketQrPayload(token))).ok).toBe(false);
    as("u_src1", "src_head");
    expect((await S.validateTicket(W.ticketQrPayload(token))).ok).toBe(true);
    expect((await S.validateTicket(token)).message).toMatch(/Already used/);
  });
});

describe("Journey P — Seller Intelligence: gated, actionable, survives refresh", () => {
  it("starter is gated; owner upgrades; recommendations apply and persist across a reload", async () => {
    as("u_seller1", "seller");
    // Start TrendTech on the free plan.
    useNaflis.setState((s) => ({ stores: s.stores.map((x) => (x.ownerId === "u_seller1" ? { ...x, subscription: "starter" as const } : x)) }));
    const store = st().stores.find((s) => s.ownerId === "u_seller1")!;
    expect(hasFeature(store.subscription, "trends")).toBe(false);
    as("u_seller2", "seller");
    expect(st().setStoreSubscription(store.id, "professional").status).toBe(403);
    as("u_seller1", "seller");
    expect(st().setStoreSubscription(store.id, "professional").ok).toBe(true);

    const demand = await fetchSellerDemand("UG - Legon");
    expect(demand.source).toBe("demo");
    expect(localStorage.getItem("naflis-intel-cache-v1:UG - Legon")).not.toBeNull(); // last good data cached for refresh
    const mine = st().products.filter((p) => p.storeId === store.id);
    const report = buildReport({ logs: demand.logs, mine, market: st().products, orders: st().orders, campus: "UG - Legon", now: Date.now() });
    expect(report.trends.length).toBeGreaterThan(0);
    expect(report.restock.some((r) => r.productName.includes("Power Bank"))).toBe(true);
    expect(report.pricing.some((p) => p.productName.includes("Headphones") && p.direction === "lower")).toBe(true);
    expect(report.bundles.length).toBeGreaterThan(0);
    expect(report.unmet.length).toBeGreaterThan(0);

    const price = report.pricing[0];
    await applyProductChange(price.productId, { price: price.suggestedPrice });
    st().dismissInsight(price.id);
    st().setIntelligencePref({ campus: "UG - Legon", tab: "pricing" });

    // Simulate a browser refresh: wipe memory, restore the persisted snapshot, rehydrate.
    const snapshot = localStorage.getItem("naflis-store-v2")!;
    useNaflis.setState({ products: [], intelligence: { dismissed: {}, applied: [], bundles: [], upgradeRequests: [] } });
    localStorage.setItem("naflis-store-v2", snapshot);
    await useNaflis.persist.rehydrate();
    expect(st().products.find((p) => p.id === price.productId)!.price).toBe(price.suggestedPrice);
    expect(st().intelligence.dismissed[price.id]).toBeDefined();
    expect(st().intelligence.tab).toBe("pricing");
    expect(st().intelligence.applied[0].kind).toBe("price");
    expect(st().stores.find((s) => s.id === store.id)!.subscription).toBe("professional");
  });
});
