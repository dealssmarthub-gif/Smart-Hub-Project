import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { Flame, Zap, Package, BadgePercent, Bell, Clock, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProductCard } from "@/components/naflis/ProductCard";
import { CATEGORIES, useNaflis } from "@/lib/naflis/store";
import { GHS } from "@/lib/naflis/format";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/buyer/")({
  component: BuyerHome,
});

function BuyerHome() {
  const initialProducts = useNaflis((s) => s.products);
  const [products, setProducts] = useState<any[]>(initialProducts);

  useEffect(() => {
    const fetchApprovedProducts = async () => {
      try {
        const { data, error } = await supabase
          .from("products")
          .select("*, vendors!inner(status, store_name, logo_url, description)")
          .eq("vendors.status", "approved");

        if (data && data.length > 0) {
          const mapped = data.map((p) => ({
            id: p.id,
            storeId: p.vendor_id,
            name: p.title,
            image: p.images?.[0] || "https://images.unsplash.com/photo-1523275335684-37898b6baf30",
            gallery: p.images || [],
            description: p.description || "",
            price: p.price,
            originalPrice: p.price * 1.2,
            stock: p.stock,
            demand: 75,
            category: p.category,
            flashSale: true,
            priceHistory: [
              { date: "2026-07-01", price: Math.round(p.price * 1.15) },
              { date: "2026-07-05", price: Math.round(p.price * 1.10) },
              { date: "2026-07-10", price: Math.round(p.price * 1.05) },
              { date: "2026-07-15", price: p.price },
            ]
          }));
          setProducts(mapped);
          useNaflis.setState({ products: mapped });
        }
      } catch (err) {
        console.error("Error fetching buyer products:", err);
      }
    };
    fetchApprovedProducts();
  }, []);
  const promos = useNaflis((s) => s.promos);
  const user = useNaflis((s) => s.users.find((u) => u.id === s.currentUserId));

  const flash = useMemo(() => products.filter((p) => p.flashSale).slice(0, 4), [products]);
  const trending = useMemo(() => [...products].sort((a, b) => b.demand - a.demand).slice(0, 8), [products]);
  const priceDrop = useMemo(
    () => [...products].sort((a, b) => (b.originalPrice - b.price) / b.originalPrice - (a.originalPrice - a.price) / a.originalPrice).slice(0, 4),
    [products],
  );
  const nearYou = useMemo(() => products.filter((p) => p.location === "Accra").slice(0, 4), [products]);

  return (
    <div className="space-y-8">
      {/* Hero banner */}
      <div className="rounded-2xl gradient-hero p-6 text-white shadow-premium sm:p-8">
        <p className="text-xs uppercase tracking-widest text-white/70">Welcome back{user ? `, ${user.name.split(" ")[0]}` : ""}</p>
        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Great deals matched to your budget</h1>
        <p className="mt-2 max-w-xl text-sm text-white/80">
          Flash sales, verified discounts, and flexible payment options — all in one place.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild size="sm" className="bg-white text-navy hover:bg-white/90">
            <Link to="/buyer/search">Browse deals</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="border-white/40 bg-white/10 text-white hover:bg-white/20">
            <Link to="/buyer/wallet">Fund wallet</Link>
          </Button>
        </div>
      </div>

      {/* Promo strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {promos.map((p) => (
          <div key={p.code} className="rounded-xl border bg-card p-3">
            <div className="flex items-center gap-2">
              <BadgePercent className="h-4 w-4 text-violet" />
              <span className="font-mono text-sm font-bold">{p.code}</span>
            </div>
            <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{p.description}</p>
          </div>
        ))}
      </div>

      {/* Category shortcuts */}
      <section>
        <h2 className="mb-3 text-lg font-bold">Categories</h2>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
          {CATEGORIES.slice(0, 12).map((c) => (
            <Link
              key={c}
              to="/buyer/search"
              search={{ q: c }}
              className="rounded-lg border bg-card px-3 py-2 text-center text-xs font-medium transition hover:border-violet"
            >
              <Package className="mx-auto mb-1 h-4 w-4 text-violet" />
              {c}
            </Link>
          ))}
        </div>
      </section>

      {/* Flash sales */}
      <section>
        <SectionHeader icon={<Zap className="h-5 w-5 text-gold" />} title="Flash sales" subtitle="Ending in hours — verified discounts" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {flash.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      </section>

      {/* Trending */}
      <section>
        <SectionHeader icon={<Flame className="h-5 w-5 text-error" />} title="Trending now" subtitle="Popular in your region" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {trending.slice(0, 4).map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      </section>

      {/* Price drops */}
      <section>
        <SectionHeader icon={<TrendingUp className="h-5 w-5 text-success" />} title="Biggest price drops" subtitle="Genuine reductions from 30-day history" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {priceDrop.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      </section>

      {/* Near you */}
      <section>
        <SectionHeader icon={<Package className="h-5 w-5 text-violet" />} title="Popular in Accra" subtitle="Fast delivery from local sellers" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {nearYou.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      </section>

      {/* CTA row */}
      <section className="grid gap-4 md:grid-cols-3">
        <PromoCard icon={<Clock className="h-5 w-5" />} title="Reserve & Pay" body="Lock in the discount today, pay gradually, receive when done." to="/buyer/reserve" />
        <PromoCard icon={<TrendingUp className="h-5 w-5" />} title="Take Now, Pay Later" body="Receive the product now and pay over time." to="/buyer/installments" />
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
      <Link to="/buyer/search" className="text-sm text-violet hover:underline">See all →</Link>
    </div>
  );
}

function PromoCard({ icon, title, body, to }: { icon: React.ReactNode; title: string; body: string; to: string }) {
  return (
    <Link to={to} className="group rounded-2xl border bg-card p-5 transition hover:border-violet hover:shadow-premium">
      <div className="mb-3 grid h-10 w-10 place-items-center rounded-lg bg-accent text-violet">{icon}</div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      <p className="mt-3 text-xs font-semibold text-violet group-hover:underline">Explore →</p>
    </Link>
  );
}
