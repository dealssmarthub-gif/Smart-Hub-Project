import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowDownRight, ArrowLeft, ArrowUpRight, BrainCircuit, CheckCircle2, Flame, Layers, Lock, PackagePlus,
  RefreshCw, Search, Sparkles, Tag, X,
} from "lucide-react";
import { toast } from "sonner";
import { RoleShell, MetricCard } from "@/components/naflis/RoleShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/lib/supabase";
import { GHS } from "@/lib/naflis/format";
import { mapDbProduct } from "@/lib/naflis/mapProduct";
import { useNaflis, CAMPUSES } from "@/lib/naflis/store";
import { AccessDeniedError, SubscriptionRequiredError } from "@/lib/naflis/errors";
import {
  FEATURE_TIER,
  TIER_PRICE_GHS,
  TIER_RANK,
  buildReport,
  hasFeature,
  type IntelFeature,
  type Tier,
} from "@/lib/naflis/intelligence";
import { applyProductChange, useSellerDemand } from "@/services/intelligenceService";

export const Route = createFileRoute("/seller/intelligence")({
  component: SellerIntelligence,
});

const TIER_LABEL: Record<Tier, string> = { starter: "Starter", growth: "Growth", professional: "Professional", enterprise: "Enterprise" };

/** The seller's store; with Supabase, loads the vendor row (and plan) if this browser hasn't seen it yet. */
function useMyStore() {
  const userId = useNaflis((s) => s.currentUserId);
  const local = useNaflis((s) => s.stores.find((st) => st.ownerId === s.currentUserId));
  const q = useQuery({
    queryKey: ["seller-vendor", userId],
    enabled: Boolean(supabase && userId && /^[0-9a-f-]{36}$/i.test(userId)),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: vendor, error } = await supabase!.from("vendors").select("*").eq("user_id", userId!).maybeSingle();
      if (error) throw new Error(error.message);
      if (!vendor) return null;
      const { data: rows } = await supabase!.from("products").select("*").eq("vendor_id", vendor.id);
      useNaflis.setState((s) => {
        const tier = (vendor.subscription_tier ?? "starter") as Tier;
        const store = {
          id: vendor.id, name: vendor.store_name, ownerId: vendor.user_id, logo: vendor.logo_url ?? "", tagline: vendor.description ?? "",
          rating: 0, reviews: 0, verified: vendor.status === "approved", followers: 0, location: "Accra", categories: [], subscription: tier,
        };
        const others = s.products.filter((p) => p.storeId !== vendor.id);
        return {
          stores: s.stores.some((st) => st.id === vendor.id) ? s.stores.map((st) => (st.id === vendor.id ? { ...st, ...store } : st)) : [...s.stores, store],
          products: [...others, ...(rows ?? []).map((r) => mapDbProduct(r, { storeId: vendor.id }))],
        };
      });
      return vendor.id as string;
    },
  });
  return { store: local, loading: q.isLoading && !local, error: q.error as Error | null };
}

