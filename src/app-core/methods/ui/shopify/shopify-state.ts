import type { AppState } from "../../../../types/app.ts";

type ShopifyTransientState = Pick<AppState, "shopifyConnectionStatus" | "shopifyConnectionShop" | "shopifyLastSyncedAt" | "shopifySyncError" | "shopifyShopDraft" | "showShopifyConnectDialog">;

export function resetShopifySignedOutState(state: ShopifyTransientState): void {
  state.shopifyConnectionStatus = "unconfigured";
  state.shopifyConnectionShop = null;
  state.shopifyLastSyncedAt = null;
  state.shopifySyncError = null;
  state.shopifyShopDraft = "";
  state.showShopifyConnectDialog = false;
}
