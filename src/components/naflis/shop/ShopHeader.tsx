import { Link } from "@tanstack/react-router";
import { ArrowUpRight, PlusCircle, ShoppingBag } from "lucide-react";
import type { ReactNode } from "react";
import { useNaflis } from "@/lib/naflis/store";

export type ShopTab = "marketplace" | "group" | "vouchers" | "all";

/**
 * Shop navigation shared by the marketplace and deals pages: page title, the
 * Marketplace | Group buys | Discounts segmented control, the NAFLIS Mall
 * entry, and the Sell button (inline from md up; floating on phones).
 * Group buys and Discounts open the deals page on its existing filters.
 */
export function ShopHeader({
  active,
  title,
  subtitle,
  aside,
}: {
  active: ShopTab;
  title: string;
  subtitle: string;
  aside?: ReactNode;
}) {
  const setStudentModalOpen = useNaflis((s) => s.setStudentModalOpen);
  const seg = (on: boolean) =>
    `flex min-h-11 flex-1 items-center justify-center whitespace-nowrap rounded-full px-3 text-xs font-bold transition sm:flex-none sm:px-5 sm:text-sm ${
      on
        ? "bg-primary text-primary-foreground shadow-soft"
        : "text-subtle-foreground hover:text-foreground"
    }`;

  return (
    <header className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
            {title}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {aside}
          <button
            type="button"
            onClick={() => setStudentModalOpen(true)}
            className="hidden min-h-11 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-soft transition hover:bg-primary-deep md:inline-flex"
          >
            <PlusCircle className="h-4 w-4" strokeWidth={1.8} /> Sell an item
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <nav
          aria-label="Shop"
          className="flex w-full rounded-full border border-border-soft bg-card p-1 shadow-soft sm:w-auto"
        >
          <Link
            to="/student-os/marketplace"
            className={seg(active === "marketplace")}
            aria-current={active === "marketplace" ? "page" : undefined}
          >
            Marketplace
          </Link>
          <Link
            to="/student-os/deals"
            search={{ view: "group" }}
            className={seg(active === "group")}
            aria-current={active === "group" ? "page" : undefined}
          >
            Group buys
          </Link>
          <Link
            to="/student-os/deals"
            search={{ view: "vouchers" }}
            className={seg(active === "vouchers")}
            aria-current={active === "vouchers" ? "page" : undefined}
          >
            Discounts
          </Link>
        </nav>
        <Link
          to="/buyer"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-xs font-bold text-subtle-foreground transition hover:border-primary/40 hover:text-foreground sm:text-sm"
        >
          <ShoppingBag className="h-4 w-4 text-link" strokeWidth={1.8} /> NAFLIS Mall{" "}
          <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.8} />
        </Link>
      </div>

      <SellFab />
    </header>
  );
}

/** Floating "Sell an item" on phones, sitting above the tab bar. Opens the existing listing flow. */
export function SellFab() {
  const setStudentModalOpen = useNaflis((s) => s.setStudentModalOpen);
  return (
    <button
      type="button"
      onClick={() => setStudentModalOpen(true)}
      className="fixed bottom-[calc(max(12px,env(safe-area-inset-bottom))+76px)] right-4 z-30 inline-flex h-12 items-center gap-1.5 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground shadow-[0_10px_24px_rgba(60,40,170,0.35)] transition hover:bg-primary-deep md:hidden"
    >
      <PlusCircle className="h-5 w-5" strokeWidth={1.8} /> Sell an item
    </button>
  );
}
