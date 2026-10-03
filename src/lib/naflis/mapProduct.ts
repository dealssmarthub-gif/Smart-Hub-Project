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
    originalPrice: Math.round(price * 1.2),
    stock: Number(row.stock) || 0,
    location: "Accra",
    rating: 0,
    reviews: 0,
    description: row.description ?? "",
    specs: { Warranty: "Seller warranty", Condition: "New" },
    paymentOptions,
    deliveryDays: 3,
    freeDelivery: false,
    priceHistory: [0.15, 0.1, 0.05, 0].map((f, i) => ({
      date: new Date(createdAt + i * 4 * 86_400_000).toISOString().slice(0, 10),
      price: Math.round(price * (1 + f)),
    })),
    demand: 75,
    viewersNow: 0,
    waitingForDrop: 0,
    tags: [],
    verifiedDiscount: false,
    createdAt,
    purchaseConfig,
    ...overrides,
  };
}
