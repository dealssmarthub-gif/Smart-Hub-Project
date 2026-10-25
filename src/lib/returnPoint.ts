// Where to send someone after they sign in or confirm their email. With email
// confirmation on, sign-up ends in "check your email" and the link in that
// email opens the site's home page, so the page they were on (a listing, Sell)
// is remembered here and taken once they come back signed in.
// Only same-site relative paths are ever used: never another site.

const KEY = "naflis-return-to";
/** A confirmation link opened later than this goes to the home page. */
export const RETURN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** The path if it's a same-site relative path (e.g. "/buyer/product/x?y=1"), else null. */
export function safeReturnPath(path: unknown): string | null {
  if (typeof path !== "string" || path.length > 512) return null;
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return null;
  // No control characters or backslashes (browsers treat "\" like "/").
  if ([...path].some((ch) => ch < " " || ch === "\u007f" || ch === "\\")) return null;
  try {
    // Resolving against a dummy origin must stay on that origin.
    const u = new URL(path, "https://same.site");
    if (u.origin !== "https://same.site") return null;
  } catch {
    return null;
  }
  return path;
}

export function rememberReturnPath(path: unknown, now = Date.now()): void {
  const safe = safeReturnPath(path);
  try {
    if (safe) localStorage.setItem(KEY, JSON.stringify({ path: safe, at: now }));
    else localStorage.removeItem(KEY);
  } catch {
    // storage unavailable: they land on the home page
  }
}

export function clearReturnPath(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}

/** The remembered path, once: it's cleared whether or not it's still usable. */
export function takeReturnPath(now = Date.now()): string | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const { path, at } = JSON.parse(raw) as { path?: unknown; at?: unknown };
    if (typeof at !== "number" || now - at > RETURN_MAX_AGE_MS || at > now) return null;
    return safeReturnPath(path);
  } catch {
    return null;
  }
}
