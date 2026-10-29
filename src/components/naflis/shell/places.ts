import {
  BadgePercent,
  Bell,
  BookOpen,
  Briefcase,
  CalendarDays,
  Clock,
  GraduationCap,
  Heart,
  Home,
  LayoutGrid,
  MessageSquare,
  Package,
  Search,
  SearchCheck,
  ShoppingBag,
  ShoppingCart,
  Store,
  Ticket,
  TrendingUp,
  User,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { IS_LIVE, hiddenInLive } from "@/lib/appMode";

// ============================================================================
// THE FOUR PLACES — Home, Shop, Campus, Me.
// Navigation only: every destination is an existing route. Feature-flagged
// destinations name their flag so menus hide them exactly as before.
// ============================================================================

export type PlaceId = "home" | "shop" | "campus" | "me";

export type FlagKey = "student_os" | "src_portal" | "reserve_and_pay" | "take_now_pay_later";

export interface Destination {
  to: string;
  label: string;
  icon: LucideIcon;
  flag?: FlagKey;
  /** Only meaningful for a signed-in account. */
  signedIn?: boolean;
  /** Student OS: linked only for signed-in students (see lib/naflis/student). */
  studentOnly?: boolean;
}

export interface Place {
  id: PlaceId;
  label: string;
  icon: LucideIcon;
  /** Where the tab goes. */
  to: string;
  destinations: Destination[];
  /** The whole place is Student OS. */
  studentOnly?: boolean;
}

/** What a viewer may see in the menus. */
export interface Viewer {
  flags: Partial<Record<FlagKey, boolean>>;
  signedIn: boolean;
  isStudent: boolean;
}

export function showDestination(d: Destination, v: Viewer): boolean {
  return (
    (!d.flag || Boolean(v.flags[d.flag])) &&
    (!d.signedIn || v.signedIn) &&
    (!d.studentOnly || v.isStudent)
  );
}

/** The places and destinations this viewer sees. The mall never shows Student OS to non-students. */
export function placesFor(v: Viewer): Place[] {
  return PLACES.filter((p) => !p.studentOnly || v.isStudent).map((p) => ({
    ...p,
    destinations: p.destinations.filter((d) => showDestination(d, v)),
  }));
}

const ALL_PLACES: Place[] = [
  {
    id: "home",
    label: "Home",
    icon: Home,
    to: "/",
    destinations: [
      { to: "/", label: "Home", icon: Home },
      {
        to: "/student-os",
        label: "Student OS",
        icon: GraduationCap,
        flag: "student_os",
        studentOnly: true,
      },
    ],
  },
  {
    id: "shop",
    label: "Shop",
    icon: Store,
    to: "/buyer",
    destinations: [
      // Browsing the mall is open to everyone.
      { to: "/buyer", label: "NAFLIS Mall", icon: ShoppingBag },
      { to: "/shops", label: "Shops", icon: Store },
      { to: "/buyer/categories", label: "Categories", icon: LayoutGrid },
      { to: "/buyer/search", label: "Search the mall", icon: Search },
      { to: "/buyer/deals", label: "Mall deals", icon: BadgePercent, signedIn: true },
      {
        to: "/student-os/marketplace",
        label: "Campus marketplace",
        icon: Store,
        flag: "student_os",
        studentOnly: true,
      },
      {
        to: "/student-os/deals",
        label: "Group buys & discounts",
        icon: BadgePercent,
        flag: "student_os",
        studentOnly: true,
      },
      {
        to: "/buyer/reserve",
        label: "Reserve & Pay",
        icon: Clock,
        flag: "reserve_and_pay",
        signedIn: true,
      },
      {
        to: "/buyer/installments",
        label: "Installments",
        icon: TrendingUp,
        flag: "take_now_pay_later",
        signedIn: true,
      },
    ],
  },
  {
    id: "campus",
    label: "Campus",
    icon: BookOpen,
    to: "/student-os/resources",
    studentOnly: true,
    destinations: [
      {
        to: "/student-os/resources",
        label: "Notes & past questions",
        icon: BookOpen,
        flag: "student_os",
      },
      { to: "/student-os/calendar", label: "Calendar", icon: CalendarDays, flag: "student_os" },
      { to: "/student-os/events", label: IS_LIVE ? "Events" : "Events & tickets", icon: Ticket, flag: "student_os" },
      {
        to: "/student-os/opportunities",
        label: "Opportunities",
        icon: Briefcase,
        flag: "student_os",
      },
      {
        to: "/student-os/lost-found",
        label: "Lost & found",
        icon: SearchCheck,
        flag: "student_os",
      },
    ],
  },
  {
    id: "me",
    label: "Me",
    icon: User,
    to: "/me",
    destinations: [
      { to: "/buyer/wallet", label: "Wallet", icon: Wallet, signedIn: true },
      { to: "/buyer/orders", label: "Orders & escrow", icon: Package, signedIn: true },
      { to: "/buyer/cart", label: "Cart", icon: ShoppingCart, signedIn: true },
      { to: "/buyer/wishlist", label: "Wishlist", icon: Heart, signedIn: true },
      { to: "/buyer/messages", label: "Messages", icon: MessageSquare, signedIn: true },
      { to: "/buyer/notifications", label: "Alerts", icon: Bell, signedIn: true },
    ],
  },
];

/** Live mode drops destinations that aren't connected yet (appMode LIVE_HIDDEN_PATHS). */
export const PLACES: Place[] = ALL_PLACES.map((p) => ({
  ...p,
  destinations: p.destinations.filter((d) => !hiddenInLive(d.to)),
}));

const ME_BUYER = [
  "/buyer/wallet",
  "/buyer/orders",
  "/buyer/cart",
  "/buyer/wishlist",
  "/buyer/messages",
  "/buyer/notifications",
];
const CAMPUS = [
  "/student-os/resources",
  "/student-os/calendar",
  "/student-os/events",
  "/student-os/opportunities",
  "/student-os/lost-found",
];

const under = (pathname: string, base: string) =>
  pathname === base || pathname.startsWith(base + "/");

/** Which of the four places a URL belongs to (null for staff dashboards and standalone pages). */
export function placeFor(pathname: string): PlaceId | null {
  if (pathname === "/" || pathname === "/student-os") return "home";
  if (pathname === "/me" || pathname === "/login" || ME_BUYER.some((b) => under(pathname, b)))
    return "me";
  if (CAMPUS.some((b) => under(pathname, b))) return "campus";
  if (
    under(pathname, "/student-os/marketplace") ||
    under(pathname, "/student-os/deals") ||
    under(pathname, "/buyer") ||
    under(pathname, "/shops")
  )
    return "shop";
  return null;
}
