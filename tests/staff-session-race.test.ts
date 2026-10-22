// A signed-in staff member opening /campus-admin or /super directly (bookmark,
// reload) lands in the portal: the guard waits for the stored session and its
// profile roles instead of deciding from an empty store. Non-staff are still
// sent to /login. Supabase is stubbed: a stored session plus a `profiles` row.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";

type Account = { id: string; email: string; roles: string[] };
const auth: { account: Account | null; calls: number } = { account: null, calls: 0 };

vi.mock("@/lib/supabase", () => {
  const profiles = () => {
    const a = auth.account;
    return a
      ? {
          id: a.id,
          email: a.email,
          full_name: "Staff Member",
          role: "buyer",
          roles: a.roles,
          institution_id: null,
        }
      : null;
  };
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
  const chain = (table: string): Chain => {
    const result = (): Result =>
      table === "profiles" ? { data: profiles(), error: null } : { data: [], error: null };
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
          auth.calls++;
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
const { Route: CampusAdminRoute } = await import("@/routes/campus-admin");
const { Route: SuperRoute } = await import("@/routes/super");

const SRC = {
  id: "11111111-0000-4000-8000-0000000000b1",
  email: "src@test.invalid",
  roles: ["buyer", "student", "src_head"],
};
const DEAN = {
  id: "11111111-0000-4000-8000-0000000000d1",
  email: "dean@test.invalid",
  roles: ["buyer", "dean"],
};
const SUPER = {
  id: "11111111-0000-4000-8000-0000000000c1",
  email: "super@test.invalid",
  roles: ["buyer", "super_admin"],
};
const STUDENT = {
  id: "11111111-0000-4000-8000-0000000000a1",
  email: "student@test.invalid",
  roles: ["buyer", "student"],
};

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
  auth.calls = 0;
});

describe("direct visits to staff routes wait for the session", () => {
  it.each([
    ["SRC executive", "/campus-admin", SRC, "src_head"],
    ["dean", "/campus-admin", DEAN, "dean"],
    ["super admin", "/campus-admin", SUPER, "super_admin"],
    ["super admin", "/super", SUPER, "super_admin"],
  ] as const)("a signed-in %s opening %s lands there", async (_who, path, account, role) => {
    auth.account = account;
    expect(useNaflis.getState().currentUserId).toBeNull(); // nothing loaded yet
    expect((await directVisit(path)).pathname).toBe(path);
    expect(useNaflis.getState().role).toBe(role);
  });

  it("a signed-in student is still sent to sign-in", async () => {
    auth.account = STUDENT;
    const to = await directVisit("/campus-admin");
    expect(to.pathname).toBe("/login");
    expect(to.search).toMatchObject({ redirect: "/campus-admin" });
    expect((await directVisit("/super")).pathname).toBe("/login");
  });

  it("an SRC executive still can't open Super Admin", async () => {
    auth.account = SRC;
    expect((await directVisit("/super")).pathname).toBe("/login");
  });

  it("with no session, both go to sign-in", async () => {
    expect((await directVisit("/campus-admin")).pathname).toBe("/login");
    expect((await directVisit("/super")).pathname).toBe("/login");
  });

  it("the session is read once per page load, not on every navigation", async () => {
    auth.account = SRC;
    await directVisit("/campus-admin");
    await directVisit("/campus-admin");
    expect(auth.calls).toBe(1);
  });

  it("the server never decides (it can't see the browser's session)", () => {
    expect(CampusAdminRoute.options.ssr).toBe(false);
    expect(SuperRoute.options.ssr).toBe(false);
  });
});
