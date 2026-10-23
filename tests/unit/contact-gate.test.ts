// Part 1, phase 4 (live mode): browsing stays open, contacting a seller needs
// sign-in, and the app never reads a seller's phone or owner id from the
// vendors table: the phone comes only from naflis_vendor_contact. The stub
// below enforces the column grants of migration 20261024120000, so a query
// that asks anonymously for contact_phone, user_id or vendors(*) fails here as
// it will on the real database. Database side: contact_phone_private.test.sql.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { renderWithLiveSnapshots } from "../liveSnapshots";

const PHONE = "024 111 2222";
type Account = { id: string; email: string; roles: string[] };
const state: {
  account: Account | null;
  rpc: { name: string; args: unknown }[];
  rpcReply: (args: { p_vendor: string }) => {
    data: unknown;
    error: { message: string; code?: string } | null;
  };
  denied: string[];
} = { account: null, rpc: [], rpcReply: () => ({ data: PHONE, error: null }), denied: [] };

const PUBLIC_VENDOR_COLS = new Set([
  "id",
  "store_name",
  "store_slug",
  "description",
  "logo_url",
  "status",
  "subscription_tier",
  "created_at",
]);
const VENDOR = {
  id: "v-approved",
  store_name: "Legon Home Goods",
  status: "approved",
  logo_url: null,
  description: null,
};
const PRODUCT = {
  id: "p-1",
  vendor_id: "v-approved",
  title: "Electric kettle 1.7L",
  description: "Stainless steel.",
  price: 180,
  stock: 2,
  category: "Home & Kitchen",
  images: [],
  listing_type: "mall",
  campus: null,
  created_at: "2026-10-20T00:00:00Z",
};

/** Would the new grants allow this select? (null = allowed, else the column refused.) */
function refused(table: string, select: string): string | null {
  const signedIn = Boolean(state.account);
  const check = (cols: string[]) => {
    for (const raw of cols) {
      const c = raw.trim().split(/[:\s]/)[0];
      if (!c || c.includes("(")) continue;
      if (c === "*") return "*";
      if (c === "contact_phone") return c;
      if (c === "user_id" && !signedIn) return c;
      if (!PUBLIC_VENDOR_COLS.has(c) && c !== "user_id") return c;
    }
    return null;
  };
  if (table === "vendors") return check(select.replace(/\w+\([^)]*\)/g, "").split(","));
  const embed = /vendors(?:!inner)?\(([^)]*)\)/.exec(select);
  return embed ? check(embed[1].split(",")) : null;
}

vi.mock("@/lib/supabase", () => {
  type Result = { data: unknown; error: { message: string; code?: string } | null };
  type Chain = {
    select: (s?: string) => Chain;
    eq: () => Chain;
    in: () => Chain;
    order: () => Chain;
    insert: () => Chain;
    update: () => Chain;
    maybeSingle: () => Promise<Result>;
    single: () => Promise<Result>;
    then: (res: (r: Result) => unknown, rej?: (e: unknown) => unknown) => Promise<unknown>;
  };
  const chain = (table: string): Chain => {
    let select = "";
    const rows = (): unknown[] => {
      const a = state.account;
      if (table === "products") return [{ ...PRODUCT, vendors: VENDOR }];
      if (table === "vendors")
        return a
          ? [
              {
                ...VENDOR,
                user_id: a.id,
                created_at: "2026-10-01T00:00:00Z",
                products: [{ count: 1 }],
              },
            ]
          : [VENDOR];
      if (table === "profiles" && a)
        return [{ id: a.id, email: a.email, full_name: "Account", role: "buyer", roles: a.roles }];
      return [];
    };
    const result = (single: boolean): Result => {
      const bad = refused(table, select);
      if (bad) {
        state.denied.push(`${table}: ${select}`);
        return {
          data: null,
          error: { message: `permission denied for table vendors (${bad})`, code: "42501" },
        };
      }
      const r = rows();
      return { data: single ? (r[0] ?? null) : r, error: null };
    };
    const c: Chain = {
      select: (s = "*") => ((select = s), c),
      eq: () => c,
      in: () => c,
      order: () => c,
      insert: () => c,
      update: () => c,
      maybeSingle: async () => result(true),
      single: async () => result(true),
      then: (res, rej) => Promise.resolve(result(false)).then(res, rej),
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
      rpc: async (name: string, args: { p_vendor: string }) => {
        state.rpc.push({ name, args });
        if (name !== "naflis_vendor_contact") return { data: null, error: null };
        if (!state.account)
          return {
            data: null,
            error: {
              message: "permission denied for function naflis_vendor_contact",
              code: "42501",
            },
          };
        return state.rpcReply(args);
      },
    },
  };
});

