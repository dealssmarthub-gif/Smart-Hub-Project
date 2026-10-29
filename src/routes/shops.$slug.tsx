import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Package, Store } from "lucide-react";
import { useEffect, useMemo } from "react";
import { ContactSeller } from "@/components/naflis/ContactSeller";
import { BrandLoading } from "@/components/naflis/Logo";
import { ProductCard } from "@/components/naflis/ProductCard";
import { useMarketplace } from "@/components/naflis/shop/Marketplace";
import { ShopError, ShopLogo, StudentSellerLabel } from "@/components/naflis/shop/ShopParts";
import { ShowMore, SortControl } from "@/components/naflis/shop/SortControl";
import { useMallOrder, usePaged } from "@/components/naflis/shop/useMallOrder";
import { IS_LIVE } from "@/lib/appMode";
import { mallSortSearch } from "@/lib/naflis/mallOrder";
import { campusLabel, itemCountLabel, shopFacts } from "@/lib/naflis/shops";
import { fetchApprovedShop } from "@/services/sellerApi";

export const Route = createFileRoute("/shops/$slug")({
  head: () => ({ meta: [{ title: "Shop · NAFLIS Mall" }] }),
  validateSearch: mallSortSearch.parse,
  component: ShopPage,
});

const primaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-soft transition hover:bg-primary-deep";
const secondaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-4 text-sm font-bold text-foreground transition hover:bg-accent";

/**
 * One approved shop: its logo, name, description and campus, its items (with
 * the mall's sort), and "Contact seller" behind sign-in. An unknown, pending
 * or rejected shop gets the same friendly not-found page.
 */
function ShopPage() {
  const { slug } = Route.useParams();
  const shop = useQuery({
    queryKey: ["shop", slug],
    queryFn: () => fetchApprovedShop(slug),
    staleTime: 60_000,
    enabled: IS_LIVE,
  });
  const { all, loading: productsLoading } = useMarketplace();
  const id = shop.data?.id;
  const items = useMemo(() => (id ? all.filter((p) => p.storeId === id) : []), [all, id]);
  const { ordered, sort, setSort } = useMallOrder(items);
  const page = usePaged(ordered);
  const name = shop.data?.name;
  const settled = !IS_LIVE || shop.isSuccess;
  useEffect(() => {
    if (settled) document.title = `${name ?? "Shop not found"} · NAFLIS Mall`;
  }, [name, settled]);

  if (shop.isError) {
    return (
      <ShopError
        message="This shop couldn't be loaded. Check your connection and try again."
        onRetry={() => void shop.refetch()}
      />
    );
  }
  if (IS_LIVE && shop.isPending) {
    return <BrandLoading label="Loading shop…" className="min-h-[40vh] py-16" />;
  }
  if (!shop.data) return <ShopNotFound />;

  const s = shop.data;
  const facts = shopFacts(s.id, all);
  return (
    <div className="space-y-6">
      <section
        aria-labelledby="shop-name"
        className="overflow-hidden rounded-3xl border border-border-soft bg-card shadow-soft"
      >
        <div aria-hidden className="h-20 bg-tile-brand sm:h-28" />
        <div className="-mt-10 space-y-3 px-4 pb-5 sm:-mt-12 sm:px-6">
          <ShopLogo shop={s} className="h-20 w-20 bg-card shadow-soft sm:h-24 sm:w-24" />
          <div className="space-y-1.5">
            <h1 id="shop-name" className="text-2xl font-extrabold tracking-tight">
              {s.name}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              {facts.studentSeller && <StudentSellerLabel />}
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-link" strokeWidth={1.8} aria-hidden />
                <span className="sr-only">Campus: </span>
                {campusLabel(facts.campuses)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Package className="h-4 w-4 text-link" strokeWidth={1.8} aria-hidden />
                {itemCountLabel(facts.productCount)}
              </span>
            </div>
            {s.description && (
              <p className="max-w-2xl whitespace-pre-line text-sm text-subtle-foreground">
                {s.description}
              </p>
            )}
          </div>
          {/* Signed out: sign in first. Signed in: the number comes from naflis_vendor_contact (daily limit). */}
          <div className="max-w-md">
            <ContactSeller vendorId={s.id} sellerName={s.name} itemTitle="your shop" />
          </div>
        </div>
      </section>

      <section aria-labelledby="shop-items" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="shop-items" className="text-lg font-extrabold">
            Items from {s.name}
          </h2>
          {items.length > 1 && <SortControl value={sort} onChange={setSort} />}
        </div>
        {productsLoading ? (
          <BrandLoading label="Loading items…" className="rounded-3xl bg-card p-6" />
        ) : items.length === 0 ? (
          <div className="rounded-3xl border border-border-soft bg-card p-8 text-center shadow-soft">
            <Package
              className="mx-auto h-10 w-10 text-muted-foreground"
              strokeWidth={1.8}
              aria-hidden
            />
            <p className="mt-3 font-extrabold">No items yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              This shop hasn&apos;t listed anything yet. Check back soon.
            </p>
          </div>
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
    </div>
  );
}

/** Unknown, pending and rejected shops look the same: nothing about them is revealed. */
function ShopNotFound() {
  return (
    <div className="rounded-3xl border border-border-soft bg-card p-8 text-center shadow-soft">
      <Store className="mx-auto h-10 w-10 text-link" strokeWidth={1.8} aria-hidden />
      <h1 className="mt-3 text-xl font-extrabold">We couldn&apos;t find that shop</h1>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        The link may be mistyped, or the shop isn&apos;t open in NAFLIS Mall right now.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Link to="/shops" className={primaryBtn}>
          Browse all shops
        </Link>
        <Link to="/buyer" className={secondaryBtn}>
          Back to the mall
        </Link>
      </div>
    </div>
  );
}
