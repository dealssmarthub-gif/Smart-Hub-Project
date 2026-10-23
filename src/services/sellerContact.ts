import { supabase } from "@/lib/supabase";

// A seller's contact phone, for a signed-in user, from the database function
// naflis_vendor_contact (migration 20261024120000). The app never reads
// vendors.contact_phone directly: anonymous visitors can't, and signed-in
// users get at most 50 different sellers a day, each reveal recorded. The
// seller themselves and admins are answered every time, uncounted.

export type ContactResult =
  | { ok: true; phone: string | null }
  | { ok: false; reason: "sign_in" | "limit" | "not_found" | "error"; message: string };

/** Matches naflis_contact_daily_limit() in the migration (for messages only). */
export const CONTACT_DAILY_LIMIT = 50;

export async function revealSellerPhone(vendorId: string): Promise<ContactResult> {
  if (!supabase) return { ok: false, reason: "error", message: "Not connected to the database." };
  const { data, error } = await supabase.rpc("naflis_vendor_contact", { p_vendor: vendorId });
  if (!error) return { ok: true, phone: typeof data === "string" && data.trim() ? data : null };
  const m = error.message ?? "";
  if (m.includes("sign_in_required") || error.code === "42501")
    return { ok: false, reason: "sign_in", message: "Sign in to see the seller's number." };
  if (m.includes("daily_limit"))
    return {
      ok: false,
      reason: "limit",
      message: `You've seen ${CONTACT_DAILY_LIMIT} sellers' numbers today. Try again tomorrow.`,
    };
  if (m.includes("not_found"))
    return { ok: false, reason: "not_found", message: "This seller isn't available right now." };
  return { ok: false, reason: "error", message: "Couldn't load the seller's number. Try again." };
}