let m: {
  routeTree: (typeof import("@/routeTree.gen"))["routeTree"];
  useNaflis: (typeof import("@/lib/naflis/store"))["useNaflis"];
  mapDbProduct: (typeof import("@/lib/naflis/mapProduct"))["mapDbProduct"];
  sessionReady: (typeof import("@/lib/sessionReady"))["sessionReady"];
  resetSessionReady: (typeof import("@/lib/sessionReady"))["resetSessionReady"];
  sellerApi: typeof import("@/services/sellerApi");
  listings: typeof import("@/services/studentListings");
  vendorAdmin: typeof import("@/services/vendorAdmin");
  contact: typeof import("@/services/sellerContact");
};

beforeAll(async () => {
  vi.stubEnv("VITE_APP_MODE", "live");
  vi.resetModules();
  m = {
    routeTree: (await import("@/routeTree.gen")).routeTree,
    useNaflis: (await import("@/lib/naflis/store")).useNaflis,
    mapDbProduct: (await import("@/lib/naflis/mapProduct")).mapDbProduct,
    sessionReady: (await import("@/lib/sessionReady")).sessionReady,
    resetSessionReady: (await import("@/lib/sessionReady")).resetSessionReady,
    sellerApi: await import("@/services/sellerApi"),
    listings: await import("@/services/studentListings"),
    vendorAdmin: await import("@/services/vendorAdmin"),
    contact: await import("@/services/sellerContact"),
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
  state.account = account;
  state.rpc = [];
  state.denied = [];
  state.rpcReply = () => ({ data: PHONE, error: null });
  m.useNaflis.setState({
    mallCampus: undefined,
    products: [m.mapDbProduct({ ...PRODUCT, vendors: VENDOR })],
    stores: [m.sellerApi.mapDbVendor(VENDOR)],
  });
  await m.sessionReady();
}

async function visit(p: string) {
  const queryClient = new QueryClient();
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
  );
  return { html, pathname: router.state.location.pathname };
}

const BUYER: Account = {
  id: "66666666-0000-4000-8000-0000000000a1",
  email: "buyer@test.invalid",
  roles: ["buyer"],
};
const ADMIN: Account = {
  id: "66666666-0000-4000-8000-0000000000e1",
  email: "admin@test.invalid",
  roles: ["buyer", "admin"],
};

describe("signed out: browsing works under the new column rules", () => {
  beforeEach(() => as(null));

  it("the catalogue, a product with its shop, a shop profile and student listings all load", async () => {
    expect((await m.sellerApi.fetchSellerProducts())?.map((p) => p.name)).toEqual([PRODUCT.title]);
    const one = await m.sellerApi.fetchSellerProduct(PRODUCT.id);
    expect(one?.vendor?.name).toBe(VENDOR.store_name);
    expect(one?.vendor).not.toHaveProperty("contactPhone");
    expect((await m.sellerApi.fetchVendorProfile(VENDOR.id))?.name).toBe(VENDOR.store_name);
    expect(await m.listings.fetchStudentListings()).toHaveLength(1);
    expect(state.denied).toEqual([]);
  });

  it.each(["/", "/buyer", "/buyer/search", `/buyer/product/${PRODUCT.id}`])(
    "%s renders",
    async (p) => {
      const { html, pathname } = await visit(p);
      expect(pathname).toBe(p);
      expect(html).toContain(PRODUCT.title);
      expect(html).not.toContain(PHONE);
    },
  );

  it("the product page offers sign-in to contact, and never asks for the number", async () => {
    const { html } = await visit(`/buyer/product/${PRODUCT.id}`);
    expect(html).toContain("Sign in to contact seller");
    expect(state.rpc.filter((r) => r.name === "naflis_vendor_contact")).toEqual([]);
  });

  it("asking anyway is refused", async () => {
    expect(await m.contact.revealSellerPhone(VENDOR.id)).toMatchObject({
      ok: false,
      reason: "sign_in",
    });
  });
});

describe("signed in: the number on request, from the database function", () => {
  it("the product page shows Contact seller, not the number, until tapped", async () => {
    await as(BUYER);
    const { html } = await visit(`/buyer/product/${PRODUCT.id}`);
    expect(html).toContain("Contact seller");
    expect(html).not.toContain("Sign in to contact seller");
    expect(html).not.toContain(PHONE);
  });

  it("revealing calls naflis_vendor_contact for that seller", async () => {
    await as(BUYER);
    expect(await m.contact.revealSellerPhone(VENDOR.id)).toEqual({ ok: true, phone: PHONE });
    expect(state.rpc).toContainEqual({
      name: "naflis_vendor_contact",
      args: { p_vendor: VENDOR.id },
    });
  });

  it("the daily limit, an unavailable seller and no number each get a clear answer", async () => {
    await as(BUYER);
    state.rpcReply = () => ({ data: null, error: { message: "daily_limit", code: "P0001" } });
    expect(await m.contact.revealSellerPhone(VENDOR.id)).toMatchObject({
      ok: false,
      reason: "limit",
    });
    state.rpcReply = () => ({ data: null, error: { message: "not_found", code: "P0001" } });
    expect(await m.contact.revealSellerPhone(VENDOR.id)).toMatchObject({
      ok: false,
      reason: "not_found",
    });
    state.rpcReply = () => ({ data: null, error: null });
    expect(await m.contact.revealSellerPhone(VENDOR.id)).toEqual({ ok: true, phone: null });
  });
});

describe("sellers and admins are unaffected", () => {
  it("a seller still sees their own phone (from the function, not the table)", async () => {
    await as(BUYER);
    const own = await m.listings.fetchOwnVendor(BUYER.id);
    expect(own?.contactPhone).toBe(PHONE);
    expect(state.denied).toEqual([]);
  });

  it("an admin's vendor list carries every phone", async () => {
    await as(ADMIN);
    const list = await m.vendorAdmin.listVendors();
    expect(list.map((v) => v.contactPhone)).toEqual([PHONE]);
    expect(state.denied).toEqual([]);
  });
});

describe("every vendors read names safe columns", () => {
  const src = path.resolve(__dirname, "../../src");
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const f = path.join(dir, n);
      return statSync(f).isDirectory() ? files(f) : /\.tsx?$/.test(n) ? [f] : [];
    });
  const sources = files(src).filter((f) => !f.endsWith("routeTree.gen.ts"));

  it("no vendors(*), no select('*') on vendors, no contact_phone in any select", () => {
    const offenders: string[] = [];
    for (const f of sources) {
      const text = readFileSync(f, "utf8");
      const rel = path.relative(src, f).replace(/\\/g, "/");
      if (/vendors(!inner)?\(\s*\*\s*\)/.test(text)) offenders.push(`${rel}: vendors(*)`);
      for (const mm of text.matchAll(/from\("vendors"\)[\s\S]{0,80}?\.select\(([^)]*)\)/g)) {
        if (/["'`]\s*\*\s*["'`]/.test(mm[1])) offenders.push(`${rel}: vendors select *`);
      }
      for (const mm of text.matchAll(/\.select\(([^)]*\)?[^)]*)\)/g)) {
        if (mm[1].includes("contact_phone")) offenders.push(`${rel}: selects contact_phone`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the payments Edge Function is unaffected: it reads vendors as service_role, status and user_id only", () => {
    const fnDir = path.resolve(__dirname, "../../supabase/functions");
    const core = readFileSync(path.join(fnDir, "_shared/paymentsCore.ts"), "utf8");
    expect(core).toMatch(/export function adminClient[\s\S]{0,120}SUPABASE_SERVICE_ROLE_KEY/);
    const payments = readFileSync(path.join(fnDir, "payments/index.ts"), "utf8");
    expect(payments).toContain("adminClient()");
    // supabase/tests/contact_phone_private.test.sql checks service_role keeps every vendor column.
    const used = new Set(
      [...payments.matchAll(/vendors(?:!inner)?\(([^)]*)\)|vendors\.([a-z_]+)/g)].flatMap((mm) =>
        (mm[1] ?? mm[2]).split(",").map((c) => c.trim()),
      ),
    );
    expect([...used].sort()).toEqual(["status", "user_id"]);
  });

  it("the public listing queries don't ask for the owner id", () => {
    for (const f of ["services/sellerApi.ts", "services/studentListings.ts"]) {
      const text = readFileSync(path.join(src, f), "utf8");
      for (const mm of text.matchAll(/vendors(?:!inner)?\(([^)]*)\)/g))
        expect(mm[1]).not.toContain("user_id");
    }
    expect(m.sellerApi.VENDOR_PUBLIC_COLUMNS).not.toMatch(/user_id|contact_phone/);
  });
});
