import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Trash2, ShoppingBag, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNaflis } from "@/lib/naflis/store";
import { GHS } from "@/lib/naflis/format";
import { toast } from "sonner";

export const Route = createFileRoute("/buyer/cart")({
  component: CartPage,
});

function CartPage() {
  const cart = useNaflis((s) => s.cart);
  const products = useNaflis((s) => s.products);
  const stores = useNaflis((s) => s.stores);
  const update = useNaflis((s) => s.updateCartQty);
  const remove = useNaflis((s) => s.removeFromCart);
  const clear = useNaflis((s) => s.clearCart);
  const navigate = useNavigate();

  const items = cart.map((c) => {
    const p = products.find((pp) => pp.id === c.productId)!;
    return { ...c, product: p };
  }).filter((i) => i.product);

  const grouped = items.reduce<Record<string, typeof items>>((acc, it) => {
    (acc[it.product.storeId] ??= []).push(it);
    return acc;
  }, {});

  const subtotal = items.reduce((a, i) => a + i.product.price * i.qty, 0);
  const savings = items.reduce((a, i) => a + (i.product.originalPrice - i.product.price) * i.qty, 0);

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border bg-card p-10 text-center">
        <ShoppingBag className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
        <h2 className="text-xl font-bold">Your cart is empty</h2>
        <p className="mt-1 text-sm text-muted-foreground">Discover deals across categories.</p>
        <Button asChild className="mt-4"><Link to="/buyer">Browse deals</Link></Button>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        {Object.entries(grouped).map(([storeId, arr]) => {
          const store = stores.find((s) => s.id === storeId);
          return (
            <div key={storeId} className="rounded-2xl border bg-card">
              <div className="border-b p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Sold by</p>
                <p className="font-semibold">{store?.name}</p>
              </div>
              <div className="divide-y">
                {arr.map((i) => (
                  <div key={i.productId} className="flex items-center gap-4 p-4">
                    <img src={i.product.image} className="h-16 w-16 shrink-0 rounded-lg object-cover" alt="" />
                    <div className="min-w-0 flex-1">
                      <Link to="/buyer/product/$id" params={{ id: i.product.id }} className="line-clamp-1 font-medium">
                        {i.product.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{i.product.brand}</p>
                      <p className="mt-1 text-sm font-bold">{GHS(i.product.price)}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => update(i.productId, i.qty - 1)}><Minus className="h-3 w-3" /></Button>
                      <span className="w-8 text-center text-sm">{i.qty}</span>
                      <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => update(i.productId, i.qty + 1)}><Plus className="h-3 w-3" /></Button>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => { remove(i.productId); toast.success("Removed"); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        <Button variant="outline" onClick={() => { clear(); toast.success("Cart cleared"); }}>Clear cart</Button>
      </div>

      <aside className="sticky top-24 h-fit rounded-2xl border bg-card p-5">
        <h3 className="font-bold">Order summary</h3>
        <dl className="mt-4 space-y-2 text-sm">
          <Row label="Subtotal" value={GHS(subtotal)} />
          <Row label="Estimated discount savings" value={<span className="text-success">-{GHS(savings)}</span>} />
          <Row label="Delivery" value={<span className="text-muted-foreground">Selected at checkout</span>} />
        </dl>
        <div className="mt-4 border-t pt-4">
          <div className="flex items-center justify-between font-bold">
            <span>Total (est.)</span>
            <span>{GHS(subtotal)}</span>
          </div>
        </div>
        <Button className="mt-4 w-full" size="lg" onClick={() => navigate({ to: "/buyer/checkout" })}>
          Proceed to checkout
        </Button>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">Escrow-protected · NAFLIS Wallet ready</p>
      </aside>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
