import { Link, useRouterState } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Logo } from "@/components/naflis/Logo";
import { ThemeToggle } from "@/components/naflis/ThemeToggle";
import { useFeatureFlag } from "@/lib/featureFlags";
import { useNaflis, useUserRoles } from "@/lib/naflis/store";
import { NotificationBell } from "@/components/naflis/home/HomeBlocks";
import { CampusPicker } from "./CampusPicker";
import { PLACES, placeFor, type PlaceId } from "./places";
import { UserMenu } from "./UserMenu";
import { IS_LIVE } from "@/lib/appMode";

/** Max content width of every page in the consumer shell. */
export const PAGE_WIDTH = "mx-auto w-full max-w-[1160px] px-4 sm:px-6";

/**
 * Desktop top navigation (md and up) and a slim mobile header.
 * `onEscrowClick` lets the landing page open its explainer in place; elsewhere
 * "How escrow works" links to that section of the landing page.
 */
/**
 * Where "Home" goes: the signed-in student hub for accounts that hold the
 * student role, the public landing page for everyone else.
 */
export function useHomePath(): "/" | "/student-os" {
  const signedIn = useNaflis((s) => Boolean(s.currentUserId));
  const held = useUserRoles();
  const studentOs = useFeatureFlag("student_os");
  return signedIn && studentOs && held.includes("student") ? "/student-os" : "/";
}

export function TopNav({
  onEscrowClick,
  showCampus = true,
  mobile = true,
}: {
  onEscrowClick?: () => void;
  showCampus?: boolean;
  mobile?: boolean;
}) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const studentOs = useFeatureFlag("student_os");
  const active = placeFor(pathname);
  const link = (id: PlaceId) =>
    `inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold transition ${
      active === id
        ? "bg-primary-soft text-accent-foreground"
        : "text-subtle-foreground hover:bg-accent hover:text-accent-foreground"
    }`;
  const shop = PLACES.find((p) => p.id === "shop")!;
  const campus = PLACES.find((p) => p.id === "campus")!;
  const escrowClass =
    "inline-flex h-11 items-center whitespace-nowrap gap-1.5 rounded-full px-4 text-sm font-semibold text-subtle-foreground transition hover:bg-accent hover:text-accent-foreground";

  return (
    <header
      className={`sticky top-0 z-40 border-b border-border-soft ${mobile ? "" : "hidden md:block"} bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75`}
    >
      <div className={`${PAGE_WIDTH} flex h-16 items-center gap-3 md:h-[72px]`}>
        <Logo className="shrink-0" compact />
        <nav aria-label="Main" className="ml-4 hidden items-center gap-1 md:flex">
          <Link to={studentOs ? shop.to : "/buyer"} className={link("shop")}>
            Shop
          </Link>
          {studentOs && (
            <Link to={campus.to} className={link("campus")}>
              Campus
            </Link>
          )}
          {IS_LIVE ? null : onEscrowClick ? (
            <button type="button" onClick={onEscrowClick} className={escrowClass}>
              <ShieldCheck className="h-4 w-4 text-link" strokeWidth={1.8} /> How escrow works
            </button>
          ) : (
            <Link to="/" hash="escrow" className={escrowClass}>
              <ShieldCheck className="h-4 w-4 text-link" strokeWidth={1.8} /> How escrow works
            </Link>
          )}
        </nav>
        <div className="ml-auto flex min-w-0 items-center gap-1 md:gap-2">
          {showCampus && <CampusPicker compact />}
          <NotificationBell />
          <ThemeToggle />
          <div className="hidden md:block">
            <UserMenu />
          </div>
        </div>
      </div>
    </header>
  );
}

/** Floating bottom tab bar for phones: Home, Shop, Campus, Me. */
export function MobileTabBar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const studentOs = useFeatureFlag("student_os");
  const home = useHomePath();
  const active = placeFor(pathname);
  const places = PLACES.map((p) => (p.id === "home" ? { ...p, to: home } : p))
    .filter((p) => studentOs || p.id !== "campus")
    .map((p) => (p.id === "shop" && !studentOs ? { ...p, to: "/buyer" } : p));

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-40 rounded-[28px] border border-border-soft bg-card p-1.5 shadow-[0_10px_30px_rgba(60,40,170,0.16)] md:hidden"
    >
      <ul className="flex items-center justify-between gap-1">
        {places.map((p) => {
          const Icon = p.icon;
          const on = active === p.id;
          return (
            <li key={p.id} className="flex-1">
              <Link
                to={p.to}
                aria-current={on ? "page" : undefined}
                className={`flex h-12 items-center justify-center gap-1.5 rounded-full px-2 text-[11px] font-bold transition ${
                  on
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" strokeWidth={1.8} />
                <span className={on ? "" : "sr-only"}>{p.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Slim footer with the secondary destinations that used to sit in the top menus. */
export function SiteFooter() {
  const year = new Date().getFullYear();
  const linkClass = "inline-flex min-h-11 min-w-11 items-center hover:text-foreground";
  return (
    <footer className="border-t border-border-soft bg-card/60">
      <div
        className={`${PAGE_WIDTH} flex flex-col gap-2 py-6 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between`}
      >
        <p>© {year} NAFLIS Mall · Verified student commerce</p>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5">
          {!IS_LIVE && (
            <>
              <Link to="/" hash="escrow" className={linkClass}>
                Escrow terms
              </Link>
              <Link to="/buyer/wallet" className={linkClass}>
                Student wallet
              </Link>
            </>
          )}
          <Link to="/student-os" className={linkClass}>
            Student OS
          </Link>
          <Link to="/campus-admin" className={linkClass}>
            SRC access
          </Link>
          <Link to="/login" className={linkClass}>
            Sign in
          </Link>
        </nav>
      </div>
    </footer>
  );
}

/**
 * The consumer shell: top nav, page content, footer, and the mobile tab bar.
 * Content gets bottom padding on phones so nothing sits behind the tab bar.
 */
export function AppShell({
  children,
  onEscrowClick,
  showCampus,
  footer = true,
  mobileHeader = true,
}: {
  children: ReactNode;
  onEscrowClick?: () => void;
  showCampus?: boolean;
  footer?: boolean;
  /** False when the page draws its own phone header (the student Home). */
  mobileHeader?: boolean;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <TopNav onEscrowClick={onEscrowClick} showCampus={showCampus} mobile={mobileHeader} />
      <div className={`flex-1 ${footer ? "" : "pb-28 md:pb-0"}`}>{children}</div>
      {footer && (
        <div className="pb-28 md:pb-0">
          <SiteFooter />
        </div>
      )}
      <MobileTabBar />
    </div>
  );
}
