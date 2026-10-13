import { supabase } from "@/lib/supabase";
import { mapDbProduct } from "@/lib/naflis/mapProduct";
import { useNaflis, type Product, type Store } from "@/lib/naflis/store";

// ============================================================================
// SELLER API — adapter for the external seller platform
// ============================================================================
// Sellers no longer have a workspace in this app: shops, catalogs, stock and
// fulfilment are managed on a separate seller platform. Everything the Buyer
// Marketplace and Student OS need to know about sellers goes through this file,
// so swapping the data source is a change here and nowhere else.
//
// Today the adapter reads the Supabase `products` / `vendors` tables, or the
// local demo catalog when Supabase isn't configured. Each function marks where
// the external REST endpoint replaces that read.

/**
 * Base URL of the external seller platform.
 * TODO(seller-api): set VITE_SELLER_API_URL once the platform is live and
 * branch on it in each function below (external first, Supabase as fallback).
 */
export const SELLER_API_URL = ((import.meta.env.VITE_SELLER_API_URL as string | undefined) ?? "").replace(/\/+$/, "");

/** A seller's public storefront profile. */
export type VendorProfile = Store;

export interface InventoryLevel {
  productId: string;
  stock: number;
}

/** Maps a Supabase `vendors` row to the app's Store shape. */
export function mapDbVendor(row: any, category?: string): VendorProfile {
  return {
    id: row.id,
    name: row.store_name,
    ownerId: row.user_id,
    logo: row.logo_url || `https://api.dicebear.com/9.x/notionists/svg?seed=${row.store_name}`,
    tagline: row.description || "Verified Seller",
    rating: 5.0,
    reviews: 0,
    verified: row.status === "approved",
    followers: 0,
    location: "Accra",
    categories: category ? [category] : [],
    subscription: "starter",
  };
}

/**
 * Every product from approved sellers.
 * Returns null when there is no remote catalog (demo mode) — the local catalog stands.
 */
export async function fetchSellerProducts(): Promise<Product[] | null> {
  // TODO(seller-api): GET {SELLER_API_URL}/v1/products?status=approved — map each item to Product.
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("products")
    .select("*, vendors!inner(status, store_name, logo_url, description)")
    .eq("vendors.status", "approved");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapDbProduct(row));
}

/**
 * One product with its seller's profile.
 * Returns null when it isn't in the remote catalog (or there is none) — fall back to the local catalog.
 */
export async function fetchSellerProduct(productId: string): Promise<{ product: Product; vendor: VendorProfile | null } | null> {
  // TODO(seller-api): GET {SELLER_API_URL}/v1/products/{productId}?include=vendor
  if (!supabase) return null;
  const { data, error } = await supabase.from("products").select("*, vendors(*)").eq("id", productId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { product: mapDbProduct(data), vendor: data.vendors ? mapDbVendor(data.vendors, data.category) : null };
}

/** A seller's storefront profile, or null if unknown. */
export async function fetchVendorProfile(vendorId: string): Promise<VendorProfile | null> {
  // TODO(seller-api): GET {SELLER_API_URL}/v1/vendors/{vendorId}
  const local = () => useNaflis.getState().stores.find((s) => s.id === vendorId) ?? null;
  if (!supabase) return local();
  const { data, error } = await supabase.from("vendors").select("*").eq("id", vendorId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapDbVendor(data) : local();
}

/** Current stock for the given products. Products the source doesn't know are omitted. */
export async function fetchInventory(productIds: string[]): Promise<InventoryLevel[]> {
  if (!productIds.length) return [];
  // TODO(seller-api): POST {SELLER_API_URL}/v1/inventory/query { productIds } — the
  // seller platform is the source of truth for stock once it is connected.
  const local = () =>
    useNaflis
      .getState()
      .products.filter((p) => productIds.includes(p.id))
      .map((p) => ({ productId: p.id, stock: p.stock }));
  if (!supabase) return local();
  const { data, error } = await supabase.from("products").select("id, stock").in("id", productIds);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ productId: row.id, stock: Number(row.stock) || 0 }));
}

// ---------------------------------------------------------------------------
// Inbound events from the seller platform
// ---------------------------------------------------------------------------

export type SellerWebhookEvent =
  | { type: "order.accepted"; orderId: string }
  | { type: "order.processing"; orderId: string }
  | { type: "order.ready_for_pickup"; orderId: string }
  | { type: "inventory.updated"; productId: string; stock: number }
  | { type: "product.updated"; productId: string; price?: number };

/**
 * Applies a seller-platform event to local state.
 *
 * TODO(seller-api): the seller platform will POST these to a server webhook
 * endpoint (e.g. a Supabase function at /functions/v1/seller-webhook) that
 * verifies the signature and writes to the database. Until then this is the
 * only way seller-side fulfilment steps (accept → processing → ready) happen,
 * so nothing calls it in production yet.
 */
export function applySellerWebhookEvent(event: SellerWebhookEvent): void {
  const s = useNaflis.getState();
  switch (event.type) {
    case "order.accepted":
      return s.sellerAcceptOrder(event.orderId);
    case "order.processing":
      return s.sellerStartPreparing(event.orderId);
    case "order.ready_for_pickup":
      return s.sellerMarkReady(event.orderId);
    case "inventory.updated":
      useNaflis.setState((st) => ({
        products: st.products.map((p) => (p.id === event.productId ? { ...p, stock: Math.max(0, event.stock) } : p)),
      }));
      return;
    case "product.updated": {
      const price = event.price;
      if (price === undefined || !(price > 0)) return;
      useNaflis.setState((st) => ({
        products: st.products.map((p) => (p.id === event.productId ? { ...p, price } : p)),
      }));
      return;
    }
  }
}
