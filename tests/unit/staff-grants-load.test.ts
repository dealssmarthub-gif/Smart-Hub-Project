// Stage 2c, live mode: SRC and dean accounts get their staff grants from
// Supabase, so the campus portal shows their campuses and publish actions.
// Supabase is stubbed to answer `staff_grants` the way RLS does (own rows;
// every row for a super admin). The database's own enforcement is covered by
// supabase/tests/staff_grants_scope.test.sql.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";

type Account = { id: string; email: string; roles: string[] };
const auth: { account: Account | null } = { account: null };

const SRC_UG = {
  id: "22222222-0000-4000-8000-0000000000a1",
  email: "src.ug@test.invalid",
  roles: ["buyer", "student", "src_head"],
};
const DEAN_UG = {
  id: "22222222-0000-4000-8000-0000000000d1",
  email: "dean.ug@test.invalid",
  roles: ["buyer", "dean"],
};
const REVOKED = {
  id: "22222222-0000-4000-8000-0000000000e1",
  email: "former@test.invalid",
  roles: ["buyer", "src_head"],
};
const SUPER = {
  id: "22222222-0000-4000-8000-0000000000c1",
  email: "super@test.invalid",
  roles: ["buyer", "super_admin"],
};

const row = (
  id: string,
  user: Account | null,
  inst: string,
  campus: string,
  permissions: string[],
  status = "active",
) => ({
  id,
  user_id: user?.id ?? null,
  email: user?.email ?? "invitee@test.invalid",
  name: null,
  title: "Staff",
  role: user === DEAN_UG ? "dean" : "src_head",
  institution_id: inst,
  campus_id: campus,
  permissions,
  status,
  token_hash: user ? null : "secret-hash",
  expires_at: null,
  invited_by: SUPER.id,
  created_at: "2026-10-01T00:00:00Z",
  accepted_at: user ? "2026-10-02T00:00:00Z" : null,
  revoked_at: status === "revoked" ? "2026-10-10T00:00:00Z" : null,
});
const GRANTS = [
  row("g-src-ug", SRC_UG, "ug", "UG - Legon", [
    "student.announcements.create",
    "student.events.create",
    "not.a.permission",
  ]),
  row("g-dean-ug", DEAN_UG, "ug", "*", [
    "student.announcements.create",
    "student.timetable.manage",
  ]),
  row("g-revoked", REVOKED, "ug", "UG - Legon", ["student.announcements.create"], "revoked"),
  row(
    "g-knust",
    { id: "22222222-0000-4000-8000-0000000000b1", email: "src.knust@test.invalid", roles: [] },
    "knust",
    "KNUST - Kumasi",
    ["student.announcements.create"],
  ),
  row("g-invite", null, "ug", "UG - Legon", ["student.announcements.create"], "invited"),
];

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
            full_name: "Staff",
            role: "buyer",
            roles: a.roles,
            institution_id: null,
          }
        : null;
    // RLS "Own or super admin reads grants" (migration 07).
    if (table === "staff_grants")
      return !a
        ? []
        : a.roles.includes("super_admin")
          ? GRANTS
          : GRANTS.filter((g) => g.user_id === a.id);
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
      storage: {
        from: () => ({
          upload: async () => ({ data: null, error: null }),
          getPublicUrl: () => ({ data: { publicUrl: "" } }),
        }),
      },
    },
  };
});

let m: {
  routeTree: (typeof import("@/routeTree.gen"))["routeTree"];
  useNaflis: (typeof import("@/lib/naflis/store"))["useNaflis"];
  resetSessionReady: (typeof import("@/lib/sessionReady"))["resetSessionReady"];
  perms: typeof import("@/lib/naflis/permissions");
};

beforeAll(async () => {
  vi.stubEnv("VITE_APP_MODE", "live");
  vi.resetModules();
  m = {
    routeTree: (await import("@/routeTree.gen")).routeTree,
    useNaflis: (await import("@/lib/naflis/store")).useNaflis,
    resetSessionReady: (await import("@/lib/sessionReady")).resetSessionReady,
    perms: await import("@/lib/naflis/permissions"),
  };
}, 60_000); // a fresh import of the whole route tree

