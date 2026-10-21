import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Home, Search, ShoppingCart, Heart, Wallet, Bell, Package, MessageSquare, TrendingUp, Clock, GraduationCap,
  LayoutGrid, BadgePercent,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AppShell, PAGE_WIDTH } from "@/components/naflis/shell/AppShell";
import { useNaflis } from "@/lib/naflis/store";
import { useFeatureFlag } from "@/lib/featureFlags";
import { hiddenInLive } from "@/lib/appMode";
import { useEffect, useState } from "react";

const NAV = [
  { to: "/buyer", label: "Home", icon: Home, exact: true },
  { to: "/student-os", label: "Student OS", icon: GraduationCap, flag: "student_os" },
  { to: "/buyer/categories", label: "Categories", icon: LayoutGrid },
  { to: "/buyer/deals", label: "Deals", icon: BadgePercent },
  { to: "/buyer/search", label: "Search", icon: Search },
  { to: "/buyer/wishlist", label: "Wishlist", icon: Heart },
  { to: "/buyer/cart", label: "Cart", icon: ShoppingCart },
  { to: "/buyer/orders", label: "Orders", icon: Package },
  { to: "/buyer/wallet", label: "Wallet", icon: Wallet },
  { to: "/buyer/reserve", label: "Reserve & Pay", icon: Clock, flag: "reserve_and_pay" },
  { to: "/buyer/installments", label: "Installments", icon: TrendingUp, flag: "take_now_pay_later" },
  { to: "/buyer/messages", label: "Messages", icon: MessageSquare },
  { to: "/buyer/notifications", label: "Alerts", icon: Bell },
];

/** NAFLIS Mall (B2C) pages: the shared shell plus the mall's own navigation and search. */
export function BuyerShell() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const cart = useNaflis((s) => s.cart);
  const wishlist = useNaflis((s) => s.wishlist);
  const notifs = useNaflis((s) => s.notifications.filter((n) => !n.read).length);
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const flags: Record<string, boolean> = {
    student_os: useFeatureFlag("student_os"),
    reserve_and_pay: useFeatureFlag("reserve_and_pay"),
    take_now_pay_later: useFeatureFlag("take_now_pay_later"),
  };
  const nav = NAV.filter((n) => (!n.flag || flags[n.flag]) && !hiddenInLive(n.to));
  const runSchedulers = useNaflis((s) => s.runSchedulers);

  // Demo-mode housekeeping: expire lapsed reservations and flag late installments.
  // (With Supabase, pg_cron jobs from migration 05 do this server-side.)
  useEffect(() => {
    runSchedulers();
    const t = setInterval(() => runSchedulers(), 30_000);
    return () => clearInterval(t);
  }, [runSchedulers]);
  const cartCount = cart.reduce((a, c) => a + c.qty, 0);

  const badges: Record<string, number> = {
    "/buyer/cart": cartCount,
    "/buyer/wishlist": wishlist.length,
    "/buyer/notifications": notifs,
  };
  const isActive = (n: (typeof NAV)[number]) => (n.exact ? pathname === n.to : pathname.startsWith(n.to));

  return (
    <AppShell showCampus={false}>
      <div className={`${PAGE_WIDTH} pt-4`}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            navigate({ to: "/buyer/search", search: { q } });
          }}
          role="search"
        >
          <label className="relative block">
            <span className="sr-only">Search NAFLIS Mall</span>
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" strokeWidth={1.8} />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search products, brands, categories, sellers…"
              className="h-12 rounded-2xl border-border bg-card pl-12 shadow-soft"
            />
          </label>
        </form>
        {/* Phones: the mall's sections as a scrollable row (the sidebar is desktop-only). */}
        <nav aria-label="NAFLIS Mall" className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 md:hidden">
          {nav.map((n) => {
            const Icon = n.icon;
            const badge = badges[n.to];
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`relative inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-xs font-bold transition ${
                  isActive(n) ? "bg-primary text-primary-foreground" : "bg-card text-subtle-foreground hover:bg-accent"
                }`}
              >
                <Icon className="h-4 w-4" strokeWidth={1.8} />
                {n.label}
                {badge ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-error px-1 text-[10px] text-error-foreground">{badge}</span> : null}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className={`${PAGE_WIDTH} flex gap-6 py-6`}>
        <aside className="sticky top-24 hidden h-fit w-56 shrink-0 md:block">
          <nav aria-label="NAFLIS Mall" className="space-y-1 rounded-3xl border border-border-soft bg-card p-2 shadow-soft">
            {nav.map((n) => {
              const Icon = n.icon;
              const badge = badges[n.to];
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm transition ${
                    isActive(n) ? "bg-accent font-semibold text-accent-foreground" : "text-subtle-foreground hover:bg-muted"
                  }`}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.8} />
                  <span className="flex-1">{n.label}</span>
                  {badge ? <Badge variant="secondary" className="h-5 min-w-5 justify-center px-1.5 text-[10px]">{badge}</Badge> : null}
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </AppShell>
  );
}
