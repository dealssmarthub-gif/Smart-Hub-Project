// Part 1, phase 1 (live mode): NAFLIS Mall is for everyone and never links to
// Student OS unless the signed-in account is a student; mall browsing is open;
// staff sign in at /staff, which nothing links to and which only forwards to a
// staff area. Supabase is stubbed: a stored session plus a `profiles` row.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { renderWithLiveSnapshots } from "../liveSnapshots";

type Account = { id: string; email: string; roles: string[]; isStudent?: boolean };
const auth: { account: Account | null } = { account: null };

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
  const rows = (table: string): unknown => {
    const a = auth.account;
    if (table === "profiles")
      return a
        ? {
            id: a.id,
            email: a.email,
            full_name: "Account",
            role: "buyer",
            roles: a.roles,
            institution_id: null,
            // Live: "student" is the self-declared profile field, never a role.
            is_student: a.isStudent ?? false,
            student_campus: null,
          }
        : null;
    return [];
  };
  const chain = (table: string): Chain => {
    const result = (): Result => ({ data: rows(table), error: null });
    const c: Chain = {
      select: () => c,
      eq: () => c,
      in: () => c,
      order: () => c,
      maybeSingle: async () => result(),
      single: async () => result(),
      then: (res, rej) => Promise.resolve(result()).then(res, rej),
    };
    return c;
  };
  return {
    supabase: {
      auth: {
        getSession: async () => {
          const a = auth.account;
          return {
            data: { session: a ? { user: { id: a.id, email: a.email, user_metadata: {} } } : null },
          };
        },
        getUser: async () => ({ data: { user: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
      from: (table: string) => chain(table),
      rpc: async () => ({ data: null, error: null }),
      storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "" } }) }) },
    },
  };
});

const BUYER = {
  id: "44444444-0000-4000-8000-0000000000a1",
  email: "buyer@test.invalid",
  roles: ["buyer"],
};
const STUDENT: Account = {
  id: "44444444-0000-4000-8000-0000000000a2",
  email: "student@test.invalid",
  roles: ["buyer"],
  isStudent: true,
};
// Holds the old student role but hasn't said they are a student: live goes by the profile field.
const ROLE_ONLY: Account = {
  id: "44444444-0000-4000-8000-0000000000a3",
  email: "roleonly@test.invalid",
  roles: ["buyer", "student"],
  isStudent: false,
};

let m: {
  routeTree: (typeof import("@/routeTree.gen"))["routeTree"];
  useNaflis: (typeof import("@/lib/naflis/store"))["useNaflis"];
  resetSessionReady: (typeof import("@/lib/sessionReady"))["resetSessionReady"];
  sessionReady: (typeof import("@/lib/sessionReady"))["sessionReady"];
  roles: typeof import("@/lib/naflis/roles");
  places: typeof import("@/components/naflis/shell/places");
};

beforeAll(async () => {
  vi.stubEnv("VITE_APP_MODE", "live");
  vi.resetModules();
  m = {
    routeTree: (await import("@/routeTree.gen")).routeTree,
    useNaflis: (await import("@/lib/naflis/store")).useNaflis,
    resetSessionReady: (await import("@/lib/sessionReady")).resetSessionReady,
    sessionReady: (await import("@/lib/sessionReady")).sessionReady,
    roles: await import("@/lib/naflis/roles"),
    places: await import("@/components/naflis/shell/places"),
  };
}, 60_000); // a fresh import of the whole route tree

