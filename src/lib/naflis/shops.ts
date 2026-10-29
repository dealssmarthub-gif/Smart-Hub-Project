import { inCampus } from "@/lib/naflis/campusFilter";
import type { Product } from "@/lib/naflis/store";

// The shops directory. The vendors table holds only the name, address,
// description and logo; everything else a shop card shows comes from the
// shop's visible (approved) products, so nothing is stored twice or invented.

export interface ShopFacts {
  /** Campuses the shop lists items at; empty means not tied to one ("All campuses"). */
  campuses: string[];
  /** Its most common product category, or null with no items. */
  category: string | null;
  productCount: number;
  /** It has student listings: a plain "Student seller" label, never shown as verified. */
  studentSeller: boolean;
}

export function shopFacts(shopId: string, products: Product[]): ShopFacts {
  const mine = products.filter((p) => p.storeId === shopId);
  const counts = new Map<string, number>();
  for (const p of mine) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  // Most items first; a tie goes to the name that sorts first, so the card never flickers.
  const category =
    [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
  return {
    campuses: [...new Set(mine.map((p) => p.campus).filter((c): c is string => Boolean(c)))].sort(
      (a, b) => a.localeCompare(b),
    ),
    category,
    productCount: mine.length,
    studentSeller: mine.some((p) => p.listingType === "student"),
  };
}

/** "All campuses", one campus, or "UG - Legon +2". */
export function campusLabel(campuses: string[]): string {
  if (campuses.length === 0) return "All campuses";
  return campuses.length === 1 ? campuses[0] : `${campuses[0]} +${campuses.length - 1}`;
}

/**
 * Directory filter. Search matches the name, description and category. A shop
 * is at a campus when any of its items would show there (the mall's campus
 * rule: items without a campus show under every campus). A shop with no items
 * yet shows only under "All campuses".
 */
export function filterShops<T extends { id: string; name: string; description: string }>(
  shops: T[],
  products: Product[],
  query: string,
  campus: string | null,
): T[] {
  const q = query.trim().toLowerCase();
  return shops.filter((s) => {
    const mine = products.filter((p) => p.storeId === s.id);
    if (campus && !mine.some((p) => inCampus(p, campus))) return false;
    if (!q) return true;
    const hay = `${s.name} ${s.description} ${mine.map((p) => p.category).join(" ")}`;
    return hay.toLowerCase().includes(q);
  });
}

export function itemCountLabel(n: number): string {
  if (n === 0) return "No items yet";
  return n === 1 ? "1 item" : `${n} items`;
}
