// Shops task, phase 5: the Shops pages rendered end to end in live mode.
// The Supabase stub below behaves like the real database for these reads:
// row-level security (visitors see approved shops and their items; an owner
// also sees their own pending shop), the column grants of 20261024120000 (a
// visitor asking for user_id or contact_phone is refused) and the eq filters.
// Page data is loaded through the real services, then each route is rendered.
// Database side of the same rules: supabase/tests/shops_directory.test.sql.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { renderWithLiveSnapshots } from "../liveSnapshots";

type Account = { id: string; email: string };
const OWNER_A = "5a000000-0000-4000-8000-0000000000a1";
const OWNER_B = "5a000000-0000-4000-8000-0000000000b1";
const OWNER_P = "5a000000-0000-4000-8000-0000000000c1";
const OWNER_R = "5a000000-0000-4000-8000-0000000000d1";
const PHONES = ["024 111 0001", "024 111 0002", "024 111 0003", "024 111 0004"];

const VENDORS = [
  {
    id: "v-a",
    user_id: OWNER_A,
    store_name: "Legon Home Goods",
    store_slug: "legon-home-goods-k3f9qz",
    status: "approved",
    contact_phone: PHONES[0],
  },
  {
    id: "v-b",
    user_id: OWNER_B,
    store_name: "Yaw Mensah",
    store_slug: "yaw-mensah-8d2hpa",
    status: "approved",
    contact_phone: PHONES[1],
  },
  {
    id: "v-p",
    user_id: OWNER_P,
    store_name: "Pending Phones",
    store_slug: "pending-phones-aaaaaa",
    status: "pending",
    contact_phone: PHONES[2],
  },
  {
    id: "v-r",
    user_id: OWNER_R,
    store_name: "Rejected Repairs",
    store_slug: "rejected-repairs-bbbbbb",
    status: "rejected",
    contact_phone: PHONES[3],
  },
].map((v) => ({
  description: `${v.store_name} on campus.`,
  logo_url: null,
  subscription_tier: "free",
  created_at: "2026-10-01T00:00:00Z",
  ...v,
}));

const item = (id: string, vendor: string, title: string, price: number, extra: object = {}) => ({
  id,
  vendor_id: vendor,
  title,
  price,
  stock: 3,
  category: "Home & Kitchen",
  images: [],
  description: "",
  listing_type: "mall",
  campus: null,
  ...extra,
});
const PRODUCTS = [
  ...Array.from({ length: 8 }, (_, i) => item(`a-${i}`, "v-a", `Legon kettle ${i}`, 50 + i * 7)),
  ...Array.from({ length: 4 }, (_, i) =>
    item(`b-${i}`, "v-b", `Yaw calculator ${i}`, 30 + i * 11, {
      listing_type: "student",
      campus: "KNUST - Kumasi",
      category: "Electronics",
    }),
  ),
  item("p-0", "v-p", "Pending phone case", 15),
  item("r-0", "v-r", "Rejected screen fix", 99),
].map((p, i) => ({ ...p, created_at: new Date(Date.UTC(2026, 9, 1 + i)).toISOString() }));

const PUBLIC_VENDOR_COLS = [
  "id",
  "store_name",
  "store_slug",
  "description",
  "logo_url",
  "status",
  "subscription_tier",
  "created_at",
];
const state: { account: Account | null; denied: string[]; rpc: unknown[]; selects: string[] } = {
  account: null,
  denied: [],
  rpc: [],
  selects: [],
};

