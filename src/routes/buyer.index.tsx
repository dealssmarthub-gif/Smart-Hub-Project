import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { Flame, Zap, Package, BadgePercent, Bell, Clock, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProductCard } from "@/components/naflis/ProductCard";
import { useNaflis } from "@/lib/naflis/store";
import { useCategories } from "@/services/categories";
import { GHS } from "@/lib/naflis/format";
import { fetchSellerProducts } from "@/services/sellerApi";
import { IS_LIVE } from "@/lib/appMode";
import { CampusFilter } from "@/components/naflis/shop/CampusFilter";
import { EmptyMarket, useMarketplace } from "@/components/naflis/shop/Marketplace";
import { ShowMore, SortControl } from "@/components/naflis/shop/SortControl";
import { useMallOrder, usePaged } from "@/components/naflis/shop/useMallOrder";
import { mallSortSearch } from "@/lib/naflis/mallOrder";

export const Route = createFileRoute("/buyer/")({
  validateSearch: mallSortSearch.parse,
  component: BuyerHome,
});

function BuyerHome() {
  const initialProducts = useNaflis((s) => s.products);
  const [products, setProducts] = useState<any[]>(initialProducts);

  useEffect(() => {
    const fetchApprovedProducts = async () => {
      try {
        const data = await fetchSellerProducts();

        // Real products only carry what the database holds: no invented flash sale.
        if (data && data.length > 0) {
          setProducts(data);
          useNaflis.setState({ products: data });
        }
      } catch (err) {
        console.error("Error fetching buyer products:", err);
      }
    };
    fetchApprovedProducts();
  }, []);
  // One marketplace: mall products and student listings, filtered by campus.
  const { all, items, campus, setCampus, options } = useMarketplace(products);
  const promos = useNaflis((s) => s.promos);
  const { tree: categories } = useCategories("mall");
  const user = useNaflis((s) => s.users.find((u) => u.id === s.currentUserId));

  const flash = useMemo(() => items.filter((p) => p.flashSale).slice(0, 4), [items]);
  // Demo: trending by demand. Live has no demand data: every approved seller's
  // products, shuffled for the session unless a sort is picked, a page at a time.
  const { ordered, sort, setSort } = useMallOrder(items);
  const page = usePaged(ordered);
  const trending = useMemo(
    () => (IS_LIVE ? page.visible : [...items].sort((a, b) => b.demand - a.demand).slice(0, 4)),
    [items, page.visible],
  );
  // Only genuine reductions (a stored old price above today's price).
  const priceDrop = useMemo(
    () =>
      items
        .filter((p) => p.originalPrice > p.price)
        .sort((a, b) => (b.originalPrice - b.price) / b.originalPrice - (a.originalPrice - a.price) / a.originalPrice)
        .slice(0, 4),
    [items],
  );
  // Products don't store a location in live mode yet.
  const nearYou = useMemo(() => (IS_LIVE ? [] : items.filter((p) => p.location === "Accra").slice(0, 4)), [items]);

  return (
    <div className="space-y-8">
      {/* Hero banner */}
      <div className="rounded-2xl gradient-hero p-6 text-white shadow-premium sm:p-8">
        <p className="text-xs uppercase tracking-widest text-white">Welcome back{user ? `, ${user.name.split(" ")[0]}` : ""}</p>
        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Great deals matched to your budget</h1>
        <p className="mt-2 max-w-xl text-sm text-white">
          {IS_LIVE
            ? "Products from approved sellers, all in one place."
            : "Flash sales, verified discounts, and flexible payment options — all in one place."}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild size="sm" className="bg-white text-primary-deep hover:bg-white/90">
            <Link to="/buyer/search">{IS_LIVE ? "Browse products" : "Browse deals"}</Link>
          </Button>
          {/* Demo only: wallet funding isn't live yet. */}
          {!IS_LIVE && (
            <Button asChild size="sm" variant="outline" className="border-white/40 bg-white/10 text-white hover:bg-white/20">
              <Link to="/buyer/wallet">Fund wallet</Link>
            </Button>
          )}
        </div>
      </div>

      {/* Promo strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {promos.map((p) => (
          <div key={p.code} className="rounded-2xl border border-border-soft bg-card p-3">
            <div className="flex items-center gap-2">
              <BadgePercent className="h-4 w-4 text-link" />
              <span className="font-mono text-sm font-bold">{p.code}</span>
            </div>
            <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{p.description}</p>
          </div>
        ))}
      </div>

      {/* Category shortcuts */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Categories</h2>
          <Link to="/buyer/categories" className="text-sm text-link hover:underline">All categories →</Link>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
          {categories.slice(0, 12).map((c) => (
            <Link
              key={c.id}
              to="/buyer/search"
              search={{ cat: c.name }}
              className="rounded-lg border bg-card px-3 py-2 text-center text-xs font-medium transition hover:border-primary"
            >
              <Package className="mx-auto mb-1 h-4 w-4 text-link" />
              {c.name}
            </Link>
          ))}
        </div>
      </section>

      {all.length > 0 && (
        <div className="flex flex-wrap justify-end gap-2">
          <CampusFilter value={campus} options={options} onChange={setCampus} />
          {IS_LIVE && <SortControl value={sort} onChange={setSort} />}
        </div>
      )}

      {/* Nothing here (at all, or at this campus): never blank. */}
      {items.length === 0 && (
        <EmptyMarket campus={campus} anyElsewhere={all.length > 0} onShowAll={() => setCampus(null)} />
      )}

      {/* Each product row only shows when it has products. */}
      {flash.length > 0 && (
        <section>
          <SectionHeader icon={<Zap className="h-5 w-5 text-orange-ink" />} title="Flash sales" subtitle="Ending in hours — verified discounts" />
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {flash.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      )}

      {trending.length > 0 && (
        <section>
          <SectionHeader
            icon={IS_LIVE ? <Package className="h-5 w-5 text-link" /> : <Flame className="h-5 w-5 text-error" />}
            title={IS_LIVE ? "In the mall" : "Trending now"}
            subtitle={IS_LIVE ? "Products from approved sellers" : "Popular in your region"}
          />
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {trending.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
          {IS_LIVE && page.hasMore && (
            <ShowMore remaining={page.remaining} onClick={page.showMore} />
          )}
        </section>
      )}

      {priceDrop.length > 0 && (
        <section>
          <SectionHeader icon={<TrendingUp className="h-5 w-5 text-success" />} title="Biggest price drops" subtitle="Genuine reductions from 30-day history" />
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {priceDrop.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      )}

      {nearYou.length > 0 && (
        <section>
          <SectionHeader icon={<Package className="h-5 w-5 text-link" />} title="Popular in Accra" subtitle="Fast delivery from local sellers" />
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {nearYou.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      )}

      {/* CTA row */}
      <section className="grid gap-4 md:grid-cols-3">
        {/* Demo only: Reserve & Pay and Pay Later aren't connected to payments yet. */}
        {!IS_LIVE && (
          <>
            <PromoCard icon={<Clock className="h-5 w-5" />} title="Reserve & Pay" body="Lock in the discount today, pay gradually, receive when done." to="/buyer/reserve" />
            <PromoCard icon={<TrendingUp className="h-5 w-5" />} title="Take Now, Pay Later" body="Receive the product now and pay over time." to="/buyer/installments" />
          </>
        )}
        <PromoCard icon={<Bell className="h-5 w-5" />} title="Product not available?" body="Tell us what you want — we'll match sellers to your budget." to="/buyer/search" />
      </section>
    </div>
  );
}

function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        {icon}
        <div>
          <h2 className="text-lg font-bold leading-tight">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <Link to="/buyer/search" className="text-sm text-link hover:underline">See all →</Link>
    </div>
  );
}

function PromoCard({ icon, title, body, to }: { icon: React.ReactNode; title: string; body: string; to: string }) {
  return (
    <Link to={to} className="group rounded-3xl border border-border-soft bg-card shadow-soft p-5 transition hover:border-primary hover:shadow-soft">
      <div className="mb-3 grid h-10 w-10 place-items-center rounded-lg bg-accent text-link">{icon}</div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      <p className="mt-3 text-xs font-semibold text-link group-hover:underline">Explore →</p>
    </Link>
  );
}
