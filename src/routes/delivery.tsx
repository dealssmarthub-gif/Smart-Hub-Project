import { createFileRoute, redirect } from "@tanstack/react-router";
import { Truck, MapPin, Package, CheckCircle2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { RoleShell, MetricCard } from "@/components/naflis/RoleShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useNaflis } from "@/lib/naflis/store";
import { GHS, fmtDate } from "@/lib/naflis/format";

export const Route = createFileRoute("/delivery")({
  beforeLoad: () => {
    const { role } = useNaflis.getState();
    if (role !== "delivery") {
      throw redirect({
        to: "/login",
        search: {
          redirect: "/delivery",
        },
      });
    }
  },
  component: DeliveryDashboard,
});

const PARTNER_ID = "u_delivery1";

// Deterministic delivery code per order id
function codeFor(orderId: string) {
  let h = 0;
  for (let i = 0; i < orderId.length; i++) h = (h * 31 + orderId.charCodeAt(i)) >>> 0;
  return String(h % 900000 + 100000);
}

function DeliveryDashboard() {
  const orders = useNaflis((s) => s.orders);
  const users = useNaflis((s) => s.users);
  const products = useNaflis((s) => s.products);
  const acceptJob = useNaflis((s) => s.deliveryAcceptJob);
  const confirmPickup = useNaflis((s) => s.deliveryConfirmPickup);
  const completeDelivery = useNaflis((s) => s.deliveryComplete);

  const available = useMemo(
    () => orders.filter((o) => o.status === "delivery-assigned" && !o.deliveryPartnerId),
    [orders],
  );
  const active = useMemo(
    () => orders.filter((o) => o.deliveryPartnerId === PARTNER_ID && !["funds-released", "delivered"].includes(o.status)),
    [orders],
  );
  const completed = useMemo(
    () => orders.filter((o) => o.deliveryPartnerId === PARTNER_ID && ["delivered", "funds-released"].includes(o.status)),
    [orders],
  );

  const earnings = completed.reduce((a, o) => a + o.delivery, 0);

  return (
    <RoleShell
      title="Delivery Partner Dashboard"
      subtitle="Accept jobs, pick up, deliver, and confirm handoff to trigger escrow release."
      icon={Truck}
      badge="Kojo Delivery · 4.9★"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Available jobs" value={String(available.length)} hint="Ready for pickup" />
        <MetricCard label="Assigned to me" value={String(active.length)} hint="In progress" />
        <MetricCard label="Delivered" value={String(completed.length)} hint="This session" />
        <MetricCard label="Earnings" value={GHS(earnings)} hint="Delivery fees" />
      </div>

      <Tabs defaultValue="available" className="mt-6">
        <TabsList>
          <TabsTrigger value="available">Available ({available.length})</TabsTrigger>
          <TabsTrigger value="active">Active ({active.length})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({completed.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="available" className="mt-4 space-y-2">
          {available.length === 0 ? (
            <EmptyState label="No jobs available. Ask a seller to mark an order 'Ready for pickup'." />
          ) : (
            available.map((o) => {
              const buyer = users.find((u) => u.id === o.buyerId);
              const firstProduct = products.find((p) => p.id === o.items[0]?.productId);
              return (
                <div key={o.id} className="rounded-xl border bg-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Job #{o.id.slice(2, 10)} · {fmtDate(o.createdAt)}</p>
                      <p className="mt-1 font-semibold">{o.items.length} item(s) · fee {GHS(o.delivery || 30)}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        <MapPin className="mr-1 inline h-3.5 w-3.5" /> Pickup: {firstProduct?.location ?? "Accra"} → Drop-off: {buyer?.region}
                      </p>
                    </div>
                    <Button onClick={() => { acceptJob(o.id, PARTNER_ID); toast.success("Job accepted — buyer notified"); }}>Accept job</Button>
                  </div>
                </div>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="active" className="mt-4 space-y-2">
          {active.length === 0 ? (
            <EmptyState label="No active deliveries. Accept a job to start." />
          ) : (
            active.map((o) => (
              <ActiveJob
                key={o.id}
                order={o}
                onPickup={() => { confirmPickup(o.id, PARTNER_ID); toast.success("Pickup confirmed"); }}
                onComplete={(code) => {
                  const res = completeDelivery(o.id, PARTNER_ID, code);
                  if (res.ok) toast.success(res.message);
                  else toast.error(res.message);
                  return res.ok;
                }}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="completed" className="mt-4 space-y-2">
          {completed.length === 0 ? (
            <EmptyState label="No completed deliveries yet." />
          ) : (
            completed.map((o) => (
              <div key={o.id} className="flex items-center justify-between rounded-xl border bg-card p-4">
                <div>
                  <p className="text-xs text-muted-foreground">Job #{o.id.slice(2, 10)}</p>
                  <p className="text-sm font-semibold">Delivered · fee {GHS(o.delivery || 30)}</p>
                </div>
                <CheckCircle2 className="h-5 w-5 text-success" />
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>
    </RoleShell>
  );
}

function ActiveJob({
  order,
  onPickup,
  onComplete,
}: {
  order: ReturnType<typeof useNaflis.getState>["orders"][number];
  onPickup: () => void;
  onComplete: (code: string) => boolean;
}) {
  const [entered, setEntered] = useState("");
  const expected = order.deliveryCode ?? codeFor(order.id);

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground">Job #{order.id.slice(2, 10)}</p>
          <p className="mt-1 font-semibold">Total {GHS(order.total)} · fee {GHS(order.delivery || 30)}</p>
        </div>
        <Badge variant="secondary" className="capitalize">{order.status.replaceAll("-", " ")}</Badge>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {order.status === "delivery-assigned" && (
          <Button size="sm" onClick={onPickup}>
            <Package className="mr-1 h-4 w-4" /> Confirm pickup
          </Button>
        )}
        {order.status === "out-for-delivery" && (
          <div className="w-full space-y-2">
            <p className="text-xs text-muted-foreground">
              Ask buyer for their delivery code (demo code: <span className="font-mono font-bold text-foreground">{expected}</span>)
            </p>
            <div className="flex gap-2">
              <Input placeholder="Enter buyer's 6-digit code" value={entered} onChange={(e) => setEntered(e.target.value)} className="max-w-[220px]" />
              <Button size="sm" onClick={() => { if (onComplete(entered)) setEntered(""); }}>
                Confirm delivery
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border bg-card p-10 text-center">
      <Truck className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
