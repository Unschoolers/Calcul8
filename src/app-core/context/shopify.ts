import type { AppState } from "../../types/app.ts";
import type { ScopedApiContext } from "./api.ts";
import type { FeatureMethodImplementation, RuntimeMethodState } from "./runtime.ts";
import type { WorkspaceComputedState } from "./workspace.ts";

export interface ShopifyMethodState {
  refreshShopifyBindings(): Promise<void>;
  resetShopifyBindings(): void;
  refreshShopifyStatus(): Promise<void>;
  openShopifyConnectDialog(): void;
  connectShopify(): Promise<void>;
  disconnectShopify(): Promise<void>;
}

export type ShopifyMethodContext = ScopedApiContext &
  Pick<AppState, "activeScopeType" | "activeWorkspaceId" | "googleAuthEpoch" | "shopifyConnectionStatus" | "shopifyConnectionShop" | "shopifyLastSyncedAt" | "shopifySyncError" | "shopifyShopDraft" | "showShopifyConnectDialog" | "shopifyBindingsSummary" | "shopifyBindingsStatus" | "shopifyBindingsStale" | "shopifyBindingsScope"> &
  Pick<WorkspaceComputedState, "isCurrentWorkspaceOwner"> &
  Pick<RuntimeMethodState, "notify"> & Pick<ShopifyMethodState, "refreshShopifyBindings" | "resetShopifyBindings">;

export type ShopifyMethodImplementation = FeatureMethodImplementation<ShopifyMethodContext, Omit<ShopifyMethodState, "refreshShopifyBindings" | "resetShopifyBindings">>;
export type ShopifyBindingMethodImplementation = FeatureMethodImplementation<ShopifyMethodContext, Pick<ShopifyMethodState, "refreshShopifyBindings" | "resetShopifyBindings">>;
