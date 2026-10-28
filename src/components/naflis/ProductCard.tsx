import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Heart, Zap, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Product } from "@/lib/naflis/store";
import { useNaflis } from "@/lib/naflis/store";
import { GHS, pct } from "@/lib/naflis/format";
import { ListingImage } from "@/components/naflis/home/HomeBlocks";
import { IS_LIVE } from "@/lib/appMode";

export function ProductCard({ product, compact = false }: { product: Product; compact?: boolean }) {
  const wishlist = useNaflis((s) => s.wishlist);
  const toggleWishlist = useNaflis((s) => s.toggleWishlist);
  const addToCart = useNaflis((s) => s.addToCart);
  const inWishlist = wishlist.includes(product.id);
  const signedIn = useNaflis((s) => Boolean(s.currentUserId));
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const off = Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100);

  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-border-soft bg-card transition hover:shadow-soft">
      <Link to="/buyer/product/$id" params={{ id: product.id }} className="relative block aspect-square overflow-hidden bg-muted">
        <ListingImage src={product.image} alt={product.name} className="transition duration-500 group-hover:scale-105" />
        <div className="absolute left-2 top-2 flex flex-col gap-1">
          {off > 0 && (
            <Badge className="bg-error text-error-foreground">-{pct(off)}</Badge>
          )}
          {product.flashSale && (
            <Badge className="bg-orange text-orange-foreground gap-1">
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
            // Live: the wishlist belongs to an account; sign in first, then come back.
            if (IS_LIVE && !signedIn) {
              navigate({ to: "/login", search: { redirect: pathname } });
              return;
            }
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
          {(product.listingType === "student" || product.campus) && (
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              {/* Self-declared, so plain text: never styled as verified. */}
              {product.listingType === "student" && (
                <span className="rounded-full bg-muted px-2 py-0.5 font-semibold">
                  Student seller
                </span>
              )}
              {product.campus && <span className="truncate">{product.campus}</span>}
            </p>
          )}
          <Link
            to="/buyer/product/$id"
            params={{ id: product.id }}
            className="line-clamp-2 text-sm font-semibold leading-snug hover:text-link"
          >
            {product.name}
          </Link>
        </div>
        <div className="mt-auto">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold">{GHS(product.price)}</span>
            {off > 0 && <span className="text-xs text-muted-foreground line-through">{GHS(product.originalPrice)}</span>}
          </div>
          {off > 0 && <p className="text-[11px] text-success">Save {GHS(product.originalPrice - product.price)}</p>}
        </div>
        {!compact && (
          <div className="flex gap-2">
            {/* Demo only: the cart isn't live yet. */}
            {!IS_LIVE && (
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
            )}
            <Button size="sm" asChild className={IS_LIVE ? "flex-1" : undefined}>
              <Link to="/buyer/product/$id" params={{ id: product.id }}>View</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
