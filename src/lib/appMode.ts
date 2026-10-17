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
