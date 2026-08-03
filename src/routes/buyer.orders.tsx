import { createFileRoute, Link } from "@tanstack/react-router";
import { Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNaflis } from "@/lib/naflis/store";
import { GHS, fmtDate } from "@/lib/naflis/format";

export const Route = createFileRoute("/buyer/orders")({
  component: OrdersPage,
});

function OrdersPage() {
  const orders = useNaflis((s) => s.orders.filter((o) => o.buyerId === s.currentUserId));
  const products = useNaflis((s) => s.products);

  if (orders.length === 0) {
    return (
      <div className="rounded-2xl border bg-card p-10 text-center">
        <Package className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
        <h2 className="text-xl font-bold">No orders yet</h2>
        <p className="mt-1 text-sm text-muted-foreground">Complete a purchase to see it here.</p>
        <Button asChild className="mt-4"><Link to="/buyer">Browse deals</Link></Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold">My orders</h1>
      {orders.map((o) => (
        <Link
          key={o.id}
          to="/buyer/orders/$orderId"
          params={{ orderId: o.id }}
          className="block rounded-2xl border bg-card p-5 transition hover:border-violet"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs text-muted-foreground">Order #{o.id.slice(2, 10)} · {fmtDate(o.createdAt)}</p>
              <p className="mt-1 font-semibold">{o.items.length} item(s) · {GHS(o.total)}</p>
            </div>
            <Badge variant="secondary" className="capitalize">
              {o.status.replaceAll("-", " ")}
            </Badge>
          </div>
          <div className="mt-3 flex gap-2">
            {o.items.slice(0, 4).map((i) => {
              const p = products.find((pp) => pp.id === i.productId);
              return p ? (
                <img key={i.productId} src={p.image} className="h-12 w-12 rounded-lg object-cover" alt="" />
              ) : null;
            })}
          </div>
        </Link>
      ))}
    </div>
  );
}
