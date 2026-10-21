import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ShieldCheck,
  Wallet,
  Zap,
  TrendingUp,
  Users,
  ArrowRight,
  Store,
  BadgePercent,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  GraduationCap,
  Search,
  Building2,
  Pin,
  MapPin,
  BookOpen,
  Lock,
  CheckCircle2,
  Flame,
  X,
} from "lucide-react";
import { Logo } from "@/components/naflis/Logo";
import { MobileTabBar, PAGE_WIDTH, TopNav } from "@/components/naflis/shell/AppShell";
import {
  GroupBuyCard, ListingImage, SectionHeader, SectionLink, Tile, almostFull, onDarkButton,
} from "@/components/naflis/home/HomeBlocks";
import { NoticeDialog } from "@/components/naflis/campus/CampusBlocks";
import { fetchSellerProducts } from "@/services/sellerApi";
import { mapDbEvent } from "@/services/campusContent";
import { ESCROW_HELD_STATES } from "@/lib/naflis/orderMachine";
import {
  useNaflis,
  CAMPUSES,
  type CampusEvent,
  type Product,
} from "@/lib/naflis/store";
import { GHS, compact } from "@/lib/naflis/format";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { IS_LIVE } from "@/lib/appMode";

export const Route = createFileRoute("/")({
  component: Landing,
});

const primaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-soft transition hover:bg-primary-deep";
const secondaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-4 text-sm font-bold text-foreground transition hover:border-primary/40 hover:bg-accent";

