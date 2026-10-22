import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { IS_LIVE } from "@/lib/appMode";
import { useMemo } from "react";
import { z } from "zod";
import {
  Flame,
  Users,
  ShieldCheck,
  CheckCircle2,
  Zap,
  Tag,
  Clock,
  Copy,
} from "lucide-react";
import { ListingImage } from "@/components/naflis/home/HomeBlocks";
import { ShopHeader } from "@/components/naflis/shop/ShopHeader";
import { useNaflis } from "@/lib/naflis/store";
import { GHS } from "@/lib/naflis/format";
import { toast } from "sonner";

type DealsView = "all" | "group" | "vouchers";

// `view` selects the existing tab: Shop's "Group buys" → group, "Discounts" → vouchers.
export const Route = createFileRoute("/student-os/deals")({
  // Live: not connected to the backend yet (appMode LIVE_HIDDEN_PATHS).
  beforeLoad: () => {
    if (IS_LIVE) throw redirect({ to: "/student-os/marketplace" });
  },
  validateSearch: z.object({ view: z.enum(["all", "group", "vouchers"]).optional() }).parse,
  component: StudentDeals,
});

const STATIC_STUDENT_DISCOUNTS = [
  {
    id: "sd_apple",
    title: "Apple Education Store: Mac & iPad Student Pack",
    partner: "Apple Authorized Campus Reseller",
    discount: "10% OFF + Free Beats",
    category: "Laptops & Tech Gadgets",
    expiry: "Valid till end of semester",
    code: "STUDENT-APPLE-GH",
    image: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800&q=80",
    description: "Save on MacBook Air, MacBook Pro, and iPad Air with valid Ghanaian tertiary institution ID.",
  },
  {
    id: "sd_spotify",
    title: "Spotify Premium Student (Ad-Free Music)",
    partner: "Spotify Ghana",
    discount: "50% OFF (GHS 12.99/mo)",
    category: "Services & Tutoring",
    expiry: "Rolling 12-Month Renewal",
    code: "SPOTIFY-CAMPUS-GH",
    image: "https://images.unsplash.com/photo-1614680376593-902f749f7ffc?w=800&q=80",
    description: "Download music offline, unlimited skips, and listen to study focus beats with verified student ID.",
  },
  {
    id: "sd_bolt",
    title: "Bolt Campus Commute Pass (UG, KNUST, UCC)",
    partner: "Bolt Ghana",
    discount: "25% OFF All Campus Trips",
    category: "Bikes & Commuting",
    expiry: "Limited semester vouchers",
    code: "BOLTCAMPUS25",
    image: "https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=800&q=80",
    description: "Get discount rides between campus halls, lecture complexes, and nearby student hostels.",
  },
  {
    id: "sd_hp",
    title: "HP EliteBook & Pavilion STEM Student Discount",
    partner: "TrendTech Ghana",
    discount: "GHS 400 OFF + Free Bag",
    category: "Laptops & Tech Gadgets",
    expiry: "Next 14 Days",
    code: "HP-STUDENT-400",
    image: "https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=800&q=80",
    description: "Tested Core i5/i7 laptops with 1-year warranty and free backpack for tertiary engineering students.",
  },
];

const primaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-soft transition hover:bg-primary-deep disabled:cursor-not-allowed";

