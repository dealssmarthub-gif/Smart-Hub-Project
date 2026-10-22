import { supabase } from "@/lib/supabase";
import { useNaflis } from "@/lib/naflis/store";

// Staff routes decide access from the account's roles. On a direct visit
// (bookmark, typed URL, reload) those aren't loaded yet: the Supabase session
// lives in localStorage and roles come from `profiles`, which live mode never
// persists. Guards await this so a signed-in staff member isn't bounced to
// /login. It only loads; the decision (and the database's own checks) stay
// where they were.

let ready: Promise<void> | null = null;

/** Resolves once the stored session (if any) is restored and its roles are loaded. Demo / no Supabase: at once. */
export function sessionReady(): Promise<void> {
  if (!supabase || typeof window === "undefined") return Promise.resolve();
  const client = supabase;
  ready ??= (async () => {
    try {
      const { data } = await client.auth.getSession();
      const user = data.session?.user;
      if (user) await useNaflis.getState().completeSignIn(user);
    } catch {
      // offline / storage blocked: the guard decides from what's loaded
    }
  })();
  return ready;
}

/** Tests only: forget the first-load result. */
export function resetSessionReady() {
  ready = null;
}
