import { supabase } from "@/lib/supabase";

/**
 * The single deployment switch.
 * - `VITE_APP_MODE=live`: real data only. No seeded users, shops, products,
 *   wallets or promo codes, no demo sign-in, and features that aren't wired
 *   to the backend yet are hidden.
 * - Unset or anything else: demo mode (seeded in-browser data), so preview
 *   deployments stay safe by default.
 */
export const IS_LIVE = import.meta.env.VITE_APP_MODE === "live";

/** Live mode needs the Supabase client; without it the site must not quietly fall back to demo. */
export const LIVE_MISCONFIGURED = IS_LIVE && !supabase;

/** `value` in demo mode, `empty` in live mode. Used for every seeded collection. */
export function seeded<T>(value: T, empty: T): T {
  return IS_LIVE ? empty : value;
}

/**
 * Pages that aren't connected to the backend yet. In live mode every link to
 * them is hidden and a direct visit redirects (see each route's beforeLoad).
 */
export const LIVE_HIDDEN_PATHS = ["/buyer/reserve", "/buyer/installments", "/buyer/deals", "/student-os/deals"];

/** True in live mode when `to` is one of LIVE_HIDDEN_PATHS (or below it). */
export function hiddenInLive(to: string): boolean {
  return IS_LIVE && LIVE_HIDDEN_PATHS.some((p) => to === p || to.startsWith(`${p}/`));
}

/** Feature flags that stay off in live mode whatever Supabase says, until their payments are wired. */
export const LIVE_FORCED_OFF_FLAGS = ["reserve_and_pay", "take_now_pay_later"];
