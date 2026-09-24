import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import {
  ShieldCheck,
  Wallet,
  Zap,
  Sparkles,
  TrendingUp,
  Clock,
  Users,
  Package,
  ArrowRight,
  Store,
  Truck,
  LineChart,
  BadgePercent,
  ChevronRight,
  ChevronLeft,
  GraduationCap,
  Search,
  Building2,
  Pin,
  Calendar,
  MapPin,
  BookOpen,
  FileText,
  Lock,
  CheckCircle2,
  Flame,
  X,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/naflis/Logo";
import { ThemeToggle } from "@/components/naflis/ThemeToggle";
import { ProductCard } from "@/components/naflis/ProductCard";
import {
  useNaflis,
  CATEGORIES,
  CAMPUSES,
  type CampusEvent,
  type Product,
} from "@/lib/naflis/store";
import { GHS, compact } from "@/lib/naflis/format";
import { toast } from "sonner";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Metric({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card/60 backdrop-blur p-4 text-left shadow-sm">
      <Icon className="mb-2 h-5 w-5 text-sky-500" />
      <p className="text-2xl font-black tracking-tight text-foreground">{value}</p>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

function Landing() {
  const navigate = useNavigate();

  const initialProducts = useNaflis((s) => s.products);
  const [products, setProducts] = useState<any[]>(initialProducts);
  const initialCampusEvents = useNaflis((s) => s.campusEvents);
  const [pinnedEvents, setPinnedEvents] = useState<CampusEvent[]>(
    initialCampusEvents.filter((e) => e.pinned)
  );

  const selectedCampus = useNaflis((s) => s.selectedCampus);
  const setSelectedCampus = useNaflis((s) => s.setSelectedCampus);
  const logDemandSearch = useNaflis((s) => s.logDemandSearch);
  const addToCart = useNaflis((s) => s.addToCart);

  const currentUserId = useNaflis((s) => s.currentUserId);
  const role = useNaflis((s) => s.role);
  const loggedInUser = useNaflis((s) => s.users.find((u) => u.id === s.currentUserId));
  const signOut = useNaflis((s) => s.signOut);
  const users = useNaflis((s) => s.users);
  const stores = useNaflis((s) => s.stores);
  const requests = useNaflis((s) => s.productRequests);
  const orders = useNaflis((s) => s.orders);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearchTerm, setActiveSearchTerm] = useState("");

  // Pinned ticker carousel index
  const [activeTickerIndex, setActiveTickerIndex] = useState(0);

  // Selected event modal
  const [selectedEventModal, setSelectedEventModal] = useState<CampusEvent | null>(null);

  // Escrow details modal
  const [escrowModalOpen, setEscrowModalOpen] = useState(false);

  // Fetch approved products and pinned events from Supabase
  useEffect(() => {
    const fetchApprovedProducts = async () => {
      if (!supabase) return;
      try {
        const { data } = await supabase
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
            originalPrice: p.price * 1.25,
            stock: p.stock,
            demand: 85,
            category: p.category,
            flashSale: true,
            verifiedDiscount: true,
            location: "Greater Accra",
          }));
          setProducts(mapped);
          useNaflis.setState({ products: mapped });
        }
      } catch (err) {
        console.warn("Notice: Loaded local product catalog:", err);
      }
    };

    const fetchPinnedCampusEvents = async () => {
      if (!supabase) return;
      try {
        const { data } = await supabase
          .from("campus_events")
          .select("*")
          .eq("pinned", true)
          .order("created_at", { ascending: false });

        if (data && data.length > 0) {
          const mapped: CampusEvent[] = data.map((e: any) => ({
            id: e.id,
            title: e.title,
            description: e.description || "",
            eventDate: e.event_date || new Date().toISOString(),
            venue: e.venue || "Campus Main Hall",
            bannerUrl: e.banner_url || "https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=1200&q=80",
            campus: e.campus || "UG - Legon",
            pinned: true,
            organizer: e.organizer || "Official SRC",
            createdAt: new Date(e.created_at).getTime(),
          }));
          setPinnedEvents(mapped);
        }
      } catch (err) {
        console.warn("Notice: Loaded local pinned events:", err);
      }
    };

    fetchApprovedProducts();
    fetchPinnedCampusEvents();
  }, []);

  // Auto-cycle pinned announcement ticker
  useEffect(() => {
    if (pinnedEvents.length <= 1) return;
    const interval = setInterval(() => {
      setActiveTickerIndex((prev) => (prev + 1) % pinnedEvents.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [pinnedEvents.length]);

  // Handle Search Submission & Passive Demand Logging
  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    setActiveSearchTerm(query);

    // Compute live results
    const matchingCount = products.filter((p) =>
      `${p.name} ${p.brand || ""} ${p.category} ${p.description}`
        .toLowerCase()
        .includes(query.toLowerCase())
    ).length;

    // Passive demand logging (both non-blocking to Supabase demand_logs and store)
    logDemandSearch(query, selectedCampus, matchingCount);

    toast.info(`Found ${matchingCount} results for "${query}" on ${selectedCampus}`);
  };

  const handleCampusChipClick = (campus: string) => {
    setSelectedCampus(campus);
    if (searchQuery.trim()) {
      logDemandSearch(searchQuery.trim(), campus, 1);
    }
  };

  // Filter products by search term and selected campus
  const displayProducts = useMemo(() => {
    return products.filter((p) => {
      if (!activeSearchTerm) return true;
      const q = activeSearchTerm.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        (p.brand && p.brand.toLowerCase().includes(q)) ||
        p.category.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
      );
    });
  }, [products, activeSearchTerm]);

  const flash = displayProducts.filter((p) => p.flashSale).slice(0, 4);
  const trending = [...displayProducts].sort((a, b) => (b.demand || 0) - (a.demand || 0)).slice(0, 8);

  const totalSaved = products.reduce((a, p) => a + (p.originalPrice - p.price) * 15, 0);
  const activeShoppersCount = users.filter((u) => u.role === "buyer").length;
  const verifiedSellersCount = stores.filter((st) => st.verified).length;
  const liveDiscountsCount = products.filter((p) => p.originalPrice > p.price).length;
  const productsRequestedCount = requests.reduce((a, r) => a + r.interestedBuyers, 0);
  const inEscrowAmount = orders.reduce(
    (acc, o) =>
      ["escrow-secured", "seller-accepted", "preparing", "out-for-delivery"].includes(o.status)
        ? acc + o.total
        : acc,
    0
  );

  const currentPinnedEvent = pinnedEvents[activeTickerIndex] || pinnedEvents[0];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* 1. Pinned SRC Announcement Banner Ticker */}
      {currentPinnedEvent && (
        <aside
          aria-label="Pinned Official SRC Announcement"
          className="bg-navy text-white border-b border-sky-500/30 px-3 py-2 text-xs transition-colors"
        >
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <span className="flex items-center gap-1 shrink-0 rounded-full bg-sky-500 px-2 py-0.5 font-black text-[10px] uppercase tracking-wider text-white shadow-sm">
                <Pin className="h-3 w-3 fill-current" />
                SRC Notice
              </span>
              <span className="shrink-0 font-bold text-sky-300 hidden sm:inline">
                [{currentPinnedEvent.campus}]
              </span>
              <p className="truncate font-medium text-white/95">
                {currentPinnedEvent.title}
              </p>
              {currentPinnedEvent.venue && (
                <span className="hidden md:inline text-white/70 truncate text-[11px]">
                  • 📍 {currentPinnedEvent.venue}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setSelectedEventModal(currentPinnedEvent)}
                className="font-bold text-sky-400 hover:text-sky-300 underline text-xs"
              >
                Read Notice →
              </button>
              {pinnedEvents.length > 1 && (
                <div className="hidden sm:flex items-center gap-1 border-l border-white/20 pl-2">
                  <button
                    onClick={() =>
                      setActiveTickerIndex(
                        (prev) => (prev - 1 + pinnedEvents.length) % pinnedEvents.length
                      )
                    }
                    className="p-0.5 hover:bg-white/10 rounded"
                    aria-label="Previous Notice"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="text-[10px] text-white/70">
                    {activeTickerIndex + 1}/{pinnedEvents.length}
                  </span>
                  <button
                    onClick={() =>
                      setActiveTickerIndex((prev) => (prev + 1) % pinnedEvents.length)
                    }
                    className="p-0.5 hover:bg-white/10 rounded"
                    aria-label="Next Notice"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </aside>
      )}

      {/* Top Navbar */}
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4">
          <Logo />

          <nav className="hidden items-center gap-6 lg:flex">
            <Link
              to="/student-os"
              className="flex items-center gap-1.5 text-sm font-bold text-sky-500 hover:text-sky-400 transition"
            >
              <GraduationCap className="h-4 w-4" />
              <span>Campus Hub</span>
            </Link>
            <Link
              to="/student-os/marketplace"
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Marketplace
            </Link>
            <Link
              to="/student-os/deals"
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Student Deals
            </Link>
            <button
              onClick={() => setEscrowModalOpen(true)}
              className="text-sm font-medium text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-sky-500" />
              <span>Safe Escrow</span>
            </button>
            <Link
              to="/campus-admin"
              className="text-sm font-semibold text-sky-500 hover:underline flex items-center gap-1"
            >
              <Building2 className="h-3.5 w-3.5" />
              <span>Institutional / SRC Access</span>
            </Link>
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            {currentUserId ? (
              <>
                {loggedInUser && (
                  <span className="hidden xl:inline text-xs font-semibold text-muted-foreground">
                    {loggedInUser.name}
                  </span>
                )}
                <Button asChild size="sm" variant="outline">
                  <Link to={role === "admin" || role === "super" ? "/admin" : `/${role}`}>
                    Dashboard
                  </Link>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    signOut();
                    toast.success("Signed out successfully");
                  }}
                >
                  Sign Out
                </Button>
              </>
            ) : (
              <Button asChild size="sm" className="bg-sky-500 hover:bg-sky-600 text-white font-bold">
                <Link to="/login">Sign In</Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden gradient-hero text-white">
        <div
          className="absolute inset-0 opacity-25 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 15% 20%, #0284c7 0%, transparent 45%), radial-gradient(circle at 85% 70%, #38bdf8 0%, transparent 40%)",
          }}
        />

        <div className="relative mx-auto max-w-7xl px-4 py-16 sm:py-24">
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/40 bg-sky-500/20 px-3.5 py-1 text-xs font-semibold text-sky-200 backdrop-blur">
              <GraduationCap className="h-4 w-4 text-sky-300" />
              <span>The Verified Campus & Student Commerce Operating System</span>
            </div>

            <h1 className="text-4xl font-black leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl text-white">
              Smart Campus Commerce & Student Hub
            </h1>

            <p className="text-sm sm:text-base text-white/80 max-w-2xl mx-auto leading-relaxed">
              Trade peer-to-peer thrift, join bulk student group buys, download verified lecture notes,
              and lock in zero-risk escrow transactions across Ghanaian universities.
            </p>

            {/* Prominent Central Search Bar with Campus Dropdown */}
            <form
              onSubmit={handleSearchSubmit}
              className="mt-6 flex flex-col sm:flex-row items-center gap-2 bg-white/10 p-2 rounded-2xl border border-white/20 backdrop-blur shadow-2xl"
            >
              <div className="relative flex items-center w-full sm:w-auto shrink-0">
                <Building2 className="pointer-events-none absolute left-3 h-4 w-4 text-sky-400 z-10" />
                <select
                  aria-label="Campus Selector"
                  value={selectedCampus}
                  onChange={(e) => setSelectedCampus(e.target.value)}
                  className="h-11 w-full sm:w-44 rounded-xl border-0 bg-white/20 pl-9 pr-7 text-xs font-bold text-white focus:bg-white/30 focus:outline-none focus:ring-1 focus:ring-sky-400"
                >
                  {CAMPUSES.map((c) => (
                    <option key={c} value={c} className="bg-navy text-white">
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="relative flex-1 w-full">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/60" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search laptops, textbooks, past exams, dorm gear..."
                  className="h-11 w-full bg-white/20 pl-10 pr-9 border-0 text-white placeholder:text-white/60 text-xs sm:text-sm rounded-xl focus-visible:ring-1 focus-visible:ring-sky-400"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setActiveSearchTerm("");
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <Button
                type="submit"
                className="h-11 w-full sm:w-auto bg-sky-500 hover:bg-sky-400 text-white font-black text-xs sm:text-sm px-6 rounded-xl shadow-lg shrink-0 gap-1.5"
              >
                <Search className="h-4 w-4" />
                <span>Search Deals</span>
              </Button>
            </form>

            {/* Active Campus Chips */}
            <div className="flex flex-wrap items-center justify-center gap-1.5 pt-2">
              <span className="text-xs text-white/60 font-semibold mr-1">Popular Campuses:</span>
              {CAMPUSES.slice(0, 7).map((campus) => (
                <button
                  key={campus}
                  type="button"
                  onClick={() => handleCampusChipClick(campus)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    selectedCampus === campus
                      ? "bg-sky-500 text-white shadow-md font-bold"
                      : "bg-white/10 text-white/80 hover:bg-white/20"
                  }`}
                >
                  {campus.replace("University", "").trim()}
                </button>
              ))}
            </div>

            {/* Prominent CTA Buttons */}
            <div className="pt-4 flex flex-wrap justify-center gap-3">
              <Button
                asChild
                size="lg"
                className="bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs sm:text-sm shadow-xl"
              >
                <Link to="/student-os/deals">
                  <BadgePercent className="mr-2 h-4 w-4" /> Browse Student Deals
                </Link>
              </Button>

              <Button
                size="lg"
                onClick={() => setEscrowModalOpen(true)}
                className="bg-white text-navy hover:bg-white/90 font-bold text-xs sm:text-sm shadow-xl"
              >
                <ShieldCheck className="mr-2 h-4 w-4 text-sky-600" /> Safe Escrow
              </Button>

              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-white/40 bg-white/10 text-white hover:bg-white/20 backdrop-blur font-bold text-xs sm:text-sm"
              >
                <Link to="/student-os">
                  <GraduationCap className="mr-2 h-4 w-4 text-sky-300" /> Campus Hub
                </Link>
              </Button>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 max-w-5xl mx-auto">
            <Metric icon={Users} label="Active shoppers" value={compact(activeShoppersCount)} />
            <Metric icon={ShieldCheck} label="Verified sellers" value={compact(verifiedSellersCount)} />
            <Metric icon={BadgePercent} label="Live discounts" value={compact(liveDiscountsCount)} />
            <Metric icon={Wallet} label="Student savings" value={GHS(totalSaved)} />
            <Metric icon={TrendingUp} label="Requested items" value={compact(productsRequestedCount)} />
            <Metric icon={Lock} label="Protected in escrow" value={GHS(inEscrowAmount)} />
          </div>
        </div>
      </section>

      {/* Active Search Results Indicator */}
      {activeSearchTerm && (
        <section className="border-b bg-sky-500/10 py-4">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4">
            <p className="text-xs sm:text-sm font-semibold text-foreground">
              Showing search results for{" "}
              <span className="font-bold text-sky-500">"{activeSearchTerm}"</span> on{" "}
              <span className="font-bold">{selectedCampus}</span> ({displayProducts.length} items found)
            </p>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setActiveSearchTerm("");
                setSearchQuery("");
              }}
              className="text-xs h-7"
            >
              Clear filter ✕
            </Button>
          </div>
        </section>
      )}

      {/* 2. Module Navigation Quick-Cards (5 Pillars) */}
      <section className="mx-auto max-w-7xl px-4 py-12">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
              Campus Toolkits & Modules
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Engineered specifically for university life, academic success, and trusted student trade.
            </p>
          </div>
          <span className="text-xs font-semibold text-sky-500">5 Integrated Pillars</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Card 1: Student Marketplace */}
          <Link
            to="/student-os/marketplace"
            className="group flex flex-col justify-between rounded-2xl border bg-card p-5 hover:border-sky-500 hover:shadow-premium transition"
          >
            <div>
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-sky-500/10 text-sky-500 group-hover:bg-sky-500 group-hover:text-white transition mb-3">
                <Store className="h-6 w-6" />
              </div>
              <h3 className="text-base font-bold text-foreground">1. Student Marketplace</h3>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Campus peer-to-peer thrift, textbooks, laptops, fridges & dorm furniture.
              </p>
            </div>
            <div className="mt-4 pt-2 border-t flex items-center text-xs font-bold text-sky-500 group-hover:translate-x-1 transition">
              <span>Open Market</span>
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </div>
          </Link>

          {/* Card 2: Student Deals & Group Buys */}
          <Link
            to="/student-os/deals"
            className="group flex flex-col justify-between rounded-2xl border bg-card p-5 hover:border-sky-500 hover:shadow-premium transition"
          >
            <div>
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-sky-500/10 text-sky-500 group-hover:bg-sky-500 group-hover:text-white transition mb-3">
                <BadgePercent className="h-6 w-6" />
              </div>
              <h3 className="text-base font-bold text-foreground">2. Student Deals & Group Buys</h3>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Verified discounts, split group orders & volume bulk price drops.
              </p>
            </div>
            <div className="mt-4 pt-2 border-t flex items-center text-xs font-bold text-sky-500 group-hover:translate-x-1 transition">
              <span>Join Group Buys</span>
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </div>
          </Link>

          {/* Card 3: Official SRC Notices & Campus Events */}
          <Link
            to="/campus-admin"
            className="group flex flex-col justify-between rounded-2xl border bg-card p-5 hover:border-sky-500 hover:shadow-premium transition"
          >
            <div>
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-sky-500/10 text-sky-500 group-hover:bg-sky-500 group-hover:text-white transition mb-3">
                <Building2 className="h-6 w-6" />
              </div>
              <h3 className="text-base font-bold text-foreground">3. Official SRC Notices</h3>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Direct administrative bulletins, townhall assemblies & campus welfare updates.
              </p>
            </div>
            <div className="mt-4 pt-2 border-t flex items-center text-xs font-bold text-sky-500 group-hover:translate-x-1 transition">
              <span>View SRC Notices</span>
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </div>
          </Link>

          {/* Card 4: Lecture Notes, Past Questions & Slides */}
          <Link
            to="/student-os/resources"
            className="group flex flex-col justify-between rounded-2xl border bg-card p-5 hover:border-sky-500 hover:shadow-premium transition"
          >
            <div>
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-sky-500/10 text-sky-500 group-hover:bg-sky-500 group-hover:text-white transition mb-3">
                <BookOpen className="h-6 w-6" />
              </div>
              <h3 className="text-base font-bold text-foreground">4. Lecture Notes & Slides</h3>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Solved past examination booklets, formulas, summaries & faculty slides.
              </p>
            </div>
            <div className="mt-4 pt-2 border-t flex items-center text-xs font-bold text-sky-500 group-hover:translate-x-1 transition">
              <span>Study Resources</span>
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </div>
          </Link>

          {/* Card 5: Escrow Protection Hub */}
          <button
            onClick={() => setEscrowModalOpen(true)}
            className="group flex flex-col justify-between rounded-2xl border bg-card p-5 hover:border-sky-500 hover:shadow-premium transition text-left"
          >
            <div>
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-sky-500/10 text-sky-500 group-hover:bg-sky-500 group-hover:text-white transition mb-3">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h3 className="text-base font-bold text-foreground">5. Escrow Protection Hub</h3>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Zero-fraud escrow. Funds held safe until meetup inspection & 6-digit PIN release.
              </p>
            </div>
            <div className="mt-4 pt-2 border-t flex items-center text-xs font-bold text-sky-500 group-hover:translate-x-1 transition">
              <span>Escrow Security</span>
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </div>
          </button>
        </div>
      </section>

      {/* 3. Flash Deals & Verified Campus Discounts */}
      <section id="deals" className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-500" />
              <h2 className="text-2xl font-black tracking-tight text-foreground">
                Flash Deals — Verified Campus Pricing
              </h2>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Strictly vetted prices backed by price history. No artificial pre-sale price markups.
            </p>
          </div>

          <Button asChild variant="outline" size="sm" className="text-xs">
            <Link to="/student-os/deals">
              See all student drops <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {flash.map((p) => (
            <div
              key={p.id}
              className="group flex flex-col rounded-2xl border bg-card overflow-hidden hover:shadow-premium transition"
            >
              <div className="relative aspect-square w-full overflow-hidden bg-muted">
                <img
                  src={p.image}
                  alt={p.name}
                  loading="lazy"
                  className="h-full w-full object-cover group-hover:scale-105 transition duration-300"
                />
                <div className="absolute top-2 left-2 flex flex-col gap-1">
                  <Badge className="bg-sky-500 text-white font-bold text-[10px] shadow-sm">
                    Student Price
                  </Badge>
                  {p.verifiedDiscount && (
                    <Badge className="bg-emerald-500 text-white text-[10px] gap-1 shadow-sm">
                      <ShieldCheck className="h-3 w-3" /> Verified Seller
                    </Badge>
                  )}
                </div>
              </div>

              <div className="flex flex-col flex-1 p-4 gap-2">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="font-semibold uppercase text-sky-500">{p.category}</span>
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                    <ShieldCheck className="h-3 w-3" /> Escrow Backed
                  </span>
                </div>

                <h4 className="text-sm font-bold text-foreground line-clamp-1">{p.name}</h4>
                <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>

                <div className="mt-auto pt-3 border-t flex items-center justify-between">
                  <div>
                    <span className="text-base font-black text-foreground">{GHS(p.price)}</span>
                    {p.originalPrice && (
                      <span className="ml-1.5 text-xs text-muted-foreground line-through">
                        {GHS(p.originalPrice)}
                      </span>
                    )}
                  </div>

                  <Button
                    size="sm"
                    onClick={() => {
                      addToCart(p.id, 1);
                      toast.success(
                        `${p.name} added to Escrow checkout. Meetup code generated.`
                      );
                    }}
                    className="bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs h-8 px-3 shadow-sm gap-1"
                  >
                    <Lock className="h-3 w-3" /> Buy with Escrow
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 4. Trending Campus Products */}
      <section className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between border-b pb-4">
          <div>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-sky-500" />
              <h2 className="text-2xl font-black tracking-tight text-foreground">
                Trending on {selectedCampus}
              </h2>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Most requested items, electronics, and study gear among students this semester.
            </p>
          </div>

          <Button asChild variant="outline" size="sm" className="text-xs">
            <Link to="/buyer">Browse full mall</Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {trending.slice(0, 8).map((p) => (
            <div
              key={p.id}
              className="group flex flex-col rounded-2xl border bg-card overflow-hidden hover:shadow-premium transition"
            >
              <div className="relative aspect-square w-full overflow-hidden bg-muted">
                <img
                  src={p.image}
                  alt={p.name}
                  loading="lazy"
                  className="h-full w-full object-cover group-hover:scale-105 transition duration-300"
                />
                <div className="absolute top-2 left-2 flex flex-col gap-1">
                  <Badge className="bg-navy/80 text-white backdrop-blur text-[10px] gap-1">
                    <Flame className="h-3 w-3 text-amber-400" /> High Campus Demand
                  </Badge>
                </div>
              </div>

              <div className="flex flex-col flex-1 p-4 gap-2">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="font-semibold uppercase text-sky-500">{p.category}</span>
                  <Badge variant="outline" className="text-[10px] text-sky-500 border-sky-500/30">
                    SRC Trusted
                  </Badge>
                </div>

                <h4 className="text-sm font-bold text-foreground line-clamp-1">{p.name}</h4>
                <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>

                <div className="mt-auto pt-3 border-t flex items-center justify-between">
                  <div>
                    <span className="text-base font-black text-foreground">{GHS(p.price)}</span>
                    {p.originalPrice && (
                      <span className="ml-1.5 text-xs text-muted-foreground line-through">
                        {GHS(p.originalPrice)}
                      </span>
                    )}
                  </div>

                  <Button
                    size="sm"
                    onClick={() => {
                      addToCart(p.id, 1);
                      toast.success(
                        `Added ${p.name} to protected Escrow order.`
                      );
                    }}
                    className="bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs h-8 px-3 shadow-sm gap-1"
                  >
                    <Lock className="h-3 w-3" /> Buy with Escrow
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 5. Safe Escrow Explainer Section */}
      <section id="escrow" className="mx-auto max-w-7xl px-4 py-16">
        <div className="rounded-3xl border border-sky-500/30 bg-card p-8 sm:p-12 shadow-premium space-y-8">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <Badge className="bg-sky-500/10 text-sky-500 border-sky-500/20 text-xs">
              Campus Handover Security
            </Badge>
            <h2 className="text-3xl font-black tracking-tight text-foreground">
              How Campus Escrow Protects Every Cedi
            </h2>
            <p className="text-sm text-muted-foreground">
              Never worry about sending money to unknown numbers. Payment is only transferred after you
              inspect the item in person.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <div className="rounded-2xl border bg-background p-6 space-y-3">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-sky-500/10 text-sky-500 font-black text-lg">
                1
              </div>
              <h3 className="text-base font-bold text-foreground">Lock Funds in Escrow</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                When you click "Buy with Escrow", your payment is secured in NAFLIS Escrow. The seller
                is notified that payment is confirmed and ready.
              </p>
            </div>

            <div className="rounded-2xl border bg-background p-6 space-y-3">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-sky-500/10 text-sky-500 font-black text-lg">
                2
              </div>
              <h3 className="text-base font-bold text-foreground">Meet at Safe Campus Spot</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Meet the student seller or vendor at designated campus points (hostels, libraries,
                or campus cafes). Test and inspect the product thoroughly.
              </p>
            </div>

            <div className="rounded-2xl border bg-background p-6 space-y-3">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-sky-500/10 text-sky-500 font-black text-lg">
                3
              </div>
              <h3 className="text-base font-bold text-foreground">Release with 6-Digit PIN</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Only when 100% satisfied, share your unique 6-digit confirmation code. If the item
                fails inspection, cancel instantly for full automatic refund.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Institutional / SRC Access Callout */}
      <section className="mx-auto max-w-7xl px-4 pb-16">
        <div className="rounded-3xl gradient-hero p-8 sm:p-12 text-white shadow-premium flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <Badge className="bg-sky-400/30 text-sky-200 border-sky-300/40 text-xs gap-1">
              <Building2 className="h-3.5 w-3.5" /> For Student Leaders & Faculty Heads
            </Badge>
            <h2 className="text-2xl sm:text-3xl font-black">
              Institutional & SRC Governance Portal
            </h2>
            <p className="text-xs sm:text-sm text-white/80 leading-relaxed">
              Publish official student welfare announcements, upload department lecture slides & solved
              past questions, and review campus-wide student demand intelligence.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 shrink-0">
            <Button
              asChild
              size="lg"
              className="bg-white text-navy hover:bg-white/90 font-bold shadow-lg"
            >
              <Link to="/campus-admin">
                Institutional / SRC Access <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-secondary/50 py-10">
        <div className="mx-auto max-w-7xl px-4 space-y-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="space-y-3">
              <Logo />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Smart Deal Hub · Powered by NAFLIS SmartMall reference architecture and campus escrow.
              </p>
            </div>

            <div className="space-y-2">
              <h5 className="text-xs font-bold uppercase tracking-wider text-foreground">Campus Portals</h5>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                <li><Link to="/student-os" className="hover:text-foreground">Student OS Hub</Link></li>
                <li><Link to="/student-os/marketplace" className="hover:text-foreground">Campus Marketplace</Link></li>
                <li><Link to="/student-os/deals" className="hover:text-foreground">Student Deals</Link></li>
                <li><Link to="/student-os/resources" className="hover:text-foreground">Lecture Notes & Slides</Link></li>
              </ul>
            </div>

            <div className="space-y-2">
              <h5 className="text-xs font-bold uppercase tracking-wider text-foreground">Leadership & Stores</h5>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                <li>
                  <Link to="/campus-admin" className="font-bold text-sky-500 hover:underline">
                    Institutional / SRC Access
                  </Link>
                </li>
                <li><Link to="/seller" className="hover:text-foreground">Vendor Command Center</Link></li>
                <li><Link to="/login" className="hover:text-foreground">Executive Sign In</Link></li>
              </ul>
            </div>

            <div className="space-y-2">
              <h5 className="text-xs font-bold uppercase tracking-wider text-foreground">Safety & Escrow</h5>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                <li><button onClick={() => setEscrowModalOpen(true)} className="hover:text-foreground">Escrow Guarantee</button></li>
                <li><Link to="/buyer/wallet" className="hover:text-foreground">Student Wallet</Link></li>
                <li><span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">✓ 100% Protected Handover</span></li>
              </ul>
            </div>
          </div>

          <div className="pt-6 border-t flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
            <p>© {new Date().getFullYear()} NAFLIS SmartMall Platform. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <Link to="/campus-admin" className="font-semibold text-sky-500 hover:underline">
                Institutional / SRC Access
              </Link>
              <span>•</span>
              <button onClick={() => setEscrowModalOpen(true)} className="hover:text-foreground">
                Escrow Terms
              </button>
            </div>
          </div>
        </div>
      </footer>

      {/* Selected Event Details Modal */}
      {selectedEventModal && (
        <Dialog open={!!selectedEventModal} onOpenChange={() => setSelectedEventModal(null)}>
          <DialogContent className="max-w-lg rounded-2xl">
            <DialogHeader>
              <div className="flex items-center gap-2 mb-2">
                <Badge className="bg-sky-500 text-white text-xs">{selectedEventModal.campus}</Badge>
                <span className="text-xs font-bold text-sky-500">{selectedEventModal.organizer}</span>
              </div>
              <DialogTitle className="text-lg font-black leading-snug">
                {selectedEventModal.title}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Official announcement published on {new Date(selectedEventModal.createdAt).toLocaleDateString()}
              </DialogDescription>
            </DialogHeader>

            {selectedEventModal.bannerUrl && (
              <div className="h-44 w-full rounded-xl overflow-hidden bg-muted mt-2">
                <img
                  src={selectedEventModal.bannerUrl}
                  alt={selectedEventModal.title}
                  className="h-full w-full object-cover"
                />
              </div>
            )}

            <div className="space-y-2 mt-3 text-xs text-foreground/90 leading-relaxed">
              <p>{selectedEventModal.description}</p>

              <div className="rounded-xl border bg-muted/40 p-3 space-y-1 text-xs text-muted-foreground mt-3">
                <div className="flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 text-sky-500" />
                  <span>Venue: {selectedEventModal.venue}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5 text-sky-500" />
                  <span>Date: {new Date(selectedEventModal.eventDate).toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setSelectedEventModal(null)}>
                Close
              </Button>
              <Button
                asChild
                size="sm"
                className="bg-sky-500 hover:bg-sky-600 text-white font-bold"
              >
                <Link to="/campus-admin">Open SRC Portal</Link>
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Escrow Modal */}
      <Dialog open={escrowModalOpen} onOpenChange={setEscrowModalOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-sky-500/10 text-sky-500 mb-2">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <DialogTitle className="text-lg font-black">NAFLIS Campus Escrow Guarantee</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              How funds are held and protected on campus.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-xs text-muted-foreground leading-relaxed">
            <p>
              1. <strong className="text-foreground">Payment is Held:</strong> When you purchase an item on NAFLIS, your money doesn't go to the seller directly. It sits securely in the platform escrow vault.
            </p>
            <p>
              2. <strong className="text-foreground">Meetup on Campus:</strong> Meet the seller at your hall, hostel, or faculty study park. Test laptops, electronics, and check textbook editions.
            </p>
            <p>
              3. <strong className="text-foreground">Confirm with 6-Digit PIN:</strong> Once you are satisfied with the item, provide your unique 6-digit release PIN to the seller. If not satisfied, funds are returned to your wallet immediately.
            </p>
          </div>

          <div className="mt-4 flex justify-end">
            <Button
              size="sm"
              onClick={() => setEscrowModalOpen(false)}
              className="bg-sky-500 hover:bg-sky-600 text-white font-bold"
            >
              Got it, Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
