import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// ============================================================================
// DYNAMIC CATEGORY ENGINE
// ============================================================================
// Categories are rows in the Supabase `categories` table (self-referencing via
// parent_id). The fallback tree below keeps the app working offline, in demo
// mode, and before the table has been migrated.

export type CategoryScope = "mall" | "student";

export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  /** lucide icon name, optional */
  icon?: string;
  scope: CategoryScope | "both";
  sortOrder: number;
}

export interface CategoryNode extends Category {
  children: CategoryNode[];
}

const slugify = (name: string) => name.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function defineTree(scope: CategoryScope, tree: [name: string, icon: string, children?: string[]][]): Category[] {
  const out: Category[] = [];
  tree.forEach(([name, icon, children], i) => {
    const id = `${scope}-${slugify(name)}`;
    out.push({ id, name, slug: slugify(name), parentId: null, icon, scope, sortOrder: i });
    children?.forEach((child, j) => {
      out.push({ id: `${scope}-${slugify(child)}`, name: child, slug: slugify(child), parentId: id, scope, sortOrder: j });
    });
  });
  return out;
}

export const FALLBACK_CATEGORIES: Category[] = [
  ...defineTree("mall", [
    ["Food & Meals", "UtensilsCrossed", ["Groceries", "Cooked Meals", "Snacks & Drinks"]],
    ["Electronics", "Smartphone", ["Phones", "Laptops", "Gaming", "Office Equipment"]],
    ["Fashion", "Shirt", ["Shoes", "Beauty"]],
    ["Home & Living", "Sofa", ["Home Appliances", "Furniture", "Home Improvement"]],
    ["Laundry Services", "WashingMachine", ["Wash & Fold", "Dry Cleaning", "Ironing"]],
    ["Accommodation", "BedDouble", ["Hostels", "Apartments", "Short Stays"]],
    ["School Supplies", "BookOpen"],
    ["Health & Wellness", "HeartPulse"],
    ["Baby Products", "Baby"],
    ["Automotive", "Car"],
    ["Travel", "Plane"],
  ]),
  ...defineTree("student", [
    ["Textbooks & Course Notes", "BookOpen"],
    ["Laptops & Tech Gadgets", "Laptop"],
    ["Hostel & Room Essentials", "BedDouble"],
    ["Campus Thrift & Fashion", "Shirt"],
    ["Electronics & Accessories", "Smartphone"],
    ["Bikes & Commuting", "Bike"],
    ["Services & Tutoring", "GraduationCap"],
  ]),
];

const CACHE_KEY = "naflis-categories-v1";

function readCache(): Category[] | null {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(CACHE_KEY) : null;
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

/** Last successful fetch if there is one, otherwise the built-in tree. */
export function getCachedCategories(): Category[] {
  return readCache() ?? FALLBACK_CATEGORIES;
}

/** Fetches the hierarchy from Supabase; never throws — falls back to cache/defaults. */
export async function fetchCategories(): Promise<Category[]> {
  if (!supabase) return getCachedCategories();
  try {
    const { data, error } = await supabase.from("categories").select("*").order("sort_order", { ascending: true });
    if (error || !data || data.length === 0) return getCachedCategories();
    const mapped: Category[] = data
      .filter((c) => c.is_active !== false)
      .map((c) => ({
        id: String(c.id),
        name: c.name,
        slug: c.slug ?? slugify(c.name),
        parentId: c.parent_id ? String(c.parent_id) : null,
        icon: c.icon ?? undefined,
        scope: c.scope === "student" || c.scope === "both" ? c.scope : "mall",
        sortOrder: c.sort_order ?? 0,
      }));
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(mapped));
    } catch {
      // storage unavailable — cache is best-effort
    }
    return mapped;
  } catch {
    return getCachedCategories();
  }
}

export function buildCategoryTree(categories: Category[], scope?: CategoryScope): CategoryNode[] {
  const inScope = categories.filter((c) => !scope || c.scope === scope || c.scope === "both");
  const nodes = new Map<string, CategoryNode>(inScope.map((c) => [c.id, { ...c, children: [] }]));
  const roots: CategoryNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    (parent ? parent.children : roots).push(node);
  }
  const sort = (list: CategoryNode[]) => {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    list.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}

/** Depth-first list, parents before their children — for selects. */
export function flattenTree(tree: CategoryNode[], depth = 0): { node: CategoryNode; depth: number }[] {
  return tree.flatMap((node) => [{ node, depth }, ...flattenTree(node.children, depth + 1)]);
}

/** Names matched by picking `name`: the category itself plus all its descendants. */
export function categoryFamily(tree: CategoryNode[], name: string): string[] {
  const hit = flattenTree(tree).find(({ node }) => node.name === name)?.node;
  return hit ? flattenTree([hit]).map(({ node }) => node.name) : [name];
}

export function useCategories(scope: CategoryScope) {
  const { data = FALLBACK_CATEGORIES } = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
    placeholderData: FALLBACK_CATEGORIES,
    staleTime: 5 * 60_000,
  });

  return useMemo(() => {
    const tree = buildCategoryTree(data, scope);
    const flat = flattenTree(tree);
    return { tree, flat, names: flat.map(({ node }) => node.name) };
  }, [data, scope]);
}