vi.mock("@/lib/supabase", () => {
  type Row = Record<string, unknown>;
  type Result = { data: unknown; error: { message: string; code?: string } | null };
  const uid = () => state.account?.id ?? null;
  // RLS: approved shops for everyone, plus the owner's own shop.
  const vendorVisible = (v: Row) => v.status === "approved" || v.user_id === uid();
  const allowed = (col: string) =>
    PUBLIC_VENDOR_COLS.includes(col) || (col === "user_id" && Boolean(uid()));
  const project = (v: Row, cols: string[]) => Object.fromEntries(cols.map((c) => [c, v[c]]));
  const columns = (list: string) =>
    list
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);

  const chain = (table: string) => {
    let select = "*";
    const filters: [string, unknown][] = [];
    const result = (single: boolean): Result => {
      state.selects.push(`${table}: ${select}`);
      const embed = /vendors(?:!inner)?\(([^)]*)\)/.exec(select);
      const vendorCols = table === "vendors" ? columns(select) : embed ? columns(embed[1]) : [];
      const bad = vendorCols.find((c) => c === "*" || !allowed(c));
      if (bad) {
        state.denied.push(`${table}: ${select}`);
        return { data: null, error: { message: `permission denied (${bad})`, code: "42501" } };
      }
      let rows: Row[];
      if (table === "vendors") {
        rows = VENDORS.filter(vendorVisible)
          .filter((v) => filters.every(([c, val]) => (v as Row)[c] === val))
          .map((v) => project(v, vendorCols));
      } else if (table === "products") {
        rows = PRODUCTS.flatMap((p) => {
          const v = VENDORS.find((x) => x.id === p.vendor_id)!;
          if (!vendorVisible(v)) return [];
          const ok = filters.every(([c, val]) =>
            c.startsWith("vendors.") ? (v as Row)[c.slice(8)] === val : (p as Row)[c] === val,
          );
          return ok ? [{ ...p, vendors: project(v, vendorCols) }] : [];
        });
      } else rows = [];
      return { data: single ? (rows[0] ?? null) : rows, error: null };
    };
    const c = {
      select: (s = "*") => ((select = s), c),
      eq: (col: string, val: unknown) => (filters.push([col, val]), c),
      in: () => c,
      order: () => c,
      maybeSingle: async () => result(true),
      single: async () => result(true),
      then: (res: (r: Result) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(result(false)).then(res, rej),
    };
    return c;
  };
  const user = () =>
    state.account ? { id: state.account.id, email: state.account.email, user_metadata: {} } : null;
  return {
    supabase: {
      auth: {
        getSession: async () => ({ data: { session: user() ? { user: user() } : null } }),
        getUser: async () => ({ data: { user: user() } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
      from: (table: string) => chain(table),
      rpc: async (name: string, args: unknown) => {
        state.rpc.push({ name, args });
        return state.account
          ? { data: PHONES[0], error: null }
          : { data: null, error: { message: "permission denied for function", code: "42501" } };
      },
    },
  };
});

let m: {
  routeTree: (typeof import("@/routeTree.gen"))["routeTree"];
  useNaflis: (typeof import("@/lib/naflis/store"))["useNaflis"];
  sessionReady: (typeof import("@/lib/sessionReady"))["sessionReady"];
  resetSessionReady: (typeof import("@/lib/sessionReady"))["resetSessionReady"];
  sellerApi: typeof import("@/services/sellerApi");
  mallOrder: typeof import("@/lib/naflis/mallOrder");
};

beforeAll(async () => {
  vi.stubEnv("VITE_APP_MODE", "live");
  vi.resetModules();
  m = {
    routeTree: (await import("@/routeTree.gen")).routeTree,
    useNaflis: (await import("@/lib/naflis/store")).useNaflis,
    sessionReady: (await import("@/lib/sessionReady")).sessionReady,
    resetSessionReady: (await import("@/lib/sessionReady")).resetSessionReady,
    sellerApi: await import("@/services/sellerApi"),
    mallOrder: await import("@/lib/naflis/mallOrder"),
  };
}, 60_000); // a fresh import of the whole route tree

const restoreSnapshots = renderWithLiveSnapshots();
afterAll(() => {
  restoreSnapshots();
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function as(account: Account | null) {
  localStorage.clear();
  m.useNaflis.getState().signOut();
  m.resetSessionReady();
  Object.assign(state, { account, denied: [], rpc: [], selects: [] });
  m.useNaflis.setState({ mallCampus: undefined, products: [], stores: [] });
  await m.sessionReady();
}

/** Loads what the page would fetch, through the real services and the stub, then renders it. */
async function visit(p: string) {
  const queryClient = new QueryClient();
  const products = (await m.sellerApi.fetchSellerProducts()) ?? [];
  m.useNaflis.setState({ products });
  queryClient.setQueryData(["home-products"], products);
  queryClient.setQueryData(["shops"], await m.sellerApi.fetchApprovedShops());
  const slug = /^\/shops\/([^/?]+)/.exec(p)?.[1];
  if (slug) queryClient.setQueryData(["shop", slug], await m.sellerApi.fetchApprovedShop(slug));
  // The product page shows its seller from the store, then refreshes it with this call.
  const productId = /^\/buyer\/product\/([^/?]+)/.exec(p)?.[1];
  const one = productId ? await m.sellerApi.fetchSellerProduct(productId) : null;
  if (one?.vendor) m.useNaflis.setState({ stores: [one.vendor] });
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

/** Product ids in the order the page lists them. */
const productOrder = (html: string) => [
  ...new Set([...html.matchAll(/href="\/buyer\/product\/([^"]+)"/g)].map((x) => x[1])),
];
const shopNames = (html: string) =>
  [...html.matchAll(/<h2 class="truncate[^"]*">([^<]+)<\/h2>/g)].map((x) =>
    x[1].replace(/&#x27;/g, "'"),
  );

const BUYER: Account = { id: "5a000000-0000-4000-8000-0000000000e1", email: "buyer@test.invalid" };
const PENDING_OWNER: Account = { id: OWNER_P, email: "pending@test.invalid" };

describe("only approved shops are visible", () => {
  it.each([
    ["a visitor", null],
    ["a signed-in buyer", BUYER],
    ["the pending shop's owner (whose own row the database does show)", PENDING_OWNER],
  ] as const)("/shops for %s lists the two approved shops", async (_who, account) => {
    await as(account);
    const { html } = await visit("/shops");
    expect(shopNames(html)).toEqual(["Legon Home Goods", "Yaw Mensah"]);
    expect(html).not.toContain("Pending Phones");
    expect(html).not.toContain("Rejected Repairs");
  });

  it("the stub really shows the owner their pending shop, so the explicit filter is what hides it", async () => {
    await as(PENDING_OWNER);
    const { supabase } = await import("@/lib/supabase");
    const { data } = await supabase!.from("vendors").select("id, store_name");
    expect((data as { store_name: string }[]).map((v) => v.store_name)).toContain("Pending Phones");
  });

  it.each([
    ["pending-phones-aaaaaa", PENDING_OWNER],
    ["pending-phones-aaaaaa", null],
    ["rejected-repairs-bbbbbb", null],
    ["no-such-shop", null],
  ] as const)("/shops/%s gets the friendly not-found page", async (slug, account) => {
    await as(account);
    const { html } = await visit(`/shops/${slug}`);
    expect(html).toContain("We couldn&#x27;t find that shop");
    expect(html).toContain('href="/shops"');
    expect(html).not.toMatch(/Pending phone case|Rejected screen fix/);
  });

  it("a pending or rejected shop's items appear nowhere in the mall", async () => {
    await as(PENDING_OWNER);
    for (const p of ["/", "/buyer", "/shops/legon-home-goods-k3f9qz"]) {
      const { html } = await visit(p);
      expect(html).not.toContain("Pending phone case");
      expect(html).not.toContain("Rejected screen fix");
    }
  });
});

describe("a shop page shows only its own products", () => {
  it("Legon Home Goods: its 8 items, none of Yaw's", async () => {
    await as(null);
    const { html } = await visit("/shops/legon-home-goods-k3f9qz");
    expect(html).toContain("Legon Home Goods");
    expect(productOrder(html).sort()).toEqual(
      PRODUCTS.filter((p) => p.vendor_id === "v-a")
        .map((p) => p.id)
        .sort(),
    );
    expect(html).not.toContain("Yaw calculator");
  });

  it("Yaw Mensah: its 4 items, the grey Student seller label, its campus", async () => {
    await as(null);
    const { html } = await visit("/shops/yaw-mensah-8d2hpa");
    expect(productOrder(html).sort()).toEqual(["b-0", "b-1", "b-2", "b-3"]);
    expect(html).not.toContain("Legon kettle");
    expect(html).toMatch(/bg-muted[^"]*">Student seller</);
    expect(html).toContain("KNUST - Kumasi");
  });

  it("?sort=price-asc orders the shop's items by price", async () => {
    await as(null);
    const { html } = await visit("/shops/legon-home-goods-k3f9qz?sort=price-asc");
    expect(productOrder(html)).toEqual(["a-0", "a-1", "a-2", "a-3", "a-4", "a-5", "a-6", "a-7"]);
  });

  it("the product page links the seller's name to their shop", async () => {
    await as(null);
    const { html } = await visit("/buyer/product/b-2");
    expect(html).toMatch(/<a [^>]*href="\/shops\/yaw-mensah-8d2hpa"[^>]*>Yaw Mensah<\/a>/);
  });
});

describe("the Home shuffle is stable within a session", () => {
  it("rendering Home again in the same session gives the same order, and it isn't newest-first", async () => {
    await as(null);
    const first = productOrder((await visit("/")).html);
    expect(first).toHaveLength(12);
    expect(productOrder((await visit("/")).html)).toEqual(first);
    expect(productOrder((await visit("/buyer")).html)).toEqual(first);
    const newest = [...PRODUCTS.slice(0, 12)]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((p) => p.id);
    expect(first).not.toEqual(newest);
  });

  it("a picked sort overrides it", async () => {
    await as(null);
    const order = productOrder((await visit("/?sort=newest")).html);
    const newest = [...PRODUCTS.slice(0, 12)]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((p) => p.id);
    expect(order).toEqual(newest);
  });

  it("the seed survives a reload (sessionStorage); a new session gets a new one", async () => {
    const seed = m.mallOrder.sessionShuffleSeed();
    expect(sessionStorage.getItem("naflis.mallSeed")).toBe(String(seed));
    vi.resetModules(); // a reload in the same tab: fresh modules, same sessionStorage
    expect((await import("@/lib/naflis/mallOrder")).sessionShuffleSeed()).toBe(seed);
    sessionStorage.clear(); // a new tab or session
    vi.resetModules();
    expect((await import("@/lib/naflis/mallOrder")).sessionShuffleSeed()).not.toBe(seed);
  });
});

describe("signed out: no phone numbers or owner ids", () => {
  const OWNERS = [OWNER_A, OWNER_B, OWNER_P, OWNER_R];

  it.each([
    "/shops",
    "/shops/legon-home-goods-k3f9qz",
    "/shops/yaw-mensah-8d2hpa",
    "/",
    "/buyer/product/a-1",
  ])("%s: none in the page, none requested, nothing refused", async (p) => {
    await as(null);
    const { html } = await visit(p);
    for (const phone of PHONES) expect(html).not.toContain(phone);
    for (const owner of OWNERS) {
      expect(html).not.toContain(owner);
      expect(html).not.toContain(owner.slice(0, 8));
    }
    expect(state.denied).toEqual([]);
    expect(state.selects.join("\n")).not.toMatch(/user_id|contact_phone|vendors(!inner)?\(\*\)/);
    expect(state.rpc).toEqual([]);
  });

  it("a shop page offers sign-in to contact the seller", async () => {
    await as(null);
    const { html } = await visit("/shops/legon-home-goods-k3f9qz");
    expect(html).toContain("Sign in to contact seller");
  });

  it("signed in, the shop page offers Contact seller and still shows no number until asked", async () => {
    await as(BUYER);
    const { html } = await visit("/shops/legon-home-goods-k3f9qz");
    expect(html).toContain("Contact seller");
    expect(html).not.toContain("Sign in to contact seller");
    for (const phone of PHONES) expect(html).not.toContain(phone);
    expect(state.rpc).toEqual([]);
  });
});
