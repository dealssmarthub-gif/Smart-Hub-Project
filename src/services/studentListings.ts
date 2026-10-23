import { supabase } from "@/lib/supabase";
import { useNaflis, type StudentItemCondition, type StudentListing } from "@/lib/naflis/store";
import { mapDbProduct } from "@/lib/naflis/mapProduct";
import { revealSellerPhone } from "@/services/sellerContact";

// Student marketplace listings in Supabase (migration 20261021120000). A listing
// is a `products` row with listing_type = 'student', owned by the seller's
// vendor. A student without a vendor gets one on their first listing; it starts
// pending, and its listings appear once an admin approves it (Super Admin →
// Vendors). Buyers contact the seller on the vendor's contact phone, which the
// app gets only from services/sellerContact (never from the vendors table);
// there is no fallback number.

/** Same rule as the vendors.contact_phone CHECK constraint. */
export const PHONE_PATTERN = /^\+?[0-9][0-9 ()-]{6,19}$/;

export type VendorStatus = "pending" | "approved" | "rejected";

export interface OwnVendor {
  id: string;
  status: VendorStatus;
  storeName: string;
  contactPhone: string | null;
}

/** Maps a `products` row joined with `vendors(store_name)` (public columns only). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped Supabase row, like mapDbProduct
export function mapDbStudentListing(row: any): StudentListing {
  const price = Number(row.price) || 0;
  const original = row.original_price == null ? undefined : Number(row.original_price);
  const images: string[] = row.images ?? [];
  return {
    id: row.id,
    title: row.title,
    category: row.category ?? "",
    price,
    originalPrice: original !== undefined && original > price ? original : undefined,
    campus: row.campus,
    condition: row.item_condition as StudentItemCondition,
    sellerName: row.vendors?.store_name ?? "",
    // The owner id and phone aren't public: contact goes through the vendor id.
    sellerId: "",
    vendorId: row.vendor_id,
    image: images[0] ?? "",
    images,
    description: row.description ?? "",
    hostelLocation: row.meetup_location ?? undefined,
    // Student verification isn't stored server-side yet, so no listing claims it.
    isVerifiedStudent: false,
    createdAt: new Date(row.created_at).getTime(),
  };
}

/** Listings from approved vendors. Null without Supabase. */
export async function fetchStudentListings(): Promise<StudentListing[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("products")
    .select("*, vendors!inner(status, store_name)")
    .eq("listing_type", "student")
    .eq("vendors.status", "approved")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapDbStudentListing);
}

/** Replaces the store's listings with what Supabase holds (live mode). */
export async function syncStudentListings(): Promise<void> {
  const rows = await fetchStudentListings();
  if (rows) useNaflis.setState({ studentListings: rows });
}

export async function fetchOwnVendor(userId: string): Promise<OwnVendor | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("vendors")
    .select("id, status, store_name")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  // The seller's own phone: from the database function (never counted for the owner).
  const own = await revealSellerPhone(data.id);
  return {
    id: data.id,
    status: data.status,
    storeName: data.store_name,
    contactPhone: own.ok ? own.phone : null,
  };
}

export interface NewStudentListing {
  title: string;
  description: string;
  category: string;
  price: number;
  originalPrice?: number;
  /** "student" for a self-declared student (campus required), "mall" for anyone else. */
  listingType?: "student" | "mall";
  /** Required for student listings; null = not tied to a campus (mall listings only). */
  campus: string | null;
  condition: StudentItemCondition;
  meetupLocation?: string;
  images: string[];
  /** Shown to buyers on every listing of this seller. Empty removes it (the form starts with the current number). */
  contactPhone?: string;
  /** Shop name used if this is the seller's first listing. */
  sellerName: string;
}

/**
 * Saves a listing for the signed-in user (fixes known issue #41).
 * Creates their vendor on the first listing. Throws with a readable message on any failure.
 */
export async function createStudentListing(
  input: NewStudentListing,
): Promise<{ listing: StudentListing; vendor: OwnVendor }> {
  if (!supabase)
    throw new Error("Listings can't be saved: the site isn't connected to its database.");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in to list an item.");

  const phone = input.contactPhone?.trim() || null;
  if (phone && !PHONE_PATTERN.test(phone))
    throw new Error(
      "Enter the phone number with digits only, e.g. 024 123 4567 or +233 24 123 4567.",
    );

  let vendor = await fetchOwnVendor(user.id);
  if (!vendor) {
    const { data, error } = await supabase
      .from("vendors")
      .insert({
        user_id: user.id,
        store_name: input.sellerName.trim() || "Seller",
        store_slug: `seller-${user.id}`,
        contact_phone: phone,
      })
      .select("id, status, store_name")
      .single();
    if (error) throw new Error(`Couldn't set up your seller account: ${error.message}`);
    vendor = {
      id: data.id,
      status: data.status,
      storeName: data.store_name,
      contactPhone: phone,
    };
  } else if (phone !== vendor.contactPhone) {
    const { error } = await supabase
      .from("vendors")
      .update({ contact_phone: phone })
      .eq("id", vendor.id);
    if (error) throw new Error(`Couldn't save your phone number: ${error.message}`);
    vendor = { ...vendor, contactPhone: phone };
  }
  const listingType = input.listingType ?? "student";
  if (listingType === "student" && !input.campus) throw new Error("Choose your campus.");
  if (vendor.status === "rejected")
    throw new Error("Your seller account wasn't approved, so new listings can't be posted.");

  const { data, error } = await supabase
    .from("products")
    .insert({
      vendor_id: vendor.id,
      title: input.title,
      description: input.description,
      price: input.price,
      original_price: input.originalPrice ?? null,
      category: input.category,
      images: input.images,
      stock: 1,
      listing_type: listingType,
      campus: input.campus || null,
      item_condition: input.condition,
      meetup_location: input.meetupLocation || null,
    })
    .select("*")
    .single();
  if (error) throw new Error(`Couldn't save your listing: ${error.message}`);

  const listing = mapDbStudentListing({
    ...data,
    vendors: { store_name: vendor.storeName },
  });
  // Only approved sellers' listings are public; a pending seller's listing waits for approval.
  if (vendor.status === "approved") {
    // One marketplace: the mall list shows it at once; Student OS keeps its student list.
    const product = mapDbProduct({
      ...data,
      vendors: { status: vendor.status, store_name: vendor.storeName },
    });
    useNaflis.setState((s) => ({
      products: [product, ...s.products],
      studentListings:
        listingType === "student" ? [listing, ...s.studentListings] : s.studentListings,
    }));
  }
  return { listing, vendor };
}

/** Removes the signed-in seller's contact phone from all their listings. */
export async function clearOwnContactPhone(): Promise<void> {
  if (!supabase) throw new Error("Not connected to the database.");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in first.");
  const { data, error } = await supabase
    .from("vendors")
    .update({ contact_phone: null })
    .eq("user_id", user.id)
    .select("id");
  if (error) throw new Error(`Couldn't remove your number: ${error.message}`);
  if (!data?.length) throw new Error("You don't have a seller account yet.");
  // Nothing to update locally: listings never carry the phone in live mode.
}
