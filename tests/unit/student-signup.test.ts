// Part 1, phase 3: "Are you a student?" at sign-up, saved as profile fields
// (never a role); the return point survives email confirmation but only ever
// sends people to a same-site relative path; a student's marketplace starts at
// their own campus; and "Sell an item" lists students as students and anyone
// else in the mall. Database side: supabase/tests/student_profile_fields.test.sql.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { renderWithLiveSnapshots } from "../liveSnapshots";
import {
  RETURN_MAX_AGE_MS,
  clearReturnPath,
  rememberReturnPath,
  safeReturnPath,
  takeReturnPath,
} from "@/lib/returnPoint";
import { postSignInPath } from "@/lib/naflis/roles";
import { signUpMetadata, studentAnswerError } from "@/lib/naflis/studentAnswer";

type Account = { id: string; email: string; isStudent: boolean; campus: string | null };
const auth: { account: Account | null } = { account: null };
const inserts: { table: string; row: Record<string, unknown> }[] = [];

vi.mock("@/lib/supabase", () => {
  type Result = { data: unknown; error: null };
  type Chain = {
    select: () => Chain;
    eq: () => Chain;
    in: () => Chain;
    order: () => Chain;
    insert: (row: Record<string, unknown>) => Chain;
    update: () => Chain;
    maybeSingle: () => Promise<Result>;
    single: () => Promise<Result>;
    then: (res: (r: Result) => unknown, rej?: (e: unknown) => unknown) => Promise<unknown>;
  };
  const chain = (table: string): Chain => {
    let inserted: Record<string, unknown> | null = null;
    const a = () => auth.account;
    const one = (): unknown => {
      if (inserted) {
        return table === "vendors"
          ? {
              id: "vendor-1",
              status: "approved",
              store_name: inserted.store_name,
              contact_phone: null,
            }
          : { id: "product-1", created_at: "2026-10-23T00:00:00Z", ...inserted };
      }
      if (table === "profiles" && a())
        return {
          id: a()!.id,
          email: a()!.email,
          full_name: "Account",
          role: "buyer",
          roles: ["buyer"],
          institution_id: null,
          is_student: a()!.isStudent,
          student_campus: a()!.campus,
        };
      return null; // no vendor yet: the first listing creates one
    };
    const c: Chain = {
      select: () => c,
      eq: () => c,
      in: () => c,
      order: () => c,
      update: () => c,
      insert: (row) => {
        inserted = row;
        inserts.push({ table, row });
        return c;
      },
      maybeSingle: async () => ({ data: one(), error: null }),
      single: async () => ({ data: one(), error: null }),
      then: (res, rej) => Promise.resolve({ data: [], error: null } as Result).then(res, rej),
    };
    return c;
  };
  const user = () =>
    auth.account ? { id: auth.account.id, email: auth.account.email, user_metadata: {} } : null;
  return {
    supabase: {
      auth: {
        getSession: async () => ({ data: { session: user() ? { user: user() } : null } }),
        getUser: async () => ({ data: { user: user() } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
      from: (table: string) => chain(table),
      rpc: async () => ({ data: null, error: null }),
    },
  };
});

describe("return point (email confirmation)", () => {
  beforeEach(() => clearReturnPath());

  it("keeps same-site relative paths, query included", () => {
    expect(safeReturnPath("/buyer/product/abc?from=home")).toBe("/buyer/product/abc?from=home");
    expect(safeReturnPath("/")).toBe("/");
  });

  it("never returns to another site or a script", () => {
    for (const bad of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "\\\\evil.example",
      "javascript:alert(1)",
      "/\t/evil.example",
      "/ok\\..\\evil",
      "buyer",
      "",
      undefined,
      null,
      42,
      `/${"a".repeat(600)}`,
    ]) {
      expect(safeReturnPath(bad)).toBeNull();
    }
  });

  it("is taken once, then gone", () => {
    rememberReturnPath("/buyer/product/abc", 1_000);
    expect(takeReturnPath(2_000)).toBe("/buyer/product/abc");
    expect(takeReturnPath(3_000)).toBeNull();
  });

  it("an unsafe path is never stored", () => {
    rememberReturnPath("https://evil.example", 1_000);
    expect(takeReturnPath(2_000)).toBeNull();
    expect(localStorage.getItem("naflis-return-to")).toBeNull();
  });

  it("expires (and a tampered entry is refused)", () => {
    rememberReturnPath("/buyer", 1_000);
    expect(takeReturnPath(1_000 + RETURN_MAX_AGE_MS + 1)).toBeNull();
    localStorage.setItem("naflis-return-to", JSON.stringify({ path: "//evil.example", at: 5 }));
    expect(takeReturnPath(10)).toBeNull();
    localStorage.setItem("naflis-return-to", JSON.stringify({ path: "/buyer", at: 99 }));
    expect(takeReturnPath(10)).toBeNull(); // from the future
  });

  it("sign-in redirects follow the same rule", () => {
    expect(postSignInPath("buyer", "/buyer/product/x?y=1")).toBe("/buyer/product/x?y=1");
    expect(postSignInPath("buyer", "/\t/evil.example")).toBe("/buyer");
    expect(postSignInPath("buyer", "javascript:alert(1)")).toBe("/buyer");
  });
});

describe("sign-up asks, never grants", () => {
  it("sends profile fields only: no role or roles", () => {
    const meta = signUpMetadata("  Ama Owusu ", { isStudent: true, campus: "UG - Legon" });
    expect(meta).toEqual({
      full_name: "Ama Owusu",
      is_student: true,
      student_campus: "UG - Legon",
    });
    expect(Object.keys(meta)).not.toContain("role");
    expect(Object.keys(meta)).not.toContain("roles");
    expect(signUpMetadata("Kofi", { isStudent: false, campus: "UG - Legon" })).toEqual({
      full_name: "Kofi",
      is_student: false,
      student_campus: null,
    });
  });

  it("the question must be answered, and a student must pick a campus", () => {
    expect(studentAnswerError({ isStudent: null, campus: "" })).toMatch(/student/);
    expect(studentAnswerError({ isStudent: true, campus: "" })).toMatch(/campus/);
    expect(studentAnswerError({ isStudent: true, campus: "UG - Legon" })).toBeNull();
    expect(studentAnswerError({ isStudent: false, campus: "" })).toBeNull();
  });
});

// ---- live mode -------------------------------------------------------------
let m: {
  routeTree: (typeof import("@/routeTree.gen"))["routeTree"];
  useNaflis: (typeof import("@/lib/naflis/store"))["useNaflis"];
  mapDbProduct: (typeof import("@/lib/naflis/mapProduct"))["mapDbProduct"];
  sessionReady: (typeof import("@/lib/sessionReady"))["sessionReady"];
  resetSessionReady: (typeof import("@/lib/sessionReady"))["resetSessionReady"];
  createStudentListing: (typeof import("@/services/studentListings"))["createStudentListing"];
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
    createStudentListing: (await import("@/services/studentListings")).createStudentListing,
  };
}, 60_000); // a fresh import of the whole route tree

