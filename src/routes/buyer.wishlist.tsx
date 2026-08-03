import { createFileRoute, Link } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductCard } from "@/components/naflis/ProductCard";
import { useNaflis } from "@/lib/naflis/store";

export const Route = createFileRoute("/buyer/wishlist")({
  component: WishlistPage,
});

function WishlistPage() {
  const wishlist = useNaflis((s) => s.wishlist);
  const products = useNaflis((s) => s.products);
  const list = products.filter((p) => wishlist.includes(p.id));

  if (list.length === 0) {
    return (
      <div className="rounded-2xl border bg-card p-10 text-center">
        <Heart className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
        <h2 className="text-xl font-bold">Nothing wishlisted yet</h2>
        <p className="mt-1 text-sm text-muted-foreground">Tap the heart on any product to save it here.</p>
        <Button asChild className="mt-4"><Link to="/buyer">Browse deals</Link></Button>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Your wishlist</h1>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {list.map((p) => <ProductCard key={p.id} product={p} />)}
      </div>
    </div>
  );
}
