import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo, useEffect, useRef } from "react";
import {
  GraduationCap,
  PlusCircle,
  BookOpen,
  CheckCircle2,
  Search,
  Tag,
  FileText,
  MapPin,
  Store,
  Users,
  Ticket,
  Flame,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/naflis/ThemeToggle";
import { CampusPicker } from "@/components/naflis/shell/CampusPicker";
import {
  EscrowBanner, GroupBuyCard, ListingImage, NotificationBell, SectionHeader, SectionLink, SrcNoticeRow, Tile, almostFull, onDarkButton,
} from "@/components/naflis/home/HomeBlocks";
import { useNaflis, type CampusEvent } from "@/lib/naflis/store";
import { NoticeDialog } from "@/components/naflis/campus/CampusBlocks";
import { useCategories } from "@/services/categories";
import { GHS } from "@/lib/naflis/format";
import { toast } from "sonner";
import { IS_LIVE } from "@/lib/appMode";
import { countResourceDownload } from "@/services/campusContent";

export const Route = createFileRoute("/student-os/")({
  component: StudentOSDashboard,
});

const primaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-soft transition hover:bg-primary-deep";

function StudentOSDashboard() {
  const selectedCampus = useNaflis((s) => s.selectedCampus);
  const studentProfile = useNaflis((s) => s.studentProfile);
  const studentListings = useNaflis((s) => s.studentListings);
  const campusEvents = useNaflis((s) => s.campusEvents);
  const user = useNaflis((s) => s.users.find((u) => u.id === s.currentUserId));
  const setStudentModalOpen = useNaflis((s) => s.setStudentModalOpen);
  const setVerifyModalOpen = useNaflis((s) => s.setVerifyModalOpen);
  const joinGroupDeal = useNaflis((s) => s.joinGroupDeal);
  const logDemandSearch = useNaflis((s) => s.logDemandSearch);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const { names: studentCategories } = useCategories("student");
  const feedRef = useRef<HTMLElement>(null);

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

  // Same three group deals as before, now shown fewest spots left first.
  const groupDeals = useMemo(
    () => almostFull(studentListings.filter((l) => l.isGroupDeal).slice(0, 3)),
    [studentListings]
  );

  // Live: published campus resources (real files); demo: seeded study listings.
  const campusResources = useNaflis((s) => s.campusResources);
  const studyResources = useMemo(
    () =>
      IS_LIVE
        ? campusResources.slice(0, 4).map((r) => ({ id: r.id, title: r.title, description: r.description, resourceType: r.resourceType, campus: r.campus, fileUrl: r.fileUrl }))
        : studentListings.filter((l) => l.resourceType).slice(0, 4),
    [studentListings, campusResources]
  );

  // Pinned SRC notice for the active campus (or any campus when browsing all).
  const notice = useMemo(
    () =>
      campusEvents.find((e) => e.pinned && (selectedCampus === "All Campuses" || e.campus === selectedCampus || e.campus === "All Campuses")) ??
      campusEvents.find((e) => e.pinned),
    [campusEvents, selectedCampus]
  );

  const [openNotice, setOpenNotice] = useState<CampusEvent | null>(null);
  const firstName = user?.name.split(" ")[0];

  return (
    <div className="space-y-8">
      {/* Greeting header: full-bleed on phones, a rounded block from md up. */}
      <section className="relative -mx-4 overflow-hidden rounded-b-[32px] bg-primary px-4 pb-12 pt-4 text-primary-foreground sm:-mx-6 sm:px-6 md:mx-0 md:rounded-[32px] md:px-10 md:pb-14 md:pt-8">
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10"
          aria-hidden
        />
        {/* Phones only: from md up the top navigation carries the campus picker. */}
        <div className="relative flex items-center justify-between gap-2 md:hidden">
          <CampusPicker tone="onPrimary" compact />
          <div className="flex items-center [&_button]:text-white [&_button:hover]:bg-white/15">
            <NotificationBell tone="onPrimary" />
            <ThemeToggle />
          </div>
        </div>
        <div className="relative mt-5 max-w-3xl space-y-2 md:mt-0">
          <h1 className="text-[26px] font-extrabold leading-tight tracking-tight md:text-4xl">
            Hi{firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="text-base font-semibold text-white/90 md:text-lg">What do you need today?</p>
          <p className="max-w-2xl pt-1 text-sm leading-relaxed text-white/80">
            <span className="font-bold text-white">Open Student OS &amp; Campus Marketplace.</span>{" "}
            {IS_LIVE
              ? "Trade peer-to-peer with classmates, find lecture notes and past questions, and keep up with SRC notices and events."
              : "Trade peer-to-peer with classmates, unlock verified student discounts, access past exam solutions, and protect every campus deal with smart escrow."}
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs font-bold">
              <GraduationCap className="h-3.5 w-3.5" strokeWidth={1.8} /> Campus Ecosystem
            </span>
            <span className="inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-bold">{selectedCampus}</span>
          </div>
          <div className="flex flex-wrap gap-2 pt-3">
            <button type="button" onClick={() => setStudentModalOpen(true)} className={onDarkButton}>
              <PlusCircle className="h-4 w-4" strokeWidth={1.8} /> Post a Campus Listing
            </button>
            <Link
              to="/student-os/deals"
              className="inline-flex min-h-11 items-center rounded-xl border border-white/40 px-4 text-sm font-bold text-white transition hover:bg-white/10"
            >
              Browse Student Deals
            </Link>
          </div>
        </div>
      </section>

      {/* Search overlaps the header; it filters the marketplace feed below. */}
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          feedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
        className="relative z-10 -mt-[3.75rem] md:mx-10"
      >
        <label className="relative block">
          <span className="sr-only">Search campus listings</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" strokeWidth={1.8} />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search items, textbooks, appliances..."
            className="h-14 w-full rounded-2xl border border-border-soft bg-card pl-12 pr-4 text-sm text-foreground shadow-soft placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
      </form>

      {/* Quick access */}
      <section>
        <SectionHeader title="Quick access" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          <Tile tone="lavender" icon={Store} title="Marketplace" hint="Find roommate / hostel items: dorm appliances, room items & sublets." to="/student-os/marketplace" />
          <Tile tone="peach" icon={Users} title="Group buys" hint="Student flash deals: join group buys & unlock verified discounts." to="/student-os/deals" />
          <Tile tone="mint" icon={BookOpen} title="Past questions" hint="Browse course notes: solved past questions & exam cheatsheets." to="/student-os/resources" />
          <Tile tone="sky" icon={Ticket} title="Events" hint="Campus events & tickets." to="/student-os/events" />
        </div>
        <button
          type="button"
          onClick={() => setStudentModalOpen(true)}
          className="mt-3 flex min-h-14 w-full items-center gap-3 rounded-3xl border border-dashed border-border bg-card px-4 text-left transition hover:border-primary/50"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-tile-butter-icon text-white">
            <PlusCircle className="h-5 w-5" strokeWidth={1.8} />
          </span>
          <span>
            <span className="block text-sm font-bold">Post Campus Listing</span>
            <span className="block text-xs text-subtle-foreground">Sell textbooks, fridges, calculators, or thrift gear.</span>
          </span>
        </button>
      </section>

      {/* Escrow / safety (demo only: escrow isn't live yet) */}
      {!IS_LIVE && (
      <EscrowBanner
        title="Pay only after you've checked the item"
        body={
          <>
            <span className="mb-1 flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wide text-white/75">
              Campus Handover &amp; Escrow Protection
              <span className="rounded-full bg-white/15 px-2 py-0.5 normal-case tracking-normal text-white">100% Safe</span>
            </span>
            Meet securely in halls or study parks. Payment is held in NAFLIS Escrow and only released
            when you inspect the item and give your 6-digit code.
          </>
        }
        action={
          <div className="flex flex-wrap gap-2">
            <Link to="/" hash="escrow" className={onDarkButton}>How it works</Link>
            <button
              type="button"
              onClick={() => setVerifyModalOpen(true)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-white/40 px-4 text-sm font-bold text-white transition hover:bg-white/10"
            >
              {studentProfile.isVerified ? <CheckCircle2 className="h-4 w-4" strokeWidth={1.8} /> : <ShieldCheck className="h-4 w-4" strokeWidth={1.8} />}
              {studentProfile.isVerified ? "Verified Profile Details" : "Verify Student ID"}
            </button>
          </div>
        }
      />
      )}

      {/* Group buys, fewest spots left first (only when there are some) */}
      {groupDeals.length > 0 && (
      <section>
        <SectionHeader
          title="Almost full"
          icon={Flame}
          hint="Active group buys, fewest spots left first."
          action={<SectionLink to="/student-os/deals">View all deals</SectionLink>}
        />
        <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-3 md:gap-4 md:overflow-visible md:px-0">
          {groupDeals.map((deal) => (
            <GroupBuyCard
              key={deal.id}
              deal={deal}
              className="w-[78%] shrink-0 snap-start sm:w-[46%] md:w-auto"
              action={
                <button
                  type="button"
                  onClick={() => {
                    const res = joinGroupDeal(deal.id);
                    toast.success(res.message);
                  }}
                  className={`${primaryBtn} w-full`}
                >
                  Join Deal
                </button>
              }
            />
          ))}
        </div>
      </section>
      )}

      {notice && <SrcNoticeRow title={notice.title} campus={notice.campus} onOpen={() => setOpenNotice(notice)} />}
      <NoticeDialog notice={openNotice} onClose={() => setOpenNotice(null)} />

      {/* Campus Marketplace Feed Section */}
      <section ref={feedRef} className="scroll-mt-24">
        <SectionHeader title="Campus Marketplace Feed" icon={Tag} hint={`Peer-to-peer listings on ${selectedCampus}`} />

        {/* Category Pills */}
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
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

        {/* Product Grid */}
        {filteredListings.length === 0 ? (
          <div className="mt-4 space-y-3 rounded-3xl border border-dashed bg-card p-10 text-center">
            <GraduationCap className="mx-auto h-10 w-10 text-muted-foreground" strokeWidth={1.8} />
            <h3 className="text-sm font-bold text-foreground">No listings found</h3>
            <p className="mx-auto max-w-sm text-xs text-muted-foreground">
              No items match this filter for {selectedCampus}. Be the first to list a student item!
            </p>
            <button type="button" onClick={() => setStudentModalOpen(true)} className={primaryBtn}>
              List an Item Now
            </button>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4">
            {filteredListings.map((item) => (
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
                      <CheckCircle2 className="h-3 w-3" strokeWidth={1.8} /> <span className="hidden sm:inline">Student </span>Verified
                    </span>
                  )}
                </div>

                <div className="flex flex-1 flex-col gap-2 p-3 sm:p-4">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{item.campus}</span>
                    <h3 className="line-clamp-2 text-sm font-bold leading-snug text-foreground">{item.title}</h3>
                  </div>

                  {item.hostelLocation && (
                    <p className="flex items-center gap-1 text-[11px] text-subtle-foreground">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-link" strokeWidth={1.8} />
                      <span className="line-clamp-1">{item.hostelLocation}</span>
                    </p>
                  )}

                  <div className="mt-auto space-y-2 pt-1">
                    <p>
                      <span className="text-base font-extrabold text-foreground">{GHS(item.price)}</span>
                      {item.originalPrice && item.originalPrice > item.price && (
                        <span className="ml-1.5 text-[11px] text-muted-foreground line-through">{GHS(item.originalPrice)}</span>
                      )}
                    </p>
                    {/* Demo only: escrow isn't wired to payments yet. */}
                    {!IS_LIVE && (
                      <button
                        type="button"
                        onClick={() => {
                          toast.success(`Escrow order created for ${item.title}. Meetup code generated.`);
                        }}
                        className={`${primaryBtn} w-full text-xs`}
                      >
                        <ShieldCheck className="h-4 w-4" strokeWidth={1.8} /> Escrow Buy
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Study Materials & Toolkits Preview (only when there are some) */}
      {studyResources.length > 0 && (
      <section className="rounded-[28px] border border-border-soft bg-card p-5 shadow-soft sm:p-6">
        <SectionHeader
          title="Top Study Materials & Past Exams"
          icon={FileText}
          hint={IS_LIVE ? "Notes and past questions published by your SRC and departments" : "Verified lecture summaries, formulas, and examination archives"}
          action={<SectionLink to="/student-os/resources">Open Resource Hub</SectionLink>}
        />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {studyResources.map((res) => (
            <div key={res.id} className="flex items-center gap-3 rounded-2xl bg-background p-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-tile-mint font-mono text-xs font-bold text-verified">
                PDF
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="border-border text-[10px] text-subtle-foreground">{res.resourceType}</Badge>
                  <span className="text-[10px] text-muted-foreground">{res.campus}</span>
                </div>
                <h4 className="mt-1 line-clamp-1 text-xs font-bold text-foreground">{res.title}</h4>
                <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{res.description}</p>
              </div>
              {IS_LIVE ? (
                res.fileUrl && (
                  <a
                    href={res.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => void countResourceDownload(res.id)}
                    className="inline-flex min-h-11 shrink-0 items-center rounded-xl px-3 text-xs font-bold text-link hover:bg-accent"
                  >
                    Download
                  </a>
                )
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    toast.success(`Downloaded: ${res.title}`);
                  }}
                  className="inline-flex min-h-11 shrink-0 items-center rounded-xl px-3 text-xs font-bold text-link hover:bg-accent"
                >
                  Download
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
      )}
    </div>
  );
}
