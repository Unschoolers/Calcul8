import type { AppState } from "../../types/app.ts";
import type { ScopedApiContext } from "./api.ts";
import type { FeatureMethodImplementation, RuntimeMethodState } from "./runtime.ts";
import type { WorkspaceComputedState } from "./workspace.ts";

export interface ShopifyMethodState {
  refreshShopifyStatus(): Promise<void>;
  openShopifyConnectDialog(): void;
  connectShopify(): Promise<void>;
  disconnectShopify(): Promise<void>;
}

export type ShopifyMethodContext = ScopedApiContext &
  Pick<AppState, "activeScopeType" | "activeWorkspaceId" | "googleAuthEpoch" | "shopifyConnectionStatus" | "shopifyConnectionShop" | "shopifyLastSyncedAt" | "shopifySyncError" | "shopifyShopDraft" | "showShopifyConnectDialog"> &
  Pick<WorkspaceComputedState, "isCurrentWorkspaceOwner"> &
  Pick<RuntimeMethodState, "notify">;

export type ShopifyMethodImplementation = FeatureMethodImplementation<ShopifyMethodContext, ShopifyMethodState>;