afterAll(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

// Signed-in renders must see the signed-in store (see liveSnapshots).
const restoreSnapshots = renderWithLiveSnapshots();
afterAll(() => restoreSnapshots());

beforeEach(() => {
  localStorage.clear();
  m.useNaflis.getState().signOut();
  m.resetSessionReady();
  auth.account = null;
});

/** A fresh page load at `p` (client-side, as the browser runs it), rendered to HTML. */
async function visit(p: string) {
  // The app shell restores the stored session on every page (pages without a guard included).
  await m.sessionReady();
  const router = createRouter({
    routeTree: m.routeTree,
    history: createMemoryHistory({ initialEntries: [p] }),
    context: { queryClient: new QueryClient() },
    isServer: false,
  });
  await router.load();
  const html = renderToString(
    React.createElement(RouterProvider, { router } as Parameters<typeof RouterProvider>[0]),
  ).replace(/<!-- -->/g, "");
  return { html, location: router.state.location };
}

const MALL_PAGES = ["/", "/buyer", "/buyer/search", "/buyer/categories", "/me", "/login"];

describe("the mall never links to Student OS for non-students", () => {
  it.each(MALL_PAGES)("%s, signed out", async (p) => {
    const { html, location } = await visit(p);
    expect(location.pathname).toBe(p); // browsing is open
    expect(html).not.toContain('href="/student-os');
    expect(html).not.toMatch(/Student OS/);
  });

  it.each(MALL_PAGES.filter((p) => p !== "/login"))(
    "%s, signed in without the student flag",
    async (p) => {
      auth.account = BUYER;
      const { html, location } = await visit(p);
      expect(location.pathname).toBe(p);
      if (p === "/me") expect(html).toContain(BUYER.email); // really rendered signed in
      expect(html).not.toContain('href="/student-os');
      expect(html).not.toMatch(/Student OS/);
    },
  );

  it("live goes by the self-declared field, not the old student role", async () => {
    auth.account = ROLE_ONLY;
    const { html } = await visit("/me");
    expect(html).toContain(ROLE_ONLY.email);
    expect(html).not.toContain('href="/student-os');
  });

  it("a signed-in student does get Student OS", async () => {
    auth.account = STUDENT;
    const { html } = await visit("/me");
    expect(html).toContain('href="/student-os"');
  });

  it("menus: the Campus place and every Student OS destination are for students only", () => {
    const flags = { student_os: true, src_portal: true };
    const ids = (v: { signedIn: boolean; isStudent: boolean }) =>
      m.places
        .placesFor({ flags, ...v })
        .flatMap((pl) => [pl.to, ...pl.destinations.map((d) => d.to)]);
    for (const v of [
      { signedIn: false, isStudent: false },
      { signedIn: true, isStudent: false },
    ]) {
      expect(ids(v).filter((to) => to.startsWith("/student-os"))).toEqual([]);
    }
    expect(ids({ signedIn: true, isStudent: true })).toContain("/student-os");
  });
});

describe("mall browsing is open, account pages are not", () => {
  it("a product page opens signed out", async () => {
    expect((await visit("/buyer/product/p1")).location.pathname).toBe("/buyer/product/p1");
  });

  it("the wishlist still needs sign-in", async () => {
    const { location } = await visit("/buyer/wishlist");
    expect(location.pathname).toBe("/login");
  });
});

describe("/staff", () => {
  it("only forwards to a staff area, never another site or a mall page", () => {
    const t = m.roles.staffTarget;
    expect(t("/campus-admin")).toBe("/campus-admin");
    expect(t("/campus-admin/dashboard")).toBe("/campus-admin/dashboard");
    expect(t("/super/staff")).toBe("/super/staff");
    for (const bad of [
      "//evil.example",
      "https://evil.example",
      "/\\evil.example",
      "/buyer",
      "/superfake",
      "/login",
      undefined,
      42,
    ]) {
      expect(t(bad)).toBe("/campus-admin");
    }
  });

  it("asks for the right roles per area", () => {
    expect(m.roles.staffRolesFor("/super/vendors")).toEqual(["super_admin"]);
    expect(m.roles.staffRolesFor("/campus-admin")).toEqual(["src_head", "dean", "super_admin"]);
  });

  it("signed-out visits to either portal land on /staff, remembering where they were going", async () => {
    for (const p of ["/campus-admin", "/super"]) {
      const { location } = await visit(p);
      expect(location.pathname).toBe("/staff");
      expect(location.search).toMatchObject({ redirect: p });
    }
  });

  it("the page has no marketplace links", async () => {
    const { html } = await visit("/staff?redirect=/campus-admin");
    expect(html).toContain("SRC Staff");
    expect(html).not.toMatch(/href="\/(buyer|student-os|me)?"/);
    expect(html).not.toContain('href="/buyer');
  });

  it("nothing links to /staff", () => {
    const src = path.resolve(__dirname, "../../src");
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const f = path.join(dir, n);
        return statSync(f).isDirectory() ? files(f) : /\.tsx?$/.test(n) ? [f] : [];
      });
    const offenders = files(src)
      .filter((f) => !f.endsWith("routeTree.gen.ts"))
      .filter((f) => /(href|to)=\{?["'`]\/staff(["'`?/])/.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(src, f).replace(/\\/g, "/"));
    expect(offenders).toEqual([]);
  });
});
