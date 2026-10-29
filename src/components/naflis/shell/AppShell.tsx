import { Link, useRouterState } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { BrandMark, Logo, Wordmark } from "@/components/naflis/Logo";
import { ThemeToggle } from "@/components/naflis/ThemeToggle";
import { useFeatureFlag } from "@/lib/featureFlags";
import { useNaflis } from "@/lib/naflis/store";
import { useIsStudent } from "@/lib/naflis/student";
import { NotificationBell } from "@/components/naflis/home/HomeBlocks";
import { CampusPicker } from "./CampusPicker";
import { PLACES, placeFor, placesFor, type PlaceId, type Viewer } from "./places";
import { UserMenu } from "./UserMenu";
import { IS_LIVE } from "@/lib/appMode";

/** Max content width of every page in the consumer shell. */
export const PAGE_WIDTH = "mx-auto w-full max-w-[1160px] px-4 sm:px-6";

/**
 * Desktop top navigation (md and up) and a slim mobile header.
 * `onEscrowClick` lets the landing page open its explainer in place; elsewhere
 * "How escrow works" links to that section of the landing page.
 */
/** Who is looking: drives which places and destinations the menus show. */
export function useViewer(): Viewer {
  const signedIn = useNaflis((s) => Boolean(s.currentUserId));
  const isStudent = useIsStudent();
  const flags = {
    student_os: useFeatureFlag("student_os"),
    src_portal: useFeatureFlag("src_portal"),
    reserve_and_pay: useFeatureFlag("reserve_and_pay"),
    take_now_pay_later: useFeatureFlag("take_now_pay_later"),
  };
  return { flags, signedIn, isStudent };
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
  const isStudent = useIsStudent();
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
          <Link to={shop.to} className={link("shop")}>
            Shop
          </Link>
          {/* Student OS: linked only for signed-in students. */}
          {isStudent && (
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
  const active = placeFor(pathname);
  // Home, Shop and Me for everyone; Campus (Student OS) only for signed-in students.
  const places = placesFor(useViewer());

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-40 rounded-[28px] border border-border-soft bg-card p-1.5 shadow-soft md:hidden"
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
  const isStudent = useIsStudent();
  const signedIn = useNaflis((s) => Boolean(s.currentUserId));
  return (
    <footer className="border-t border-border-soft bg-card/60">
      <div
        className={`${PAGE_WIDTH} flex flex-col gap-2 py-6 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between`}
      >
        <div className="flex items-center gap-2">
          <BrandMark className="h-7 w-7" />
          <p>
            <Wordmark /> <span className="whitespace-nowrap">© {year}</span>
          </p>
        </div>
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
          {isStudent && (
            <Link to="/student-os" className={linkClass}>
              Student OS
            </Link>
          )}
          {!signedIn && (
            <Link to="/login" className={linkClass}>
              Sign in
            </Link>
          )}
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
  fab = false,
}: {
  children: ReactNode;
  onEscrowClick?: () => void;
  showCampus?: boolean;
  footer?: boolean;
  /** False when the page draws its own phone header (the student Home). */
  mobileHeader?: boolean;
  /** The page shows the floating Sell button above the tab bar: reserve room for both on phones. */
  fab?: boolean;
}) {
  // Tab bar alone needs 112px; with the Sell button (it reaches 136px up) 160px.
  const phonePad = fab ? "pb-40 md:pb-0" : "pb-28 md:pb-0";
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <TopNav onEscrowClick={onEscrowClick} showCampus={showCampus} mobile={mobileHeader} />
      <div className={`flex-1 ${footer ? "" : phonePad}`}>{children}</div>
      {footer && (
        <div className={phonePad}>
          <SiteFooter />
        </div>
      )}
      <MobileTabBar />
    </div>
  );
}
