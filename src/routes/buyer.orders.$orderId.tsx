import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, MessageSquare, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EscrowTimeline } from "@/components/naflis/EscrowTimeline";
import { useNaflis } from "@/lib/naflis/store";
import { nextHappyState, orderStateLabel } from "@/lib/naflis/orderMachine";
import { PURCHASE_METHOD_LABEL } from "@/lib/naflis/purchase";
import { runOrderTransition } from "@/services/orderService";
import { GHS, fmtDate } from "@/lib/naflis/format";
import { toast } from "sonner";

export const Route = createFileRoute("/buyer/orders/$orderId")({
  component: OrderDetail,
});

function OrderDetail() {
  const { orderId } = Route.useParams();
  const order = useNaflis((s) => s.orders.find((o) => o.id === orderId));
  const products = useNaflis((s) => s.products);
  const advance = useNaflis((s) => s.advanceOrder);
  const pushNotif = useNaflis((s) => s.pushNotif);

  if (!order) {
    return (
      <div className="rounded-xl border bg-card p-10 text-center">
        <p>Order not found.</p>
        <Button asChild className="mt-3"><Link to="/buyer/orders">Back to orders</Link></Button>
      </div>
    );
  }

  const simulatedNext = order.status === "awaiting_payment" ? null : nextHappyState(order.status);
  const items = order.items.map((i) => ({ ...i, product: products.find((p) => p.id === i.productId)! }));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <div className="rounded-2xl border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs text-muted-foreground">Order #{order.id.slice(2, 10)}</p>
              <p className="text-lg font-bold">Placed {fmtDate(order.createdAt)}</p>
            </div>
            <Badge variant="secondary">{orderStateLabel(order.status)}</Badge>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-5">
          <h3 className="mb-3 font-bold">Items</h3>
          <div className="divide-y">
            {items.map((i) => (
              <div key={i.productId} className="flex items-center gap-3 py-3">
                <img src={i.product?.image} alt="" className="h-14 w-14 rounded object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{i.product?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Qty {i.qty} · {GHS(i.price)}
                    {i.method && i.method !== "full" ? ` · ${PURCHASE_METHOD_LABEL[i.method]}` : ""}
                  </p>
                </div>
                <span className="text-sm font-semibold">{GHS(i.price * i.qty)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-5">
          <h3 className="mb-3 flex items-center gap-2 font-bold"><ShieldCheck className="h-4 w-4 text-success" /> Escrow timeline</h3>
          <EscrowTimeline events={order.timeline} />

          <div className="mt-5 flex flex-wrap gap-2">
            {/* Demo-only shortcut through the fulfilment path; server-backed orders move via their real actors. */}
            {!order.serverBacked && simulatedNext && simulatedNext !== "completed" && (
              <Button
                variant="outline" size="sm"
                onClick={() => {
                  if (advance(order.id, simulatedNext, `Simulated: order moved to ${orderStateLabel(simulatedNext)}`, "admin")) {
                    toast.success(`Order advanced to ${orderStateLabel(simulatedNext).toLowerCase()}`);
                  } else {
                    toast.error("That step is blocked (for example, dispatch waits on the payment plan).");
                  }
                }}
              >
                <RefreshCw className="mr-1 h-4 w-4" /> Simulate next status
              </Button>
            )}
            {order.status === "delivered" && (
              <Button
                onClick={async () => {
                  const res = await runOrderTransition(order.id, "completed", () =>
                    advance(order.id, "completed", "Buyer confirmed delivery — escrow released to seller", "buyer"),
                  );
                  if (!res.ok) return toast.error(res.message);
                  pushNotif({ userId: order.buyerId, type: "escrow", title: "Escrow released", body: "Funds released to seller — thanks for confirming." });
                  toast.success("Delivery confirmed. Funds released to seller.");
                }}
              >
                <CheckCircle2 className="mr-1 h-4 w-4" /> Confirm delivery & release escrow
              </Button>
            )}
            <Button variant="outline" size="sm" asChild>
              <Link to="/buyer/messages"><MessageSquare className="mr-1 h-4 w-4" /> Message seller</Link>
            </Button>
          </div>
        </div>
      </div>

      <aside className="sticky top-24 h-fit space-y-4 rounded-2xl border bg-card p-5">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Delivery address</p>
          <p className="mt-1 text-sm">{order.address}</p>
        </div>
        <div className="space-y-1 border-t pt-3 text-sm">
          <Row label="Subtotal" value={GHS(order.subtotal)} />
          {order.discount > 0 && <Row label="Discount" value={<span className="text-success">-{GHS(order.discount)}</span>} />}
          <Row label="Delivery" value={GHS(order.delivery)} />
          <Row label="Escrow fee" value={GHS(order.escrowFee)} />
        </div>
        <div className="flex items-center justify-between border-t pt-3 font-bold">
          <span>Order total</span>
          <span>{GHS(order.total)}</span>
        </div>
        {order.amountPaid !== undefined && (
          <div className="space-y-1 text-sm">
            <Row label="Paid so far" value={GHS(order.amountPaid)} />
            {(order.amountOutstanding ?? 0) > 0 && <Row label="Still owed" value={GHS(order.amountOutstanding!)} />}
            {order.deliveryUnlocked === false && (
              <p className="rounded-lg bg-warning/10 p-2 text-xs text-warning">Delivery unlocks once your payment plan terms are met.</p>
            )}
          </div>
        )}
        <div className="rounded-lg bg-accent/50 p-3 text-xs text-muted-foreground">
          Payment method: <b className="text-foreground capitalize">{order.paymentOption}</b>
        </div>
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
