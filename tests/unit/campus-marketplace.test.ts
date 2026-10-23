// Part 1, phase 2 (live mode): one marketplace for everyone. Mall products and
// student listings share one list; the campus filter shows items without a
// campus under every campus and items with one only at their campus; student
// listings carry a plain (unverified) "Student seller" label; an empty list is
// never blank. Supabase is stubbed (no session, empty tables).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { renderWithLiveSnapshots } from "../liveSnapshots";
import { campusOptions, filterByCampus, inCampus } from "@/lib/naflis/campusFilter";
import { mapDbProduct } from "@/lib/naflis/mapProduct";

vi.mock("@/lib/supabase", () => {
  type Result = { data: unknown; error: null };
  type Chain = {
    select: () => Chain;
    eq: () => Chain;
    in: () => Chain;
    order: () => Chain;
    maybeSingle: () => Promise<Result>;
    single: () => Promise<Result>;
    then: (res: (r: Result) => unknown, rej?: (e: unknown) => unknown) => Promise<unknown>;
  };
  const chain = (): Chain => {
    const result = (): Result => ({ data: [], error: null });
    const c: Chain = {
      select: () => c,
      eq: () => c,
      in: () => c,
      order: () => c,
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => ({ data: null, error: null }),
      then: (res, rej) => Promise.resolve(result()).then(res, rej),
    };
    return c;
  };
  return {
    supabase: {
      auth: {
        getSession: async () => ({ data: { session: null } }),
        getUser: async () => ({ data: { user: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
      from: () => chain(),
      rpc: async () => ({ data: null, error: null }),
    },
  };
});

const vendors = { status: "approved", store_name: "Seller", logo_url: null, description: null };
const row = (
  id: string,
  title: string,
  listing_type: "mall" | "student",
  campus: string | null,
) => ({
  id,
  vendor_id: `v-${id}`,
  title,
  description: "",
  price: 50,
  stock: 1,
  category: "Home & Kitchen",
  images: [],
  listing_type,
  campus,
  item_condition: listing_type === "student" ? "Like New" : null,
  purchase_config: {},
  created_at: "2026-10-20T00:00:00Z",
  vendors,
});
const ROWS = [
  row("p-mall", "Anywhere kettle", "mall", null),
  row("p-ug", "Legon desk lamp", "student", "UG - Legon"),
  row("p-knust", "Kumasi calculator", "student", "KNUST - Kumasi"),
];

describe("campus rules", () => {
  it("no campus: shown under every campus; a campus: only there", () => {
    expect(inCampus({}, "UG - Legon")).toBe(true);
    expect(inCampus({ campus: null }, "KNUST - Kumasi")).toBe(true);
    expect(inCampus({ campus: "UG - Legon" }, "UG - Legon")).toBe(true);
    expect(inCampus({ campus: "UG - Legon" }, "KNUST - Kumasi")).toBe(false);
    expect(inCampus({ campus: "UG - Legon" }, null)).toBe(true);
  });

  it("options are the campuses that have listings", () => {
    const items = ROWS.map((r) => mapDbProduct(r));
    expect(campusOptions(items)).toEqual(["KNUST - Kumasi", "UG - Legon"]);
    expect(filterByCampus(items, "UG - Legon").map((p) => p.id)).toEqual(["p-mall", "p-ug"]);
  });

  it("maps the listing type, campus and condition from the products row", () => {
    const [mall, ug] = ROWS.map((r) => mapDbProduct(r));
    expect(mall).toMatchObject({ listingType: "mall", campus: undefined });
    expect(ug).toMatchObject({
      listingType: "student",
      campus: "UG - Legon",
      condition: "Like New",
    });
  });
});

let m: {
  routeTree: (typeof import("@/routeTree.gen"))["routeTree"];
  useNaflis: (typeof import("@/lib/naflis/store"))["useNaflis"];
  mapDbProduct: (typeof import("@/lib/naflis/mapProduct"))["mapDbProduct"];
  resetSessionReady: (typeof import("@/lib/sessionReady"))["resetSessionReady"];
};

beforeAll(async () => {
  vi.stubEnv("VITE_APP_MODE", "live");
  vi.resetModules();
  m = {
    routeTree: (await import("@/routeTree.gen")).routeTree,
    useNaflis: (await import("@/lib/naflis/store")).useNaflis,
    mapDbProduct: (await import("@/lib/naflis/mapProduct")).mapDbProduct,
    resetSessionReady: (await import("@/lib/sessionReady")).resetSessionReady,
  };
}, 60_000); // a fresh import of the whole route tree

// Renders must see the store as set by each test (see liveSnapshots).
const restoreSnapshots = renderWithLiveSnapshots();
afterAll(() => {
  restoreSnapshots();
  vi.unstubAllEnvs();
  vi.resetModules();
});

beforeEach(() => {
  localStorage.clear();
  m.useNaflis.getState().signOut();
  m.resetSessionReady();
  m.useNaflis.setState({ products: ROWS.map((r) => m.mapDbProduct(r)), mallCampus: undefined });
});

async function visit(p: string) {
  const queryClient = new QueryClient();
  // Home's fetch has already run: it put the store's products in place.
  queryClient.setQueryData(["home-products"], m.useNaflis.getState().products);
  const router = createRouter({
    routeTree: m.routeTree,
    history: createMemoryHistory({ initialEntries: [p] }),
    context: { queryClient },
    isServer: false,
  });
  await router.load();
  const html = renderToString(
    React.createElement(RouterProvider, { router } as Parameters<typeof RouterProvider>[0]),
  ).replace(/<!-- -->/g, "");
  return { html, pathname: router.state.location.pathname };
}

const PAGES = ["/", "/buyer", "/buyer/search"];

describe("one marketplace, filtered by campus", () => {
  it.each(PAGES)(
    "%s: all campuses shows mall products and student listings together",
    async (p) => {
      const { html, pathname } = await visit(p);
      expect(pathname).toBe(p);
      for (const t of ["Anywhere kettle", "Legon desk lamp", "Kumasi calculator"])
        expect(html).toContain(t);
      expect(html).toContain("All campuses");
    },
  );

  it.each(PAGES)(
    "%s: a campus shows its listings and the campus-less items, nothing from elsewhere",
    async (p) => {
      m.useNaflis.setState({ mallCampus: "UG - Legon" });
      const { html } = await visit(p);
      expect(html).toContain("Anywhere kettle");
      expect(html).toContain("Legon desk lamp");
      expect(html).not.toContain("Kumasi calculator");
    },
  );

  it('student listings say "Student seller", plainly; mall products don\'t', async () => {
    m.useNaflis.setState({ products: [m.mapDbProduct(ROWS[1])] });
    const { html } = await visit("/");
    expect(html).toContain("Student seller");
    expect(html).not.toMatch(/Verified/i);
    m.useNaflis.setState({ products: [m.mapDbProduct(ROWS[0])] });
    expect((await visit("/")).html).not.toContain("Student seller");
  });
});

describe("never blank", () => {
  it.each(PAGES)(
    "%s with nothing for sale: a friendly empty state with Sell an item",
    async (p) => {
      m.useNaflis.setState({ products: [] });
      const { html } = await visit(p);
      expect(html).toContain("Nothing for sale yet");
      expect(html).toContain("Sell an item");
    },
  );

  it.each(PAGES)(
    "%s with nothing at the chosen campus: offers all campuses and Sell an item",
    async (p) => {
      m.useNaflis.setState({ products: [m.mapDbProduct(ROWS[1])], mallCampus: "KNUST - Kumasi" });
      const { html } = await visit(p);
      expect(html).toContain("Nothing at KNUST - Kumasi yet");
      expect(html).toContain("Show all campuses");
      expect(html).toContain("Sell an item");
    },
  );
});

describe("the wishlist stays signed-in", () => {
  it("signed out, /buyer/wishlist goes to sign-in", async () => {
    expect((await visit("/buyer/wishlist")).pathname).toBe("/login");
  });
});
