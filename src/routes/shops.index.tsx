import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, Store, X } from "lucide-react";
import { useMemo, useState } from "react";
import { BrandLoading } from "@/components/naflis/Logo";
import { Input } from "@/components/ui/input";
import { CampusFilter } from "@/components/naflis/shop/CampusFilter";
import { SellButton, useMarketplace } from "@/components/naflis/shop/Marketplace";
import { ShopCard, ShopError } from "@/components/naflis/shop/ShopParts";
import { IS_LIVE } from "@/lib/appMode";
import { filterShops, shopFacts } from "@/lib/naflis/shops";
import { fetchApprovedShops } from "@/services/sellerApi";

export const Route = createFileRoute("/shops/")({
  head: () => ({ meta: [{ title: "Shops · NAFLIS Mall" }] }),
  component: ShopsDirectory,
});

const secondaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-4 text-sm font-bold text-foreground transition hover:bg-accent";

/** Every approved shop: search, the mall's campus filter, and an empty state. */
function ShopsDirectory() {
  const shops = useQuery({
    queryKey: ["shops"],
    queryFn: fetchApprovedShops,
    staleTime: 60_000,
    enabled: IS_LIVE,
  });
  // The catalogue gives each card its campus, category, item count and student label.
  const { all, campus, setCampus, options, loading: productsLoading } = useMarketplace();
  const [q, setQ] = useState("");

  const list = useMemo(() => shops.data ?? [], [shops.data]);
  const shown = useMemo(() => filterShops(list, all, q, campus), [list, all, q, campus]);
  const filtered = Boolean(q.trim() || campus);

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-extrabold tracking-tight">Shops</h1>
        <p className="text-sm text-muted-foreground">Every approved seller in NAFLIS Mall.</p>
      </header>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="relative block flex-1">
          <span className="sr-only">Search shops</span>
          <Search
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
            strokeWidth={1.8}
            aria-hidden
          />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search shops by name or category"
            className="h-12 rounded-2xl border-border bg-card pl-12 pr-12 shadow-soft"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label="Clear search"
              className="absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          )}
        </label>
        <CampusFilter value={campus} options={options} onChange={setCampus} />
      </div>

      {shops.isError ? (
        <ShopError
          message="Shops couldn't be loaded. Check your connection and try again."
          onRetry={() => void shops.refetch()}
        />
      ) : (IS_LIVE && shops.isPending) || (productsLoading && list.length > 0) ? (
        <BrandLoading label="Loading shops…" className="rounded-3xl bg-card p-6" />
      ) : list.length === 0 ? (
        <div className="rounded-3xl border border-border-soft bg-card p-8 text-center shadow-soft">
          <Store className="mx-auto h-10 w-10 text-link" strokeWidth={1.8} aria-hidden />
          <h2 className="mt-3 text-lg font-extrabold">No shops yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Shops appear here once their seller is approved. Have something to sell?
          </p>
          <div className="mt-4 flex justify-center">
            <SellButton />
          </div>
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-3xl border border-border-soft bg-card p-8 text-center shadow-soft">
          <Search
            className="mx-auto h-10 w-10 text-muted-foreground"
            strokeWidth={1.8}
            aria-hidden
          />
          <h2 className="mt-3 text-lg font-extrabold">No shops match</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            {campus
              ? `Nothing for "${q.trim() || "your search"}" at ${campus}. Try another word or all campuses.`
              : "Try another word."}
          </p>
          {filtered && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                className={secondaryBtn}
                onClick={() => {
                  setQ("");
                  setCampus(null);
                }}
              >
                Show all shops
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          <p role="status" className="text-sm text-muted-foreground">
            {shown.length} {shown.length === 1 ? "shop" : "shops"}
            {campus ? ` at ${campus}` : ""}
          </p>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((shop) => (
              <li key={shop.id}>
                <ShopCard shop={shop} facts={shopFacts(shop.id, all)} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
