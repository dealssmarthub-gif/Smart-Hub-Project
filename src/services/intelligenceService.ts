import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { AccessDeniedError, SubscriptionRequiredError, isRlsDenied } from "@/lib/naflis/errors";
import { demoDemandLogs, type DemandLogInput } from "@/lib/naflis/intelligence";
import { useNaflis } from "@/lib/naflis/store";

// Demand data for Seller Intelligence.
// Server mode: the `naflis_seller_demand` RPC (migration 08) returns 28 days of
// searches with pseudonymous searcher ids — only to approved vendors on a paid
// plan, so the gate is enforced by the database, not just the UI.
// Demo mode: local search logs plus a deterministic synthetic history.

export interface DemandPayload {
  logs: DemandLogInput[];
  source: "live" | "demo";
  fetchedAt: number;
}

const CACHE_PREFIX = "naflis-intel-cache-v1:";

function readCache(campus: string): DemandPayload | undefined {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + campus);
    return raw ? (JSON.parse(raw) as DemandPayload) : undefined;
  } catch {
    return undefined;
  }
}

function writeCache(campus: string, payload: DemandPayload) {
  try {
    localStorage.setItem(CACHE_PREFIX + campus, JSON.stringify(payload));
  } catch {
    // storage full / unavailable — the in-memory query cache still works
  }
}

export async function fetchSellerDemand(campus: string, now = Date.now()): Promise<DemandPayload> {
  if (!supabase) {
    const local = useNaflis
      .getState()
      .demandLogs.map((d) => ({ searchQuery: d.searchQuery, campus: d.campus, resultsCount: d.resultsCount, userId: d.userId, createdAt: d.createdAt }));
    const payload: DemandPayload = { logs: [...local, ...demoDemandLogs(campus, now)], source: "demo", fetchedAt: now };
    writeCache(campus, payload);
    return payload;
  }
  const { data, error } = await supabase.rpc("naflis_seller_demand", { p_campus: campus });
  if (error) {
    if (/subscription_required/.test(error.message)) throw new SubscriptionRequiredError();
    if (/not_a_vendor/.test(error.message) || isRlsDenied(error)) throw new AccessDeniedError("Only approved sellers can view market demand.");
    throw new Error(error.message || "Couldn't load demand data.");
  }
  const payload: DemandPayload = {
    logs: (data ?? []).map((r: any) => ({
      searchQuery: r.search_query,
      campus: r.campus,
      resultsCount: r.results_count,
      userId: r.searcher,
      createdAt: new Date(r.created_at).getTime(),
    })),
    source: "live",
    fetchedAt: now,
  };
  writeCache(campus, payload);
  return payload;
}

/** Demand data with the last good result restored instantly after a refresh. */
export function useSellerDemand(campus: string, enabled: boolean) {
  return useQuery({
    queryKey: ["seller-demand", campus],
    queryFn: () => fetchSellerDemand(campus),
    enabled,
    staleTime: 2 * 60_000,
    // Gate and permission errors won't fix themselves on retry.
    retry: (count, err) => !(err instanceof SubscriptionRequiredError || err instanceof AccessDeniedError) && count < 2,
    initialData: () => readCache(campus),
    initialDataUpdatedAt: () => readCache(campus)?.fetchedAt,
  });
}

/** Applies a recommendation to the catalog. Server mode updates `products` under the vendor RLS policy first. */
export async function applyProductChange(productId: string, patch: { price?: number; stockDelta?: number }): Promise<string> {
  const s = useNaflis.getState();
  const product = s.products.find((p) => p.id === productId);
  if (supabase && product && /^[0-9a-f-]{36}$/i.test(productId)) {
    const update: Record<string, number> = {};
    if (patch.price !== undefined) update.price = patch.price;
    if (patch.stockDelta) update.stock = Math.max(0, product.stock + patch.stockDelta);
    const { data, error } = await supabase.from("products").update(update).eq("id", productId).select("id");
    if (error) throw isRlsDenied(error) ? new AccessDeniedError("This product belongs to another store.") : new Error(error.message);
    // RLS-filtered updates succeed with zero rows instead of erroring.
    if (!data?.length) throw new AccessDeniedError("This product belongs to another store.");
  }
  const res = useNaflis.getState().sellerUpdateProduct(productId, patch);
  if (res.status === 403) throw new AccessDeniedError(res.message);
  if (!res.ok) throw new Error(res.message);
  return res.message;
}
