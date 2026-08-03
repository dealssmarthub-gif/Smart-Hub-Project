import { Link } from "@tanstack/react-router";
import { Heart, Zap, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Product } from "@/lib/naflis/store";
import { useNaflis } from "@/lib/naflis/store";
import { GHS, pct } from "@/lib/naflis/format";

export function ProductCard({ product, compact = false }: { product: Product; compact?: boolean }) {
  const wishlist = useNaflis((s) => s.wishlist);
  const toggleWishlist = useNaflis((s) => s.toggleWishlist);
  const addToCart = useNaflis((s) => s.addToCart);
  const inWishlist = wishlist.includes(product.id);
  const off = Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100);

  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border bg-card transition hover:shadow-premium">
      <Link to="/buyer/product/$id" params={{ id: product.id }} className="relative block aspect-square overflow-hidden bg-muted">
        <img
          src={product.image}
          alt={product.name}
          loading="lazy"
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
        <div className="absolute left-2 top-2 flex flex-col gap-1">
          {off > 0 && (
            <Badge className="bg-error text-error-foreground">-{pct(off)}</Badge>
          )}
          {product.flashSale && (
            <Badge className="bg-gold text-gold-foreground gap-1">
              <Zap className="h-3 w-3" /> Flash
            </Badge>
          )}
          {product.verifiedDiscount && (
            <Badge variant="secondary" className="gap-1 text-[10px]">
              <ShieldCheck className="h-3 w-3" /> Verified
            </Badge>
          )}
        </div>
        <button
          aria-label="Wishlist"
          onClick={(e) => {
            e.preventDefault();
            toggleWishlist(product.id);
            toast.success(inWishlist ? "Removed from wishlist" : "Added to wishlist");
          }}
          className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-background/90 backdrop-blur transition hover:bg-background"
        >
          <Heart className={`h-4 w-4 ${inWishlist ? "fill-error text-error" : ""}`} />
        </button>
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">{product.brand}</p>
          <Link
            to="/buyer/product/$id"
            params={{ id: product.id }}
            className="line-clamp-2 text-sm font-semibold leading-snug hover:text-violet"
          >
            {product.name}
          </Link>
        </div>
        <div className="mt-auto">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold">{GHS(product.price)}</span>
            <span className="text-xs text-muted-foreground line-through">{GHS(product.originalPrice)}</span>
          </div>
          <p className="text-[11px] text-success">Save {GHS(product.originalPrice - product.price)}</p>
        </div>
        {!compact && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              className="flex-1"
              onClick={() => {
                addToCart(product.id, 1);
                toast.success(`${product.name} added to cart`);
              }}
            >
              Add to cart
            </Button>
            <Button size="sm" asChild>
              <Link to="/buyer/product/$id" params={{ id: product.id }}>View</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
