// Shops task, phase 2: Home lists every approved seller's products in a shuffle
// that is fixed for the session (scrolling, "Show more" and refetches don't
// reorder it); an explicit sort (newest, price low/high) overrides it.
import { describe, expect, it } from "vitest";
import { mallSortSearch, orderProducts, seededShuffle } from "@/lib/naflis/mallOrder";

const items = Array.from({ length: 40 }, (_, i) => ({
  id: `p${i}`,
  price: (i * 37) % 50,
  createdAt: 1_700_000_000_000 + i * 1000,
}));
const ids = (list: { id: string }[]) => list.map((p) => p.id);

describe("seededShuffle", () => {
  it("gives the same order for the same seed", () => {
    expect(ids(seededShuffle(items, 42))).toEqual(ids(seededShuffle(items, 42)));
  });

  it("doesn't depend on the order the items arrive in", () => {
    const reversed = [...items].reverse();
    expect(ids(seededShuffle(reversed, 42))).toEqual(ids(seededShuffle(items, 42)));
  });

  it("actually shuffles, and another seed gives another order", () => {
    const a = ids(seededShuffle(items, 1));
    expect(a).not.toEqual(ids(items));
    expect(a).not.toEqual(ids(seededShuffle(items, 2)));
    expect([...a].sort()).toEqual([...ids(items)].sort());
  });

  it("keeps the items already shown in place when new ones arrive", () => {
    const before = ids(seededShuffle(items.slice(0, 30), 7));
    const after = ids(seededShuffle(items, 7)).filter((id) => before.includes(id));
    expect(after).toEqual(before);
  });

  it("doesn't change the list it's given", () => {
    const copy = ids(items);
    seededShuffle(items, 3);
    expect(ids(items)).toEqual(copy);
  });
});

describe("orderProducts", () => {
  it("defaults to the shuffle", () => {
    expect(ids(orderProducts(items, "mixed", 9))).toEqual(ids(seededShuffle(items, 9)));
  });

  it("a picked sort overrides the shuffle", () => {
    const newest = orderProducts(items, "newest", 9);
    expect(newest[0].id).toBe("p39");
    expect(newest.every((p, i) => i === 0 || newest[i - 1].createdAt >= p.createdAt)).toBe(true);
    const low = orderProducts(items, "price-asc", 9);
    expect(low.every((p, i) => i === 0 || low[i - 1].price <= p.price)).toBe(true);
    const high = orderProducts(items, "price-desc", 9);
    expect(high.every((p, i) => i === 0 || high[i - 1].price >= p.price)).toBe(true);
  });

  it("sorted lists are the same for every seed", () => {
    const bySeed = (seed: number) => orderProducts(items, "price-asc", seed).map((p) => p.price);
    expect(bySeed(1)).toEqual(bySeed(2));
  });
});

describe("?sort=", () => {
  it("accepts the four sorts and ignores anything else", () => {
    expect(mallSortSearch.parse({ sort: "price-desc" })).toEqual({ sort: "price-desc" });
    expect(mallSortSearch.parse({ sort: "cheapest" })).toEqual({ sort: undefined });
    expect(mallSortSearch.parse({})).toEqual({});
  });
});
