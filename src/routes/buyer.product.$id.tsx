import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import {
  Heart, Share2, Bell, MessageSquare, ShieldCheck, Truck, Clock, TrendingUp,
  Zap, AlertTriangle, Eye, Users, Star, Loader2, Phone,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useNaflis } from "@/lib/naflis/store";
import { GHS, pct, telHref, whatsappNumber } from "@/lib/naflis/format";
import { ProductCard } from "@/components/naflis/ProductCard";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { fetchSellerProduct } from "@/services/sellerApi";
import { PurchaseOptions } from "@/components/naflis/PurchaseOptions";
import type { Product, Store } from "@/lib/naflis/store";
import { IS_LIVE } from "@/lib/appMode";
import { ContactSeller } from "@/components/naflis/ContactSeller";
import { ListingImage } from "@/components/naflis/home/HomeBlocks";

export const Route = createFileRoute("/buyer/product/$id")({
  component: ProductDetail,
});

function ProductDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();

  const wishlist = useNaflis((s) => s.wishlist);
  const toggleWishlist = useNaflis((s) => s.toggleWishlist);
  const addToCart = useNaflis((s) => s.addToCart);
  const setPriceAlert = useNaflis((s) => s.setPriceAlert);
  const products = useNaflis((s) => s.products);

  // Opened from a list: show what the store already holds at once, then refresh it.
  const [dbProduct, setDbProduct] = useState<Product | null>(
    () => useNaflis.getState().products.find((p) => p.id === id) ?? null,
  );
  const [dbStore, setDbStore] = useState<Store | null>(() => {
    const s = useNaflis.getState();
    const local = s.products.find((p) => p.id === id);
    return local ? (s.stores.find((st) => st.id === local.storeId) ?? null) : null;
  });
  const [loading, setLoading] = useState(() => !dbProduct);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    // Demo / seeded products live only in the local store.
    const loadLocal = () => {
      const s = useNaflis.getState();
      const local = s.products.find((p) => p.id === id) ?? null;
      setDbProduct(local);
      setDbStore(local ? s.stores.find((st) => st.id === local.storeId) ?? null : null);
    };

    const fetchProduct = async () => {
      try {
        const data = await fetchSellerProduct(id);

        if (!data) return loadLocal();
        {
          const existing = useNaflis.getState().products.find((p) => p.id === data.product.id);
          const mapped = existing ? { ...data.product, rating: existing.rating, reviews: existing.reviews } : data.product;
          setDbProduct(mapped);

          // Sync product to Zustand store if not already present
          useNaflis.setState((s) => {
            const exists = s.products.find((p) => p.id === mapped.id);
            return {
              products: exists ? s.products.map((p) => p.id === mapped.id ? { ...p, ...mapped } : p) : [...s.products, mapped]
            };
          });

          if (data.vendor) setDbStore(data.vendor);
        }
      } catch (err) {
        console.error("Error loading product details:", err);
        loadLocal();
      } finally {
        setLoading(false);
      }
    };

    fetchProduct();
  }, [id]);

  const related = useMemo(
    () => dbProduct ? products.filter((p) => p.category === dbProduct.category && p.id !== dbProduct.id).slice(0, 4) : [],
    [products, dbProduct],
  );

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center py-20 min-h-[50vh]">
        <Loader2 className="h-10 w-10 text-link animate-spin" />
        <p className="mt-3 text-sm text-muted-foreground font-semibold">Loading product specifications...</p>
      </div>
    );
  }

  const product = dbProduct;
  const store = dbStore;

  if (!product) {
    return (
      <div className="rounded-2xl border border-border-soft bg-card p-10 text-center">
        <p>Product not found.</p>
        <Button asChild className="mt-3"><Link to="/buyer">Back home</Link></Button>
      </div>
    );
  }

  const off = Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100);
  const inWishlist = wishlist.includes(product.id);
  const chart = product.priceHistory.map((h: any) => ({ ...h, date: h.date.slice(5) }));
  const hasSpecs = Object.keys(product.specs ?? {}).length > 0;
  // One data point isn't a history.
  const hasHistory = product.priceHistory.length > 1;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-[1.1fr_1fr]">
        <div className="overflow-hidden rounded-3xl border border-border-soft bg-card shadow-soft">
          <div className="aspect-[4/3] w-full"><ListingImage src={product.image} alt={product.name} /></div>
        </div>

        <div className="min-w-0 space-y-4">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="uppercase tracking-wide">{product.category}</Badge>
            {product.verifiedDiscount && (
              <Badge className="gap-1 bg-success text-success-foreground">
                <ShieldCheck className="h-3 w-3" /> Verified discount
              </Badge>
            )}
            {product.flashSale && (
              <Badge className="gap-1 bg-orange text-orange-foreground">
                <Zap className="h-3 w-3" /> Flash sale
              </Badge>
            )}
          </div>
          <h1 className="text-2xl font-extrabold leading-tight sm:text-3xl">{product.name}</h1>
          {(product.listingType === "student" || product.campus || product.condition) && (
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {/* Self-declared, so plain text: never styled as verified. */}
              {product.listingType === "student" && (
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold">
                  Student seller
                </span>
              )}
              {product.campus && <span>{product.campus}</span>}
              {product.condition && <span>· {product.condition}</span>}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 text-sm">
            {product.reviews > 0 && (
              <span className="flex items-center gap-1">
                <Star className="h-4 w-4 fill-orange-ink text-orange-ink" />
                {product.rating.toFixed(1)} · {product.reviews} reviews
              </span>
            )}
            {store && (
              <span className="flex items-center gap-1">
                <ShieldCheck className="h-4 w-4 text-link" />
                {store.name} {store.verified && <span className="text-xs text-link">{IS_LIVE ? "(approved seller)" : "(verified)"}</span>}
              </span>
            )}
            {/* Only when the product has a delivery time (database products don't yet). */}
            {product.deliveryDays > 0 && (
              <span className="flex items-center gap-1"><Truck className="h-4 w-4" /> Delivery in {product.deliveryDays} days</span>
            )}
          </div>

          <div className="rounded-xl bg-muted p-4">
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-extrabold">{GHS(product.price)}</span>
              {off > 0 && <span className="text-sm text-muted-foreground line-through">{GHS(product.originalPrice)}</span>}
              {off > 0 && <Badge className="bg-error text-error-foreground">-{pct(off)}</Badge>}
            </div>
            {off > 0 && <p className="mt-1 text-sm text-success">You save {GHS(product.originalPrice - product.price)}</p>}
          </div>

          {/* Live signals (demo only: viewers, waiting and demand aren't tracked yet) */}
          {!IS_LIVE && (
          <div className="grid grid-cols-3 gap-2 text-xs">
            <SignalCard icon={<Eye className="h-4 w-4" />} label="Viewing now" value={product.viewersNow} />
            <SignalCard icon={<Users className="h-4 w-4" />} label="Waiting for lower price" value={product.waitingForDrop} />
            <SignalCard icon={<TrendingUp className="h-4 w-4" />} label="Demand" value={`${product.demand}/100`} />
          </div>
          )}

          {product.stock < 15 && (
            <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Only {product.stock} left in stock
            </div>
          )}

          <PurchaseOptions
            product={product}
            onChoose={(method) => {
              addToCart(product.id, 1, undefined, method);
              navigate({ to: "/buyer/checkout" });
            }}
          />

          {/* Live: buying on the site isn't connected yet, so buyers contact the seller directly.
              Signed out: sign in first. Signed in: the number comes from the database on request. */}
          {IS_LIVE && (
            <div className="space-y-2 rounded-xl border border-border-soft bg-card p-4">
              <p className="text-sm font-semibold">Contact {store?.name || "the seller"} to buy</p>
              <ContactSeller
                vendorId={product.storeId}
                sellerName={store?.name ?? ""}
                itemTitle={product.name}
              />
            </div>
          )}

          {/* Actions */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {!IS_LIVE && (<>
            <Button
              size="lg"
              className="col-span-2 gradient-hero text-white hover:opacity-95"
              onClick={() => {
                addToCart(product.id, 1);
                navigate({ to: "/buyer/checkout" });
              }}
            >
              Buy now
            </Button>
            <Button
              size="lg"
              variant="secondary"
              className="col-span-2"
              onClick={() => {
                addToCart(product.id, 1);
                toast.success("Added to cart");
              }}
            >
              Add to cart
            </Button>
            </>)}
            <Button variant="ghost" onClick={() => { toggleWishlist(product.id); toast.success(inWishlist ? "Removed" : "Wishlisted"); }}>
              <Heart className={`mr-1 h-4 w-4 ${inWishlist ? "fill-error text-error" : ""}`} /> Wishlist
            </Button>
            {/* Demo only: price alerts and seller messages aren't delivered anywhere yet. */}
            {!IS_LIVE && (<>
            <PriceAlertButton
              current={product.price}
              onSet={(target) => {
                setPriceAlert(product.id, target);
                toast.success(`We'll notify you when it hits ${GHS(target)}`);
              }}
            />
            <AskSellerDialog
              storeName={store?.name ?? "Seller"}
              onSend={(body) => {
                toast.success(`Message sent to ${store?.name ?? "seller"} through NAFLIS. Your contact stays private.`);
                setMsg("");
              }}
              msg={msg}
              setMsg={setMsg}
            />
            </>)}
            <Button
              variant="ghost"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(window.location.href);
                  toast.success("Link copied");
                } catch {
                  toast.error("Couldn't copy the link. Copy it from the address bar instead.");
                }
              }}
            >
              <Share2 className="mr-1 h-4 w-4" /> Share
            </Button>
          </div>

          {/* Demo only: escrow isn't live yet. */}
          {!IS_LIVE && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-success" />
              Escrow-protected · Funds only released once you confirm delivery
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          {hasSpecs && <TabsTrigger value="specs">Specifications</TabsTrigger>}
          {hasHistory && <TabsTrigger value="price">Price history</TabsTrigger>}
          {product.reviews > 0 && <TabsTrigger value="reviews">Reviews</TabsTrigger>}
        </TabsList>
        <TabsContent value="details" className="rounded-2xl border border-border-soft bg-card p-5 text-sm leading-relaxed">
          <p>{product.description}</p>
          {/* Demo only: no return policy or warranty is stored for real products. */}
          {!IS_LIVE && (
            <p className="mt-3 text-xs text-muted-foreground">Return policy: 7-day return if the item differs from description.{product.specs.Warranty ? ` Warranty: ${product.specs.Warranty}.` : ""}</p>
          )}
        </TabsContent>
        <TabsContent value="specs">
          <div className="grid gap-2 rounded-2xl border border-border-soft bg-card p-5 text-sm sm:grid-cols-2">
            {Object.entries(product.specs).map(([k, v]) => (
              <div key={k} className="flex justify-between border-b py-1">
                <span className="text-muted-foreground">{k}</span>
                <span className="font-medium">{String(v)}</span>
              </div>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="price">
          <div className="rounded-2xl border border-border-soft bg-card p-5">
            <p className="mb-3 text-sm text-muted-foreground">30-day price history — proof of a genuine discount.</p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart}>
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: any) => GHS(Number(v))} />
                  <Line type="monotone" dataKey="price" stroke="var(--primary)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="reviews" className="rounded-2xl border border-border-soft bg-card p-5">
          <p className="text-sm">Verified buyer reviews average {product.rating.toFixed(1)}/5 across {product.reviews} ratings.</p>
        </TabsContent>
      </Tabs>

      {/* Related */}
      {related.length > 0 && (
        <div>
          <h3 className="mb-3 text-lg font-bold">Related products</h3>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {related.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function SignalCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-2 text-center">
      <div className="mx-auto mb-1 text-link">{icon}</div>
      <p className="text-sm font-bold">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

function PriceAlertButton({ current, onSet }: { current: number; onSet: (v: number) => void }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(Math.round(current * 0.9));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost"><Bell className="mr-1 h-4 w-4" /> Price alert</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Notify me when the price drops</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input type="number" value={target} onChange={(e) => setTarget(+e.target.value)} />
          <div className="grid grid-cols-3 gap-2 text-xs">
            {[0.95, 0.90, 0.85].map((f) => (
              <Button key={f} variant="outline" size="sm" onClick={() => setTarget(Math.round(current * f))}>
                {Math.round((1 - f) * 100)}% off
              </Button>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => { onSet(target); setOpen(false); }}>Set alert</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AskSellerDialog({ storeName, msg, setMsg, onSend }: {
  storeName: string; msg: string; setMsg: (s: string) => void; onSend: (b: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost"><MessageSquare className="mr-1 h-4 w-4" /> Ask</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Message {storeName}</DialogTitle>
        </DialogHeader>
        <Textarea rows={4} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Hi, I'd like to know…" />
        <p className="text-xs text-muted-foreground">Your phone number stays private. All communication happens through NAFLIS.</p>
        <DialogFooter>
          <Button onClick={() => { if (msg.trim()) { onSend(msg); setOpen(false); } }}>Send</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
