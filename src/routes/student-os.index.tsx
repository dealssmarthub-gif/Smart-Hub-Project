import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import {
  GraduationCap,
  Sparkles,
  PlusCircle,
  Home,
  BookOpen,
  Zap,
  ShieldCheck,
  Building2,
  Users,
  CheckCircle2,
  ArrowRight,
  Search,
  Tag,
  Flame,
  FileText,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useNaflis, CAMPUSES, STUDENT_CATEGORIES, type StudentListing } from "@/lib/naflis/store";
import { GHS } from "@/lib/naflis/format";
import { toast } from "sonner";

export const Route = createFileRoute("/student-os/")({
  component: StudentOSDashboard,
});

function StudentOSDashboard() {
  const selectedCampus = useNaflis((s) => s.selectedCampus);
  const setSelectedCampus = useNaflis((s) => s.setSelectedCampus);
  const studentProfile = useNaflis((s) => s.studentProfile);
  const studentListings = useNaflis((s) => s.studentListings);
  const setStudentModalOpen = useNaflis((s) => s.setStudentModalOpen);
  const setVerifyModalOpen = useNaflis((s) => s.setVerifyModalOpen);
  const joinGroupDeal = useNaflis((s) => s.joinGroupDeal);
  const logDemandSearch = useNaflis((s) => s.logDemandSearch);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  // Filter listings based on campus, search query, and category
  const filteredListings = useMemo(() => {
    return studentListings.filter((item) => {
      const matchCampus =
        selectedCampus === "All Campuses" ||
        item.campus === "All Campuses" ||
        item.campus === selectedCampus;

      const matchCategory =
        selectedCategory === "All" || item.category === selectedCategory;

      const matchSearch =
        !searchQuery.trim() ||
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.courseCode && item.courseCode.toLowerCase().includes(searchQuery.toLowerCase()));

      return matchCampus && matchCategory && matchSearch;
    });
  }, [studentListings, selectedCampus, selectedCategory, searchQuery]);

  useEffect(() => {
    if (searchQuery.trim().length > 2) {
      const t = setTimeout(() => {
        logDemandSearch(searchQuery.trim(), selectedCampus, filteredListings.length);
      }, 500);
      return () => clearTimeout(t);
    }
  }, [searchQuery, selectedCampus, filteredListings.length, logDemandSearch]);

  const groupDeals = useMemo(
    () => studentListings.filter((l) => l.isGroupDeal).slice(0, 3),
    [studentListings]
  );

  const studyResources = useMemo(
    () => studentListings.filter((l) => l.resourceType).slice(0, 4),
    [studentListings]
  );

  return (
    <div className="space-y-8">
      {/* Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl gradient-hero text-white p-6 sm:p-10 shadow-premium">
        <div
          className="absolute -right-10 -top-10 h-64 w-64 rounded-full opacity-20 blur-3xl pointer-events-none"
          style={{ backgroundColor: "oklch(0.74 0.17 225)" }}
        />
        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-white/20 text-white hover:bg-white/30 backdrop-blur border-white/20 gap-1 text-xs">
              <GraduationCap className="h-3.5 w-3.5" />
              <span>Campus Ecosystem</span>
            </Badge>
            <Badge className="bg-sky-400/30 text-sky-200 border-sky-300/40 text-xs">
              {selectedCampus}
            </Badge>
          </div>

          <h1 className="text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
            Open Student OS & Campus Marketplace
          </h1>

          <p className="text-sm sm:text-base text-white/80 max-w-2xl leading-relaxed">
            Trade peer-to-peer with classmates, unlock verified student discounts, access past exam
            solutions, and protect every campus deal with smart escrow.
          </p>

          <div className="pt-2 flex flex-wrap items-center gap-3">
            <Button
              onClick={() => setStudentModalOpen(true)}
              className="bg-sky-500 hover:bg-sky-400 text-white font-semibold text-xs sm:text-sm shadow-md gap-1.5"
            >
              <PlusCircle className="h-4 w-4" /> Post a Campus Listing
            </Button>
            <Button
              asChild
              variant="outline"
              className="border-white/40 bg-white/10 text-white hover:bg-white/20 backdrop-blur font-semibold text-xs sm:text-sm"
            >
              <Link to="/student-os/deals">Browse Student Deals</Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Quick-Action Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Post Listing */}
        <button
          onClick={() => setStudentModalOpen(true)}
          className="group flex flex-col items-start p-4 sm:p-5 rounded-2xl border bg-card hover:border-sky-500 hover:shadow-premium text-left transition"
        >
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-sky-500/10 text-sky-500 group-hover:bg-sky-500 group-hover:text-white transition mb-3">
            <PlusCircle className="h-5 w-5" />
          </div>
          <h3 className="text-sm sm:text-base font-bold text-foreground">Post Campus Listing</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Sell textbooks, fridges, calculators, or thrift gear.
          </p>
        </button>

        {/* Card 2: Find Roommate / Hostel */}
        <Link
          to="/student-os/marketplace"
          className="group flex flex-col items-start p-4 sm:p-5 rounded-2xl border bg-card hover:border-sky-500 hover:shadow-premium text-left transition"
        >
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-sky-500/10 text-sky-500 group-hover:bg-sky-500 group-hover:text-white transition mb-3">
            <Home className="h-5 w-5" />
          </div>
          <h3 className="text-sm sm:text-base font-bold text-foreground">Find Roommate / Hostel</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Browse dorm appliances, room items & sublets.
          </p>
        </Link>

        {/* Card 3: Browse Course Notes */}
        <Link
          to="/student-os/resources"
          className="group flex flex-col items-start p-4 sm:p-5 rounded-2xl border bg-card hover:border-sky-500 hover:shadow-premium text-left transition"
        >
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-sky-500/10 text-sky-500 group-hover:bg-sky-500 group-hover:text-white transition mb-3">
            <BookOpen className="h-5 w-5" />
          </div>
          <h3 className="text-sm sm:text-base font-bold text-foreground">Browse Course Notes</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Download solved past questions & exam cheatsheets.
          </p>
        </Link>

        {/* Card 4: Student Flash Deals */}
        <Link
          to="/student-os/deals"
          className="group flex flex-col items-start p-4 sm:p-5 rounded-2xl border bg-card hover:border-sky-500 hover:shadow-premium text-left transition"
        >
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-sky-500/10 text-sky-500 group-hover:bg-sky-500 group-hover:text-white transition mb-3">
            <Zap className="h-5 w-5" />
          </div>
          <h3 className="text-sm sm:text-base font-bold text-foreground">Student Flash Deals</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Join group buys & unlock verified discounts.
          </p>
        </Link>
      </div>

      {/* Campus Escrow / Safety Banner */}
      <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-sky-500/15 text-sky-500">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-foreground flex items-center gap-1.5">
              Campus Handover & Escrow Protection
              <Badge variant="outline" className="text-[10px] text-sky-500 border-sky-500/30">
                100% Safe
              </Badge>
            </h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              Meet securely in halls or study parks. Payment is held in NAFLIS Escrow and only released
              when you inspect the item and give your 6-digit code.
            </p>
          </div>
        </div>
        <button
          onClick={() => setVerifyModalOpen(true)}
          className="shrink-0 text-xs font-semibold text-sky-500 hover:text-sky-600 underline"
        >
          {studentProfile.isVerified ? "Verified Profile Details →" : "Verify Student ID →"}
        </button>
      </div>

      {/* Group Deals Spotlight */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-amber-500" />
            <h2 className="text-lg sm:text-xl font-black tracking-tight">Active Group Buys</h2>
          </div>
          <Link
            to="/student-os/deals"
            className="text-xs font-semibold text-sky-500 hover:text-sky-600 flex items-center gap-1"
          >
            View all deals <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {groupDeals.map((deal) => {
            const joined = deal.groupDealJoined || 0;
            const target = deal.groupDealTarget || 10;
            const pct = Math.min(100, Math.round((joined / target) * 100));

            return (
              <div
                key={deal.id}
                className="flex flex-col rounded-2xl border bg-card overflow-hidden shadow-sm hover:shadow-premium transition"
              >
                <div className="relative h-36 w-full overflow-hidden bg-muted">
                  <img src={deal.image} alt={deal.title} className="h-full w-full object-cover" />
                  <Badge className="absolute top-2 left-2 bg-amber-500 text-white text-[10px]">
                    Group Buy Deal
                  </Badge>
                </div>
                <div className="flex flex-col flex-1 p-4 gap-3">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-sky-500">{deal.campus}</span>
                    <h4 className="text-sm font-bold line-clamp-1 text-foreground">{deal.title}</h4>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Progress</span>
                      <span className="font-semibold text-foreground">
                        {joined}/{target} students joined
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-sky-500 transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-auto flex items-center justify-between pt-2 border-t">
                    <div>
                      <span className="text-base font-black text-foreground">{GHS(deal.price)}</span>
                      {deal.originalPrice && (
                        <span className="ml-1.5 text-xs text-muted-foreground line-through">
                          {GHS(deal.originalPrice)}
                        </span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      onClick={() => {
                        const res = joinGroupDeal(deal.id);
                        toast.success(res.message);
                      }}
                      className="bg-sky-500 hover:bg-sky-600 text-white text-xs h-8"
                    >
                      Join Deal
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Campus Marketplace Feed Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg sm:text-xl font-black tracking-tight flex items-center gap-2">
              <Tag className="h-5 w-5 text-sky-500" /> Campus Marketplace Feed
            </h2>
            <p className="text-xs text-muted-foreground">
              Peer-to-peer listings on {selectedCampus}
            </p>
          </div>

          {/* Search bar */}
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search items, textbooks, appliances..."
              className="pl-8 text-xs h-9"
            />
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
                  ? "bg-sky-500 text-white"
                  : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Product Grid */}
        {filteredListings.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-10 text-center space-y-3">
            <GraduationCap className="h-10 w-10 mx-auto text-muted-foreground opacity-50" />
            <h3 className="text-sm font-bold text-foreground">No listings found</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              No items match this filter for {selectedCampus}. Be the first to list a student item!
            </p>
            <Button
              size="sm"
              onClick={() => setStudentModalOpen(true)}
              className="bg-sky-500 hover:bg-sky-600 text-white text-xs"
            >
              List an Item Now
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {filteredListings.map((item) => (
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
                    <Badge className="bg-sky-500/90 text-white text-[10px] backdrop-blur">
                      {item.condition}
                    </Badge>
                  </div>
                  {item.isVerifiedStudent && (
                    <Badge
                      variant="secondary"
                      className="absolute top-2 right-2 bg-background/90 text-sky-500 text-[10px] backdrop-blur gap-1"
                    >
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Student Verified
                    </Badge>
                  )}
                </div>

                <div className="flex flex-col flex-1 p-3.5 gap-2">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">
                      {item.campus}
                    </span>
                    <h4 className="text-sm font-bold leading-snug line-clamp-2 text-foreground">
                      {item.title}
                    </h4>
                  </div>

                  {item.hostelLocation && (
                    <p className="text-[11px] text-muted-foreground line-clamp-1">
                      📍 {item.hostelLocation}
                    </p>
                  )}

                  <div className="mt-auto pt-2 border-t flex items-center justify-between">
                    <div>
                      <span className="text-base font-black text-foreground">{GHS(item.price)}</span>
                      {item.originalPrice && item.originalPrice > item.price && (
                        <span className="ml-1 text-[11px] text-muted-foreground line-through">
                          {GHS(item.originalPrice)}
                        </span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      onClick={() => {
                        toast.success(`Escrow order created for ${item.title}. Meetup code generated.`);
                      }}
                      className="bg-sky-500 hover:bg-sky-600 text-white text-xs h-7 px-2.5"
                    >
                      Escrow Buy
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Study Materials & Toolkits Preview */}
      <div className="rounded-2xl border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-sky-500" />
            <div>
              <h3 className="text-base font-bold text-foreground">Top Study Materials & Past Exams</h3>
              <p className="text-xs text-muted-foreground">
                Verified lecture summaries, formulas, and examination archives
              </p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm" className="text-xs">
            <Link to="/student-os/resources">Open Resource Hub →</Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {studyResources.map((res) => (
            <div
              key={res.id}
              className="flex items-start gap-3 rounded-xl border p-3.5 bg-background hover:border-sky-500 transition"
            >
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-sky-500/10 text-sky-500 font-mono font-bold text-xs">
                PDF
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px] text-sky-500 border-sky-500/30">
                    {res.resourceType}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">{res.campus}</span>
                </div>
                <h5 className="text-xs font-bold text-foreground line-clamp-1 mt-1">{res.title}</h5>
                <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                  {res.description}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  toast.success(`Downloaded: ${res.title}`);
                }}
                className="text-xs text-sky-500 hover:text-sky-600 hover:bg-sky-500/10 shrink-0"
              >
                Download
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
