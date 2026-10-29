import { enabledMethods, normalizePurchaseConfig } from "./purchase";
import type { PaymentOption, Product } from "./store";


/** Maps a Supabase `products` row (optionally joined with `vendors`) to the app's Product shape. */
export function mapDbProduct(row: any, overrides: Partial<Product> = {}): Product {
  const price = Number(row.price) || 0;
  const purchaseConfig = normalizePurchaseConfig(row.purchase_config);
  const methods = enabledMethods(purchaseConfig);
  const paymentOptions: PaymentOption[] = [
    "wallet", "card", "momo",
    ...(methods.includes("reservation") ? (["reserve"] as const) : []),
    ...(methods.includes("installment") || methods.includes("credit") ? (["installment"] as const) : []),
  ];
  const createdAt = row.created_at ? new Date(row.created_at).getTime() : Date.now();
  return {
    id: row.id,
    name: row.title ?? "Untitled product",
    brand: row.vendors?.store_name ?? "",
    storeId: row.vendor_id,
    storeSlug: row.vendors?.store_slug || undefined,
    category: row.category ?? "Uncategorised",
    // No stock photo: cards show a neutral placeholder when the seller added none.
    image: row.images?.[0] || "",
    images: row.images ?? [],
    price,
    // No price history is stored yet, so no "was" price, discount or demand is shown.
    originalPrice: price,
    stock: Number(row.stock) || 0,
    // Not stored yet: no location, delivery time or specs are invented.
    location: "",
    rating: 0,
    reviews: 0,
    description: row.description ?? "",
    specs: {},
    paymentOptions,
    deliveryDays: 0,
    freeDelivery: false,
    priceHistory: [{ date: new Date(createdAt).toISOString().slice(0, 10), price }],
    demand: 0,
    viewersNow: 0,
    waitingForDrop: 0,
    tags: [],
    verifiedDiscount: false,
    createdAt,
    purchaseConfig,
    listingType: row.listing_type === "student" ? "student" : "mall",
    // No campus: not tied to one, so it shows under every campus filter.
    campus: row.campus || undefined,
    condition: row.item_condition || undefined,
    ...overrides,
  };
}