function StudentDeals() {
  const studentListings = useNaflis((s) => s.studentListings);
  const studentProfile = useNaflis((s) => s.studentProfile);
  const setVerifyModalOpen = useNaflis((s) => s.setVerifyModalOpen);
  const joinGroupDeal = useNaflis((s) => s.joinGroupDeal);
  const { view } = Route.useSearch();
  const navigate = useNavigate();
  const activeTab: DealsView = view ?? "all";
  const setActiveTab = (v: DealsView) => navigate({ to: "/student-os/deals", search: { view: v }, replace: true });

  const groupDeals = useMemo(
    () => studentListings.filter((l) => l.isGroupDeal),
    [studentListings]
  );

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success(`Copied promo code: ${code}`);
  };

  const chip = (on: boolean) =>
    `inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-xs font-bold transition ${
      on ? "bg-primary text-primary-foreground" : "bg-card text-subtle-foreground shadow-soft hover:bg-accent hover:text-accent-foreground"
    }`;

  return (
    <div className="space-y-7">
      <ShopHeader
        active={activeTab === "all" ? "all" : activeTab}
        title="Verified Student Deals & Group Buys"
        subtitle="Exclusive partner discounts and collective student purchasing pools to unlock wholesale pricing."
        aside={
          studentProfile.isVerified ? (
            <span className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-tile-mint px-3 text-xs font-bold text-verified">
              <CheckCircle2 className="h-4 w-4" strokeWidth={1.8} />
              Student ID Verified
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setVerifyModalOpen(true)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-xs font-bold text-foreground transition hover:border-primary/40"
            >
              <ShieldCheck className="h-4 w-4 text-link" strokeWidth={1.8} /> Verify to Unlock All Deals
            </button>
          )
        }
      />

      {/* The page's own views: All Deals, Group Buying Pools, Brand Vouchers. */}
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6 md:mx-0 md:px-0" role="group" aria-label="Deal types">
        <button type="button" onClick={() => setActiveTab("all")} aria-pressed={activeTab === "all"} className={chip(activeTab === "all")}>
          All Deals
        </button>
        <button type="button" onClick={() => setActiveTab("group")} aria-pressed={activeTab === "group"} className={chip(activeTab === "group")}>
          <Flame className="h-4 w-4" strokeWidth={1.8} /> Group Buying Pools
        </button>
        <button type="button" onClick={() => setActiveTab("vouchers")} aria-pressed={activeTab === "vouchers"} className={chip(activeTab === "vouchers")}>
          <Tag className="h-4 w-4" strokeWidth={1.8} /> Brand Vouchers
        </button>
      </div>

      {/* Group Buying Section */}
      {(activeTab === "all" || activeTab === "group") && (
        <section className="space-y-4">
          <div className="flex items-start gap-2">
            <Flame className="mt-1 h-5 w-5 shrink-0 text-link" strokeWidth={1.8} />
            <div>
              <h2 className="text-xl font-extrabold tracking-tight text-foreground">Campus Group Buying Pools</h2>
              <p className="text-sm text-muted-foreground">
                Join forces with classmates. When the target number of students is reached, the discount is unlocked for everyone!
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-3">
            {groupDeals.map((deal) => {
              const joined = deal.groupDealJoined || 0;
              const target = deal.groupDealTarget || 10;
              const pct = Math.min(100, Math.round((joined / target) * 100));
              const isFull = joined >= target;

              return (
                <article key={deal.id} className="flex flex-col overflow-hidden rounded-3xl border border-border-soft bg-card shadow-soft">
                  <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted">
                    <ListingImage src={deal.image} alt={deal.title} />
                    <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-tile-peach px-2.5 py-1 text-[11px] font-bold text-peach-ink">
                      <Flame className="h-3 w-3" strokeWidth={1.8} /> Group Pool
                    </span>
                    <span className="absolute right-3 top-3 rounded-full bg-card/95 px-2.5 py-1 text-[11px] font-bold text-foreground">{deal.campus}</span>
                  </div>

                  <div className="flex flex-1 flex-col gap-3 p-4">
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{deal.category}</span>
                      <h3 className="mt-0.5 line-clamp-2 text-sm font-bold text-foreground">{deal.title}</h3>
                    </div>
                    <p className="line-clamp-2 text-xs text-subtle-foreground">{deal.description}</p>

                    {/* Progress */}
                    <div className="space-y-1.5 rounded-2xl bg-muted p-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1 text-subtle-foreground">
                          <Users className="h-3.5 w-3.5 text-link" strokeWidth={1.8} /> Pool Progress
                        </span>
                        <span className="font-bold text-foreground">{joined} of {target} joined</span>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-card" role="progressbar" aria-valuemin={0} aria-valuemax={target} aria-valuenow={joined} aria-label="Pool progress">
                        <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-right text-[11px] text-subtle-foreground">
                        {isFull ? "Unlocked!" : `${target - joined} more spots needed to activate`}
                      </p>
                    </div>

                    <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                      <p>
                        <span className="text-lg font-extrabold text-foreground">{GHS(deal.price)}</span>
                        {deal.originalPrice && (
                          <span className="ml-1.5 text-xs text-muted-foreground line-through">{GHS(deal.originalPrice)}</span>
                        )}
                      </p>
                      <button
                        type="button"
                        disabled={isFull}
                        onClick={() => {
                          const res = joinGroupDeal(deal.id);
                          toast.success(res.message);
                        }}
                        className={isFull ? "inline-flex min-h-11 items-center rounded-xl bg-tile-mint px-4 text-sm font-bold text-verified" : primaryBtn}
                      >
                        {isFull ? "Pool Full!" : "Join Pool"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* Brand Vouchers Section */}
      {(activeTab === "all" || activeTab === "vouchers") && (
        <section className="space-y-4">
          <div className="flex items-start gap-2">
            <Zap className="mt-1 h-5 w-5 shrink-0 text-link" strokeWidth={1.8} />
            <div>
              <h2 className="text-xl font-extrabold tracking-tight text-foreground">Verified Student Brand Discounts</h2>
              <p className="text-sm text-muted-foreground">Exclusive promos from major education and tech partners with student ID</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
            {STATIC_STUDENT_DISCOUNTS.map((item) => (
              <article key={item.id} className="flex gap-4 rounded-3xl border border-border-soft bg-card p-3 shadow-soft sm:p-4">
                <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-muted sm:h-32 sm:w-32">
                  <ListingImage src={item.image} alt={item.title} />
                  <span className="absolute left-1.5 top-1.5 rounded-full bg-tile-mint px-2 py-0.5 text-[9px] font-bold text-verified">Verified</span>
                </div>

                <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-link">{item.partner}</p>
                    <h3 className="mt-0.5 text-sm font-bold text-foreground">{item.title}</h3>
                    <p className="mt-1 line-clamp-2 text-xs text-subtle-foreground">{item.description}</p>
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Clock className="h-3 w-3" strokeWidth={1.8} /> {item.expiry}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="rounded-xl bg-tile-peach px-2.5 py-1 font-mono text-xs font-bold text-peach-ink">{item.discount}</span>
                    <button
                      type="button"
                      onClick={() => copyCode(item.code)}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-xs font-bold text-foreground transition hover:border-primary/40 hover:bg-accent"
                    >
                      <Copy className="h-4 w-4 text-link" strokeWidth={1.8} /> Copy Code
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
