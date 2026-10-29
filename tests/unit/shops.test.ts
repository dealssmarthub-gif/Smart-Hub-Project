// Shops task, phase 3: the /shops directory and shop pages. Approved shops only,
// public columns only (never the owner id or phone), and every card fact
// (campus, category, item count, "Student seller") comes from the shop's items.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Product } from "@/lib/naflis/store";

const calls: { table: string; columns?: string; filters: [string, unknown][] }[] = [];
let rows: unknown[] = [];
vi.mock("@/lib/supabase", () => {
  const from = (table: string) => {
    const call: (typeof calls)[number] = { table, filters: [] };
    calls.push(call);
    const result = () => ({ data: rows, error: null });
    const chain = {
      select: (columns: string) => ((call.columns = columns), chain),
      eq: (col: string, val: unknown) => (call.filters.push([col, val]), chain),
      order: () => chain,
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (res: (r: unknown) => unknown) => Promise.resolve(result()).then(res),
    };
    return chain;
  };
  return { supabase: { from } };
});

const { fetchApprovedShop, fetchApprovedShops } = await import("@/services/sellerApi");
const { campusLabel, filterShops, itemCountLabel, shopFacts } = await import("@/lib/naflis/shops");

const p = (id: string, storeId: string, extra: Partial<Product> = {}) =>
  ({ id, storeId, category: "Books", price: 10, listingType: "mall", ...extra }) as Product;
const products = [
  p("1", "a", { category: "Phones", campus: "UG - Legon" }),
  p("2", "a", { category: "Phones" }),
  p("3", "a", { category: "Books", campus: "KNUST - Kumasi" }),
  p("4", "b", { listingType: "student", campus: "KNUST - Kumasi" }),
];
const shops = [
  { id: "a", name: "Ama's Phone Corner", description: "Chargers and cases" },
  { id: "b", name: "Yaw Mensah", description: "" },
  { id: "c", name: "Brand New Shop", description: "" },
];

describe("shop facts come from the shop's items", () => {
  it("campuses, most common category, count and the student label", () => {
    expect(shopFacts("a", products)).toEqual({
      campuses: ["KNUST - Kumasi", "UG - Legon"],
      category: "Phones",
      productCount: 3,
      studentSeller: false,
    });
    expect(shopFacts("b", products).studentSeller).toBe(true);
    expect(shopFacts("c", products)).toEqual({
      campuses: [],
      category: null,
      productCount: 0,
      studentSeller: false,
    });
  });

  it("a category tie goes to the name that sorts first", () => {
    const tie = [p("x", "t", { category: "Phones" }), p("y", "t", { category: "Books" })];
    expect(shopFacts("t", tie).category).toBe("Books");
  });

  it("labels", () => {
    expect(campusLabel([])).toBe("All campuses");
    expect(campusLabel(["UG - Legon"])).toBe("UG - Legon");
    expect(campusLabel(["KNUST - Kumasi", "UG - Legon", "UCC"])).toBe("KNUST - Kumasi +2");
    expect([0, 1, 5].map(itemCountLabel)).toEqual(["No items yet", "1 item", "5 items"]);
  });
});

describe("directory filter", () => {
  const names = (list: { name: string }[]) => list.map((s) => s.name);

  it("search matches name, description and the shop's categories", () => {
    expect(names(filterShops(shops, products, "yaw", null))).toEqual(["Yaw Mensah"]);
    expect(names(filterShops(shops, products, "chargers", null))).toEqual(["Ama's Phone Corner"]);
    expect(names(filterShops(shops, products, "books", null))).toEqual([
      "Ama's Phone Corner",
      "Yaw Mensah",
    ]);
    expect(filterShops(shops, products, "  ", null)).toHaveLength(3);
  });

  it("campus: the mall's rule (items with no campus show everywhere); empty shops only under all", () => {
    expect(names(filterShops(shops, products, "", "KNUST - Kumasi"))).toEqual([
      "Ama's Phone Corner",
      "Yaw Mensah",
    ]);
    expect(names(filterShops(shops, products, "", "UCC"))).toEqual(["Ama's Phone Corner"]);
    expect(names(filterShops(shops, products, "", null))).toContain("Brand New Shop");
  });
});

describe("shop queries", () => {
  beforeEach(() => {
    calls.length = 0;
    rows = [];
  });

  const privateColumn = /user_id|contact_phone|\*/;

  it("the directory asks for approved shops and public columns only", async () => {
    rows = [
      { id: "a", store_name: "A", store_slug: "a-123456", description: null, logo_url: null },
      { id: "z", store_name: "No slug", store_slug: null, description: null, logo_url: null },
    ];
    const list = await fetchApprovedShops();
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("vendors");
    expect(calls[0].columns).not.toMatch(privateColumn);
    expect(calls[0].filters).toContainEqual(["status", "approved"]);
    expect(list).toEqual([
      { id: "a", name: "A", slug: "a-123456", description: "", logoUrl: null },
    ]);
  });

  it("a shop page looks the slug up among approved shops only", async () => {
    expect(await fetchApprovedShop("pending-shop")).toBeNull();
    expect(calls[0].columns).not.toMatch(privateColumn);
    expect(calls[0].filters).toEqual([
      ["store_slug", "pending-shop"],
      ["status", "approved"],
    ]);
  });
});
