import { useSyncExternalStore } from "react";
import { z } from "zod";

// The order of the mall's product lists. By default a shuffle that is fixed for
// the browser session: each item's place comes from a hash of (session seed,
// item id), so scrolling, "Show more" and a background refetch never reorder
// what is already on screen. An explicit sort the visitor picks overrides it.

export const MALL_SORTS = ["mixed", "newest", "price-asc", "price-desc"] as const;
export type MallSort = (typeof MALL_SORTS)[number];

export const MALL_SORT_LABELS: Record<MallSort, string> = {
  mixed: "Mixed",
  newest: "Newest",
  "price-asc": "Price: low to high",
  "price-desc": "Price: high to low",
};

/** `?sort=` on the mall's lists; anything unknown falls back to the shuffle. */
export const mallSortSearch = z.object({
  sort: z.enum(MALL_SORTS).optional().catch(undefined),
});

/** 32-bit FNV-1a, then a final mix so nearby ids spread out. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return h >>> 0;
}

/** The same seed always gives the same order, whatever order the items arrive in. */
export function seededShuffle<T extends { id: string }>(items: T[], seed: number): T[] {
  const keyed = items.map((item) => ({ item, k: hash(`${seed}:${item.id}`) }));
  keyed.sort((a, b) => a.k - b.k || (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0));
  return keyed.map((x) => x.item);
}

export function orderProducts<T extends { id: string; price: number; createdAt?: number }>(
  items: T[],
  sort: MallSort,
  seed: number,
): T[] {
  // Ties keep the shuffled order, so equal prices don't always list the same seller first.
  const mixed = seededShuffle(items, seed);
  if (sort === "newest") return mixed.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (sort === "price-asc") return mixed.sort((a, b) => a.price - b.price);
  if (sort === "price-desc") return mixed.sort((a, b) => b.price - a.price);
  return mixed;
}

const SEED_KEY = "naflis.mallSeed";
let sessionSeed: number | null = null;

/** One seed per browser session (sessionStorage); per page load when storage is blocked. */
function readSeed(): number {
  if (sessionSeed !== null) return sessionSeed;
  try {
    const stored = sessionStorage.getItem(SEED_KEY);
    if (stored && /^\d+$/.test(stored)) return (sessionSeed = Number(stored));
  } catch {
    // Private window or blocked storage: the seed lasts for this page load.
  }
  sessionSeed = Math.floor(Math.random() * 2 ** 32);
  try {
    sessionStorage.setItem(SEED_KEY, String(sessionSeed));
  } catch {
    // As above.
  }
  return sessionSeed;
}

const noSubscribe = () => () => {};

/** The session's shuffle seed. The server render uses 0 and the browser takes over on hydration. */
export function useSessionSeed(): number {
  return useSyncExternalStore(noSubscribe, readSeed, () => 0);
}