const restoreSnapshots = renderWithLiveSnapshots();
afterAll(() => {
  restoreSnapshots();
  vi.unstubAllEnvs();
  vi.resetModules();
});

const KNUST: Account = {
  id: "55555555-0000-4000-8000-0000000000a1",
  email: "kwame@test.invalid",
  isStudent: true,
  campus: "KNUST - Kumasi",
};
const BUYER: Account = {
  id: "55555555-0000-4000-8000-0000000000b1",
  email: "efua@test.invalid",
  isStudent: false,
  campus: null,
};
const row = (id: string, title: string, listing_type: string, campus: string | null) => ({
  id,
  vendor_id: "v",
  title,
  price: 10,
  listing_type,
  campus,
  created_at: "2026-10-20T00:00:00Z",
  vendors: { status: "approved", store_name: "S" },
});

async function signInAs(a: Account | null) {
  localStorage.clear();
  m.useNaflis.getState().signOut();
  m.resetSessionReady();
  auth.account = a;
  m.useNaflis.setState({
    mallCampus: undefined,
    products: [
      row("p1", "Anywhere kettle", "mall", null),
      row("p2", "Legon desk lamp", "student", "UG - Legon"),
      row("p3", "Kumasi calculator", "student", "KNUST - Kumasi"),
    ].map((r) => m.mapDbProduct(r)),
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
  return renderToString(
    React.createElement(RouterProvider, { router } as Parameters<typeof RouterProvider>[0]),
  );
}

describe("live: the profile fields shape what a student sees", () => {
  it("a student's marketplace starts at their own campus", async () => {
    await signInAs(KNUST);
    const html = await visit("/");
    expect(html).toContain("Kumasi calculator");
    expect(html).toContain("Anywhere kettle");
    expect(html).not.toContain("Legon desk lamp");
  });

  it("anyone else starts at all campuses", async () => {
    await signInAs(BUYER);
    const html = await visit("/");
    for (const t of ["Kumasi calculator", "Anywhere kettle", "Legon desk lamp"])
      expect(html).toContain(t);
  });

  it("/me asks the question, showing the saved answer", async () => {
    await signInAs(KNUST);
    const html = await visit("/me");
    expect(html).toContain("Are you a student?");
    expect(html).toMatch(/aria-pressed="true"[^>]*>Yes</);
  });
});

describe("live: Sell an item, for everyone", () => {
  const listing = {
    title: "Desk fan",
    description: "",
    category: "Home & Kitchen",
    price: 120,
    condition: "Like New" as const,
    images: [],
    sellerName: "Efua",
  };

  beforeEach(() => {
    inserts.length = 0;
  });

  it("a non-student lists in the mall, with no campus needed", async () => {
    await signInAs(BUYER);
    await m.createStudentListing({ ...listing, listingType: "mall", campus: null });
    const product = inserts.find((i) => i.table === "products")!.row;
    expect(product).toMatchObject({ listing_type: "mall", campus: null });
    const vendor = inserts.find((i) => i.table === "vendors")!.row;
    // The seller application: a new vendor (the database starts it pending), neutral by default.
    expect(vendor).toMatchObject({ user_id: BUYER.id, store_name: "Efua" });
    expect(Object.keys(vendor)).not.toContain("status");
  });

  it("a student lists as a student, at a campus", async () => {
    await signInAs(KNUST);
    await m.createStudentListing({ ...listing, listingType: "student", campus: "KNUST - Kumasi" });
    expect(inserts.find((i) => i.table === "products")!.row).toMatchObject({
      listing_type: "student",
      campus: "KNUST - Kumasi",
    });
  });

  it("a student listing without a campus is refused before anything is saved", async () => {
    await signInAs(KNUST);
    await expect(
      m.createStudentListing({ ...listing, listingType: "student", campus: null }),
    ).rejects.toThrow(/campus/);
    expect(inserts.find((i) => i.table === "products")).toBeUndefined();
  });

  it("an approved seller's new listing joins the one marketplace at once", async () => {
    await signInAs(BUYER);
    await m.createStudentListing({
      ...listing,
      title: "Brand new fan",
      listingType: "mall",
      campus: null,
    });
    expect(m.useNaflis.getState().products.some((p) => p.name === "Brand new fan")).toBe(true);
  });
});
