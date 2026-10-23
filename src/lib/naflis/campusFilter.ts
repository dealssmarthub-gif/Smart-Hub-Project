import { useNaflis } from "@/lib/naflis/store";

// One marketplace, one campus filter. Items with no campus aren't tied to one
// and show under every campus; items with a campus (every student listing has
// one) show only at their campus. Display only: never used for access.

/** Does `item` belong in the list for `campus` (null = all campuses)? */
export function inCampus(item: { campus?: string | null }, campus: string | null): boolean {
  return !campus || !item.campus || item.campus === campus;
}

export function filterByCampus<T extends { campus?: string | null }>(
  items: T[],
  campus: string | null,
): T[] {
  return items.filter((i) => inCampus(i, campus));
}

/** The campuses that actually have listings, for the filter's options. */
export function campusOptions(items: { campus?: string | null }[]): string[] {
  return [...new Set(items.map((i) => i.campus).filter((c): c is string => Boolean(c)))].sort(
    (a, b) => a.localeCompare(b),
  );
}

/**
 * The campus the mall is filtered to. Until the visitor picks one, a signed-in
 * student starts at their own campus (`defaultCampus`); everyone else sees all.
 */
export function useMallCampus(
  defaultCampus: string | null = null,
): [string | null, (c: string | null) => void] {
  const chosen = useNaflis((s) => s.mallCampus);
  const set = useNaflis((s) => s.setMallCampus);
  return [chosen === undefined ? defaultCampus : chosen, set];
}
