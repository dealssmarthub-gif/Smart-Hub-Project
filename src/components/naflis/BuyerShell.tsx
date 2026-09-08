import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Home, Search, ShoppingCart, Heart, Wallet, Bell, Package, MessageSquare, User, TrendingUp, Clock,
} from "lucide-react";
import { Logo } from "@/components/naflis/Logo";
import { ThemeToggle } from "@/components/naflis/ThemeToggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNaflis } from "@/lib/naflis/store";
import { useState } from "react";
import { toast } from "sonner";

const NAV = [
  { to: "/buyer", label: "Home", icon: Home, exact: true },
  { to: "/buyer/search", label: "Search", icon: Search },
  { to: "/buyer/wishlist", label: "Wishlist", icon: Heart },
  { to: "/buyer/cart", label: "Cart", icon: ShoppingCart },
  { to: "/buyer/orders", label: "Orders", icon: Package },
  { to: "/buyer/wallet", label: "Wallet", icon: Wallet },
  { to: "/buyer/reserve", label: "Reserve & Pay", icon: Clock },
  { to: "/buyer/installments", label: "Installments", icon: TrendingUp },
  { to: "/buyer/messages", label: "Messages", icon: MessageSquare },
  { to: "/buyer/notifications", label: "Alerts", icon: Bell },
];

const MOBILE_NAV = NAV.slice(0, 5);

export function BuyerShell() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const cart = useNaflis((s) => s.cart);
  const wishlist = useNaflis((s) => s.wishlist);
  const notifs = useNaflis((s) => s.notifications.filter((n) => !n.read).length);
  const user = useNaflis((s) => s.users.find((u) => u.id === s.currentUserId));
  const signOut = useNaflis((s) => s.signOut);
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  const badges: Record<string, number> = {
    "/buyer/cart": cart.reduce((a, c) => a + c.qty, 0),
    "/buyer/wishlist": wishlist.length,
    "/buyer/notifications": notifs,
  };

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
          <Logo className="shrink-0" />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              navigate({ to: "/buyer/search", search: { q } });
            }}
            className="ml-2 hidden flex-1 md:block"
          >
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search products, brands, categories, sellers…"
                className="pl-9"
              />
            </div>
          </form>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            {user && (
              <div className="hidden items-center gap-2 rounded-full border px-2 py-1 sm:flex">
                <img src={user.avatar} alt="" className="h-6 w-6 rounded-full" />
                <span className="text-xs font-medium">{user.name}</span>
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                signOut();
                toast.success("Signed out successfully");
                navigate({ to: "/" });
              }}
            >
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
        {/* Sidebar */}
        <aside className="sticky top-24 hidden h-fit w-56 shrink-0 md:block">
          <nav className="space-y-1">
            {NAV.map((n) => {
              const Icon = n.icon;
              const active = n.exact ? pathname === n.to : pathname.startsWith(n.to);
              const badge = badges[n.to];
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                    active
                      ? "bg-accent text-accent-foreground font-semibold"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="flex-1">{n.label}</span>
                  {badge ? <Badge variant="secondary" className="h-5 min-w-5 justify-center px-1.5 text-[10px]">{badge}</Badge> : null}
                </Link>
              );
            })}
          </nav>
        </aside>
        {/* Content */}
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-background md:hidden">
        {MOBILE_NAV.map((n) => {
          const Icon = n.icon;
          const active = n.exact ? pathname === n.to : pathname.startsWith(n.to);
          const badge = badges[n.to];
          return (
            <Link
              key={n.to}
              to={n.to}
              className={`relative flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] ${
                active ? "text-sky-500" : "text-muted-foreground"
              }`}
            >
              <Icon className="h-5 w-5" />
              {n.label}
              {badge ? (
                <span className="absolute right-4 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-error px-1 text-[9px] text-error-foreground">
                  {badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
