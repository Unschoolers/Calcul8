import type { ApiConfig } from "../../types";
import type { ShopifyConnection, ShopifyConnectionStore, ShopifyOAuthState } from "../../features/shopify/connectionService";
import { getContainers, isNotFoundError, isPreconditionFailedError, withCosmosRetry } from "./core";

const OAUTH_PARTITION = "oauth:shopify";
const connectionId = (scopeKey: string) => `shopify_connection:${scopeKey}`;
const stateId = (state: string) => `shopify_oauth_state:${state}`;

type StateDocument = ShopifyOAuthState & { id: string; userId: string; docType: "shopify_oauth_state"; _etag?: string };
type ConnectionDocument = ShopifyConnection & { id: string; userId: string; docType: "shopify_connection" };

export function createShopifyStore(config: ApiConfig): ShopifyConnectionStore {
  return {
    async createState(state) {
      const { entitlements } = getContainers(config);
      const document: StateDocument = { ...state, id: stateId(state.state), userId: OAUTH_PARTITION, docType: "shopify_oauth_state" };
      await withCosmosRetry(() => entitlements.items.upsert(document));
    },
    async consumeState(state) {
      const { entitlements } = getContainers(config);
      const item = entitlements.item(stateId(state), OAUTH_PARTITION);
      let resource: StateDocument | undefined;
      try { ({ resource } = await withCosmosRetry(() => item.read<StateDocument>())); }
      catch (error) { if (isNotFoundError(error)) return null; throw error; }
      if (!resource || resource.docType !== "shopify_oauth_state" || resource.state !== state || !resource._etag) return null;
      try {
        await withCosmosRetry(() => item.delete({ accessCondition: { type: "IfMatch", condition: resource._etag! } }));
      } catch (error) {
        if (isNotFoundError(error) || isPreconditionFailedError(error)) return null;
        throw error;
      }
      const { id: _id, userId: _userId, docType: _docType, _etag, ...payload } = resource;
      return payload;
    },
    async putConnection(connection) {
      const { entitlements } = getContainers(config);
      const document: ConnectionDocument = { ...connection, id: connectionId(connection.scopeKey), userId: connection.scopeKey, docType: "shopify_connection" };
      await withCosmosRetry(() => entitlements.items.upsert(document));
    }
  };
}

export async function getShopifyConnection(config: ApiConfig, scopeKey: string): Promise<ShopifyConnection | null> {
  const { entitlements } = getContainers(config);
  try {
    const { resource } = await withCosmosRetry(() => entitlements.item(connectionId(scopeKey), scopeKey).read<ConnectionDocument>());
    if (!resource || resource.docType !== "shopify_connection" || resource.scopeKey !== scopeKey) return null;
    const { id: _id, userId: _userId, docType: _docType, ...connection } = resource;
    return connection;
  } catch (error) { if (isNotFoundError(error)) return null; throw error; }
}

export async function listShopifyConnectionScopes(config: ApiConfig): Promise<string[]> {
  const { entitlements } = getContainers(config);
  const iterator = entitlements.items.query<ConnectionDocument>({
    query: "SELECT c.scopeKey FROM c WHERE c.docType = @docType",
    parameters: [{ name: "@docType", value: "shopify_connection" }]
  });
  const { resources } = await withCosmosRetry(() => iterator.fetchAll());
  return (resources ?? []).map((connection) => connection.scopeKey).filter((value): value is string => typeof value === "string");
}

/** Conditional token rotation avoids overwriting a newer refresh token. */
export async function replaceShopifyConnectionIfCurrent(
  config: ApiConfig, current: ShopifyConnection, next: ShopifyConnection
): Promise<boolean> {
  const { entitlements } = getContainers(config);
  const item = entitlements.item(connectionId(current.scopeKey), current.scopeKey);
  try {
    const { resource } = await withCosmosRetry(() => item.read<ConnectionDocument & { _etag?: string }>());
    if (!resource?._etag || resource.accessTokenCiphertext !== current.accessTokenCiphertext ||
      resource.refreshTokenCiphertext !== current.refreshTokenCiphertext || resource.shop !== current.shop) return false;
    await withCosmosRetry(() => item.replace(
      { ...next, id: connectionId(next.scopeKey), userId: next.scopeKey, docType: "shopify_connection" },
      { accessCondition: { type: "IfMatch", condition: resource._etag } }
    ));
    return true;
  } catch (error) {
    if (isNotFoundError(error) || isPreconditionFailedError(error)) return false;
    throw error;
  }
}

export async function deleteShopifyConnection(config: ApiConfig, scopeKey: string): Promise<void> {
  const { entitlements } = getContainers(config);
  try { await withCosmosRetry(() => entitlements.item(connectionId(scopeKey), scopeKey).delete()); }
  catch (error) { if (!isNotFoundError(error)) throw error; }
}
