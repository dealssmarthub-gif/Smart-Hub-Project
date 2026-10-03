import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { BadgePercent, TrendingUp, Zap } from "lucide-react";
import { ProductCard } from "@/components/naflis/ProductCard";
import { useNaflis } from "@/lib/naflis/store";

export const Route = createFileRoute("/buyer/deals")({
  component: DealsPage,
});

const discount = (p: { price: number; originalPrice: number }) =>
  p.originalPrice > 0 ? (p.originalPrice - p.price) / p.originalPrice : 0;

function DealsPage() {
  const products = useNaflis((s) => s.products);
  const promos = useNaflis((s) => s.promos);

  const flash = useMemo(() => products.filter((p) => p.flashSale), [products]);
  const biggest = useMemo(
    () => products.filter((p) => discount(p) > 0).sort((a, b) => discount(b) - discount(a)).slice(0, 12),
    [products],
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Deals</h1>
        <p className="text-sm text-muted-foreground">Flash sales, promo codes and the deepest verified discounts.</p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {promos.filter((p) => p.active).map((p) => (
          <div key={p.code} className="rounded-xl border bg-card p-3">
            <div className="flex items-center gap-2">
              <BadgePercent className="h-4 w-4 text-sky-500" />
              <span className="font-mono text-sm font-bold">{p.code}</span>
            </div>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{p.description}</p>
          </div>
        ))}
      </div>

      {flash.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
            <Zap className="h-5 w-5 text-gold" /> Flash sales
          </h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {flash.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
          <TrendingUp className="h-5 w-5 text-success" /> Biggest discounts
        </h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {biggest.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      </section>
    </div>
  );
}
