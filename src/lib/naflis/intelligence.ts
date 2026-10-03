// ============================================================================
// SELLER INTELLIGENCE ENGINE
// Deterministic analytics over `demand_logs` (what students search for), the
// seller's catalog, orders and market prices. "AI" in the product name; under
// the hood these are transparent, explainable rules — every recommendation
// carries the numbers behind it.
// ============================================================================

export type Tier = "starter" | "growth" | "professional" | "enterprise";

export const TIER_RANK: Record<Tier, number> = { starter: 0, growth: 1, professional: 2, enterprise: 3 };

export const TIER_PRICE_GHS: Record<Exclude<Tier, "starter">, number> = { growth: 99, professional: 249, enterprise: 799 };

/** Which subscription unlocks each insight. */
export const FEATURE_TIER = {
  trends: "growth",
  restock: "growth",
  unmet: "growth",
  pricing: "professional",
  bundles: "professional",
} as const satisfies Record<string, Tier>;
export type IntelFeature = keyof typeof FEATURE_TIER;

export function hasFeature(tier: Tier, feature: IntelFeature): boolean {
  return TIER_RANK[tier] >= TIER_RANK[FEATURE_TIER[feature]];
}

export interface DemandLogInput {
  searchQuery: string;
  campus: string;
  resultsCount: number;
  userId?: string | null;
  createdAt: number;
}

export interface CatalogProduct {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  storeId: string;
}

export interface OrderInput {
  createdAt: number;
  status: string;
  items: { productId: string; qty: number; price: number }[];
}

const DAY = 86_400_000;
const STOPWORDS = new Set(["the", "and", "for", "with", "new", "used", "inch", "pro", "max", "mini", "plus"]);

