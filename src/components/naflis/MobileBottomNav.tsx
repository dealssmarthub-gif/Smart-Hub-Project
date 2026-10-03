import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BadgePercent, Bell, Briefcase, SearchCheck, Ticket, BookOpen, Building2, CalendarDays, Clock, GraduationCap, Heart, Home, LayoutGrid,
  LogOut, Menu, MessageSquare, Package, PlusCircle, Search, ShoppingBag, ShoppingCart, Store, TrendingUp, Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ROLE_ICONS, useWorkspaces } from "@/components/naflis/ContextSwitcher";
import { useFeatureFlag } from "@/lib/featureFlags";
import { ROLE_META } from "@/lib/naflis/roles";
import { useNaflis } from "@/lib/naflis/store";

type NavTo =
  | "/buyer" | "/buyer/categories" | "/buyer/deals" | "/buyer/orders" | "/buyer/search" | "/buyer/wishlist"
  | "/buyer/cart" | "/buyer/wallet" | "/buyer/reserve" | "/buyer/installments" | "/buyer/messages"
  | "/buyer/notifications" | "/student-os" | "/student-os/resources" | "/student-os/marketplace"
  | "/student-os/calendar" | "/student-os/deals" | "/student-os/opportunities" | "/student-os/lost-found" | "/student-os/events" | "/campus-admin";

interface NavItem {
  to: NavTo;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  /** Feature flag that must be on for the item to show. */
  flag?: "reserve" | "payLater" | "studentOs" | "srcPortal";
}

const TABS: Record<"buyer" | "student", NavItem[]> = {
  buyer: [
    { to: "/buyer", label: "Home", icon: Home, exact: true },
    { to: "/buyer/categories", label: "Categories", icon: LayoutGrid },
    { to: "/buyer/deals", label: "Deals", icon: BadgePercent },
    { to: "/buyer/orders", label: "Orders", icon: Package },
  ],
  student: [
    { to: "/student-os", label: "Home", icon: Home, exact: true },
    { to: "/student-os/resources", label: "Campus", icon: BookOpen },
    { to: "/student-os/marketplace", label: "Mall", icon: Store },
    { to: "/student-os/calendar", label: "Calendar", icon: CalendarDays },
  ],
};

const MORE: Record<"buyer" | "student", NavItem[]> = {
  buyer: [
    { to: "/buyer/search", label: "Search", icon: Search },
    { to: "/buyer/cart", label: "Cart", icon: ShoppingCart },
    { to: "/buyer/wishlist", label: "Wishlist", icon: Heart },
    { to: "/buyer/wallet", label: "Wallet", icon: Wallet },
    { to: "/buyer/reserve", label: "Reserve & Pay", icon: Clock, flag: "reserve" },
    { to: "/buyer/installments", label: "Installments", icon: TrendingUp, flag: "payLater" },
    { to: "/buyer/messages", label: "Messages", icon: MessageSquare },
    { to: "/buyer/notifications", label: "Alerts", icon: Bell },
    { to: "/student-os", label: "Student OS", icon: GraduationCap, flag: "studentOs" },
  ],
  student: [
    { to: "/student-os/events", label: "Events & Tickets", icon: Ticket },
    { to: "/student-os/opportunities", label: "Opportunities", icon: Briefcase },
    { to: "/student-os/lost-found", label: "Lost & Found", icon: SearchCheck },
    { to: "/student-os/deals", label: "Student Deals", icon: BadgePercent },
    { to: "/campus-admin", label: "SRC Access", icon: Building2, flag: "srcPortal" },
    { to: "/buyer", label: "NAFLIS Mall", icon: ShoppingBag },
    { to: "/buyer/orders", label: "Orders", icon: Package },
    { to: "/buyer/wallet", label: "Wallet", icon: Wallet },
  ],
};