function Metric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-border-soft bg-card p-4 shadow-soft">
      <Icon className="mb-2 h-5 w-5 text-link" strokeWidth={1.8} />
      <p className="text-xl font-extrabold tracking-tight text-foreground sm:text-2xl">{value}</p>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
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
  const studentListings = useNaflis((s) => s.studentListings);

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
      try {
        const data = await fetchSellerProducts();

        // Real products only carry what the database holds: no invented old price, demand or flash sale.
        if (data && data.length > 0) {
          setProducts(data);
          useNaflis.setState({ products: data });
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
          setPinnedEvents(data.map(mapDbEvent));
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
  // Live has no demand data, so "trending" becomes newest first.
  const trending = [...displayProducts]
    .sort((a, b) => (IS_LIVE ? (b.createdAt || 0) - (a.createdAt || 0) : (b.demand || 0) - (a.demand || 0)))
    .slice(0, 8);

  const totalSaved = products.reduce((a, p) => a + (p.originalPrice - p.price) * 15, 0);
  const activeShoppersCount = users.filter((u) => u.role === "buyer").length;
  const verifiedSellersCount = stores.filter((st) => st.verified).length;
  const liveDiscountsCount = products.filter((p) => p.originalPrice > p.price).length;
  const productsRequestedCount = requests.reduce((a, r) => a + r.interestedBuyers, 0);
  const inEscrowAmount = orders.reduce(
    (acc, o) =>
      ESCROW_HELD_STATES.includes(o.status)
        ? acc + (o.escrowHeld ?? o.total)
        : acc,
    0
  );

  const currentPinnedEvent = pinnedEvents[activeTickerIndex] || pinnedEvents[0];
  const groupBuys = almostFull(studentListings).slice(0, 3);
  const heroListing = flash[0] ?? trending[0];
  const heroGroupBuy = groupBuys[0];

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* 1. Pinned SRC Announcement Banner Ticker */}
      {currentPinnedEvent && (
        <aside aria-label="Pinned Official SRC Announcement" className="bg-escrow text-escrow-foreground">
          <div className={`${PAGE_WIDTH} flex min-h-11 items-center justify-between gap-3 py-1 text-xs`}>
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider">
                <Pin className="h-3 w-3" strokeWidth={1.8} />
                SRC Notice
              </span>
              <span className="hidden shrink-0 font-bold text-white/80 sm:inline">[{currentPinnedEvent.campus}]</span>
              <p className="truncate font-semibold">{currentPinnedEvent.title}</p>
              {currentPinnedEvent.venue && (
                <span className="hidden items-center gap-1 truncate text-[11px] text-white/75 md:inline-flex">
                  <MapPin className="h-3 w-3 shrink-0" strokeWidth={1.8} /> {currentPinnedEvent.venue}
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setSelectedEventModal(currentPinnedEvent)}
                className="inline-flex min-h-11 items-center px-2 text-xs font-bold text-white underline underline-offset-2"
              >
                Read Notice →
              </button>
              {pinnedEvents.length > 1 && (
                <div className="hidden items-center gap-0.5 border-l border-white/20 pl-1 sm:flex">
                  <button
                    type="button"
                    onClick={() => setActiveTickerIndex((prev) => (prev - 1 + pinnedEvents.length) % pinnedEvents.length)}
                    className="grid h-11 w-9 place-items-center rounded hover:bg-white/10"
                    aria-label="Previous Notice"
                  >
                    <ChevronLeft className="h-4 w-4" strokeWidth={1.8} />
                  </button>
                  <span className="text-[10px] text-white/75">{activeTickerIndex + 1}/{pinnedEvents.length}</span>
                  <button
                    type="button"
                    onClick={() => setActiveTickerIndex((prev) => (prev + 1) % pinnedEvents.length)}
                    className="grid h-11 w-9 place-items-center rounded hover:bg-white/10"
                    aria-label="Next Notice"
                  >
                    <ChevronRight className="h-4 w-4" strokeWidth={1.8} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </aside>
      )}

      <TopNav onEscrowClick={IS_LIVE ? undefined : () => setEscrowModalOpen(true)} />

      <main className="flex-1 pb-28 md:pb-0">
        {/* Hero */}
        <section className={`${PAGE_WIDTH} grid items-center gap-10 py-10 md:py-16 lg:grid-cols-[1.1fr_0.9fr]`}>
          <div className="space-y-5">
            <span className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3.5 py-1.5 text-xs font-bold text-accent-foreground">
              <GraduationCap className="h-4 w-4" strokeWidth={1.8} />
              Campus marketplace &amp; student hub
            </span>
            <h1 className="text-[40px] font-extrabold leading-[1.05] tracking-tight text-foreground md:text-[56px]">
              Buy smarter.
              <br />
              <span className="text-link">Study smarter.</span>
            </h1>
            {IS_LIVE ? (
              <p className="max-w-xl text-base leading-relaxed text-subtle-foreground">
                <span className="font-bold text-foreground">Smart Campus Commerce &amp; Student Hub</span>. Buy and sell with
                students on your campus, find lecture notes and past questions, and keep up with SRC notices and campus events.
              </p>
            ) : (
              <p className="max-w-xl text-base leading-relaxed text-subtle-foreground">
                <span className="font-bold text-foreground">Smart Campus Commerce &amp; Student Hub</span>, the verified campus &amp;
                student commerce operating system. Trade peer-to-peer thrift, join bulk student group buys, download verified
                lecture notes, and lock in zero-risk escrow transactions across Ghanaian universities.
              </p>
            )}

            {/* Search: campus + query + button */}
            <form
              onSubmit={handleSearchSubmit}
              role="search"
              className="flex flex-col gap-2 rounded-3xl border border-border-soft bg-card p-2 shadow-soft sm:flex-row sm:items-center"
            >
              <label className="relative flex shrink-0 items-center">
                <span className="sr-only">Campus</span>
                <MapPin className="pointer-events-none absolute left-3.5 h-4 w-4 text-link" strokeWidth={1.8} />
                <select
                  aria-label="Campus Selector"
                  value={selectedCampus}
                  onChange={(e) => setSelectedCampus(e.target.value)}
                  className="h-12 w-full appearance-none rounded-2xl bg-muted pl-10 pr-8 text-sm font-semibold text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-48"
                >
                  {CAMPUSES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-muted-foreground" strokeWidth={1.8} />
              </label>
              <label className="relative flex-1">
                <span className="sr-only">Search</span>
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" strokeWidth={1.8} />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search laptops, textbooks, past exams, dorm gear..."
                  className="h-12 w-full rounded-2xl bg-transparent pl-11 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                {searchQuery && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => {
                      setSearchQuery("");
                      setActiveSearchTerm("");
                    }}
                    className="absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" strokeWidth={1.8} />
                  </button>
                )}
              </label>
              <button type="submit" className={`${primaryBtn} h-12 shrink-0 px-6`}>
                <Search className="h-4 w-4" strokeWidth={1.8} /> Search Deals
              </button>
            </form>

            {/* Popular campuses */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-xs font-semibold text-muted-foreground">Popular Campuses:</span>
              {CAMPUSES.slice(0, 7).map((campus) => (
                <button
                  key={campus}
                  type="button"
                  onClick={() => handleCampusChipClick(campus)}
                  aria-pressed={selectedCampus === campus}
                  className={`min-h-11 rounded-full px-4 text-xs font-bold transition ${
                    selectedCampus === campus ? "bg-primary text-primary-foreground" : "bg-card text-subtle-foreground shadow-soft hover:bg-accent"
                  }`}
                >
                  {campus.replace("University", "").trim()}
                </button>
              ))}
            </div>

            {/* Calls to action */}
            <div className="flex flex-wrap gap-2 pt-1">
              <Link to="/student-os/deals" className={primaryBtn}>
                <BadgePercent className="h-4 w-4" strokeWidth={1.8} /> Browse Student Deals
              </Link>
              {!IS_LIVE && (
                <button type="button" onClick={() => setEscrowModalOpen(true)} className={secondaryBtn}>
                  <ShieldCheck className="h-4 w-4 text-link" strokeWidth={1.8} /> Safe Escrow
                </button>
              )}
              <Link to="/student-os" className={secondaryBtn}>
                <GraduationCap className="h-4 w-4 text-link" strokeWidth={1.8} /> Student OS
              </Link>
            </div>
          </div>

          {/* Illustration: real listings floating on a lavender circle */}
          <div className="relative mx-auto hidden aspect-square w-full max-w-[460px] lg:block" aria-hidden>
            <div className="absolute inset-6 rounded-full bg-tile-lavender" />
            {heroListing && (
              <div className="absolute left-0 top-10 w-56 overflow-hidden rounded-3xl border border-border-soft bg-card shadow-soft">
                <div className="h-32"><ListingImage src={heroListing.image} alt="" /></div>
                <div className="p-3">
                  <p className="line-clamp-1 text-sm font-bold">{heroListing.name}</p>
                  <p className="text-sm">
                    <span className="font-extrabold">{GHS(heroListing.price)}</span>
                    {heroListing.originalPrice > heroListing.price && (
                      <span className="ml-1.5 text-xs text-muted-foreground line-through">{GHS(heroListing.originalPrice)}</span>
                    )}
                  </p>
                </div>
              </div>
            )}
            {heroGroupBuy && (
              <div className="absolute bottom-16 right-0 w-60 rounded-3xl border border-border-soft bg-card p-4 shadow-soft">
                <p className="text-xs font-bold text-muted-foreground">Group buy</p>
                <p className="line-clamp-1 text-sm font-bold">{heroGroupBuy.title}</p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.min(100, Math.round(((heroGroupBuy.groupDealJoined || 0) / (heroGroupBuy.groupDealTarget || 10)) * 100))}%` }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-subtle-foreground">
                  {heroGroupBuy.groupDealJoined || 0} of {heroGroupBuy.groupDealTarget || 10} students joined
                </p>
              </div>
            )}
            {!IS_LIVE && (
              <div className="absolute bottom-2 left-10 flex items-center gap-3 rounded-2xl bg-escrow px-4 py-3 text-escrow-foreground shadow-soft">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-white/15"><Lock className="h-4 w-4" strokeWidth={1.8} /></span>
                <span className="text-sm font-bold">Funds held in escrow</span>
              </div>
            )}
          </div>
        </section>

        {/* Quick metrics (values as computed before this redesign) */}
        {/* Demo only: these figures are computed from the in-browser store. */}
        {!IS_LIVE && (
        <section className={`${PAGE_WIDTH} pb-4`}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Metric icon={Users} label="Active shoppers" value={compact(activeShoppersCount)} />
            <Metric icon={ShieldCheck} label="Verified sellers" value={compact(verifiedSellersCount)} />
            <Metric icon={BadgePercent} label="Live discounts" value={compact(liveDiscountsCount)} />
            <Metric icon={Wallet} label="Student savings" value={GHS(totalSaved)} />
            <Metric icon={TrendingUp} label="Requested items" value={compact(productsRequestedCount)} />
            <Metric icon={Lock} label="Protected in escrow" value={GHS(inEscrowAmount)} />
          </div>
        </section>
        )}

        {/* Active Search Results Indicator */}
        {activeSearchTerm && (
          <section className={`${PAGE_WIDTH} pt-4`}>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-primary-soft px-4 py-2 text-accent-foreground">
              <p className="text-sm font-semibold">
                Showing search results for <span className="font-extrabold">"{activeSearchTerm}"</span> on{" "}
                <span className="font-extrabold">{selectedCampus}</span> ({displayProducts.length} items found)
              </p>
              <button
                type="button"
                onClick={() => {
                  setActiveSearchTerm("");
                  setSearchQuery("");
                }}
                className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-xs font-bold hover:bg-white/40"
              >
                Clear filter <X className="h-3.5 w-3.5" strokeWidth={1.8} />
              </button>
            </div>
          </section>
        )}

        {/* What do you need today? (the five campus toolkits) */}
        <section className={`${PAGE_WIDTH} py-10`}>
          <SectionHeader
            title="What do you need today?"
            hint="Campus Toolkits & Modules — engineered specifically for university life, academic success, and trusted student trade. 5 integrated pillars."
          />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-5">
            <Tile tone="lavender" icon={Store} title="Student Marketplace" hint="Campus peer-to-peer thrift, textbooks, laptops, fridges & dorm furniture." to="/student-os/marketplace" cta="Open Market" />
            <Tile tone="peach" icon={BadgePercent} title="Student Deals & Group Buys" hint="Verified discounts, split group orders & volume bulk price drops." to="/student-os/deals" cta="Join Group Buys" />
            <Tile tone="rose" icon={Building2} title="Official SRC Notices" hint="Direct administrative bulletins, townhall assemblies & campus welfare updates." to="/campus-admin" cta="View SRC Notices" />
            <Tile tone="mint" icon={BookOpen} title="Lecture Notes & Slides" hint="Solved past examination booklets, formulas, summaries & faculty slides." to="/student-os/resources" cta="Study Resources" />
            {!IS_LIVE && <Tile tone="sky" icon={ShieldCheck} title="Escrow Protection Hub" hint="Zero-fraud escrow. Funds held safe until meetup inspection & 6-digit PIN release." onClick={() => setEscrowModalOpen(true)} cta="Escrow Security" />}
          </div>
        </section>

        {/* Almost full group buys */}
        {groupBuys.length > 0 && (
          <section className={`${PAGE_WIDTH} py-6`}>
            <SectionHeader
              title="Almost full"
              icon={Flame}
              hint="Student group buys with the fewest spots left."
              action={<SectionLink to="/student-os/deals">All group buys</SectionLink>}
            />
            <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-3 md:gap-4 md:overflow-visible md:px-0">
              {groupBuys.map((deal) => (
                <GroupBuyCard
                  key={deal.id}
                  deal={deal}
                  className="w-[78%] shrink-0 snap-start sm:w-[46%] md:w-auto"
                  action={<Link to="/student-os/deals" className={`${secondaryBtn} w-full`}>See group buy</Link>}
                />
              ))}
            </div>
          </section>
        )}

        {/* 3. Flash Deals & Verified Campus Discounts (only when there are some) */}
        {flash.length > 0 && (
        <section id="deals" className={`${PAGE_WIDTH} scroll-mt-24 py-8`}>
          <SectionHeader
            title="Flash Deals — Verified Campus Pricing"
            icon={Zap}
            hint="Strictly vetted prices backed by price history. No artificial pre-sale price markups."
            action={<SectionLink to="/student-os/deals">See all student drops</SectionLink>}
          />
          <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
            {flash.map((p) => (
              <ProductTile
                key={p.id}
                p={p}
                badges={
                  <>
                    <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">Student Price</span>
                    {p.verifiedDiscount && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-tile-mint px-2 py-0.5 text-[10px] font-bold text-verified">
                        <ShieldCheck className="h-3 w-3" strokeWidth={1.8} /> Verified Seller
                      </span>
                    )}
                  </>
                }
                meta={
                  IS_LIVE ? null : (
                    <span className="inline-flex items-center gap-1 font-bold text-verified">
                      <ShieldCheck className="h-3 w-3" strokeWidth={1.8} /> Escrow Backed
                    </span>
                  )
                }
                onBuy={() => {
                  addToCart(p.id, 1);
                  toast.success(`${p.name} added to Escrow checkout. Meetup code generated.`);
                }}
              />
            ))}
          </div>
        </section>
        )}

        {/* 4. Trending Campus Products (live: newest from approved sellers; hidden when there are none) */}
        {trending.length > 0 && (
        <section className={`${PAGE_WIDTH} py-8`}>
          <SectionHeader
            title={IS_LIVE ? "New in the mall" : `Trending on ${selectedCampus}`}
            icon={IS_LIVE ? Store : TrendingUp}
            hint={IS_LIVE ? "The latest products from approved sellers." : "Most requested items, electronics, and study gear among students this semester."}
            action={<SectionLink to="/buyer">Browse full mall</SectionLink>}
          />
          <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
            {trending.slice(0, 8).map((p) => (
              <ProductTile
                key={p.id}
                p={p}
                badges={
                  IS_LIVE ? null : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-card/95 px-2 py-0.5 text-[10px] font-bold text-peach-ink">
                      <Flame className="h-3 w-3" strokeWidth={1.8} /> High Campus Demand
                    </span>
                  )
                }
                meta={IS_LIVE ? null : <span className="rounded-full border border-border px-2 py-0.5 font-bold text-link">SRC Trusted</span>}
                onBuy={() => {
                  addToCart(p.id, 1);
                  toast.success(`Added ${p.name} to protected Escrow order.`);
                }}
              />
            ))}
          </div>
        </section>
        )}

        {/* 5. Safe Escrow Explainer Section (demo only: escrow isn't live yet) */}
        {!IS_LIVE && (
        <section id="escrow" className={`${PAGE_WIDTH} scroll-mt-24 py-10`}>
          <div className="rounded-[32px] bg-escrow p-6 text-escrow-foreground sm:p-10">
            <div className="max-w-2xl space-y-2">
              <span className="inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-bold">Campus Handover Security</span>
              <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">How escrow protects every cedi</h2>
              <p className="text-sm leading-relaxed text-white/85">
                Never worry about sending money to unknown numbers. Payment is only transferred after you inspect the item in person.
              </p>
            </div>
            <ol className="mt-8 grid gap-4 md:grid-cols-3">
              {[
                ["Lock Funds in Escrow", `When you click "Buy with Escrow", your payment is secured in NAFLIS Escrow. The seller is notified that payment is confirmed and ready.`],
                ["Meet at Safe Campus Spot", "Meet the student seller or vendor at designated campus points (hostels, libraries, or campus cafes). Test and inspect the product thoroughly."],
                ["Release with 6-Digit PIN", "Only when 100% satisfied, share your unique 6-digit confirmation code. If the item fails inspection, cancel instantly for full automatic refund."],
              ].map(([title, body], i) => (
                <li key={title} className="rounded-3xl bg-white/10 p-5">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-white text-base font-extrabold text-[#2F2A8F]">{i + 1}</span>
                  <h3 className="mt-3 text-base font-bold">{title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-white/85">{body}</p>
                </li>
              ))}
            </ol>
            <button type="button" onClick={() => setEscrowModalOpen(true)} className={`${onDarkButton} mt-6`}>
              How it works
            </button>
          </div>
        </section>
        )}

        {/* 6. Institutional / SRC Access Callout */}
        <section className={`${PAGE_WIDTH} pb-12`}>
          <div className="flex flex-col items-start justify-between gap-5 rounded-[32px] bg-tile-lavender p-6 sm:p-10 md:flex-row md:items-center">
            <div className="max-w-2xl space-y-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-xs font-bold text-accent-foreground">
                <Building2 className="h-3.5 w-3.5" strokeWidth={1.8} /> For Student Leaders &amp; Faculty Heads
              </span>
              <h2 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">Student leader or faculty head?</h2>
              <p className="text-sm font-bold text-foreground">Institutional &amp; SRC Governance Portal</p>
              <p className="text-sm leading-relaxed text-subtle-foreground">
                Publish official student welfare announcements, upload department lecture slides &amp; solved past questions, and
                review campus-wide student demand intelligence.
              </p>
            </div>
            <Link to="/campus-admin" className={`${primaryBtn} shrink-0`}>
              Institutional / SRC Access <ArrowRight className="h-4 w-4" strokeWidth={1.8} />
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border-soft bg-card/60 pb-28 md:pb-0">
        <div className={`${PAGE_WIDTH} space-y-6 py-8`}>
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            <div className="col-span-2 space-y-2 md:col-span-1">
              <Logo />
              <p className="text-xs leading-relaxed text-muted-foreground">
                Smart Deal Hub · Powered by NAFLIS SmartMall{IS_LIVE ? "." : " reference architecture and campus escrow."}
              </p>
            </div>
            <FooterColumn title="Campus Portals">
              <FooterLink to="/student-os">Student OS Hub</FooterLink>
              <FooterLink to="/student-os/marketplace">Campus Marketplace</FooterLink>
              <FooterLink to="/student-os/deals">Student Deals</FooterLink>
              <FooterLink to="/student-os/resources">Lecture Notes &amp; Slides</FooterLink>
            </FooterColumn>
            <FooterColumn title="Leadership">
              <FooterLink to="/campus-admin">Institutional / SRC Access</FooterLink>
              <FooterLink to="/login">Executive Sign In</FooterLink>
            </FooterColumn>
            {!IS_LIVE && (
            <FooterColumn title="Safety & Escrow">
              <li>
                <button type="button" onClick={() => setEscrowModalOpen(true)} className="inline-flex min-h-11 items-center hover:text-foreground">
                  Escrow Guarantee
                </button>
              </li>
              <FooterLink to="/buyer/wallet">Student Wallet</FooterLink>
              <li className="inline-flex min-h-11 items-center gap-1 font-semibold text-verified">
                <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.8} /> 100% Protected Handover
              </li>
            </FooterColumn>
            )}
          </div>
          <div className="flex flex-col items-start justify-between gap-2 border-t border-border-soft pt-4 text-xs text-muted-foreground sm:flex-row sm:items-center">
            <p>© {new Date().getFullYear()} NAFLIS SmartMall Platform. All rights reserved.</p>
            <div className="flex flex-wrap items-center gap-x-4">
              {!IS_LIVE && (
                <>
                  <button type="button" onClick={() => setEscrowModalOpen(true)} className="inline-flex min-h-11 items-center hover:text-foreground">
                    Escrow Terms
                  </button>
                  <Link to="/buyer/wallet" className="inline-flex min-h-11 items-center hover:text-foreground">Student Wallet</Link>
                </>
              )}
              <Link to="/campus-admin" className="inline-flex min-h-11 items-center font-bold text-link hover:underline">
                Institutional / SRC Access
              </Link>
            </div>
          </div>
        </div>
      </footer>

      {/* Selected Event Details Modal */}
      <NoticeDialog notice={selectedEventModal} onClose={() => setSelectedEventModal(null)} />

      {/* Escrow Modal */}
      <Dialog open={escrowModalOpen} onOpenChange={setEscrowModalOpen}>
        <DialogContent className="max-w-md rounded-[28px]">
          <DialogHeader>
            <div className="mb-2 grid h-12 w-12 place-items-center rounded-full bg-primary-soft text-link">
              <ShieldCheck className="h-6 w-6" strokeWidth={1.8} />
            </div>
            <DialogTitle className="text-lg font-extrabold">NAFLIS Campus Escrow Guarantee</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">How funds are held and protected on campus.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm leading-relaxed text-subtle-foreground">
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
            <button type="button" onClick={() => setEscrowModalOpen(false)} className={primaryBtn}>Got it, Close</button>
          </div>
        </DialogContent>
      </Dialog>
      <MobileTabBar />
    </div>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">{title}</h2>
      <ul className="text-sm text-muted-foreground">{children}</ul>
    </div>
  );
}

function FooterLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <li>
      <Link to={to} className="inline-flex min-h-11 items-center hover:text-foreground">{children}</Link>
    </li>
  );
}

/** Product card used by Flash Deals and Trending: photo, badges, price and the escrow buy action. */
function ProductTile({ p, badges, meta, onBuy }: { p: Product; badges: React.ReactNode; meta: React.ReactNode; onBuy: () => void }) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-3xl border border-border-soft bg-card shadow-soft">
      <div className="relative aspect-square w-full overflow-hidden bg-muted">
        <ListingImage src={p.image} alt={p.name} className="transition duration-300 group-hover:scale-105" />
        <div className="absolute left-2 top-2 flex flex-col items-start gap-1">{badges}</div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
          <span className="font-bold uppercase text-muted-foreground">{p.category}</span>
          {meta}
        </div>
        <h3 className="line-clamp-1 text-sm font-bold text-foreground">{p.name}</h3>
        <p className="line-clamp-2 text-xs text-subtle-foreground">{p.description}</p>
        <div className="mt-auto space-y-2 pt-1">
          <p>
            <span className="text-base font-extrabold text-foreground">{GHS(p.price)}</span>
            {p.originalPrice > p.price && (
              <span className="ml-1.5 text-xs text-muted-foreground line-through">{GHS(p.originalPrice)}</span>
            )}
          </p>
          {IS_LIVE ? (
            // Live: no escrow checkout yet, so the tile only opens the product page.
            <Link to="/buyer/product/$id" params={{ id: p.id }} className={`${primaryBtn} w-full text-xs`}>
              View item
            </Link>
          ) : (
            <button type="button" onClick={onBuy} className={`${primaryBtn} w-full text-xs`}>
              <Lock className="h-3.5 w-3.5" strokeWidth={1.8} /> Buy with Escrow
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
