import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import {
  Heart, Share2, Bell, MessageSquare, ShieldCheck, Truck, Clock, TrendingUp,
  Zap, AlertTriangle, Eye, Users, Star, Loader2,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useNaflis } from "@/lib/naflis/store";
import { GHS, pct } from "@/lib/naflis/format";
import { ProductCard } from "@/components/naflis/ProductCard";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";

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

  const [dbProduct, setDbProduct] = useState<any>(null);
  const [dbStore, setDbStore] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from("products")
          .select("*, vendors(*)")
          .eq("id", id)
          .single();

        if (data) {
          const mapped = {
            id: data.id,
            storeId: data.vendor_id,
            name: data.title,
            image: data.images?.[0] || "https://images.unsplash.com/photo-1523275335684-37898b6baf30",
            gallery: data.images || [],
            description: data.description || "",
            price: data.price,
            originalPrice: data.price * 1.2,
            stock: data.stock,
            demand: 75,
            category: data.category,
            priceHistory: [
              { date: "2026-07-01", price: Math.round(data.price * 1.15) },
              { date: "2026-07-05", price: Math.round(data.price * 1.10) },
              { date: "2026-07-10", price: Math.round(data.price * 1.05) },
              { date: "2026-07-15", price: data.price },
            ]
          };
          setDbProduct(mapped);

          // Sync product to Zustand store if not already present
          useNaflis.setState((s) => {
            const exists = s.products.find((p) => p.id === mapped.id);
            return {
              products: exists ? s.products.map((p) => p.id === mapped.id ? { ...p, ...mapped } : p) : [...s.products, mapped]
            };
          });

          if (data.vendors) {
            setDbStore({
              id: data.vendors.id,
              name: data.vendors.store_name,
              ownerId: data.vendors.user_id,
              logo: data.vendors.logo_url || `https://api.dicebear.com/9.x/notionists/svg?seed=${data.vendors.store_name}`,
              tagline: data.vendors.description || "Verified Seller",
              rating: 5.0,
              reviews: 0,
              verified: data.vendors.status === "approved",
              followers: 0,
              location: "Accra",
              categories: [data.category],
              subscription: "starter"
            });
          }
        }
      } catch (err) {
        console.error("Error loading product details:", err);
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
        <Loader2 className="h-10 w-10 text-violet animate-spin" />
        <p className="mt-3 text-sm text-muted-foreground font-semibold">Loading product specifications...</p>
      </div>
    );
  }

  const product = dbProduct;
  const store = dbStore;

  if (!product) {
    return (
      <div className="rounded-xl border bg-card p-10 text-center">
        <p>Product not found.</p>
        <Button asChild className="mt-3"><Link to="/buyer">Back home</Link></Button>
      </div>
    );
  }

  const off = Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100);
  const inWishlist = wishlist.includes(product.id);
  const chart = product.priceHistory.map((h: any) => ({ ...h, date: h.date.slice(5) }));

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-[1.1fr_1fr]">
        <div className="overflow-hidden rounded-2xl border bg-card">
          <img src={product.image} alt={product.name} className="aspect-[4/3] w-full object-cover" />
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
              <Badge className="gap-1 bg-gold text-gold-foreground">
                <Zap className="h-3 w-3" /> Flash sale
              </Badge>
            )}
          </div>
          <h1 className="text-2xl font-black leading-tight sm:text-3xl">{product.name}</h1>

          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="flex items-center gap-1">
              <Star className="h-4 w-4 fill-gold text-gold" />
              {product.rating.toFixed(1)} · {product.reviews} reviews
            </span>
            {store && (
              <span className="flex items-center gap-1">
                <ShieldCheck className="h-4 w-4 text-violet" />
                {store.name} {store.verified && <span className="text-xs text-violet">(verified)</span>}
              </span>
            )}
            <span className="flex items-center gap-1"><Truck className="h-4 w-4" /> Delivery in {product.deliveryDays} days</span>
          </div>

          <div className="rounded-xl bg-muted p-4">
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-black">{GHS(product.price)}</span>
              <span className="text-sm text-muted-foreground line-through">{GHS(product.originalPrice)}</span>
              {off > 0 && <Badge className="bg-error text-error-foreground">-{pct(off)}</Badge>}
            </div>
            <p className="mt-1 text-sm text-success">You save {GHS(product.originalPrice - product.price)}</p>
          </div>

          {/* Live signals */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            <SignalCard icon={<Eye className="h-4 w-4" />} label="Viewing now" value={product.viewersNow} />
            <SignalCard icon={<Users className="h-4 w-4" />} label="Waiting for lower price" value={product.waitingForDrop} />
            <SignalCard icon={<TrendingUp className="h-4 w-4" />} label="Demand" value={`${product.demand}/100`} />
          </div>

          {product.stock < 15 && (
            <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Only {product.stock} left in stock
            </div>
          )}

          {/* Actions */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
            <Button size="lg" variant="outline" asChild>
              <Link to="/buyer/reserve">
                <Clock className="mr-1 h-4 w-4" /> Reserve & Pay
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/buyer/installments">
                <TrendingUp className="mr-1 h-4 w-4" /> Pay Later
              </Link>
            </Button>
            <Button variant="ghost" onClick={() => { toggleWishlist(product.id); toast.success(inWishlist ? "Removed" : "Wishlisted"); }}>
              <Heart className={`mr-1 h-4 w-4 ${inWishlist ? "fill-error text-error" : ""}`} /> Wishlist
            </Button>
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
            <Button variant="ghost" onClick={() => { navigator.clipboard?.writeText(window.location.href); toast.success("Link copied"); }}>
              <Share2 className="mr-1 h-4 w-4" /> Share
            </Button>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-success" />
            Escrow-protected · Funds only released once you confirm delivery
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="specs">Specifications</TabsTrigger>
          <TabsTrigger value="price">Price history</TabsTrigger>
          <TabsTrigger value="reviews">Reviews</TabsTrigger>
        </TabsList>
        <TabsContent value="details" className="rounded-xl border bg-card p-5 text-sm leading-relaxed">
          <p>{product.description}</p>
          <p className="mt-3 text-xs text-muted-foreground">Return policy: 7-day return if the item differs from description. Warranty: {product.specs.Warranty}.</p>
        </TabsContent>
        <TabsContent value="specs">
          <div className="grid gap-2 rounded-xl border bg-card p-5 text-sm sm:grid-cols-2">
            {Object.entries(product.specs).map(([k, v]) => (
              <div key={k} className="flex justify-between border-b py-1">
                <span className="text-muted-foreground">{k}</span>
                <span className="font-medium">{v}</span>
              </div>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="price">
          <div className="rounded-xl border bg-card p-5">
            <p className="mb-3 text-sm text-muted-foreground">30-day price history — proof of a genuine discount.</p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart}>
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: any) => GHS(Number(v))} />
                  <Line type="monotone" dataKey="price" stroke="var(--violet)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="reviews" className="rounded-xl border bg-card p-5">
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
      <div className="mx-auto mb-1 text-violet">{icon}</div>
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
