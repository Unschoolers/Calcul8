import { createHash } from "node:crypto";
import type { ApiConfig } from "../../types";
import { HttpError } from "../auth";
import { ShopifyErrorCode } from "../../shared/shopify-errors";
import type { ShopifyOperation, ShopifyOperationStore } from "../../features/shopify/operationTypes";
import { getContainers, withCosmosRetry, isNotFoundError, isConflictError, isPreconditionFailedError } from "./core";

type OperationDocument = ShopifyOperation & { id: string; userId: string; docType: "shopify_operation"; _etag?: string };
const operationId = (lotId: number, id: string) => `shopify_operation:${lotId}:${createHash("sha256").update(id).digest("hex")}`;

export function createShopifyOperationStore(config: ApiConfig): ShopifyOperationStore {
  const { entitlements } = getContainers(config);
  const strip = (doc: OperationDocument): ShopifyOperation => {
    const { id: _id, userId: _userId, docType: _docType, _etag, version: _version, ...record } = doc;
    if (!_etag) throw new Error("Shopify operation version unavailable");
    return { ...record, version: _etag };
  };
  return {
    async get(scopeKey, lotId, id) {
      try {
        const { resource } = await withCosmosRetry(() => entitlements.item(operationId(lotId, id), scopeKey).read<OperationDocument>());
        if (!resource) return null;
        if (resource.docType !== "shopify_operation" || resource.scopeKey !== scopeKey || resource.userId !== scopeKey || resource.lotId !== lotId || resource.operationId !== id) throw new Error("Shopify operation identity mismatch");
        return strip(resource);
      } catch (error) { if (isNotFoundError(error)) return null; throw error; }
    },
    async list(scopeKey, lotId) {
      const iterator = entitlements.items.query<OperationDocument>({ query: "SELECT * FROM c WHERE c.docType = @docType AND c.userId = @scopeKey AND c.lotId = @lotId", parameters: [{ name: "@docType", value: "shopify_operation" }, { name: "@scopeKey", value: scopeKey }, { name: "@lotId", value: lotId }] }, { partitionKey: scopeKey });
      const { resources } = await withCosmosRetry(() => iterator.fetchAll());
      return (resources ?? []).filter(doc => doc.docType === "shopify_operation" && doc.scopeKey === scopeKey && doc.userId === scopeKey && doc.lotId === lotId).map(strip);
    },
    async put(record) {
      const { version, ...data } = record;
      const document: OperationDocument = { ...data, id: operationId(record.lotId, record.operationId), userId: record.scopeKey, docType: "shopify_operation" };
      try {
        if (version) await withCosmosRetry(() => entitlements.item(document.id, record.scopeKey).replace(document, { accessCondition: { type: "IfMatch", condition: version } }));
        else await withCosmosRetry(() => entitlements.items.create(document));
      } catch (error) {
        if (isConflictError(error) || isPreconditionFailedError(error)) throw new HttpError(409, "Shopify operation changed; recover before retrying", ShopifyErrorCode.BINDING_CHANGED);
        throw error;
      }
      const { resource } = await withCosmosRetry(() => entitlements.item(document.id, record.scopeKey).read<OperationDocument>());
      if (!resource) throw new Error("Shopify operation could not be persisted");
      return strip(resource);
    }
  };
}
