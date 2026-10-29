import { Link, useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useState } from "react";
import { AppShell, PAGE_WIDTH } from "@/components/naflis/shell/AppShell";
import { ProductCard } from "@/components/naflis/ProductCard";
import { BrandLoading } from "@/components/naflis/Logo";
import { ListStudentItemModal } from "@/components/naflis/ListStudentItemModal";
import { Input } from "@/components/ui/input";
import { useCategories } from "@/services/categories";
import { CampusFilter } from "@/components/naflis/shop/CampusFilter";
import { EmptyMarket, SellButton, useMarketplace } from "@/components/naflis/shop/Marketplace";
import { ShowMore, SortControl } from "@/components/naflis/shop/SortControl";
import { useMallOrder, usePaged } from "@/components/naflis/shop/useMallOrder";

/**
 * Live Home: the marketplace first. Search, categories and every approved
 * seller's items (shuffled for the session unless a sort is picked); a friendly
 * empty state with "Sell an item" when there is nothing yet. No Student OS
 * content (students reach it from the menus).
 */
export function LiveHome() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const { names: categories } = useCategories("mall");
  // useMarketplace loads the catalogue (one marketplace for every mall page).
  const { all, items: products, campus, setCampus, options, loading } = useMarketplace();
  const { ordered, sort, setSort } = useMallOrder(products);
  const page = usePaged(ordered);

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
              In the mall
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
          {all.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              <CampusFilter value={campus} options={options} onChange={setCampus} />
              <SortControl value={sort} onChange={setSort} />
            </div>
          )}
          {loading ? (
            <BrandLoading label="Loading items…" className="rounded-3xl bg-card p-6" />
          ) : products.length === 0 ? (
            <EmptyMarket
              campus={campus}
              anyElsewhere={all.length > 0}
              onShowAll={() => setCampus(null)}
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4">
                {page.visible.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
              {page.hasMore && <ShowMore remaining={page.remaining} onClick={page.showMore} />}
            </>
          )}
        </section>

        {all.length > 0 && (
          <section className="flex flex-col items-start justify-between gap-3 rounded-3xl bg-tile-brand p-6 sm:flex-row sm:items-center">
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
