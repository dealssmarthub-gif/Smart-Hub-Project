/**
 * Browsing NAFLIS Mall is open to everyone: the mall home, categories, search
 * and product pages. Account pages (wishlist, and those hidden in live mode)
 * still need sign-in.
 */
export function isPublicMallPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/";
  return (
    p === "/buyer" ||
    p === "/buyer/categories" ||
    p === "/buyer/search" ||
    /^\/buyer\/product\/[^/]+$/.test(p)
  );
}
