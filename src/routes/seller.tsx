import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Store, TrendingUp, Package, Sparkles, Zap, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { RoleShell, MetricCard } from "@/components/naflis/RoleShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { useNaflis } from "@/lib/naflis/store";
import { GHS, fmtDate, pct } from "@/lib/naflis/format";

export const Route = createFileRoute("/seller")({
  beforeLoad: () => {
    const { role } = useNaflis.getState();
    if (role !== "seller") {
      throw redirect({
        to: "/login",
        search: {
          redirect: "/seller",
        },
      });
    }
  },
  component: SellerDashboard,
});

const MY_STORE_ID = "s_trendtech";

function SellerDashboard() {
  const products = useNaflis((s) => s.products);
  const orders = useNaflis((s) => s.orders);
  const requests = useNaflis((s) => s.productRequests);
  const searchEvents = useNaflis((s) => s.searchEvents);
  const stores = useNaflis((s) => s.stores);
  const store = stores.find((x) => x.id === MY_STORE_ID)!;

  const myProducts = useMemo(() => products.filter((p) => p.storeId === MY_STORE_ID), [products]);
  const myProductIds = new Set(myProducts.map((p) => p.id));
  const myOrders = useMemo(
    () => orders.filter((o) => o.items.some((i) => myProductIds.has(i.productId))),
    [orders, myProductIds],
  );

  const revenue = myOrders.reduce(
    (a, o) => a + o.items.filter((i) => myProductIds.has(i.productId)).reduce((b, i) => b + i.price * i.qty, 0),
    0,
  );
  const escrowPending = myOrders
    .filter((o) => ["escrow-secured", "seller-accepted", "preparing", "out-for-delivery"].includes(o.status))
    .reduce((a, o) => a + o.total, 0);
  const avgDiscount =
    myProducts.reduce((a, p) => a + (p.originalPrice - p.price) / p.originalPrice, 0) / myProducts.length;

  return (
    <RoleShell
      title={`${store.name} · Seller Command`}
      subtitle="Storefront, orders, demand intelligence, and pricing recommendations."
      icon={Store}
      badge={store.subscription.toUpperCase()}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Revenue (all-time)" value={GHS(revenue)} hint={`${myOrders.length} orders`} />
        <MetricCard label="Escrow pending release" value={GHS(escrowPending)} hint="Held by NAFLIS" />
        <MetricCard label="Products live" value={String(myProducts.length)} hint={`Avg discount ${pct(avgDiscount * 100)}`} />
        <MetricCard label="Store rating" value={`${store.rating.toFixed(1)} / 5`} hint={`${store.reviews} reviews`} />
      </div>

      <Tabs defaultValue="orders" className="mt-6">
        <TabsList>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="intelligence">Intelligence</TabsTrigger>
          <TabsTrigger value="pricing">Price Intelligence</TabsTrigger>
          <TabsTrigger value="requests">Demand Inbox</TabsTrigger>
          <TabsTrigger value="brand">Brand Studio</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="mt-4">
          <OrdersTab orders={myOrders} myProductIds={myProductIds} />
        </TabsContent>
        <TabsContent value="products" className="mt-4">
          <ProductsTab products={myProducts} />
        </TabsContent>
        <TabsContent value="intelligence" className="mt-4">
          <IntelligenceTab searchEvents={searchEvents} products={myProducts} />
        </TabsContent>
        <TabsContent value="pricing" className="mt-4">
          <PricingTab products={myProducts} />
        </TabsContent>
        <TabsContent value="requests" className="mt-4">
          <RequestsTab requests={requests} />
        </TabsContent>
        <TabsContent value="brand" className="mt-4">
          <BrandTab />
        </TabsContent>
      </Tabs>
    </RoleShell>
  );
}