afterAll(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

beforeEach(() => {
  localStorage.clear();
  m.useNaflis.getState().signOut();
  m.resetSessionReady();
  auth.account = null;
});

/** A fresh page load of the portal with only a stored session. */
async function openPortal() {
  const router = createRouter({
    routeTree: m.routeTree,
    history: createMemoryHistory({ initialEntries: ["/campus-admin"] }),
    context: { queryClient: new QueryClient() },
    isServer: false,
  });
  await router.load();
  return router.state.location.pathname;
}

/** What the portal computes from the store (campus-admin.tsx uses the same calls). */
function portal() {
  const s = m.useNaflis.getState();
  const scope = m.perms.scopedCampuses(
    { userId: s.currentUserId, isSuperAdmin: false },
    s.staffGrants,
  );
  return { scope, can: (p: string, campus: string) => s.hasPermission(p as never, campus) };
}

describe("live: the portal is scoped by the grants loaded from Supabase", () => {
  it("starts with no grants (nothing seeded)", () => {
    expect(m.useNaflis.getState().staffGrants).toEqual([]);
  });

  it("a UG SRC executive gets UG - Legon and only the permissions granted", async () => {
    auth.account = SRC_UG;
    expect(await openPortal()).toBe("/campus-admin");
    const p = portal();
    expect(p.scope).toEqual(["UG - Legon"]);
    expect(p.can("student.announcements.create", "UG - Legon")).toBe(true);
    expect(p.can("student.events.create", "UG - Legon")).toBe(true);
    expect(p.can("student.resources.manage", "UG - Legon")).toBe(false);
    expect(p.can("student.announcements.create", "KNUST - Kumasi")).toBe(false);
    // Only their own grant reached the browser, without unknown permissions or token hashes.
    const grants = m.useNaflis.getState().staffGrants;
    expect(grants.map((g) => g.id)).toEqual(["g-src-ug"]);
    expect(grants[0].permissions).toEqual([
      "student.announcements.create",
      "student.events.create",
    ]);
    expect(grants[0]).not.toHaveProperty("tokenHash");
  });

  it("a UG dean with an all-campus grant gets every UG campus, nothing elsewhere", async () => {
    auth.account = DEAN_UG;
    expect(await openPortal()).toBe("/campus-admin");
    const p = portal();
    expect(p.scope).toEqual(m.perms.INSTITUTIONS.find((i) => i.id === "ug")!.campuses);
    expect(p.can("student.timetable.manage", "UG - Legon")).toBe(true);
    expect(p.can("student.announcements.create", "KNUST - Kumasi")).toBe(false);
  });

  it("a revoked grant gives no campuses and no permissions", async () => {
    auth.account = REVOKED;
    await openPortal();
    const p = portal();
    expect(p.scope).toEqual([]);
    expect(p.can("student.announcements.create", "UG - Legon")).toBe(false);
  });

  it("a super admin loads every grant, for Super Admin → Staff", async () => {
    auth.account = SUPER;
    await openPortal();
    expect(
      m.useNaflis
        .getState()
        .staffGrants.map((g) => g.id)
        .sort(),
    ).toEqual(GRANTS.map((g) => g.id).sort());
  });

  it("signing out clears the grants", async () => {
    auth.account = SRC_UG;
    await openPortal();
    expect(m.useNaflis.getState().staffGrants).toHaveLength(1);
    m.useNaflis.getState().signOut();
    expect(m.useNaflis.getState().staffGrants).toEqual([]);
  });

  it("signing in (login page) loads them too", async () => {
    auth.account = DEAN_UG;
    await m.useNaflis
      .getState()
      .completeSignIn({ id: DEAN_UG.id, email: DEAN_UG.email, user_metadata: {} });
    expect(m.useNaflis.getState().staffGrants.map((g) => g.id)).toEqual(["g-dean-ug"]);
  });
});
