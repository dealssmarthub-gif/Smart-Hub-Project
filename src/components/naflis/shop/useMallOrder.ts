import { useNavigate, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { MALL_SORTS, orderProducts, useSessionSeed, type MallSort } from "@/lib/naflis/mallOrder";

/**
 * A mall list in its order: the session's shuffle, or the sort in `?sort=` (so
 * it survives going to a product and back). The route must accept `mallSortSearch`.
 */
export function useMallOrder<T extends { id: string; price: number; createdAt?: number }>(
  items: T[],
) {
  const seed = useSessionSeed();
  const raw = (useSearch({ strict: false }) as { sort?: string }).sort;
  const sort: MallSort = MALL_SORTS.includes(raw as MallSort) ? (raw as MallSort) : "mixed";
  const navigate = useNavigate();
  const setSort = (next: MallSort) =>
    navigate({
      to: ".",
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        sort: next === "mixed" ? undefined : next,
      }),
      replace: true,
      resetScroll: false,
    } as never);
  const ordered = useMemo(() => orderProducts(items, sort, seed), [items, sort, seed]);
  return { ordered, sort, setSort };
}

/** Shows `pageSize` items, then "Show more" adds the next page (the order never changes). */
export function usePaged<T>(items: T[], pageSize = 24) {
  const [count, setCount] = useState(pageSize);
  return {
    visible: items.slice(0, count),
    hasMore: items.length > count,
    remaining: Math.max(0, items.length - count),
    showMore: () => setCount((c) => c + pageSize),
  };
}