export function normalizeQuery(q: string): string {
  return q.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function tokens(s: string): string[] {
  return normalizeQuery(s).split(" ").filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

/** Share of a query's meaningful tokens found in the product name (0–1). */
export function matchStrength(query: string, productName: string): number {
  const q = tokens(query);
  if (!q.length) return 0;
  const p = new Set(tokens(productName));
  return q.filter((t) => p.has(t)).length / q.length;
}

// ---------------------------------------------------------------------------
// Demand aggregation
// ---------------------------------------------------------------------------

export interface DemandTerm {
  query: string;
  /** Display form (most recent original casing). */
  label: string;
  campus: string;
  last7: number;
  prev7: number;
  last28: number;
  /** % growth of last 7 days over the 7 before (Infinity-safe: new terms report 100). */
  growthPct: number;
  /** Share of searches that returned nothing — unmet demand. */
  zeroResultRate: number;
  uniqueSearchers: number;
  lastSeen: number;
}

export function aggregateDemand(logs: DemandLogInput[], now: number, campus?: string): DemandTerm[] {
  const map = new Map<string, DemandTerm & { _users: Set<string>; _zero: number }>();
  for (const l of logs) {
    if (campus && campus !== "All Campuses" && l.campus !== campus && l.campus !== "General") continue;
    const age = now - l.createdAt;
    if (age < 0 || age > 28 * DAY) continue;
    const query = normalizeQuery(l.searchQuery);
    if (!query) continue;
    const key = `${query}|${campus && campus !== "All Campuses" ? campus : l.campus}`;
    const t = map.get(key) ?? {
      query, label: l.searchQuery.trim(), campus: campus && campus !== "All Campuses" ? campus : l.campus,
      last7: 0, prev7: 0, last28: 0, growthPct: 0, zeroResultRate: 0, uniqueSearchers: 0, lastSeen: 0,
      _users: new Set<string>(), _zero: 0,
    };
    t.last28++;
    if (age <= 7 * DAY) t.last7++;
    else if (age <= 14 * DAY) t.prev7++;
    if (l.resultsCount === 0) t._zero++;
    if (l.userId) t._users.add(l.userId);
    if (l.createdAt > t.lastSeen) {
      t.lastSeen = l.createdAt;
      t.label = l.searchQuery.trim();
    }
    map.set(key, t);
  }
  return [...map.values()]
    .map(({ _users, _zero, ...t }) => ({
      ...t,
      growthPct: t.prev7 === 0 ? (t.last7 > 0 ? 100 : 0) : Math.round(((t.last7 - t.prev7) / t.prev7) * 100),
      zeroResultRate: t.last28 ? _zero / t.last28 : 0,
      uniqueSearchers: _users.size || t.last28,
    }))
    .sort((a, b) => b.last7 - a.last7 || b.last28 - a.last28);
}

/** Fast-growing terms: real volume this week and clearly up on last week. */
export function fastGrowingTrends(terms: DemandTerm[], limit = 6): DemandTerm[] {
  return terms
    .filter((t) => t.last7 >= 3 && t.growthPct >= 50)
    .sort((a, b) => b.growthPct * Math.log2(1 + b.last7) - a.growthPct * Math.log2(1 + a.last7))
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Recommendations
// ---------------------------------------------------------------------------

export type Severity = "critical" | "warning" | "info";

export interface RestockAlert {
  id: string;
  productId: string;
  productName: string;
  stock: number;
  /** Units sold per day over the last 14 days. */
  velocity: number;
  daysOfCover: number | null;
  demandSignals: number;
  suggestedQty: number;
  severity: Severity;
  reason: string;
}

export interface PriceSuggestion {
  id: string;
  productId: string;
  productName: string;
  currentPrice: number;
  suggestedPrice: number;
  marketMedian: number;
  comparables: number;
  direction: "lower" | "raise";
  confidence: "high" | "medium" | "low";
  reason: string;
}

export interface BundleSuggestion {
  id: string;
  productIds: [string, string];
  names: [string, string];
  /** How many times the pair was bought together / searched by the same student. */
  coPurchases: number;
  coSearches: number;
  discountPct: number;
  bundlePrice: number;
  reason: string;
}

export interface UnmetDemand {
  id: string;
  query: string;
  label: string;
  searches: number;
  zeroResultRate: number;
  growthPct: number;
}

function velocityFor(productId: string, orders: OrderInput[], now: number): number {
  let units = 0;
  for (const o of orders) {
    if (now - o.createdAt > 14 * DAY || ["cancelled", "refunded"].includes(o.status)) continue;
    for (const it of o.items) if (it.productId === productId) units += it.qty;
  }
  return units / 14;
}

function demandFor(p: CatalogProduct, terms: DemandTerm[]): number {
  return terms.filter((t) => matchStrength(t.query, p.name) >= 0.5).reduce((a, t) => a + t.last7, 0);
}

export function restockAlerts(products: CatalogProduct[], orders: OrderInput[], terms: DemandTerm[], now: number): RestockAlert[] {
  const out: RestockAlert[] = [];
  for (const p of products) {
    const velocity = velocityFor(p.id, orders, now);
    const signals = demandFor(p, terms);
    // Expected daily demand: observed sales plus a conversion share of search interest.
    const expected = velocity + (signals / 7) * 0.15;
    const daysOfCover = expected > 0 ? p.stock / expected : null;
    let severity: Severity | null = null;
    if (p.stock === 0 && (velocity > 0 || signals > 0)) severity = "critical";
    else if (daysOfCover !== null && daysOfCover < 7) severity = "critical";
    else if (daysOfCover !== null && daysOfCover < 14) severity = "warning";
    else if (p.stock <= 5 && signals >= 3) severity = "warning";
    if (!severity) continue;
    const target = Math.ceil(expected * 21); // three weeks of cover
    const suggestedQty = Math.max(target - p.stock, signals > 0 ? 5 : 1);
    out.push({
      id: `restock:${p.id}`,
      productId: p.id,
      productName: p.name,
      stock: p.stock,
      velocity: Math.round(velocity * 100) / 100,
      daysOfCover: daysOfCover === null ? null : Math.round(daysOfCover * 10) / 10,
      demandSignals: signals,
      suggestedQty,
      severity,
      reason:
        p.stock === 0
          ? `Out of stock with ${signals} matching searches this week.`
          : `${p.stock} left · ~${daysOfCover === null ? "∞" : Math.round(daysOfCover)} days of cover at current demand${signals ? ` (${signals} searches this week)` : ""}.`,
    });
  }
  const rank = { critical: 0, warning: 1, info: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || (a.daysOfCover ?? 0) - (b.daysOfCover ?? 0));
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Compares each product with similar listings from other stores. */
export function priceSuggestions(mine: CatalogProduct[], market: CatalogProduct[], terms: DemandTerm[]): PriceSuggestion[] {
  const out: PriceSuggestion[] = [];
  for (const p of mine) {
    const peers = market.filter(
      (m) => m.storeId !== p.storeId && m.category === p.category && (matchStrength(p.name, m.name) >= 0.34 || matchStrength(m.name, p.name) >= 0.34),
    );
    // Without two close matches, fall back to the whole category only when it is broad
    // enough for a median to mean something (and flag it as low confidence).
    const category = market.filter((m) => m.storeId !== p.storeId && m.category === p.category);
    const pool = peers.length >= 2 ? peers : category.length >= 5 ? category : [];
    if (pool.length < 2) continue;
    const med = median(pool.map((m) => m.price));
    const ratio = p.price / med;
    const signals = demandFor(p, terms);
    const confidence = peers.length >= 4 ? "high" : peers.length >= 2 ? "medium" : "low";
    if (ratio > 1.12) {
      const suggested = Math.round(med * 1.03);
      out.push({
        id: `price:${p.id}`, productId: p.id, productName: p.name, currentPrice: p.price, suggestedPrice: suggested,
        marketMedian: Math.round(med), comparables: pool.length, direction: "lower", confidence,
        reason: `${Math.round((ratio - 1) * 100)}% above the market median of ${pool.length} similar listings${signals ? `; ${signals} buyers searched for it this week` : ""}.`,
      });
    } else if (ratio < 0.88 && signals >= 3 && p.stock <= 20) {
      const suggested = Math.round(med * 0.97);
      out.push({
        id: `price:${p.id}`, productId: p.id, productName: p.name, currentPrice: p.price, suggestedPrice: suggested,
        marketMedian: Math.round(med), comparables: pool.length, direction: "raise", confidence,
        reason: `Priced ${Math.round((1 - ratio) * 100)}% under market with strong demand (${signals} searches) and limited stock — room to raise margin.`,
      });
    }
  }
  return out.sort((a, b) => Math.abs(b.currentPrice - b.suggestedPrice) - Math.abs(a.currentPrice - a.suggestedPrice));
}

/** Category pairs that sell together in campus life, used when order history is thin. */
const AFFINITY: [string, string][] = [
  ["Laptops", "Electronics"],
  ["Phones", "Electronics"],
  ["Laptops", "School Supplies"],
  ["Home Appliances", "Furniture"],
  ["Fashion", "Shoes"],
  ["Gaming", "Electronics"],
];

export function bundleSuggestions(mine: CatalogProduct[], orders: OrderInput[], logs: DemandLogInput[], limit = 4): BundleSuggestion[] {
  const ids = new Set(mine.map((p) => p.id));
  const byId = new Map(mine.map((p) => [p.id, p]));
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const co = new Map<string, number>();
  for (const o of orders) {
    const inOrder = [...new Set(o.items.map((i) => i.productId).filter((id) => ids.has(id)))];
    for (let i = 0; i < inOrder.length; i++) for (let j = i + 1; j < inOrder.length; j++) {
      const k = pairKey(inOrder[i], inOrder[j]);
      co.set(k, (co.get(k) ?? 0) + 1);
    }
  }
  // Same student searching for both products within a day.
  const search = new Map<string, number>();
  const byUser = new Map<string, DemandLogInput[]>();
  for (const l of logs) if (l.userId) byUser.set(l.userId, [...(byUser.get(l.userId) ?? []), l]);
  for (const userLogs of byUser.values()) {
    const hits = new Map<string, number>();
    for (const l of userLogs) for (const p of mine) if (matchStrength(l.searchQuery, p.name) >= 0.5) hits.set(p.id, l.createdAt);
    const hit = [...hits.keys()];
    for (let i = 0; i < hit.length; i++) for (let j = i + 1; j < hit.length; j++) {
      if (Math.abs(hits.get(hit[i])! - hits.get(hit[j])!) <= DAY) {
        const k = pairKey(hit[i], hit[j]);
        search.set(k, (search.get(k) ?? 0) + 1);
      }
    }
  }
  const candidates = new Map<string, { score: number; coP: number; coS: number; affinity: boolean }>();
  for (const [k, n] of co) candidates.set(k, { score: n * 3, coP: n, coS: 0, affinity: false });
  for (const [k, n] of search) {
    const c = candidates.get(k) ?? { score: 0, coP: 0, coS: 0, affinity: false };
    candidates.set(k, { ...c, score: c.score + n * 2, coS: n });
  }
  for (const a of mine) for (const b of mine) {
    if (a.id >= b.id) continue;
    if (AFFINITY.some(([x, y]) => (a.category === x && b.category === y) || (a.category === y && b.category === x))) {
      const k = pairKey(a.id, b.id);
      const c = candidates.get(k) ?? { score: 0, coP: 0, coS: 0, affinity: false };
      candidates.set(k, { ...c, score: c.score + 1, affinity: true });
    }
  }
  return [...candidates.entries()]
    .sort((x, y) => y[1].score - x[1].score)
    .slice(0, limit)
    .map(([k, c]) => {
      const [a, b] = k.split("|").map((id) => byId.get(id)!);
      const discountPct = c.coP >= 3 ? 5 : c.coP + c.coS >= 2 ? 8 : 10;
      const total = a.price + b.price;
      return {
        id: `bundle:${k}`,
        productIds: [a.id, b.id] as [string, string],
        names: [a.name, b.name] as [string, string],
        coPurchases: c.coP,
        coSearches: c.coS,
        discountPct,
        bundlePrice: Math.round(total * (1 - discountPct / 100)),
        reason: c.coP
          ? `Bought together ${c.coP}× in the last weeks${c.coS ? ` and searched together by ${c.coS} students` : ""}.`
          : c.coS
            ? `${c.coS} students searched for both within a day.`
            : `${a.category} and ${b.category} are commonly bought together by students.`,
      };
    });
}

export function unmetDemand(terms: DemandTerm[], mine: CatalogProduct[], limit = 6): UnmetDemand[] {
  return terms
    .filter((t) => t.last28 >= 3 && t.zeroResultRate >= 0.4 && !mine.some((p) => matchStrength(t.query, p.name) >= 0.5))
    .sort((a, b) => b.last28 * b.zeroResultRate - a.last28 * a.zeroResultRate)
    .slice(0, limit)
    .map((t) => ({ id: `unmet:${t.query}`, query: t.query, label: t.label, searches: t.last28, zeroResultRate: t.zeroResultRate, growthPct: t.growthPct }));
}

export interface IntelligenceReport {
  generatedAt: number;
  campus: string;
  terms: DemandTerm[];
  trends: DemandTerm[];
  restock: RestockAlert[];
  pricing: PriceSuggestion[];
  bundles: BundleSuggestion[];
  unmet: UnmetDemand[];
  totals: { searches7: number; searchesPrev7: number; uniqueTerms: number };
}

export function buildReport(input: {
  logs: DemandLogInput[];
  mine: CatalogProduct[];
  market: CatalogProduct[];
  orders: OrderInput[];
  campus: string;
  now: number;
}): IntelligenceReport {
  const terms = aggregateDemand(input.logs, input.now, input.campus);
  return {
    generatedAt: input.now,
    campus: input.campus,
    terms,
    trends: fastGrowingTrends(terms),
    restock: restockAlerts(input.mine, input.orders, terms, input.now),
    pricing: priceSuggestions(input.mine, input.market, terms),
    bundles: bundleSuggestions(input.mine, input.orders, input.logs),
    unmet: unmetDemand(terms, input.mine),
    totals: {
      searches7: terms.reduce((a, t) => a + t.last7, 0),
      searchesPrev7: terms.reduce((a, t) => a + t.prev7, 0),
      uniqueTerms: terms.length,
    },
  };
}

/** Synthetic 28-day search history for demo mode (deterministic per campus). */
export function demoDemandLogs(campus: string, now: number): DemandLogInput[] {
  const plan: [string, number, number, number][] = [
    // query, searches last week, searches the week before, zero-result share
    ["Lenovo IdeaPad", 14, 6, 0.2],
    ["HP Charger", 11, 9, 0.1],
    ["Casio fx-991EX Calculator", 9, 2, 0.7],
    ["Single Bed Mattress", 7, 6, 0.6],
    ["Rechargeable Standing Fan", 12, 3, 0.1],
    ["Power Bank 20000mAh", 10, 4, 0.1],
    ["Lab Coat", 5, 1, 0.8],
    ["Samsung Galaxy", 6, 7, 0.1],
    ["Induction Cooker", 4, 1, 0.9],
    ["Noise Cancelling Headphones", 5, 3, 0.2],
  ];
  let seed = [...campus].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const out: DemandLogInput[] = [];
  plan.forEach(([q, last, prev, zero], qi) => {
    const push = (n: number, minAge: number) => {
      for (let i = 0; i < n; i++) {
        out.push({
          searchQuery: q,
          campus,
          resultsCount: rnd() < zero ? 0 : 1 + Math.floor(rnd() * 5),
          userId: `demo_student_${(qi * 7 + i) % 23}`,
          createdAt: now - (minAge + rnd() * 6.9) * DAY,
        });
      }
    };
    push(last, 0);
    push(prev, 7);
    push(Math.round(prev * 0.8), 14);
  });
  return out;
}