function OrdersTab({ orders, myProductIds }: { orders: ReturnType<typeof useNaflis.getState>["orders"]; myProductIds: Set<string> }) {
  const acceptOrder = useNaflis((s) => s.sellerAcceptOrder);
  const startPreparing = useNaflis((s) => s.sellerStartPreparing);
  const markReady = useNaflis((s) => s.sellerMarkReady);
  if (orders.length === 0) {
    return (
      <div className="rounded-2xl border bg-card p-10 text-center">
        <Package className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
        <p className="font-semibold">No customer orders yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Place an order as a buyer to see it appear here.
        </p>
        <Button asChild className="mt-4" variant="outline"><Link to="/buyer">Switch to Buyer</Link></Button>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {orders.map((o) => {
        const myItems = o.items.filter((i) => myProductIds.has(i.productId));
        const myTotal = myItems.reduce((a, i) => a + i.price * i.qty, 0);
        return (
          <div key={o.id} className="rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground">Order #{o.id.slice(2, 10)} · {fmtDate(o.createdAt)}</p>
                <p className="mt-0.5 font-semibold">{myItems.length} item(s) · {GHS(myTotal)}</p>
              </div>
              <Badge variant="secondary" className="capitalize">{o.status.replaceAll("-", " ")}</Badge>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {o.status === "escrow-secured" && (
                <Button size="sm" onClick={() => { acceptOrder(o.id); toast.success("Order accepted — buyer notified"); }}>
                  Accept order
                </Button>
              )}
              {o.status === "seller-accepted" && (
                <Button size="sm" onClick={() => { startPreparing(o.id); toast.success("Marked as preparing"); }}>
                  Start preparing
                </Button>
              )}
              {o.status === "preparing" && (
                <Button size="sm" onClick={() => { markReady(o.id); toast.success("Ready for pickup — delivery partners notified"); }}>
                  Ready for pickup
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProductsTab({ products }: { products: ReturnType<typeof useNaflis.getState>["products"] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {products.map((p) => (
        <div key={p.id} className="flex gap-3 rounded-xl border bg-card p-3">
          <img src={p.image} alt={p.name} className="h-20 w-20 shrink-0 rounded-lg object-cover" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{p.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Stock: {p.stock} · Demand {p.demand}%</p>
            <div className="mt-1 flex items-center gap-2">
              <span className="font-bold">{GHS(p.price)}</span>
              <span className="text-xs text-muted-foreground line-through">{GHS(p.originalPrice)}</span>
              <Badge variant="secondary" className="ml-auto">{pct(((p.originalPrice - p.price) / p.originalPrice) * 100)} off</Badge>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function IntelligenceTab({ searchEvents, products }: { searchEvents: ReturnType<typeof useNaflis.getState>["searchEvents"]; products: ReturnType<typeof useNaflis.getState>["products"] }) {
  const zeroMatch = searchEvents.filter((e) => e.matches === 0);
  const hottest = [...products].sort((a, b) => b.demand - a.demand).slice(0, 5);
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-violet" />
          <p className="font-semibold">Hottest products in your catalog</p>
        </div>
        <ul className="mt-3 space-y-2">
          {hottest.map((p) => (
            <li key={p.id} className="flex items-center gap-3 text-sm">
              <span className="truncate">{p.name}</span>
              <Progress value={p.demand} className="ml-auto w-24" />
              <span className="w-10 text-right text-xs font-semibold">{p.demand}%</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-gold" />
          <p className="font-semibold">Unmet demand (buyer searches with 0 results)</p>
        </div>
        {zeroMatch.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No unmet searches yet — try searching for something rare as a buyer.
          </p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {zeroMatch.slice(0, 8).map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2">
                <span className="truncate">"{e.query}"</span>
                <Badge variant="outline" className="shrink-0">{e.region}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function PricingTab({ products }: { products: ReturnType<typeof useNaflis.getState>["products"] }) {
  const [applied, setApplied] = useState<Record<string, boolean>>({});
  const recommendations = products
    .map((p) => {
      const currentDiscount = (p.originalPrice - p.price) / p.originalPrice;
      const suggestedExtra = Math.max(0.02, 0.15 - currentDiscount);
      const newPrice = Math.round(p.price * (1 - suggestedExtra));
      return { p, suggestedExtra, newPrice, projectedLift: Math.round(p.demand * 1.3 + suggestedExtra * 200) };
    })
    .slice(0, 6);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border bg-card p-4">
        <p className="text-sm">
          NAFLIS Price Intelligence analyses competitor pricing, buyer wishlists, and demand curves to
          recommend when to move the needle.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {recommendations.map(({ p, suggestedExtra, newPrice, projectedLift }) => (
          <div key={p.id} className="rounded-xl border bg-card p-4">
            <p className="text-sm font-semibold">{p.name}</p>
            <div className="mt-2 flex items-baseline gap-2 text-sm">
              <span className="text-muted-foreground line-through">{GHS(p.price)}</span>
              <span className="text-lg font-bold text-violet">{GHS(newPrice)}</span>
              <Badge className="ml-auto bg-success text-success-foreground">−{pct(suggestedExtra * 100)}</Badge>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Projected demand lift: <span className="font-semibold text-foreground">+{projectedLift}%</span>
            </p>
            <Button
              size="sm"
              variant={applied[p.id] ? "outline" : "default"}
              className="mt-3 w-full"
              disabled={applied[p.id]}
              onClick={() => {
                setApplied((a) => ({ ...a, [p.id]: true }));
                toast.success(`Applied to ${p.name}`);
              }}
            >
              {applied[p.id] ? "Recommendation applied" : "Apply recommendation"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function RequestsTab({ requests }: { requests: ReturnType<typeof useNaflis.getState>["productRequests"] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {requests.map((r) => (
        <div key={r.id} className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-violet" />
            <p className="text-xs text-muted-foreground">{r.interestedBuyers.toLocaleString()} buyers waiting</p>
          </div>
          <p className="mt-2 font-semibold">{r.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {r.category} · {r.region} · budget {GHS(r.priceMin)}–{GHS(r.priceMax)}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {r.wantsReserve && <Badge variant="outline">Reserve</Badge>}
            {r.wantsInstallment && <Badge variant="outline">Installment</Badge>}
          </div>
          <Button
            size="sm"
            className="mt-3 w-full"
            onClick={() => toast.success("Product listed — matched buyers notified")}
          >
            List product to matched buyers
          </Button>
        </div>
      ))}
    </div>
  );
}

function BrandTab() {
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [generated, setGenerated] = useState<{ name: string; tagline: string; palette: string[] } | null>(null);
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-gold" />
          <p className="font-semibold">Brand Studio</p>
        </div>
        <div className="space-y-2">
          <Input placeholder="Store name idea" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="What do you sell?" value={tagline} onChange={(e) => setTagline(e.target.value)} />
          <Button
            className="w-full"
            onClick={() => {
              setGenerated({
                name: name || "TrendTech Ghana",
                tagline: tagline ? `Premium ${tagline} — verified, escrow-protected.` : "Certified quality, unbeatable prices.",
                palette: ["#0F172A", "#1E3A8A", "#7C3AED", "#F59E0B"],
              });
              toast.success("Brand identity generated");
            }}
          >
            Generate store identity
          </Button>
        </div>
      </div>
      <div className="rounded-xl border bg-card p-4">
        <p className="font-semibold">Preview</p>
        {generated ? (
          <div className="mt-3">
            <p className="text-lg font-black">{generated.name}</p>
            <p className="text-sm text-muted-foreground">{generated.tagline}</p>
            <div className="mt-3 flex gap-2">
              {generated.palette.map((c) => (
                <span key={c} className="h-8 w-8 rounded-lg border" style={{ background: c }} />
              ))}
            </div>
            <Button className="mt-4 w-full" variant="outline" onClick={() => toast.success("Store published — catalog generation started")}>
              Publish store
            </Button>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Generate to see a live preview.</p>
        )}
      </div>
    </div>
  );
}
