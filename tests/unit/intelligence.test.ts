import { describe, expect, it } from "vitest";
import {
  aggregateDemand,
  buildReport,
  bundleSuggestions,
  demoDemandLogs,
  fastGrowingTrends,
  hasFeature,
  matchStrength,
  priceSuggestions,
  restockAlerts,
  unmetDemand,
  type CatalogProduct,
  type DemandLogInput,
} from "@/lib/naflis/intelligence";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 3, 12);
const log = (q: string, daysAgo: number, results = 1, userId?: string, campus = "UG - Legon"): DemandLogInput => ({
  searchQuery: q, campus, resultsCount: results, userId, createdAt: NOW - daysAgo * DAY,
});
const p = (id: string, name: string, category: string, price: number, stock: number, storeId = "s_me"): CatalogProduct => ({ id, name, category, price, stock, storeId });

describe("demand aggregation", () => {
  it("buckets by week, normalises queries and computes growth / zero-result rate", () => {
    const logs = [
      ...Array.from({ length: 6 }, (_, i) => log("Lenovo IdeaPad!", i * 0.5, i < 3 ? 0 : 2, `u${i}`)),
      ...Array.from({ length: 2 }, (_, i) => log("lenovo ideapad", 8 + i)),
      log("lenovo ideapad", 30), // outside the 28-day window
      log("lenovo ideapad", 1, 1, "x", "KNUST - Kumasi"), // other campus
    ];
    const [t] = aggregateDemand(logs, NOW, "UG - Legon");
    expect(t.query).toBe("lenovo ideapad");
    expect(t.last7).toBe(6);
    expect(t.prev7).toBe(2);
    expect(t.last28).toBe(8);
    expect(t.growthPct).toBe(200);
    expect(t.zeroResultRate).toBeCloseTo(3 / 8);
  });

  it("flags only real, fast-growing trends", () => {
    const terms = aggregateDemand(
      [
        ...Array.from({ length: 8 }, () => log("fan", 2)), ...Array.from({ length: 2 }, () => log("fan", 9)),
        ...Array.from({ length: 2 }, () => log("kettle", 2)), // too little volume
        ...Array.from({ length: 5 }, () => log("rice", 2)), ...Array.from({ length: 5 }, () => log("rice", 9)), // flat
      ],
      NOW,
    );
    expect(fastGrowingTrends(terms).map((t) => t.query)).toEqual(["fan"]);
  });
});

describe("recommendations", () => {
  it("raises restock alerts from sales velocity and search demand", () => {
    const mine = [p("a", "20000mAh Power Bank", "Electronics", 320, 3), p("b", "Desk Lamp", "Furniture", 100, 200)];
    const orders = [{ createdAt: NOW - 2 * DAY, status: "completed", items: [{ productId: "a", qty: 7, price: 320 }] }];
    const terms = aggregateDemand(Array.from({ length: 10 }, () => log("power bank 20000mah", 1)), NOW);
    const alerts = restockAlerts(mine, orders, terms, NOW);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ productId: "a", severity: "critical" });
    expect(alerts[0].suggestedQty).toBeGreaterThan(0);
  });

  it("suggests lowering an over-priced listing against close comparables only", () => {
    const mine = [p("h", "Sony Noise Cancelling Headphones", "Electronics", 1980, 30)];
    const market = [
      ...mine,
      p("c1", "JBL Noise Cancelling Headphones", "Electronics", 1390, 5, "s_x"),
      p("c2", "Sony WH Noise Cancelling Headphones", "Electronics", 1450, 5, "s_y"),
      p("pb", "Power Bank", "Electronics", 300, 5, "s_z"), // not comparable
    ];
    const [s] = priceSuggestions(mine, market, []);
    expect(s.direction).toBe("lower");
    expect(s.marketMedian).toBe(1420);
    expect(s.suggestedPrice).toBeLessThan(1980);
    // A lone, unrelated category item is not enough to judge price.
    expect(priceSuggestions(mine, [mine[0], market[3]], [])).toEqual([]);
  });

  it("bundles products bought together, then products searched together", () => {
    const mine = [p("l", "HP Laptop", "Laptops", 7200, 5), p("m", "Wireless Mouse", "Electronics", 120, 50), p("s", "Sofa", "Furniture", 4000, 2)];
    const orders = Array.from({ length: 3 }, (_, i) => ({
      createdAt: NOW - i * DAY, status: "completed", items: [{ productId: "l", qty: 1, price: 7200 }, { productId: "m", qty: 1, price: 120 }],
    }));
    const [b] = bundleSuggestions(mine, orders, []);
    expect(b.productIds.sort()).toEqual(["l", "m"]);
    expect(b.coPurchases).toBe(3);
    expect(b.bundlePrice).toBeLessThan(7320);
  });

  it("surfaces searches that keep finding nothing, unless the seller already stocks it", () => {
    const terms = aggregateDemand(Array.from({ length: 6 }, (_, i) => log("lab coat", i, 0)), NOW);
    expect(unmetDemand(terms, []).map((u) => u.query)).toEqual(["lab coat"]);
    expect(unmetDemand(terms, [p("x", "White Lab Coat", "Fashion", 90, 10)])).toEqual([]);
  });

  it("matches queries to product names by meaningful tokens", () => {
    expect(matchStrength("Casio fx-991EX Calculator", "Casio Scientific Calculator")).toBeGreaterThanOrEqual(0.5);
    expect(matchStrength("the new pro", "Anything")).toBe(0);
  });
});

describe("plans and demo data", () => {
  it("gates features by subscription tier", () => {
    expect(hasFeature("starter", "trends")).toBe(false);
    expect(hasFeature("growth", "restock")).toBe(true);
    expect(hasFeature("growth", "pricing")).toBe(false);
    expect(hasFeature("professional", "bundles")).toBe(true);
  });

  it("demo history is deterministic and yields trends + unmet demand", () => {
    const a = demoDemandLogs("UG - Legon", NOW);
    expect(demoDemandLogs("UG - Legon", NOW)).toEqual(a);
    const r = buildReport({ logs: a, mine: [], market: [], orders: [], campus: "UG - Legon", now: NOW });
    expect(r.trends.length).toBeGreaterThan(0);
    expect(r.unmet.some((u) => u.query.includes("calculator"))).toBe(true);
  });
});
