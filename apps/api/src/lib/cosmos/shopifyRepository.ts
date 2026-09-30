import type { ApiConfig } from "../../types";
import type { ShopifyConnection, ShopifyConnectionStore, ShopifyOAuthState } from "../../features/shopify/connectionService";
import { HttpError } from "../auth";
import { getContainers, isConflictError, isNotFoundError, isPreconditionFailedError, withCosmosRetry } from "./core";

const OAUTH_PARTITION = "oauth:shopify";
const connectionId = (scopeKey: string) => `shopify_connection:${scopeKey}`;
const stateId = (state: string) => `shopify_oauth_state:${state}`;

type StateDocument = ShopifyOAuthState & { id: string; userId: string; docType: "shopify_oauth_state"; _etag?: string };
type ConnectionDocument = ShopifyConnection & { id: string; userId: string; docType: "shopify_connection"; _etag?: string; generation?: number; disconnectedAt?: string };

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
    getConnection(scopeKey) { return getShopifyConnection(config, scopeKey); },
    async getGeneration(scopeKey) {
      const { entitlements } = getContainers(config);
      try {
        const { resource } = await withCosmosRetry(() => entitlements.item(connectionId(scopeKey), scopeKey).read<ConnectionDocument>());
        return resource?.generation ?? 0;
      } catch (error) { if (isNotFoundError(error)) return 0; throw error; }
    },
    async putConnection(connection, expectedGeneration) {
      const { entitlements } = getContainers(config);
      const document: ConnectionDocument = { ...connection, id: connectionId(connection.scopeKey), userId: connection.scopeKey, docType: "shopify_connection", generation: expectedGeneration };
      const item = entitlements.item(document.id, connection.scopeKey);
      let current: ConnectionDocument | undefined;
      try { ({ resource: current } = await withCosmosRetry(() => item.read<ConnectionDocument>())); }
      catch (error) { if (!isNotFoundError(error)) throw error; }
      if (!current) {
        if (expectedGeneration !== 0) throw new HttpError(409, "Shopify connection changed; start connecting again.");
        try { await withCosmosRetry(() => entitlements.items.create(document)); }
        catch (error) { if (isConflictError(error)) throw new HttpError(409, "Shopify connection changed; retry connecting."); throw error; }
        return;
      }
      if (current.docType !== "shopify_connection" || current.scopeKey !== connection.scopeKey ||
        (current.generation ?? 0) !== expectedGeneration || (current.accessTokenCiphertext && current.shop !== connection.shop) || !current._etag) {
        throw new HttpError(409, "Shopify connection changed; disconnect the current store before connecting another store.");
      }
      try { await withCosmosRetry(() => item.replace(document, { accessCondition: { type: "IfMatch", condition: current._etag! } })); }
      catch (error) { if (isPreconditionFailedError(error)) throw new HttpError(409, "Shopify connection changed; retry connecting."); throw error; }
    }
  };
}

export async function getShopifyConnection(config: ApiConfig, scopeKey: string): Promise<ShopifyConnection | null> {
  const { entitlements } = getContainers(config);
  try {
    const { resource } = await withCosmosRetry(() => entitlements.item(connectionId(scopeKey), scopeKey).read<ConnectionDocument>());
    if (!resource || resource.docType !== "shopify_connection" || resource.scopeKey !== scopeKey || !resource.accessTokenCiphertext || resource.disconnectedAt) return null;
    const { id: _id, userId: _userId, docType: _docType, _etag, disconnectedAt: _disconnectedAt, ...connection } = resource;
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

export async function listShopifyConnectionsForShop(config: ApiConfig, shop: string): Promise<ShopifyConnection[]> {
  const { entitlements } = getContainers(config);
  const iterator = entitlements.items.query<ConnectionDocument>({
    query: "SELECT * FROM c WHERE c.docType = @type AND c.shop = @shop",
    parameters: [{ name: "@type", value: "shopify_connection" }, { name: "@shop", value: shop }]
  });
  const { resources } = await withCosmosRetry(() => iterator.fetchAll());
  return (resources ?? []).filter((connection) => connection.shop === shop && Boolean(connection.accessTokenCiphertext) && !connection.disconnectedAt).map((resource) => {
    const { id: _id, userId: _userId, docType: _docType, _etag, disconnectedAt: _disconnectedAt, ...connection } = resource;
    return connection;
  });
}

/** Conditional token rotation avoids overwriting a newer refresh token. */
export async function replaceShopifyConnectionIfCurrent(
  config: ApiConfig, current: ShopifyConnection, next: ShopifyConnection
): Promise<boolean> {
  const { entitlements } = getContainers(config);
  const item = entitlements.item(connectionId(current.scopeKey), current.scopeKey);
  try {
    const { resource } = await withCosmosRetry(() => item.read<ConnectionDocument & { _etag?: string }>());
    if (!resource?._etag || resource.disconnectedAt || resource.accessTokenCiphertext !== current.accessTokenCiphertext ||
      resource.refreshTokenCiphertext !== current.refreshTokenCiphertext || resource.shop !== current.shop) return false;
    await withCosmosRetry(() => item.replace(
      { ...next, generation: resource.generation ?? 0, id: connectionId(next.scopeKey), userId: next.scopeKey, docType: "shopify_connection" },
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
  const item = entitlements.item(connectionId(scopeKey), scopeKey);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    let current: ConnectionDocument | undefined;
    try { ({ resource: current } = await withCosmosRetry(() => item.read<ConnectionDocument>())); }
    catch (error) { if (!isNotFoundError(error)) throw error; }
    const now = new Date().toISOString();
    if (!current) {
      const scopeType = scopeKey.startsWith("ws:") ? "workspace" : "user";
      const tombstone: ConnectionDocument = { id: connectionId(scopeKey), userId: scopeKey, docType: "shopify_connection",
        scopeKey, scopeType, scopeId: scopeKey.slice(scopeKey.indexOf(":") + 1), shop: "", accessTokenCiphertext: "",
        scopes: [], connectedByUserId: "", updatedAt: now, disconnectedAt: now, generation: 1 };
      try { await withCosmosRetry(() => entitlements.items.create(tombstone)); return; }
      catch (error) { if (isConflictError(error)) continue; throw error; }
    }
    if (!current._etag) throw new Error("Shopify connection version unavailable");
    try {
      await withCosmosRetry(() => item.replace({ ...current, accessTokenCiphertext: "", refreshTokenCiphertext: undefined,
        tokenExpiresAt: undefined, scopes: [], disconnectedAt: now, generation: (current.generation ?? 0) + 1, updatedAt: now },
        { accessCondition: { type: "IfMatch", condition: current._etag! } }));
      return;
    } catch (error) { if (!isPreconditionFailedError(error)) throw error; }
  }
  throw new Error("Shopify disconnect conflicted; retry");
}
