import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import {
  BadgePercent,
  Flame,
  Users,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  Zap,
  Tag,
  Clock,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNaflis, type StudentListing } from "@/lib/naflis/store";
import { GHS } from "@/lib/naflis/format";
import { toast } from "sonner";

export const Route = createFileRoute("/student-os/deals")({
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

function StudentDeals() {
  const studentListings = useNaflis((s) => s.studentListings);
  const studentProfile = useNaflis((s) => s.studentProfile);
  const setVerifyModalOpen = useNaflis((s) => s.setVerifyModalOpen);
  const joinGroupDeal = useNaflis((s) => s.joinGroupDeal);

  const [activeTab, setActiveTab] = useState<"all" | "group" | "vouchers">("all");

  const groupDeals = useMemo(
    () => studentListings.filter((l) => l.isGroupDeal),
    [studentListings]
  );

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success(`Copied promo code: ${code}`);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5">
        <div>
          <div className="flex items-center gap-2">
            <BadgePercent className="h-6 w-6 text-sky-500" />
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              Verified Student Deals & Group Buys
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Exclusive partner discounts and collective student purchasing pools to unlock wholesale pricing.
          </p>
        </div>

        {/* Verification Pill */}
        <div className="flex items-center gap-2">
          {studentProfile.isVerified ? (
            <div className="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span>Student ID Verified</span>
            </div>
          ) : (
            <Button
              size="sm"
              onClick={() => setVerifyModalOpen(true)}
              className="bg-sky-500 hover:bg-sky-600 text-white text-xs gap-1.5"
            >
              <ShieldCheck className="h-4 w-4" /> Verify to Unlock All Deals
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab("all")}
          className={`rounded-xl px-4 py-2 text-xs font-bold transition ${
            activeTab === "all"
              ? "bg-sky-500 text-white shadow-sm"
              : "bg-muted text-muted-foreground hover:bg-accent"
          }`}
        >
          All Deals
        </button>
        <button
          onClick={() => setActiveTab("group")}
          className={`rounded-xl px-4 py-2 text-xs font-bold flex items-center gap-1.5 transition ${
            activeTab === "group"
              ? "bg-sky-500 text-white shadow-sm"
              : "bg-muted text-muted-foreground hover:bg-accent"
          }`}
        >
          <Flame className="h-3.5 w-3.5 text-amber-500" /> Group Buying Pools
        </button>
        <button
          onClick={() => setActiveTab("vouchers")}
          className={`rounded-xl px-4 py-2 text-xs font-bold flex items-center gap-1.5 transition ${
            activeTab === "vouchers"
              ? "bg-sky-500 text-white shadow-sm"
              : "bg-muted text-muted-foreground hover:bg-accent"
          }`}
        >
          <Tag className="h-3.5 w-3.5 text-sky-500" /> Brand Vouchers
        </button>
      </div>

      {/* Group Buying Section */}
      {(activeTab === "all" || activeTab === "group") && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-amber-500" />
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-foreground">Campus Group Buying Pools</h2>
              <p className="text-xs text-muted-foreground">
                Join forces with classmates. When the target number of students is reached, the discount is unlocked for everyone!
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {groupDeals.map((deal) => {
              const joined = deal.groupDealJoined || 0;
              const target = deal.groupDealTarget || 10;
              const pct = Math.min(100, Math.round((joined / target) * 100));
              const isFull = joined >= target;

              return (
                <div
                  key={deal.id}
                  className="flex flex-col rounded-2xl border bg-card overflow-hidden shadow-sm hover:shadow-premium transition"
                >
                  <div className="relative h-44 w-full overflow-hidden bg-muted">
                    <img src={deal.image} alt={deal.title} className="h-full w-full object-cover" />
                    <Badge className="absolute top-2 left-2 bg-amber-500 text-white text-[10px] gap-1">
                      <Flame className="h-3 w-3" /> Group Pool
                    </Badge>
                    <Badge className="absolute top-2 right-2 bg-background/90 text-sky-500 text-[10px] backdrop-blur">
                      {deal.campus}
                    </Badge>
                  </div>

                  <div className="flex flex-col flex-1 p-4 gap-3">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-muted-foreground">
                        {deal.category}
                      </span>
                      <h3 className="text-sm font-bold text-foreground line-clamp-2 mt-0.5">
                        {deal.title}
                      </h3>
                    </div>

                    <p className="text-xs text-muted-foreground line-clamp-2">{deal.description}</p>

                    {/* Progress */}
                    <div className="space-y-1.5 bg-muted/60 p-3 rounded-xl">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <Users className="h-3.5 w-3.5 text-sky-500" /> Pool Progress
                        </span>
                        <span className="font-bold text-foreground">
                          {joined} of {target} joined
                        </span>
                      </div>
                      <div className="h-2.5 w-full rounded-full bg-background overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-sky-500 to-amber-500 transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground text-right">
                        {isFull ? "Unlocked!" : `${target - joined} more spots needed to activate`}
                      </p>
                    </div>

                    <div className="mt-auto pt-3 border-t flex items-center justify-between">
                      <div>
                        <span className="text-lg font-black text-foreground">{GHS(deal.price)}</span>
                        {deal.originalPrice && (
                          <span className="ml-1.5 text-xs text-muted-foreground line-through">
                            {GHS(deal.originalPrice)}
                          </span>
                        )}
                      </div>

                      <Button
                        size="sm"
                        disabled={isFull}
                        onClick={() => {
                          const res = joinGroupDeal(deal.id);
                          toast.success(res.message);
                        }}
                        className={`text-xs h-8 px-4 ${
                          isFull
                            ? "bg-emerald-600 text-white"
                            : "bg-sky-500 hover:bg-sky-600 text-white shadow-sm"
                        }`}
                      >
                        {isFull ? "Pool Full!" : "Join Pool"}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Brand Vouchers Section */}
      {(activeTab === "all" || activeTab === "vouchers") && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-sky-500" />
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-foreground">
                Verified Student Brand Discounts
              </h2>
              <p className="text-xs text-muted-foreground">
                Exclusive promos from major education and tech partners with student ID
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {STATIC_STUDENT_DISCOUNTS.map((item) => (
              <div
                key={item.id}
                className="flex flex-col sm:flex-row gap-4 p-4 rounded-2xl border bg-card hover:shadow-premium transition"
              >
                <div className="relative h-32 w-full sm:w-32 shrink-0 rounded-xl overflow-hidden bg-muted">
                  <img src={item.image} alt={item.title} className="h-full w-full object-cover" />
                  <Badge className="absolute top-2 left-2 bg-sky-500 text-white text-[9px]">
                    Verified
                  </Badge>
                </div>

                <div className="flex flex-col flex-1 justify-between gap-2">
                  <div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[10px] uppercase font-bold text-sky-500">
                        {item.partner}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{item.expiry}</span>
                    </div>
                    <h4 className="text-sm font-bold text-foreground mt-0.5">{item.title}</h4>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {item.description}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t mt-1">
                    <div className="rounded-lg bg-sky-500/10 px-2 py-1 font-mono text-xs font-bold text-sky-500 border border-sky-500/20">
                      {item.discount}
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyCode(item.code)}
                      className="text-xs h-8"
                    >
                      Copy Code
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
