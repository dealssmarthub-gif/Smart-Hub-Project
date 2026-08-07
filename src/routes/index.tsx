import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { ShieldCheck, Wallet, Zap, Sparkles, TrendingUp, Clock, Users, Package,
  ArrowRight, Store, Truck, LineChart, BadgePercent, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/naflis/Logo";
import { ThemeToggle } from "@/components/naflis/ThemeToggle";
import { ProductCard } from "@/components/naflis/ProductCard";
import { useNaflis, CATEGORIES } from "@/lib/naflis/store";
import { GHS, compact } from "@/lib/naflis/format";
import { toast } from "sonner";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Metric({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card/60 backdrop-blur p-4 text-left">
      <Icon className="mb-2 h-5 w-5 text-gold" />
      <p className="text-2xl font-black tracking-tight">{value}</p>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

function Landing() {
  const initialProducts = useNaflis((s) => s.products);
  const [products, setProducts] = useState<any[]>(initialProducts);

  useEffect(() => {
    const fetchApprovedProducts = async () => {
      try {
        const { data, error } = await supabase
          .from("products")
          .select("*, vendors!inner(status, store_name, logo_url, description)")
          .eq("vendors.status", "approved");

        if (data && data.length > 0) {
          const mapped = data.map((p) => ({
            id: p.id,
            storeId: p.vendor_id,
            name: p.title,
            image: p.images?.[0] || "https://images.unsplash.com/photo-1523275335684-37898b6baf30",
            gallery: p.images || [],
            description: p.description || "",
            price: p.price,
            originalPrice: p.price * 1.2,
            stock: p.stock,
            demand: 75,
            category: p.category,
            flashSale: true,
            priceHistory: [
              { date: "2026-07-01", price: Math.round(p.price * 1.15) },
              { date: "2026-07-05", price: Math.round(p.price * 1.10) },
              { date: "2026-07-10", price: Math.round(p.price * 1.05) },
              { date: "2026-07-15", price: p.price },
            ]
          }));
          setProducts(mapped);
          useNaflis.setState({ products: mapped });
        }
      } catch (err) {
        console.error("Error fetching homepage products:", err);
      }
    };
    fetchApprovedProducts();
  }, []);
  const users = useNaflis((s) => s.users);
  const stores = useNaflis((s) => s.stores);
  const requests = useNaflis((s) => s.productRequests);
  const orders = useNaflis((s) => s.orders);
  
  const currentUserId = useNaflis((s) => s.currentUserId);
  const role = useNaflis((s) => s.role);
  const loggedInUser = useNaflis((s) => s.users.find((u) => u.id === s.currentUserId));
  const signOut = useNaflis((s) => s.signOut);

  const flash = products.filter((p) => p.flashSale).slice(0, 4);
  const trending = [...products].sort((a, b) => b.demand - a.demand).slice(0, 8);

  const totalSaved = products.reduce((a, p) => a + (p.originalPrice - p.price) * 20, 0);

  const activeShoppersCount = users.filter((u) => u.role === "buyer").length;
  const verifiedSellersCount = stores.filter((st) => st.verified).length;
  const liveDiscountsCount = products.filter((p) => p.originalPrice > p.price).length;
  const productsRequestedCount = requests.reduce((a, r) => a + r.interestedBuyers, 0);
  const inEscrowAmount = orders.reduce((acc, o) => ["escrow-secured", "seller-accepted", "preparing", "out-for-delivery"].includes(o.status) ? acc + o.total : acc, 0);

  return (
    <div className="min-h-screen bg-background">
      {/* Top nav */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4">
          <Logo />
          <nav className="hidden items-center gap-6 md:flex">
            <a href="#deals" className="text-sm text-muted-foreground hover:text-foreground">Deals</a>
            <a href="#how" className="text-sm text-muted-foreground hover:text-foreground">How it works</a>
            <a href="#sellers" className="text-sm text-muted-foreground hover:text-foreground">For Sellers</a>
            <a href="#faq" className="text-sm text-muted-foreground hover:text-foreground">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {currentUserId ? (
              <>
                {loggedInUser && (
                  <span className="hidden lg:inline text-xs font-semibold text-muted-foreground">
                    Logged in as {loggedInUser.name}
                  </span>
                )}
                <Button asChild size="sm" variant="outline">
                  <Link to={role === "admin" || role === "super" ? "/admin" : `/${role}`}>Dashboard</Link>
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    signOut();
                    toast.success("Signed out successfully");
                  }}
                >
                  Sign Out
                </Button>
              </>
            ) : (
              <Button asChild size="sm">
                <Link to="/login">Sign In</Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden gradient-hero text-white">
        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, oklch(0.72 0.18 295 / 0.5), transparent 40%), radial-gradient(circle at 80% 60%, oklch(0.82 0.13 85 / 0.4), transparent 40%)" }} />
        <div className="relative mx-auto max-w-7xl px-4 py-16 md:py-24">
          <div className="grid gap-10 md:grid-cols-2 md:items-center">
            <div>
              <h1 className="text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
                The Future of Buying and Selling
              </h1>
              <p className="mt-4 max-w-xl text-lg text-white/80">
                Discover genuine discounts, pay flexibly, shop securely, and help sellers understand
                what buyers truly want.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg" className="bg-white text-navy hover:bg-white/90">
                  <Link to="/buyer">Start Shopping <ArrowRight className="ml-1 h-4 w-4" /></Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="border-white/40 bg-white/10 text-white hover:bg-white/20">
                  <Link to="/seller">Open a Store</Link>
                </Button>
                <Button asChild size="lg" variant="ghost" className="text-white hover:bg-white/10">
                  <a href="#deals">Explore Live Deals</a>
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-2">
              <Metric icon={Users} label="Active shoppers" value={compact(activeShoppersCount)} />
              <Metric icon={ShieldCheck} label="Verified sellers" value={compact(verifiedSellersCount)} />
              <Metric icon={BadgePercent} label="Live discounts" value={compact(liveDiscountsCount)} />
              <Metric icon={Wallet} label="Buyers saved" value={GHS(totalSaved)} />
              <Metric icon={TrendingUp} label="Products requested" value={compact(productsRequestedCount)} />
              <Metric icon={ShieldCheck} label="In escrow" value={GHS(inEscrowAmount)} />
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="mx-auto max-w-7xl px-4 py-10">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-2xl font-bold">Popular categories</h2>
          <Link to="/buyer" className="text-sm text-violet hover:underline">Browse all →</Link>
        </div>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
          {CATEGORIES.slice(0, 8).map((c) => (
            <Link
              key={c}
              to="/buyer"
              className="rounded-xl border bg-card p-3 text-center text-sm font-medium transition hover:border-violet hover:shadow-premium"
            >
              <Package className="mx-auto mb-1 h-5 w-5 text-violet" />
              {c}
            </Link>
          ))}
        </div>
      </section>

      {/* Flash Sales */}
      <section id="deals" className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-gold" />
              <h2 className="text-2xl font-bold">Flash sales — ending soon</h2>
            </div>
            <p className="text-sm text-muted-foreground">Verified discounts backed by 30-day price history.</p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/buyer">See all <ChevronRight className="ml-1 h-4 w-4" /></Link>
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {flash.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      </section>

      {/* Trending */}
      <section className="mx-auto max-w-7xl px-4 py-6">
        <h2 className="mb-4 text-2xl font-bold">Trending right now</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {trending.slice(0, 8).map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-7xl px-4 py-16">
        <h2 className="mb-8 text-center text-3xl font-bold">Buy any way you can afford</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border bg-card p-6">
            <ShieldCheck className="mb-3 h-8 w-8 text-violet" />
            <h3 className="text-lg font-semibold">Escrow-protected checkout</h3>
            <p className="mt-1 text-sm text-muted-foreground">Funds sit safely in NAFLIS escrow until you confirm delivery. No lost payments, ever.</p>
          </div>
          <div className="rounded-2xl border bg-card p-6">
            <Clock className="mb-3 h-8 w-8 text-gold" />
            <h3 className="text-lg font-semibold">Reserve and Pay</h3>
            <p className="mt-1 text-sm text-muted-foreground">Lock the discount today, pay in weekly or monthly installments — receive the item once you're done.</p>
          </div>
          <div className="rounded-2xl border bg-card p-6">
            <Wallet className="mb-3 h-8 w-8 text-success" />
            <h3 className="text-lg font-semibold">Take Now, Pay Later</h3>
            <p className="mt-1 text-sm text-muted-foreground">Approved buyers pay a down payment, receive the product immediately, and settle over time.</p>
          </div>
        </div>
      </section>

      {/* For sellers */}
      <section id="sellers" className="border-y bg-secondary">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 md:grid-cols-2 md:items-center">
          <div>
            <Badge variant="secondary" className="mb-3 bg-violet/10 text-violet">For Sellers</Badge>
            <h2 className="text-3xl font-bold">Sell what buyers actually want</h2>
            <p className="mt-3 text-muted-foreground">
              See what shoppers are searching for, what price they'll pay, and which discount will convert
              — before you list a single product.
            </p>
            <ul className="mt-6 space-y-3 text-sm">
              <li className="flex gap-2"><LineChart className="h-4 w-4 text-violet" /> Demand intelligence & regional heatmaps</li>
              <li className="flex gap-2"><BadgePercent className="h-4 w-4 text-violet" /> Pricing recommendations tied to expected sales lift</li>
              <li className="flex gap-2"><Store className="h-4 w-4 text-violet" /> Automated store branding & catalog generation</li>
              <li className="flex gap-2"><Truck className="h-4 w-4 text-violet" /> Escrow settlements & platform-wide delivery network</li>
            </ul>
            <div className="mt-6 flex gap-3">
              <Button asChild>
                <Link to="/seller">Open a Store</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/seller">See Seller Intelligence</Link>
              </Button>
            </div>
          </div>
          <div className="rounded-3xl border bg-card p-6 shadow-premium">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Live opportunity signal</p>
            <p className="mt-1 text-lg font-semibold">Gaming chairs in Kumasi</p>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-muted p-3"><p className="text-xs text-muted-foreground">Interested buyers</p><p className="text-xl font-bold">2,812</p></div>
              <div className="rounded-lg bg-muted p-3"><p className="text-xs text-muted-foreground">Active sellers</p><p className="text-xl font-bold">3</p></div>
              <div className="rounded-lg bg-muted p-3"><p className="text-xs text-muted-foreground">Market price</p><p className="text-xl font-bold">{GHS(1350)}</p></div>
              <div className="rounded-lg bg-muted p-3"><p className="text-xs text-muted-foreground">Preferred price</p><p className="text-xl font-bold text-success">{GHS(1180)}</p></div>
            </div>
            <div className="mt-4 rounded-lg gradient-hero p-3 text-white">
              <p className="text-xs opacity-80">Opportunity score</p>
              <p className="text-3xl font-black">96 <span className="text-sm font-normal opacity-70">/ 100</span></p>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="mx-auto max-w-7xl px-4 py-16">
        <h2 className="mb-8 text-center text-3xl font-bold">Trusted by buyers and sellers</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { q: "I reserved a fridge and paid weekly. Getting it delivered next week feels magical.", n: "Ama, Accra" },
            { q: "The demand map told me exactly which laptop to import. Sold out in 6 days.", n: "TrendTech Ghana" },
            { q: "Escrow means I finally trust online shopping again.", n: "Efua, Takoradi" },
          ].map((t, i) => (
            <div key={i} className="rounded-2xl border bg-card p-6">
              <p className="text-sm">"{t.q}"</p>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">— {t.n}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl px-4 py-16">
        <h2 className="mb-6 text-center text-3xl font-bold">Frequently asked questions</h2>
        <Accordion type="single" collapsible className="w-full">
          {[
            ["How does escrow work?", "NAFLIS holds the payment until you confirm delivery. Sellers only receive funds once the buyer approves — or automatically after the confirmation window closes."],
            ["Is Reserve and Pay a loan?", "No. There is no credit risk. You pay in installments and only receive the product once you have paid in full."],
            ["Who can qualify for Take Now, Pay Later?", "Every buyer goes through a transparent eligibility check based on wallet activity, verification, and repayment history. You see exactly why you were approved or declined."],
            ["Are the discounts real?", "Yes. We store the price history of every product. Sellers cannot inflate a price and instantly claim a big discount — we badge only Verified Discounts."],
          ].map(([q, a], i) => (
            <AccordionItem key={i} value={`i-${i}`}>
              <AccordionTrigger className="text-left">{q}</AccordionTrigger>
              <AccordionContent>{a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-4 pb-20">
        <div className="rounded-3xl gradient-hero p-10 text-center text-white shadow-premium">
          <h2 className="text-3xl font-bold">Ready to see the future of commerce?</h2>
          <p className="mt-2 text-white/80">Experience smarter commerce today.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="bg-white text-navy hover:bg-white/90">
              <Link to="/buyer">Enter the platform</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-white/40 bg-white/10 text-white hover:bg-white/20">
              <Link to="/admin">View Admin Console</Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t bg-secondary/50">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row">
          <Logo />
          <p>© {new Date().getFullYear()} NAFLIS Discount Mall. Investor preview build.</p>
        </div>
      </footer>
    </div>
  );
}
