// Shared with the payments Edge Function — see supabase/functions/_shared/purchase.ts
export * from "../../../supabase/functions/_shared/purchase.ts";

import { legacyPurchaseConfig, normalizePurchaseConfig, type PurchaseConfig } from "../../../supabase/functions/_shared/purchase.ts";

/** Effective purchase config for a product (seller config, else legacy payment options). */
export function getPurchaseConfig(product: { purchaseConfig?: unknown; paymentOptions?: string[] }): PurchaseConfig {
  return product.purchaseConfig ? normalizePurchaseConfig(product.purchaseConfig) : legacyPurchaseConfig(product.paymentOptions);
}