export function MobileBottomNav({
  context,
  badges = {},
}: {
  context: "buyer" | "student";
  badges?: Record<string, number>;
}) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const signOut = useNaflis((s) => s.signOut);
  const ws = useWorkspaces();
  const [open, setOpen] = useState(false);

  const flags = {
    reserve: useFeatureFlag("reserve_and_pay"),
    payLater: useFeatureFlag("take_now_pay_later"),
    studentOs: useFeatureFlag("student_os"),
    srcPortal: useFeatureFlag("src_portal"),
  };

  const more = MORE[context].filter((n) => !n.flag || flags[n.flag]);
  const isActive = (n: NavItem) => (n.exact ? pathname === n.to : pathname.startsWith(n.to));
  const moreActive = more.some((n) => n.to.startsWith(context === "buyer" ? "/buyer" : "/student-os") && isActive(n));
  const moreBadge = more.reduce((a, n) => a + (badges[n.to] ?? 0), 0);
  const tabClass = (active: boolean) =>
    `relative flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] ${
      active ? "text-sky-500" : "text-muted-foreground"
    }`;

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {TABS[context].map((n) => {
          const Icon = n.icon;
          const badge = badges[n.to];
          return (
            <Link key={n.to} to={n.to} className={tabClass(isActive(n) && !open)}>
              <Icon className="h-5 w-5" />
              {n.label}
              {badge ? <NavBadge count={badge} /> : null}
            </Link>
          );
        })}
        <button type="button" onClick={() => setOpen(true)} className={tabClass(open || moreActive)}>
          <Menu className="h-5 w-5" />
          More
          {moreBadge ? <NavBadge count={moreBadge} /> : null}
        </button>
      </nav>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl md:hidden">
          <SheetHeader className="text-left">
            <SheetTitle>More</SheetTitle>
            <SheetDescription className="sr-only">More destinations and workspace switching</SheetDescription>
          </SheetHeader>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {more.map((n) => {
              const Icon = n.icon;
              const badge = badges[n.to];
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  onClick={() => setOpen(false)}
                  className="relative flex flex-col items-center gap-1.5 rounded-xl border bg-card px-2 py-3 text-center text-xs font-medium"
                >
                  <Icon className="h-5 w-5 text-sky-500" />
                  {n.label}
                  {badge ? <NavBadge count={badge} /> : null}
                </Link>
              );
            })}
          </div>

          {ws.signedIn && (
            <div className="mt-5 space-y-1">
              <p className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Workspace</p>
              {ws.roles.map((r) => {
                const Icon = ROLE_ICONS[r];
                return (
                  <SheetRow
                    key={r}
                    icon={Icon}
                    label={ROLE_META[r].label}
                    hint={r === ws.active ? "Current" : ROLE_META[r].description}
                    active={r === ws.active}
                    onClick={() => {
                      setOpen(false);
                      ws.switchTo(r);
                    }}
                  />
                );
              })}
              {ws.canOpenShop && (
                <SheetRow icon={PlusCircle} label="Open a shop" onClick={() => { setOpen(false); ws.openShop(); }} />
              )}
              {ws.canJoinStudentOs && (
                <SheetRow icon={PlusCircle} label="Join Student OS" onClick={() => { setOpen(false); ws.joinStudentOs(); }} />
              )}
              <SheetRow
                icon={LogOut}
                label="Sign out"
                onClick={() => {
                  setOpen(false);
                  signOut();
                  toast.success("Signed out successfully");
                  navigate({ to: "/" });
                }}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function NavBadge({ count }: { count: number }) {
  return (
    <span className="absolute right-4 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-error px-1 text-[9px] text-error-foreground">
      {count}
    </span>
  );
}

function SheetRow({
  icon: Icon,
  label,
  hint,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  hint?: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${
        active ? "bg-accent font-semibold text-accent-foreground" : "hover:bg-muted"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0 text-sky-500" />
      <span className="flex-1">{label}</span>
      {hint && <span className="truncate text-xs text-muted-foreground">{hint}</span>}
    </button>
  );
}
