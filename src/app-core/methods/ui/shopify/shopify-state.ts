import type { AppState } from "../../../../types/app.ts";

type ShopifyTransientState = Pick<AppState, "shopifyConnectionStatus" | "shopifyConnectionShop" | "shopifyShopDraft" | "showShopifyConnectDialog">;

export function resetShopifySignedOutState(state: ShopifyTransientState): void {
  state.shopifyConnectionStatus = "unconfigured";
  state.shopifyConnectionShop = null;
  state.shopifyShopDraft = "";
  state.showShopifyConnectDialog = false;
}
