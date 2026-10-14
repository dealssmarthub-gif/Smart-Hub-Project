import {
  BadgePercent, Bell, BookOpen, Briefcase, Building2, CalendarDays, Clock, GraduationCap, Heart, Home, LayoutGrid,
  MessageSquare, Package, Search, SearchCheck, ShoppingBag, ShoppingCart, Store, Ticket, TrendingUp, User, Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

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
}

export interface Place {
  id: PlaceId;
  label: string;
  icon: LucideIcon;
  /** Where the tab goes. */
  to: string;
  destinations: Destination[];
}

export const PLACES: Place[] = [
  {
    id: "home",
    label: "Home",
    icon: Home,
    to: "/",
    destinations: [
      { to: "/", label: "Home", icon: Home },
      { to: "/student-os", label: "Student OS hub", icon: GraduationCap, flag: "student_os" },
    ],
  },
  {
    id: "shop",
    label: "Shop",
    icon: Store,
    to: "/student-os/marketplace",
    destinations: [
      { to: "/student-os/marketplace", label: "Campus marketplace", icon: Store, flag: "student_os" },
      { to: "/student-os/deals", label: "Group buys & discounts", icon: BadgePercent, flag: "student_os" },
      { to: "/buyer", label: "NAFLIS Mall", icon: ShoppingBag, signedIn: true },
      { to: "/buyer/deals", label: "Mall deals", icon: BadgePercent, signedIn: true },
      { to: "/buyer/categories", label: "Mall categories", icon: LayoutGrid, signedIn: true },
      { to: "/buyer/search", label: "Search the mall", icon: Search, signedIn: true },
      { to: "/buyer/reserve", label: "Reserve & Pay", icon: Clock, flag: "reserve_and_pay", signedIn: true },
      { to: "/buyer/installments", label: "Installments", icon: TrendingUp, flag: "take_now_pay_later", signedIn: true },
    ],
  },
  {
    id: "campus",
    label: "Campus",
    icon: BookOpen,
    to: "/student-os/resources",
    destinations: [
      { to: "/student-os/resources", label: "Notes & past questions", icon: BookOpen, flag: "student_os" },
      { to: "/student-os/calendar", label: "Calendar", icon: CalendarDays, flag: "student_os" },
      { to: "/student-os/events", label: "Events & tickets", icon: Ticket, flag: "student_os" },
      { to: "/student-os/opportunities", label: "Opportunities", icon: Briefcase, flag: "student_os" },
      { to: "/student-os/lost-found", label: "Lost & found", icon: SearchCheck, flag: "student_os" },
      { to: "/campus-admin", label: "SRC & institution access", icon: Building2, flag: "src_portal" },
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

const ME_BUYER = ["/buyer/wallet", "/buyer/orders", "/buyer/cart", "/buyer/wishlist", "/buyer/messages", "/buyer/notifications"];
const CAMPUS = ["/student-os/resources", "/student-os/calendar", "/student-os/events", "/student-os/opportunities", "/student-os/lost-found", "/campus-admin"];

const under = (pathname: string, base: string) => pathname === base || pathname.startsWith(base + "/");

/** Which of the four places a URL belongs to (null for staff dashboards and standalone pages). */
export function placeFor(pathname: string): PlaceId | null {
  if (pathname === "/" || pathname === "/student-os") return "home";
  if (pathname === "/me" || pathname === "/login" || ME_BUYER.some((b) => under(pathname, b))) return "me";
  if (CAMPUS.some((b) => under(pathname, b))) return "campus";
  if (under(pathname, "/student-os/marketplace") || under(pathname, "/student-os/deals") || under(pathname, "/buyer")) return "shop";
  return null;
}
