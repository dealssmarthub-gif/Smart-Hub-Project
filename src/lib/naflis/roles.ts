// ============================================================================
// UNIFIED IDENTITY — one account, many roles
// ============================================================================
// A user holds a set of roles. The store's `role` field is the *active
// context* (workspace) the user is currently operating in.

export type Role =
  | "guest"
  | "buyer"
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
    | "/" | "/buyer" | "/student-os" | "/campus-admin"
    | "/delivery" | "/finance" | "/dispute" | "/admin" | "/super";
}

export const ROLE_META: Record<Role, RoleMeta> = {
  guest: { label: "Guest", description: "Browsing without an account", home: "/" },
  buyer: { label: "Buyer", description: "Shop the NAFLIS Mall", home: "/buyer" },
  student: { label: "Student", description: "Student OS & campus life", home: "/student-os" },
  src_head: { label: "SRC Executive", description: "Campus notices, events & tickets", home: "/campus-admin" },
  dean: { label: "Dean / Staff", description: "Institutional publishing & timetables", home: "/campus-admin" },
  delivery: { label: "Delivery Partner", description: "Delivery jobs & earnings", home: "/delivery" },
  finance: { label: "Finance Officer", description: "Credit & settlements", home: "/finance" },
  dispute: { label: "Dispute Officer", description: "Resolve order disputes", home: "/dispute" },
  admin: { label: "Admin", description: "Marketplace operations", home: "/admin" },
  super_admin: { label: "Super Admin", description: "Engine room & feature flags", home: "/super" },
};

/**
 * Institutional publishers. Their portal (/campus-admin) is reached only by its
 * own URL (bookmark, invite link, sign-in redirect), never from buyer or
 * student navigation, menus or the workspace switcher.
 */
export const INSTITUTIONAL_ROLES: readonly Role[] = ["src_head", "dean"];

export function isInstitutionalRole(role: Role): boolean {
  return INSTITUTIONAL_ROLES.includes(role);
}

/** Display order in the context switcher. */
const ROLE_ORDER: Role[] = [
  "buyer", "student", "src_head", "dean", "delivery", "finance", "dispute", "admin", "super_admin",
];

/**
 * Maps raw / legacy role strings (e.g. the old "super") onto a known Role.
 * Accounts created as "seller" before sellers moved to the external platform
 * (see services/sellerApi.ts) are plain buyers here.
 */
export function normalizeRole(raw: unknown): Role {
  if (raw === "super" || raw === "superadmin") return "super_admin";
  if (typeof raw === "string" && raw in ROLE_META) return raw as Role;
  return "buyer";
}

/**
 * The full set of roles an account holds.
 * Every signed-in user is a buyer (students included).
 */
export function resolveRoles(
  user: { id: string; role?: unknown; roles?: unknown[] } | null | undefined,
): Role[] {
  if (!user) return [];
  const held = new Set<Role>(["buyer"]);
  for (const r of user.roles ?? []) held.add(normalizeRole(r));
  if (user.role) held.add(normalizeRole(user.role));
  held.delete("guest");
  return ROLE_ORDER.filter((r) => held.has(r));
}

/**
 * Workspace a fresh sign-in starts in: Student when the account holds it,
 * otherwise Buyer (every account is a buyer). Staff workspaces are one switch
 * away in the context switcher — never the default.
 */
export function defaultContext(held: Role[]): Role {
  return held.includes("student") ? "student" : "buyer";
}

/** Where to go after signing in: a same-site ?redirect wins, else the active workspace's home. */
export function postSignInPath(role: Role, redirect?: string): string {
  // Only relative, same-origin paths — "//evil.com" or "https://…" would be an open redirect.
  if (redirect && redirect.startsWith("/") && !redirect.startsWith("//") && !redirect.startsWith("/\\")) return redirect;
  return roleHome(role);
}

export function roleHome(role: Role): RoleMeta["home"] {
  return ROLE_META[role]?.home ?? "/";
}
