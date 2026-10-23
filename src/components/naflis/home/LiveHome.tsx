import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PlusCircle, Search, Store } from "lucide-react";
import { useState } from "react";
import { AppShell, PAGE_WIDTH } from "@/components/naflis/shell/AppShell";
import { ProductCard } from "@/components/naflis/ProductCard";
import { ListStudentItemModal } from "@/components/naflis/ListStudentItemModal";
import { Input } from "@/components/ui/input";
import { useNaflis } from "@/lib/naflis/store";
import { fetchSellerProducts } from "@/services/sellerApi";
import { useCategories } from "@/services/categories";

const primaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-soft transition hover:bg-primary-deep";

/** "Sell an item": signed in opens the listing form; signed out signs in first, then comes back. */
export function SellButton({ className = primaryBtn }: { className?: string }) {
  const signedIn = useNaflis((s) => Boolean(s.currentUserId));
  const openForm = useNaflis((s) => s.setStudentModalOpen);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  return (
    <button
      type="button"
      className={className}
      onClick={() =>
        signedIn ? openForm(true) : navigate({ to: "/login", search: { redirect: pathname } })
      }
    >
      <PlusCircle className="h-4 w-4" strokeWidth={1.8} /> Sell an item
    </button>
  );
}

/**
 * Live Home: the marketplace first. Search, categories and the latest items
 * from approved sellers; a friendly empty state with "Sell an item" when there
 * is nothing yet. No Student OS content (students reach it from the menus).
 */
export function LiveHome() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const { names: categories } = useCategories("mall");
  const { data: products = [], isPending } = useQuery({
    queryKey: ["home-products"],
    queryFn: async () => {
      const rows = (await fetchSellerProducts()) ?? [];
      useNaflis.setState({ products: rows });
      return rows;
    },
    staleTime: 60_000,
  });

  return (
    <AppShell showCampus={false}>
      <main className={`${PAGE_WIDTH} space-y-6 py-6`}>
        <section className="space-y-3">
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">NAFLIS Mall</h1>
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              navigate({ to: "/buyer/search", search: { q: q.trim() || undefined } });
            }}
          >
            <label className="relative block">
              <span className="sr-only">Search NAFLIS Mall</span>
              <Search
                className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
                strokeWidth={1.8}
              />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search products, brands, categories…"
                className="h-12 rounded-2xl border-border bg-card pl-12 shadow-soft"
              />
            </label>
          </form>
          {categories.length > 0 && (
            <nav
              aria-label="Categories"
              className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4"
            >
              {categories.slice(0, 12).map((c) => (
                <Link
                  key={c}
                  to="/buyer/search"
                  search={{ cat: c }}
                  className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-card px-4 text-xs font-bold text-subtle-foreground shadow-soft hover:bg-accent"
                >
                  {c}
                </Link>
              ))}
            </nav>
          )}
        </section>

        <section aria-labelledby="latest">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="latest" className="text-lg font-extrabold">
              Latest items
            </h2>
            {products.length > 0 && (
              <Link
                to="/buyer"
                className="inline-flex min-h-11 items-center text-sm font-bold text-link hover:underline"
              >
                Browse the mall
              </Link>
            )}
          </div>
          {isPending ? (
            <p className="rounded-3xl bg-card p-6 text-sm text-muted-foreground">Loading items…</p>
          ) : products.length === 0 ? (
            <div className="rounded-3xl border border-border-soft bg-card p-8 text-center shadow-soft">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-tile-lavender text-tile-lavender-icon">
                <Store className="h-6 w-6" strokeWidth={1.8} />
              </span>
              <h3 className="mt-3 text-lg font-extrabold">Nothing for sale yet</h3>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                Be the first to list something. Items appear here once the seller is approved.
              </p>
              <div className="mt-4 flex justify-center">
                <SellButton />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4">
              {products.slice(0, 24).map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </section>

        {products.length > 0 && (
          <section className="flex flex-col items-start justify-between gap-3 rounded-3xl bg-tile-lavender p-6 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-extrabold">Have something to sell?</h2>
              <p className="text-sm text-subtle-foreground">
                List it in a minute. Buyers contact you directly.
              </p>
            </div>
            <SellButton />
          </section>
        )}
      </main>
      <ListStudentItemModal />
    </AppShell>
  );
}
