import { supabase } from "@/lib/supabase";
import { PHONE_PATTERN, type VendorStatus } from "@/services/studentListings";

// Admin vendor management (Super Admin → Vendors). RLS from migration
// 20261021120000 lets admins and super admins read every vendor, create one for
// any user and change its status; everyone else is refused by the database.

export interface AdminVendor {
  id: string;
  storeName: string;
  status: VendorStatus;
  contactPhone: string | null;
  ownerEmail: string;
  ownerName: string;
  productCount: number;
  createdAt: string;
}

function client() {
  if (!supabase) throw new Error("Not connected to the database.");
  return supabase;
}

export async function listVendors(): Promise<AdminVendor[]> {
  const db = client();
  const { data, error } = await db
    .from("vendors")
    .select("id, store_name, status, contact_phone, user_id, created_at, products(count)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const ids = [...new Set((data ?? []).map((v) => v.user_id))];
  // Staff can read profiles (migration 20261015121000); owners shown by email.
  const { data: owners } = ids.length
    ? await db.from("profiles").select("id, email, full_name").in("id", ids)
    : { data: [] as { id: string; email: string; full_name: string }[] };
  const byId = new Map((owners ?? []).map((o) => [o.id, o]));
  return (data ?? []).map((v) => ({
    id: v.id,
    storeName: v.store_name,
    status: v.status,
    contactPhone: v.contact_phone,
    ownerEmail: byId.get(v.user_id)?.email ?? "",
    ownerName: byId.get(v.user_id)?.full_name ?? "",
    productCount: v.products?.[0]?.count ?? 0,
    createdAt: v.created_at,
  }));
}

export async function setVendorStatus(vendorId: string, status: VendorStatus): Promise<void> {
  const { data, error } = await client()
    .from("vendors")
    .update({ status })
    .eq("id", vendorId)
    .select("status");
  if (error) throw new Error(error.message);
  // RLS hides rows you can't change; the trigger keeps the old status for non-admins.
  if (!data?.length || data[0].status !== status)
    throw new Error("You don't have permission to change this vendor.");
}

/** Creates a pending vendor owned by the account with this email. */
export async function createVendorFor(input: {
  ownerEmail: string;
  storeName: string;
  contactPhone?: string;
}): Promise<void> {
  const db = client();
  const email = input.ownerEmail.trim().toLowerCase();
  const phone = input.contactPhone?.trim() || null;
  if (!input.storeName.trim()) throw new Error("Enter a shop name.");
  if (phone && !PHONE_PATTERN.test(phone))
    throw new Error("Enter the phone number with digits only, e.g. 024 123 4567.");
  const { data: owner, error: ownerError } = await db
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (ownerError) throw new Error(ownerError.message);
  if (!owner)
    throw new Error(`No account uses ${email}. The owner needs to have signed in at least once.`);
  const { error } = await db.from("vendors").insert({
    user_id: owner.id,
    store_name: input.storeName.trim(),
    store_slug: `${input.storeName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")}-${owner.id.slice(0, 8)}`,
    contact_phone: phone,
  });
  if (error) {
    if (error.code === "23505") throw new Error("That account already has a vendor.");
    throw new Error(error.message);
  }
}
