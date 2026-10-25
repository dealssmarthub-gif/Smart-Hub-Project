import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useReturnFocus } from "@/hooks/useReturnFocus";
import {
  Store,
  Search,
  SlidersHorizontal,
  MapPin,
  CheckCircle2,
  ShieldCheck,
  Phone,
  MessageCircle,
  ChevronDown,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ListingImage } from "@/components/naflis/home/HomeBlocks";
import { ShopHeader } from "@/components/naflis/shop/ShopHeader";
import {
  useNaflis,
  CAMPUSES,
  type StudentListing,
} from "@/lib/naflis/store";
import { useCategories } from "@/services/categories";
import { GHS, telHref, whatsappNumber } from "@/lib/naflis/format";
import { toast } from "sonner";
import { IS_LIVE } from "@/lib/appMode";
import { ContactSeller } from "@/components/naflis/ContactSeller";

export const Route = createFileRoute("/student-os/marketplace")({
  component: StudentMarketplace,
});

type SortBy = "newest" | "price-asc" | "price-desc";

const CONDITIONS = ["Brand New", "Like New", "Used - Good", "Used - Fair"] as const;
const SORTS: { value: SortBy; label: string }[] = [
  { value: "newest", label: "Newest First" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
];

const selectClass =
  "h-11 w-full appearance-none rounded-xl border border-border bg-card pl-3 pr-9 text-sm font-semibold text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring md:w-auto";
const primaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-primary px-2 text-xs font-bold text-primary-foreground shadow-soft transition hover:bg-primary-deep";
const secondaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-border bg-card px-2 text-xs font-bold text-foreground transition hover:border-primary/40 hover:bg-accent";

function StudentMarketplace() {
  const selectedCampus = useNaflis((s) => s.selectedCampus);
  const requestCampusSwitch = useNaflis((s) => s.requestCampusSwitch);
  const studentListings = useNaflis((s) => s.studentListings);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const { names: studentCategories } = useCategories("student");
  const [selectedCondition, setSelectedCondition] = useState<string>("All");
  const [sortBy, setSortBy] = useState<SortBy>("newest");
  const [contactModalItem, setContactModalItem] = useState<StudentListing | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersFocus = useReturnFocus(filtersOpen);
  const contactFocus = useReturnFocus(!!contactModalItem);


  // Filter out pure study resources and apply filters
  const marketplaceItems = useMemo(() => {
    return studentListings
      .filter((item) => !item.resourceType) // non-study guide items
      .filter((item) => {
        const matchCampus =
          selectedCampus === "All Campuses" ||
          item.campus === "All Campuses" ||
          item.campus === selectedCampus;

        const matchCategory =
          selectedCategory === "All" || item.category === selectedCategory;

        const matchCondition =
          selectedCondition === "All" || item.condition === selectedCondition;

        const matchSearch =
          !searchQuery.trim() ||
          item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (item.hostelLocation &&
            item.hostelLocation.toLowerCase().includes(searchQuery.toLowerCase()));

        return matchCampus && matchCategory && matchCondition && matchSearch;
      })
      .sort((a, b) => {
        if (sortBy === "price-asc") return a.price - b.price;
        if (sortBy === "price-desc") return b.price - a.price;
        return b.createdAt - a.createdAt;
      });
  }, [studentListings, selectedCampus, selectedCategory, selectedCondition, searchQuery, sortBy]);

  // How many sheet filters differ from their defaults (badge on the phone filter button).
  const activeFilters = (selectedCampus !== "All Campuses" ? 1 : 0) + (selectedCondition !== "All" ? 1 : 0) + (sortBy !== "newest" ? 1 : 0);

  const filterControls = (
    <>
      {/* Campus Selector */}
      <label className="relative block md:inline-block">
        <span className="mb-1 block text-xs font-bold text-subtle-foreground md:sr-only">Campus</span>
        <select value={selectedCampus} onChange={(e) => requestCampusSwitch(e.target.value, "manual")} className={selectClass}>
          {CAMPUSES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute bottom-3.5 right-3 h-4 w-4 text-muted-foreground" strokeWidth={1.8} aria-hidden />
      </label>

      {/* Condition Filter */}
      <label className="relative block md:inline-block">
        <span className="mb-1 block text-xs font-bold text-subtle-foreground md:sr-only">Condition</span>
        <select value={selectedCondition} onChange={(e) => setSelectedCondition(e.target.value)} className={selectClass}>
          <option value="All">All Conditions</option>
          {CONDITIONS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute bottom-3.5 right-3 h-4 w-4 text-muted-foreground" strokeWidth={1.8} aria-hidden />
      </label>

      {/* Sort By */}
      <label className="relative block md:inline-block">
        <span className="mb-1 block text-xs font-bold text-subtle-foreground md:sr-only">Sort by</span>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)} className={selectClass}>
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute bottom-3.5 right-3 h-4 w-4 text-muted-foreground" strokeWidth={1.8} aria-hidden />
      </label>
    </>
  );

  return (
    <div className="space-y-5">
      <ShopHeader
        active="marketplace"
        title="Campus Marketplace"
        subtitle="Buy & sell textbooks, laptops, hostel appliances, and thrift fashion with fellow students."
      />

      {/* Search + filters */}
      <div className="flex items-center gap-2">
        <label className="relative flex-1">
          <span className="sr-only">Search the campus marketplace</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" strokeWidth={1.8} />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search textbooks, gadgets, calculators, mini fridges..."
            className="h-12 w-full rounded-2xl border border-border-soft bg-card pl-12 pr-4 text-sm text-foreground shadow-soft placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <button
          type="button"
          onClick={() => setFiltersOpen(true)}
          aria-label={activeFilters ? `Filters, ${activeFilters} active` : "Filters"}
          className="relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-border-soft bg-card text-foreground shadow-soft md:hidden"
        >
          <SlidersHorizontal className="h-5 w-5" strokeWidth={1.8} />
          {activeFilters > 0 && (
            <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">{activeFilters}</span>
          )}
        </button>
        <div className="hidden items-center gap-2 md:flex">{filterControls}</div>
      </div>

      {/* Category Pills */}
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 md:mx-0 md:px-0">
        {["All", ...studentCategories].map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setSelectedCategory(cat)}
            aria-pressed={selectedCategory === cat}
            className={`min-h-11 whitespace-nowrap rounded-full px-4 text-xs font-bold transition ${
              selectedCategory === cat
                ? "bg-primary text-primary-foreground"
                : "bg-card text-subtle-foreground shadow-soft hover:bg-accent hover:text-accent-foreground"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Items Grid */}
      {marketplaceItems.length === 0 ? (
        <div className="space-y-3 rounded-3xl border border-dashed bg-card p-10 text-center">
          <Store className="mx-auto h-12 w-12 text-muted-foreground" strokeWidth={1.8} />
          <h2 className="text-base font-bold text-foreground">No campus items found</h2>
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            We couldn't find any items matching your selected filters for {selectedCampus}. Try adjusting
            your search or list the first item!
          </p>
          <button
            type="button"
            onClick={() => {
              setSelectedCategory("All");
              setSelectedCondition("All");
              setSearchQuery("");
            }}
            className={secondaryBtn}
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4">
          {marketplaceItems.map((item) => (
            <article
              key={item.id}
              className="group flex flex-col overflow-hidden rounded-3xl border border-border-soft bg-card shadow-soft"
            >
              <div className="relative aspect-square w-full overflow-hidden bg-muted">
                <ListingImage src={item.image} alt={item.title} className="transition duration-300 group-hover:scale-105" />
                {item.condition && (
                  <span className="absolute left-2 top-2 rounded-full bg-card/95 px-2 py-0.5 text-[10px] font-bold text-foreground">
                    {item.condition}
                  </span>
                )}
                {item.isVerifiedStudent && (
                  <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-tile-mint px-2 py-0.5 text-[10px] font-bold text-verified">
                    <CheckCircle2 className="h-3 w-3" strokeWidth={1.8} /> Verified
                  </span>
                )}
              </div>

              <div className="flex flex-1 flex-col gap-1.5 p-3 sm:p-4">
                <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{item.campus}</span>
                <h2 className="line-clamp-2 text-sm font-bold leading-snug text-foreground">{item.title}</h2>
                <p className="line-clamp-2 text-xs text-subtle-foreground">{item.description}</p>

                {item.hostelLocation && (
                  <p className="flex items-center gap-1 text-[11px] text-subtle-foreground">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-link" strokeWidth={1.8} />
                    <span className="truncate">{item.hostelLocation}</span>
                  </p>
                )}

                <div className="mt-auto space-y-2 pt-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <p>
                      <span className="text-base font-extrabold text-foreground sm:text-lg">{GHS(item.price)}</span>
                      {item.originalPrice && item.originalPrice > item.price && (
                        <span className="ml-1.5 text-xs text-muted-foreground line-through">{GHS(item.originalPrice)}</span>
                      )}
                    </p>
                    {item.sellerName && (
                      <span className="max-w-[100px] truncate text-[11px] text-muted-foreground">By {item.sellerName.split(" ")[0]}</span>
                    )}
                  </div>

                  <div className={`grid grid-cols-1 gap-2 ${!IS_LIVE && telHref(item.sellerPhone) ? "sm:grid-cols-2" : ""}`}>
                    {/* Live: always (the number is fetched on request, signed in). Demo: when the seller gave one. */}
                    {(IS_LIVE ? Boolean(item.vendorId) : Boolean(telHref(item.sellerPhone))) && (
                      <button type="button" onClick={() => setContactModalItem(item)} className={secondaryBtn}>
                        <MessageCircle className="h-4 w-4 text-link" strokeWidth={1.8} /> Contact seller
                      </button>
                    )}
                    {/* Demo only: escrow isn't wired to payments yet. */}
                    {!IS_LIVE && (
                      <button
                        type="button"
                        onClick={() => {
                          toast.success(`Escrow hold secured for ${item.title}. Meetup verification code sent!`);
                        }}
                        className={primaryBtn}
                      >
                        <ShieldCheck className="h-4 w-4" strokeWidth={1.8} /> Escrow Buy
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Phone filter sheet: campus, condition and sort (category chips stay on the page). */}
      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="bottom" className="rounded-t-[28px] md:hidden" onCloseAutoFocus={filtersFocus}>
          <SheetHeader className="text-left">
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription>Campus, condition and sort order for the marketplace.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-4 px-4">{filterControls}</div>
          <div className="mt-6 grid grid-cols-2 gap-2 px-4 pb-6">
            <button
              type="button"
              onClick={() => {
                setSelectedCondition("All");
                setSortBy("newest");
              }}
              className={secondaryBtn}
            >
              Reset
            </button>
            <button type="button" onClick={() => setFiltersOpen(false)} className={primaryBtn}>
              Show {marketplaceItems.length} item{marketplaceItems.length === 1 ? "" : "s"}
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Contact Seller Dialog */}
      <Dialog open={!!contactModalItem} onOpenChange={(open) => !open && setContactModalItem(null)}>
        <DialogContent className="max-w-sm rounded-[28px]" onCloseAutoFocus={contactFocus}>
          {contactModalItem && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base font-extrabold">Contact Student Seller</DialogTitle>
                <DialogDescription className="sr-only">Seller contact details for {contactModalItem.title}</DialogDescription>
              </DialogHeader>
              <div className="space-y-1 border-b border-border-soft pb-3 text-sm">
                <p className="font-semibold text-foreground">{contactModalItem.title}</p>
                <p className="text-subtle-foreground">Seller: {contactModalItem.sellerName} · {contactModalItem.campus}</p>
                {contactModalItem.hostelLocation && (
                  <p className="text-subtle-foreground">Location: {contactModalItem.hostelLocation}</p>
                )}
              </div>
              {IS_LIVE && contactModalItem.vendorId ? (
                <ContactSeller
                  vendorId={contactModalItem.vendorId}
                  sellerName={contactModalItem.sellerName}
                  itemTitle={contactModalItem.title}
                  autoReveal
                />
              ) : (
                <div className="space-y-2">
                  {whatsappNumber(contactModalItem.sellerPhone) && (
                    <a
                      href={`https://wa.me/${whatsappNumber(contactModalItem.sellerPhone)}?text=Hi%20${encodeURIComponent(contactModalItem.sellerName)}%2C%20I%20saw%20your%20listing%20on%20Smart%20Hub%20Student%20OS%3A%20${encodeURIComponent(contactModalItem.title)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-tile-mint-icon text-sm font-bold text-white transition hover:opacity-90"
                    >
                      <MessageCircle className="h-4 w-4" strokeWidth={1.8} /> WhatsApp Seller
                    </a>
                  )}
                  {telHref(contactModalItem.sellerPhone) && (
                    <a
                      href={telHref(contactModalItem.sellerPhone)!}
                      className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-bold text-foreground transition hover:bg-accent"
                    >
                      <Phone className="h-4 w-4 text-link" strokeWidth={1.8} /> Call {contactModalItem.sellerPhone}
                    </a>
                  )}
                </div>
              )}
              <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
                Always meet in well-lit public campus locations (Library, Quad, Hall porter lodge).
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

