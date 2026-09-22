import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import {
  Store,
  Search,
  SlidersHorizontal,
  MapPin,
  CheckCircle2,
  ShieldCheck,
  PlusCircle,
  Phone,
  MessageCircle,
  ArrowUpDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  useNaflis,
  CAMPUSES,
  STUDENT_CATEGORIES,
  type StudentItemCondition,
  type StudentListing,
} from "@/lib/naflis/store";
import { GHS } from "@/lib/naflis/format";
import { toast } from "sonner";

export const Route = createFileRoute("/student-os/marketplace")({
  component: StudentMarketplace,
});

function StudentMarketplace() {
  const selectedCampus = useNaflis((s) => s.selectedCampus);
  const setSelectedCampus = useNaflis((s) => s.setSelectedCampus);
  const studentListings = useNaflis((s) => s.studentListings);
  const setStudentModalOpen = useNaflis((s) => s.setStudentModalOpen);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedCondition, setSelectedCondition] = useState<string>("All");
  const [sortBy, setSortBy] = useState<"newest" | "price-asc" | "price-desc">("newest");
  const [contactModalItem, setContactModalItem] = useState<StudentListing | null>(null);

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

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Store className="h-6 w-6 text-sky-500" />
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Campus Marketplace</h1>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Buy & sell textbooks, laptops, hostel appliances, and thrift fashion with fellow students.
          </p>
        </div>

        <Button
          onClick={() => setStudentModalOpen(true)}
          className="bg-sky-500 hover:bg-sky-600 text-white font-medium text-xs sm:text-sm self-start sm:self-auto gap-1.5"
        >
          <PlusCircle className="h-4 w-4" /> List Item
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search textbooks, gadgets, calculators, mini fridges..."
            className="pl-9 text-xs sm:text-sm"
          />
        </div>

        {/* Filters Row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Campus Selector */}
          <select
            value={selectedCampus}
            onChange={(e) => setSelectedCampus(e.target.value)}
            className="h-9 rounded-lg border bg-card px-2.5 text-xs font-semibold text-foreground focus:border-sky-500 focus:outline-none"
          >
            {CAMPUSES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {/* Condition Filter */}
          <select
            value={selectedCondition}
            onChange={(e) => setSelectedCondition(e.target.value)}
            className="h-9 rounded-lg border bg-card px-2.5 text-xs font-semibold text-foreground focus:border-sky-500 focus:outline-none"
          >
            <option value="All">All Conditions</option>
            <option value="Brand New">Brand New</option>
            <option value="Like New">Like New</option>
            <option value="Used - Good">Used - Good</option>
            <option value="Used - Fair">Used - Fair</option>
          </select>

          {/* Sort By */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="h-9 rounded-lg border bg-card px-2.5 text-xs font-semibold text-foreground focus:border-sky-500 focus:outline-none"
          >
            <option value="newest">Newest First</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
          </select>
        </div>
      </div>

      {/* Category Pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {STUDENT_CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold transition ${
              selectedCategory === cat
                ? "bg-sky-500 text-white shadow-sm"
                : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Items Grid */}
      {marketplaceItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-12 text-center space-y-3">
          <Store className="h-12 w-12 mx-auto text-muted-foreground opacity-40" />
          <h3 className="text-base font-bold text-foreground">No campus items found</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            We couldn't find any items matching your selected filters for {selectedCampus}. Try adjusting
            your search or list the first item!
          </p>
          <Button
            size="sm"
            onClick={() => {
              setSelectedCategory("All");
              setSelectedCondition("All");
              setSearchQuery("");
            }}
            variant="outline"
            className="text-xs"
          >
            Reset Filters
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {marketplaceItems.map((item) => (
            <div
              key={item.id}
              className="group flex flex-col rounded-2xl border bg-card overflow-hidden hover:shadow-premium transition"
            >
              <div className="relative aspect-square w-full overflow-hidden bg-muted">
                <img
                  src={item.image}
                  alt={item.title}
                  className="h-full w-full object-cover group-hover:scale-105 transition duration-300"
                />
                <div className="absolute top-2 left-2 flex flex-col gap-1">
                  <Badge className="bg-sky-500 text-white text-[10px] shadow-sm">
                    {item.condition}
                  </Badge>
                </div>
                {item.isVerifiedStudent && (
                  <Badge
                    variant="secondary"
                    className="absolute top-2 right-2 bg-background/90 text-sky-500 text-[10px] backdrop-blur gap-1 shadow-sm"
                  >
                    <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Student
                  </Badge>
                )}
              </div>

              <div className="flex flex-col flex-1 p-4 gap-2">
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">
                    {item.campus}
                  </span>
                  <h3 className="text-sm font-bold leading-snug line-clamp-2 text-foreground">
                    {item.title}
                  </h3>
                </div>

                <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>

                {item.hostelLocation && (
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-1">
                    <MapPin className="h-3.5 w-3.5 text-sky-500 shrink-0" />
                    <span className="truncate">{item.hostelLocation}</span>
                  </div>
                )}

                <div className="mt-auto pt-3 border-t flex flex-col gap-2">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <span className="text-lg font-black text-foreground">{GHS(item.price)}</span>
                      {item.originalPrice && item.originalPrice > item.price && (
                        <span className="ml-1.5 text-xs text-muted-foreground line-through">
                          {GHS(item.originalPrice)}
                        </span>
                      )}
                    </div>
                    {item.sellerName && (
                      <span className="text-[11px] text-muted-foreground truncate max-w-[100px]">
                        By {item.sellerName.split(" ")[0]}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setContactModalItem(item)}
                      className="text-xs h-8"
                    >
                      <MessageCircle className="h-3.5 w-3.5 mr-1 text-sky-500" /> Contact
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        toast.success(
                          `Escrow hold secured for ${item.title}. Meetup verification code sent!`
                        );
                      }}
                      className="bg-sky-500 hover:bg-sky-600 text-white text-xs h-8 shadow-sm"
                    >
                      <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Escrow Buy
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Contact Seller Dialog */}
      {contactModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground">Contact Student Seller</h3>
              <button
                onClick={() => setContactModalItem(null)}
                className="text-muted-foreground hover:text-foreground text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1 border-b pb-3 text-xs">
              <p className="font-semibold text-foreground">{contactModalItem.title}</p>
              <p className="text-muted-foreground">
                Seller: {contactModalItem.sellerName} · {contactModalItem.campus}
              </p>
              <p className="text-muted-foreground">Location: {contactModalItem.hostelLocation}</p>
            </div>

            <div className="space-y-2">
              <a
                href={`https://wa.me/${contactModalItem.sellerPhone?.replace(/[^0-9]/g, "") || "233240000000"}?text=Hi%20${encodeURIComponent(contactModalItem.sellerName)}%2C%20I%20saw%20your%20listing%20on%20Smart%20Hub%20Student%20OS%3A%20${encodeURIComponent(contactModalItem.title)}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 py-2.5 text-xs font-semibold text-white transition shadow-sm"
              >
                <MessageCircle className="h-4 w-4" /> WhatsApp Seller
              </a>

              <a
                href={`tel:${contactModalItem.sellerPhone || "+233240000000"}`}
                className="flex items-center justify-center gap-2 w-full rounded-xl border bg-background hover:bg-muted py-2.5 text-xs font-semibold text-foreground transition"
              >
                <Phone className="h-4 w-4 text-sky-500" /> Call {contactModalItem.sellerPhone || "+233 24 000 0000"}
              </a>
            </div>

            <p className="text-[11px] text-muted-foreground text-center">
              🛡️ Always meet in well-lit public campus locations (Library, Quad, Hall porter lodge).
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