function SellerIntelligence() {
  const navigate = useNavigate();
  const { store, loading: storeLoading, error: storeError } = useMyStore();
  const products = useNaflis((s) => s.products);
  const orders = useNaflis((s) => s.orders);
  const prefs = useNaflis((s) => s.intelligence);
  const setPrefs = useNaflis((s) => s.setIntelligencePref);
  const dismiss = useNaflis((s) => s.dismissInsight);
  const restore = useNaflis((s) => s.restoreInsights);
  const saveBundle = useNaflis((s) => s.saveBundleDraft);
  const setTier = useNaflis((s) => s.setStoreSubscription);
  const requestUpgrade = useNaflis((s) => s.requestSubscriptionUpgrade);

  const tier: Tier = (store?.subscription as Tier) ?? "starter";
  const unlocked = TIER_RANK[tier] >= TIER_RANK.growth;
  const campus = prefs.campus ?? "UG - Legon";
  const demand = useSellerDemand(campus, Boolean(store) && unlocked);
  const [busy, setBusy] = useState<string | null>(null);

  const mine = useMemo(() => products.filter((p) => p.storeId === store?.id), [products, store?.id]);
  const report = useMemo(() => {
    if (!store || !demand.data) return null;
    return buildReport({ logs: demand.data.logs, mine, market: products, orders, campus, now: Date.now() });
  }, [store, demand.data, mine, products, orders, campus]);

  const visible = <T extends { id: string }>(xs: T[]) => xs.filter((x) => !prefs.dismissed[x.id]);
  const dismissedCount = Object.keys(prefs.dismissed).length;

  const act = async (id: string, fn: () => Promise<string>, success: string) => {
    setBusy(id);
    try {
      const detail = await fn();
      toast.success(`${success} (${detail})`);
      dismiss(id);
    } catch (err) {
      toast.error(err instanceof AccessDeniedError ? `403 · ${err.message}` : err instanceof Error ? err.message : "Couldn't apply that change.");
    } finally {
      setBusy(null);
    }
  };

  const upgrade = (target: Exclude<Tier, "starter">) => {
    if (!store) return;
    if (supabase) {
      // Billing isn't wired to a payment provider yet: the request goes to NAFLIS admins.
      requestUpgrade(store.id, target);
      void supabase.from("subscription_requests").insert({ vendor_id: store.id, tier: target }).then(() => undefined, () => undefined);
      toast.success(`Upgrade to ${TIER_LABEL[target]} requested — our team will activate it shortly.`);
    } else {
      const r = setTier(store.id, target);
      r.ok ? toast.success(`Demo: ${TIER_LABEL[target]} plan activated (no charge).`) : toast.error(r.message);
    }
  };

  // ------------------------------------------------------------------ states
  const shell = (body: React.ReactNode) => (
    <RoleShell title="Seller Intelligence" subtitle="Campus demand, restock alerts, price moves and bundle ideas — refreshed from student search activity." icon={BrainCircuit} badge={TIER_LABEL[tier]}>
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link to="/seller"><ArrowLeft className="mr-1 h-4 w-4" /> Seller dashboard</Link>
      </Button>
      {body}
    </RoleShell>
  );

  if (storeLoading) return shell(<LoadingGrid />);
  if (storeError) return shell(<ErrorCard message={storeError.message} onRetry={() => window.location.reload()} />);
  if (!store) {
    return shell(
      <EmptyCard
        icon={<PackagePlus className="h-10 w-10" />}
        title="Set up your shop first"
        body="Seller Intelligence analyses demand for your catalog. Finish store onboarding to get started."
        action={<Button asChild><Link to="/seller">Go to Seller dashboard</Link></Button>}
      />,
    );
  }
  if (!unlocked) return shell(<UpgradeGate tier={tier} onUpgrade={upgrade} requested={prefs.upgradeRequests.some((r) => r.storeId === store.id)} />);

  const err = demand.error as Error | null;
  if (err instanceof SubscriptionRequiredError) {
    return shell(<UpgradeGate tier={tier} onUpgrade={upgrade} requested={prefs.upgradeRequests.some((r) => r.storeId === store.id)} serverSays />);
  }
  if (err instanceof AccessDeniedError) return shell(<ErrorCard status={403} message={err.message} />);

  const header = (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <select
        aria-label="Market campus"
        className="h-9 rounded-lg border bg-card px-2.5 text-xs font-semibold"
        value={campus}
        onChange={(e) => setPrefs({ campus: e.target.value })}
      >
        {CAMPUSES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <Button size="sm" variant="outline" onClick={() => demand.refetch()} disabled={demand.isFetching}>
        <RefreshCw className={`mr-1 h-3.5 w-3.5 ${demand.isFetching ? "animate-spin" : ""}`} /> Refresh
      </Button>
      {demand.data && (
        <span className="text-xs text-muted-foreground">
          {demand.data.source === "demo" ? "Demo data" : "Live demand"} · updated {new Date(demand.dataUpdatedAt || demand.data.fetchedAt).toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" })}
        </span>
      )}
      {dismissedCount > 0 && (
        <Button size="sm" variant="ghost" className="ml-auto" onClick={restore}>Show {dismissedCount} dismissed</Button>
      )}
    </div>
  );

  if (!demand.data && demand.isLoading) return shell(<>{header}<LoadingGrid /></>);
  if (!demand.data && err) return shell(<>{header}<ErrorCard message={err.message} onRetry={() => demand.refetch()} /></>);
  if (!report) return shell(<>{header}<LoadingGrid /></>);

  const growth = report.totals.searchesPrev7 ? Math.round(((report.totals.searches7 - report.totals.searchesPrev7) / report.totals.searchesPrev7) * 100) : 0;
  const restock = visible(report.restock);
  const pricing = visible(report.pricing);
  const bundles = visible(report.bundles);
  const unmet = visible(report.unmet);

  return shell(
    <>
      {header}
      {err && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs">
          <AlertTriangle className="h-4 w-4 text-warning" /> Couldn't refresh ({err.message}). Showing the last data from {new Date(demand.data!.fetchedAt).toLocaleString("en-GH")}.
          <Button size="sm" variant="ghost" onClick={() => demand.refetch()}>Retry</Button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Searches · 7 days" value={String(report.totals.searches7)} hint={`${growth >= 0 ? "+" : ""}${growth}% vs previous week`} />
        <MetricCard label="Distinct search terms" value={String(report.totals.uniqueTerms)} hint={campus} />
        <MetricCard label="Restock alerts" value={String(restock.length)} hint={`${restock.filter((r) => r.severity === "critical").length} critical`} />
        <MetricCard label="Unmet demand" value={String(unmet.length)} hint="Searched, rarely found" />
      </div>

      {report.totals.uniqueTerms === 0 ? (
        <div className="mt-6">
          <EmptyCard icon={<Search className="h-10 w-10" />} title={`No searches on ${campus} in the last 28 days`} body="Pick another campus, or check back as students start searching." />
        </div>
      ) : (
        <Tabs value={prefs.tab ?? "trends"} onValueChange={(v) => setPrefs({ tab: v })} className="mt-6">
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="trends"><Flame className="mr-1 h-3.5 w-3.5" /> Trends</TabsTrigger>
            <TabsTrigger value="restock"><AlertTriangle className="mr-1 h-3.5 w-3.5" /> Restock ({restock.length})</TabsTrigger>
            <TabsTrigger value="pricing"><Tag className="mr-1 h-3.5 w-3.5" /> Pricing {hasFeature(tier, "pricing") ? `(${pricing.length})` : <Lock className="ml-1 h-3 w-3" />}</TabsTrigger>
            <TabsTrigger value="bundles"><Layers className="mr-1 h-3.5 w-3.5" /> Bundles {hasFeature(tier, "bundles") ? `(${bundles.length})` : <Lock className="ml-1 h-3 w-3" />}</TabsTrigger>
            <TabsTrigger value="unmet"><Sparkles className="mr-1 h-3.5 w-3.5" /> Unmet demand ({unmet.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="trends" className="mt-4 space-y-2">
            {report.trends.length === 0 && <Empty text="No term is growing fast this week. The top searches are below." />}
            {(report.trends.length ? report.trends : report.terms.slice(0, 6)).map((t) => (
              <div key={t.query} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{t.label}</p>
                  <p className="text-xs text-muted-foreground">{t.last7} searches this week · {t.prev7} the week before · {Math.round(t.zeroResultRate * 100)}% found nothing</p>
                </div>
                <Badge className={t.growthPct >= 0 ? "bg-success text-success-foreground" : ""} variant={t.growthPct >= 0 ? "default" : "secondary"}>
                  {t.growthPct >= 0 ? <ArrowUpRight className="mr-0.5 h-3 w-3" /> : <ArrowDownRight className="mr-0.5 h-3 w-3" />}
                  {t.growthPct}%
                </Badge>
                <Button size="sm" variant="outline" onClick={() => navigate({ to: "/seller", search: { list: t.label } })}>List this</Button>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="restock" className="mt-4 space-y-2">
            {mine.length === 0 && <Empty text="Add products to get restock alerts." />}
            {mine.length > 0 && restock.length === 0 && <Empty text="Stock levels look healthy for current demand." good />}
            {restock.map((r) => (
              <Recommendation
                key={r.id}
                tone={r.severity}
                title={r.productName}
                body={r.reason}
                meta={`Sells ~${r.velocity}/day · suggest ordering ${r.suggestedQty}`}
                onDismiss={() => dismiss(r.id)}
                action={
                  <Button size="sm" disabled={busy === r.id} onClick={() => act(r.id, () => applyProductChange(r.productId, { stockDelta: r.suggestedQty }), "Stock updated")}>
                    Add {r.suggestedQty} to stock
                  </Button>
                }
              />
            ))}
          </TabsContent>

          <TabsContent value="pricing" className="mt-4 space-y-2">
            {!hasFeature(tier, "pricing") ? (
              <FeatureLock feature="pricing" onUpgrade={upgrade} />
            ) : pricing.length === 0 ? (
              <Empty text="Your prices are in line with similar listings." good />
            ) : (
              pricing.map((p) => (
                <Recommendation
                  key={p.id}
                  tone={p.direction === "lower" ? "warning" : "info"}
                  title={`${p.productName}: ${GHS(p.currentPrice)} → ${GHS(p.suggestedPrice)}`}
                  body={p.reason}
                  meta={`Market median ${GHS(p.marketMedian)} · ${p.comparables} comparables · ${p.confidence} confidence`}
                  onDismiss={() => dismiss(p.id)}
                  action={
                    <Button size="sm" disabled={busy === p.id} onClick={() => act(p.id, () => applyProductChange(p.productId, { price: p.suggestedPrice }), "Price updated")}>
                      {p.direction === "lower" ? "Lower" : "Raise"} to {GHS(p.suggestedPrice)}
                    </Button>
                  }
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="bundles" className="mt-4 space-y-2">
            {!hasFeature(tier, "bundles") ? (
              <FeatureLock feature="bundles" onUpgrade={upgrade} />
            ) : bundles.length === 0 ? (
              <Empty text="Not enough co-purchase or co-search signal for bundles yet." />
            ) : (
              bundles.map((b) => (
                <Recommendation
                  key={b.id}
                  tone="info"
                  title={b.names.join(" + ")}
                  body={b.reason}
                  meta={`Bundle at ${GHS(b.bundlePrice)} (${b.discountPct}% off)`}
                  onDismiss={() => dismiss(b.id)}
                  action={
                    <Button
                      size="sm"
                      onClick={() => {
                        saveBundle({ id: b.id, storeId: store.id, productIds: b.productIds, names: b.names, discountPct: b.discountPct, bundlePrice: b.bundlePrice, createdAt: Date.now() });
                        toast.success("Bundle saved as a draft offer.");
                      }}
                    >
                      Save bundle
                    </Button>
                  }
                />
              ))
            )}
            {prefs.bundles.filter((b) => b.storeId === store.id).length > 0 && (
              <div className="rounded-xl border bg-card p-4 text-sm">
                <p className="mb-1 font-semibold">Saved bundle drafts</p>
                {prefs.bundles.filter((b) => b.storeId === store.id).map((b) => (
                  <p key={b.id} className="text-xs text-muted-foreground">{b.names.join(" + ")} · {GHS(b.bundlePrice)} ({b.discountPct}% off)</p>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="unmet" className="mt-4 space-y-2">
            {unmet.length === 0 && <Empty text="No big gaps — students are finding what they search for." good />}
            {unmet.map((u) => (
              <Recommendation
                key={u.id}
                tone="info"
                title={u.label}
                body={`${u.searches} searches in 28 days; ${Math.round(u.zeroResultRate * 100)}% returned no results.`}
                meta={u.growthPct ? `${u.growthPct >= 0 ? "+" : ""}${u.growthPct}% week on week` : undefined}
                onDismiss={() => dismiss(u.id)}
                action={<Button size="sm" onClick={() => navigate({ to: "/seller", search: { list: u.label } })}>List this product</Button>}
              />
            ))}
          </TabsContent>
        </Tabs>
      )}

      {prefs.applied.length > 0 && (
        <section className="mt-8 rounded-xl border bg-card p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Applied recommendations</p>
          <ul className="space-y-1 text-xs">
            {prefs.applied.slice(0, 8).map((a, i) => (
              <li key={`${a.id}-${i}`} className="flex justify-between gap-2">
                <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-success" /> {a.detail}</span>
                <span className="shrink-0 text-muted-foreground">{new Date(a.at).toLocaleString("en-GH")}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="mt-6 text-[11px] text-muted-foreground">
        Recommendations come from transparent rules over search logs, your orders and similar listings — each one shows the numbers behind it.
      </p>
    </>,
  );
}

// ---------------------------------------------------------------------------

function Recommendation({ tone, title, body, meta, action, onDismiss }: {
  tone: "critical" | "warning" | "info"; title: string; body: string; meta?: string; action: React.ReactNode; onDismiss: () => void;
}) {
  const color = tone === "critical" ? "border-l-error" : tone === "warning" ? "border-l-warning" : "border-l-sky-500";
  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-xl border border-l-4 bg-card p-3 ${color}`}>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        <p className="text-xs">{body}</p>
        {meta && <p className="mt-0.5 text-[11px] text-muted-foreground">{meta}</p>}
      </div>
      {action}
      <button onClick={onDismiss} aria-label="Dismiss" className="rounded p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
    </div>
  );
}

function UpgradeGate({ tier, onUpgrade, requested, serverSays }: { tier: Tier; onUpgrade: (t: Exclude<Tier, "starter">) => void; requested: boolean; serverSays?: boolean }) {
  const plans: { tier: Exclude<Tier, "starter">; features: string[] }[] = [
    { tier: "growth", features: ["Fast-growing campus trends", "Restock alerts with suggested quantities", "Unmet-demand opportunities"] },
    { tier: "professional", features: ["Everything in Growth", "Price adjustment recommendations", "Bundle suggestions from co-purchases"] },
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-2xl border bg-card p-5">
        <Lock className="mt-0.5 h-5 w-5 text-sky-500" />
        <div>
          <p className="font-bold">Seller Intelligence is part of the Growth plan</p>
          <p className="text-sm text-muted-foreground">
            You're on {TIER_LABEL[tier]}. {serverSays ? "The NAFLIS server confirmed this plan doesn't include market demand data." : "Upgrade to see what students on each campus are searching for."}
          </p>
          {requested && <p className="mt-1 text-xs text-success">Upgrade requested — we'll notify you when it's active.</p>}
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {plans.map((p) => (
          <div key={p.tier} className="rounded-2xl border bg-card p-5">
            <p className="font-bold">{TIER_LABEL[p.tier]} · {GHS(TIER_PRICE_GHS[p.tier])}/month</p>
            <ul className="mt-2 space-y-1 text-sm">
              {p.features.map((f) => <li key={f} className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-success" /> {f}</li>)}
            </ul>
            <Button className="mt-3 w-full" onClick={() => onUpgrade(p.tier)}>Upgrade to {TIER_LABEL[p.tier]}</Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function FeatureLock({ feature, onUpgrade }: { feature: IntelFeature; onUpgrade: (t: Exclude<Tier, "starter">) => void }) {
  const need = FEATURE_TIER[feature] as Exclude<Tier, "starter">;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed bg-card p-5">
      <Lock className="h-5 w-5 text-muted-foreground" />
      <p className="flex-1 text-sm">This insight is included in the {TIER_LABEL[need]} plan.</p>
      <Button size="sm" onClick={() => onUpgrade(need)}>Upgrade to {TIER_LABEL[need]}</Button>
    </div>
  );
}

function LoadingGrid() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading intelligence">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
    </div>
  );
}

function ErrorCard({ message, onRetry, status }: { message: string; onRetry?: () => void; status?: number }) {
  return (
    <div role="alert" className="rounded-2xl border border-error/40 bg-error/5 p-6 text-center">
      <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-error" />
      <p className="font-semibold">{status === 403 ? "403 · Access denied" : "Couldn't load Seller Intelligence"}</p>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      {onRetry && <Button className="mt-3" variant="outline" onClick={onRetry}><RefreshCw className="mr-1 h-4 w-4" /> Try again</Button>}
    </div>
  );
}

function EmptyCard({ icon, title, body, action }: { icon: React.ReactNode; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed bg-card p-10 text-center">
      <div className="mx-auto mb-3 w-fit text-muted-foreground">{icon}</div>
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function Empty({ text, good }: { text: string; good?: boolean }) {
  return (
    <p className="flex items-center gap-2 rounded-xl border bg-card p-5 text-sm text-muted-foreground">
      {good && <CheckCircle2 className="h-4 w-4 text-success" />} {text}
    </p>
  );
}
