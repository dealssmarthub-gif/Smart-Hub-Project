import { enabledMethods, normalizePurchaseConfig } from "./purchase";
import type { PaymentOption, Product } from "./store";

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1523275335684-37898b6baf30";

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
    category: row.category ?? "Uncategorised",
    image: row.images?.[0] || FALLBACK_IMAGE,
    images: row.images ?? [],
    price,
    // No price history is stored yet, so no "was" price, discount or demand is shown.
    originalPrice: price,
    stock: Number(row.stock) || 0,
    location: "Accra",
    rating: 0,
    reviews: 0,
    description: row.description ?? "",
    specs: { Warranty: "Seller warranty", Condition: "New" },
    paymentOptions,
    deliveryDays: 3,
    freeDelivery: false,
    priceHistory: [{ date: new Date(createdAt).toISOString().slice(0, 10), price }],
    demand: 0,
    viewersNow: 0,
    waitingForDrop: 0,
    tags: [],
    verifiedDiscount: false,
    createdAt,
    purchaseConfig,
    ...overrides,
  };
}
