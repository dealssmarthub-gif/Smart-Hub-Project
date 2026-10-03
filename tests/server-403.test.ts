// Server-mode 403 mapping. A stubbed Supabase client answers the way PostgREST
// does under the scoped RLS from migration 07:
//  - INSERT violating a policy → error code 42501 (HTTP 403)
//  - UPDATE / DELETE on rows hidden by RLS → success with zero rows
// The real policies are exercised by supabase/tests/rls_cross_institution.test.sql.
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { table: string; op: string }[] = [];
const rpc = { error: { message: "not_authorized" } as { message: string } | null };

vi.mock("@/lib/supabase", () => {
  const rlsError = { code: "42501", message: 'new row violates row-level security policy for table "campus_events"' };
  const builder = (table: string) => {
    let op = "select";
    const result = () => {
      calls.push({ table, op });
      if (op === "insert") return { data: null, error: rlsError };
      if (op === "update" || op === "delete") return { data: [], error: null }; // RLS-filtered: 0 rows
      return { data: [], error: null };
    };
    const chain: any = {
      insert: () => ((op = "insert"), chain),
      update: () => ((op = "update"), chain),
      delete: () => ((op = "delete"), chain),
      select: () => chain,
      eq: () => chain,
      single: async () => result(),
      then: (res: any, rej: any) => Promise.resolve(result()).then(res, rej),
    };
    return chain;
  };
  return {
    supabase: {
      auth: { getSession: async () => ({ data: { session: { user: { id: "knust-src" } } } }) },
      from: (table: string) => builder(table),
      rpc: async () => ({ data: null, error: rpc.error }),
    },
  };
});

const { useNaflis } = await import("@/lib/naflis/store");
const C = await import("@/services/campusContent");
const { applyProductChange } = await import("@/services/intelligenceService");
const S = await import("@/services/staffService");
const { fetchSellerDemand } = await import("@/services/intelligenceService");
const { AccessDeniedError } = await import("@/lib/naflis/errors");

const UUID = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  calls.length = 0;
  rpc.error = { message: "not_authorized" };
  useNaflis.getState().resetDemo();
});

describe("server-mode cross-institution writes surface as 403", () => {
  it("RLS-rejected insert → AccessDeniedError 403 (even if the local scope check passed)", async () => {
    // UG SRC passes the local check; the server still refuses (e.g. grant revoked server-side).
    useNaflis.setState({ currentUserId: "u_src1", role: "src_head" });
    const err = await C.publishCampusEvent({
      kind: "announcement", title: "x", description: "", eventDate: new Date().toISOString(), venue: "v", campus: "UG - Legon", pinned: false, organizer: "o",
    }).catch((e) => e);
    expect(err).toBeInstanceOf(AccessDeniedError);
    expect(err.status).toBe(403);
    expect(calls).toContainEqual({ table: "campus_events", op: "insert" });
    expect(useNaflis.getState().campusEvents.some((e) => e.title === "x")).toBe(false);
  });

  it("zero-row update / delete (row hidden by RLS) → 403, not a silent success", async () => {
    useNaflis.setState((s) => ({
      currentUserId: "u_src1",
      role: "src_head",
      campusEvents: [{ id: UUID, kind: "announcement", title: "UG", description: "", eventDate: new Date().toISOString(), venue: "", campus: "UG - Legon", pinned: false, organizer: "", createdAt: 0 }, ...s.campusEvents],
    }));
    await expect(C.togglePinCampusEvent(UUID)).rejects.toMatchObject({ status: 403 });
    await expect(C.removeCampusEvent(UUID)).rejects.toMatchObject({ status: 403 });
    expect(useNaflis.getState().campusEvents.find((e) => e.id === UUID)?.pinned).toBe(false);
  });

  it("product update filtered by vendor RLS → 403", async () => {
    useNaflis.setState((s) => ({
      currentUserId: "u_seller1",
      role: "seller",
      products: [{ ...s.products[0], id: UUID, storeId: "s_trendtech" }, ...s.products],
    }));
    await expect(applyProductChange(UUID, { price: 10 })).rejects.toMatchObject({ status: 403 });
  });

  it("demand RPC: Starter plan → 402, non-vendor → 403 (server-side gate)", async () => {
    rpc.error = { message: "subscription_required" };
    await expect(fetchSellerDemand("UG - Legon")).rejects.toMatchObject({ status: 402 });
    rpc.error = { message: "not_a_vendor" };
    await expect(fetchSellerDemand("UG - Legon")).rejects.toMatchObject({ status: 403 });
  });

  it("staff RPCs refused by the server report the denial", async () => {
    useNaflis.setState({ currentUserId: "u_src1", role: "src_head" });
    const res = await S.revokeStaff("sg_ug_president");
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/not authorised/i);
  });
});
