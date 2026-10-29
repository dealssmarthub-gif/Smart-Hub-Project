import { Link } from "@tanstack/react-router";
import { AlertCircle, MapPin, Package, RotateCw, Tag } from "lucide-react";
import { useState } from "react";
import type { PublicShop } from "@/services/sellerApi";
import { campusLabel, itemCountLabel, type ShopFacts } from "@/lib/naflis/shops";

/** The shop's logo, or its first letter on the brand tile when it has none (no invented images). */
export function ShopLogo({
  shop,
  className = "h-14 w-14",
}: {
  shop: PublicShop;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const box = `${className} shrink-0 overflow-hidden rounded-2xl border border-border-soft`;
  if (shop.logoUrl && !failed) {
    return (
      <img
        src={shop.logoUrl}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className={`${box} bg-card object-cover`}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`${box} grid place-items-center bg-tile-brand text-xl font-extrabold text-link`}
    >
      {shop.name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

/** Self-declared, so a plain grey label: never styled as verified. */
export function StudentSellerLabel() {
  return (
    <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
      Student seller
    </span>
  );
}

/** A load error: always an icon and words, and a way to try again. */
export function ShopError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-3xl border border-error/40 bg-card p-5 shadow-soft sm:flex-row sm:items-center"
    >
      <AlertCircle className="h-5 w-5 shrink-0 text-error" strokeWidth={1.8} aria-hidden />
      <p className="flex-1 text-sm">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-border bg-card px-4 text-sm font-bold transition hover:bg-accent"
      >
        <RotateCw className="h-4 w-4" strokeWidth={1.8} aria-hidden /> Try again
      </button>
    </div>
  );
}

/** One directory card: the whole card is a single link named after the shop. */
export function ShopCard({ shop, facts }: { shop: PublicShop; facts: ShopFacts }) {
  return (
    <Link
      to="/shops/$slug"
      params={{ slug: shop.slug }}
      className="group flex h-full gap-3 rounded-3xl border border-border-soft bg-card p-4 shadow-soft transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <ShopLogo shop={shop} />
      <div className="min-w-0 flex-1 space-y-1">
        <h2 className="truncate text-base font-extrabold group-hover:text-link">{shop.name}</h2>
        {facts.studentSeller && <StudentSellerLabel />}
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          <li className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} aria-hidden />
            <span className="sr-only">Campus: </span>
            <span className="truncate">{campusLabel(facts.campuses)}</span>
          </li>
          {facts.category && (
            <li className="flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} aria-hidden />
              <span className="sr-only">Category: </span>
              <span className="truncate">{facts.category}</span>
            </li>
          )}
          <li className="flex items-center gap-1.5">
            <Package className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} aria-hidden />
            {itemCountLabel(facts.productCount)}
          </li>
        </ul>
      </div>
    </Link>
  );
}
