// Reloading (or opening a bookmark to) any page that needs sign-in keeps a
// signed-in account where it was: every guard waits for the stored session and
// its profile roles before deciding. Who is allowed in is unchanged. The staff
// portal and Super Admin are covered by staff-session-race.test.ts.
// Supabase is stubbed: a stored session plus a `profiles` row.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";

type Account = { id: string; email: string; roles: string[] };
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
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
      from: (table: string) => chain(table),
      rpc: async () => ({ data: null, error: null }),
    },
  };
});

const { routeTree } = await import("@/routeTree.gen");
const { useNaflis } = await import("@/lib/naflis/store");
const { resetSessionReady } = await import("@/lib/sessionReady");
const routes = {
  buyer: (await import("@/routes/buyer")).Route,
  admin: (await import("@/routes/admin")).Route,
  finance: (await import("@/routes/finance")).Route,
  dispute: (await import("@/routes/dispute")).Route,
  delivery: (await import("@/routes/delivery")).Route,
  studentOs: (await import("@/routes/student-os")).Route,
};

const acct = (n: string, roles: string[]): Account => ({
  id: `33333333-0000-4000-8000-0000000000${n}`,
  email: `${n}@test.invalid`,
  roles,
});
const BUYER = acct("a1", ["buyer"]);
const STUDENT = acct("a2", ["buyer", "student"]);
const FINANCE = acct("b1", ["buyer", "finance"]);
const DISPUTE = acct("b2", ["buyer", "dispute"]);
const DELIVERY = acct("b3", ["buyer", "delivery"]);
const ADMIN = acct("b4", ["buyer", "admin"]);

/** A fresh page load at `path`: nothing in the store, the session only in Supabase's storage. */
async function directVisit(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    context: { queryClient: new QueryClient() },
    isServer: false,
  });
  await router.load();
  return router.state.location;
}

beforeEach(() => {
  localStorage.clear();
  useNaflis.getState().resetDemo();
  useNaflis.getState().signOut();
  resetSessionReady();
  auth.account = null;
});

describe("buyer area", () => {
  it.each(["/buyer", "/buyer/categories", "/buyer/search", "/buyer/wishlist"])(
    "a signed-in buyer reloading %s stays there",
    async (path) => {
      auth.account = BUYER;
      expect((await directVisit(path)).pathname).toBe(path);
      expect(useNaflis.getState().role).toBe("buyer");
    },
  );

  it("a signed-in student reloading /buyer stays there, in the buyer workspace", async () => {
    auth.account = STUDENT;
    expect((await directVisit("/buyer")).pathname).toBe("/buyer");
    expect(useNaflis.getState().role).toBe("buyer");
  });

  it("signed out, it still goes to sign-in", async () => {
    const to = await directVisit("/buyer/wishlist");
    expect(to.pathname).toBe("/login");
    expect(to.search).toMatchObject({ redirect: "/buyer" });
  });
});

describe("operations consoles", () => {
  it.each([
    ["/finance", FINANCE, "finance"],
    ["/dispute", DISPUTE, "dispute"],
    ["/delivery", DELIVERY, "delivery"],
    ["/admin", ADMIN, "admin"],
  ] as const)("reloading %s as its officer stays there", async (path, account, role) => {
    auth.account = account;
    expect((await directVisit(path)).pathname).toBe(path);
    expect(useNaflis.getState().role).toBe(role);
  });

  it.each(["/finance", "/dispute", "/delivery", "/admin"])(
    "a student reloading %s is still sent to sign-in",
    async (path) => {
      auth.account = STUDENT;
      const to = await directVisit(path);
      expect(to.pathname).toBe("/login");
      expect(to.search).toMatchObject({ redirect: path });
    },
  );

  it("a finance officer still can't open the dispute console", async () => {
    auth.account = FINANCE;
    expect((await directVisit("/dispute")).pathname).toBe("/login");
  });
});

describe("Student OS", () => {
  it("a student reloading /student-os is back in the student workspace", async () => {
    auth.account = STUDENT;
    expect((await directVisit("/student-os/resources")).pathname).toBe("/student-os/resources");
    expect(useNaflis.getState().role).toBe("student");
  });

  it("a buyer without the student role can browse it, but isn't made a student", async () => {
    auth.account = BUYER;
    expect((await directVisit("/student-os")).pathname).toBe("/student-os");
    expect(useNaflis.getState().role).toBe("buyer");
  });

  it("it stays open to signed-out visitors", async () => {
    expect((await directVisit("/student-os")).pathname).toBe("/student-os");
    expect(useNaflis.getState().currentUserId).toBeNull();
  });
});

describe("rendering", () => {
  it("sign-in-only areas are decided in the browser, where the session is", () => {
    for (const r of [routes.buyer, routes.admin, routes.finance, routes.dispute, routes.delivery]) {
      expect(r.options.ssr).toBe(false);
    }
  });

  it("Student OS stays server-rendered (it's public)", () => {
    expect(routes.studentOs.options.ssr).toBeUndefined();
  });
});
