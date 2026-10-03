// ============================================================================
// UNIFIED IDENTITY — one account, many roles
// ============================================================================
// A user holds a set of roles. The store's `role` field is the *active
// context* (workspace) the user is currently operating in.

export type Role =
  | "guest"
  | "buyer"
  | "seller"
  | "student"
  | "src_head"
  | "dean"
  | "delivery"
  | "finance"
  | "dispute"
  | "admin"
  | "super_admin";

export interface RoleMeta {
  label: string;
  description: string;
  /** Landing route for this workspace. */
  home:
    | "/" | "/buyer" | "/seller" | "/student-os" | "/campus-admin"
    | "/delivery" | "/finance" | "/dispute" | "/admin" | "/super";
}

export const ROLE_META: Record<Role, RoleMeta> = {
  guest: { label: "Guest", description: "Browsing without an account", home: "/" },
  buyer: { label: "Buyer", description: "Shop the NAFLIS Mall", home: "/buyer" },
  seller: { label: "Seller", description: "Manage your shop & orders", home: "/seller" },
  student: { label: "Student", description: "Student OS & campus life", home: "/student-os" },
  src_head: { label: "SRC Executive", description: "Campus notices, events & tickets", home: "/campus-admin" },
  dean: { label: "Dean / Staff", description: "Institutional publishing & timetables", home: "/campus-admin" },
  delivery: { label: "Delivery Partner", description: "Delivery jobs & earnings", home: "/delivery" },
  finance: { label: "Finance Officer", description: "Credit & settlements", home: "/finance" },
  dispute: { label: "Dispute Officer", description: "Resolve order disputes", home: "/dispute" },
  admin: { label: "Admin", description: "Marketplace operations", home: "/admin" },
  super_admin: { label: "Super Admin", description: "Engine room & feature flags", home: "/super" },
};

/** Display order in the context switcher. */
const ROLE_ORDER: Role[] = [
  "buyer", "student", "seller", "src_head", "dean", "delivery", "finance", "dispute", "admin", "super_admin",
];

/** Maps raw / legacy role strings (e.g. the old "super") onto a known Role. */
export function normalizeRole(raw: unknown): Role {
  if (raw === "super" || raw === "superadmin") return "super_admin";
  if (typeof raw === "string" && raw in ROLE_META) return raw as Role;
  return "buyer";
}

/**
 * The full set of roles an account holds.
 * - every signed-in user is a buyer (students included)
 * - owning a shop unlocks seller
 */
export function resolveRoles(
  user: { id: string; role?: unknown; roles?: unknown[] } | null | undefined,
  stores: { ownerId: string }[] = [],
): Role[] {
  if (!user) return [];
  const held = new Set<Role>(["buyer"]);
  for (const r of user.roles ?? []) held.add(normalizeRole(r));
  if (user.role) held.add(normalizeRole(user.role));
  if (stores.some((s) => s.ownerId === user.id)) held.add("seller");
  held.delete("guest");
  return ROLE_ORDER.filter((r) => held.has(r));
}

export function roleHome(role: Role): RoleMeta["home"] {
  return ROLE_META[role]?.home ?? "/";
}
