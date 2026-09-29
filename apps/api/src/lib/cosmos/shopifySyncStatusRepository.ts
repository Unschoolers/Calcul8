import type { ApiConfig } from "../../types";
import { getContainers, isNotFoundError, withCosmosRetry } from "./core";

export type ShopifySyncStatus = {
  scopeKey: string; shop: string; lastSyncedAt: string | null; lastAttemptAt: string; lastError: string | null;
};
type StatusDocument = ShopifySyncStatus & { id: string; userId: string; docType: "shopify_sync_status" };
const statusId = (scopeKey: string) => `shopify_sync_status:${scopeKey}`;

export async function getShopifySyncStatus(config: ApiConfig, scopeKey: string): Promise<ShopifySyncStatus | null> {
  const { entitlements } = getContainers(config);
  try {
    const { resource } = await withCosmosRetry(() => entitlements.item(statusId(scopeKey), scopeKey).read<StatusDocument>());
    if (!resource || resource.docType !== "shopify_sync_status" || resource.scopeKey !== scopeKey) return null;
    return { scopeKey, shop: resource.shop, lastSyncedAt: resource.lastSyncedAt, lastAttemptAt: resource.lastAttemptAt, lastError: resource.lastError };
  } catch (error) { if (isNotFoundError(error)) return null; throw error; }
}

export async function recordShopifySyncStatus(config: ApiConfig, status: ShopifySyncStatus): Promise<void> {
  const { entitlements } = getContainers(config);
  const document: StatusDocument = { ...status, id: statusId(status.scopeKey), userId: status.scopeKey, docType: "shopify_sync_status" };
  await withCosmosRetry(() => entitlements.items.upsert(document));
}
