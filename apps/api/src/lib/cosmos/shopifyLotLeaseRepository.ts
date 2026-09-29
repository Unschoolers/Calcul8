import { randomUUID } from "node:crypto";
import type { ApiConfig } from "../../types";
import { getContainers, isConflictError, isNotFoundError, isPreconditionFailedError, withCosmosRetry } from "./core";

type LeaseDocument = { id: string; userId: string; docType: "shopify_reconcile_lease"; owner: string | null;
  fence: number; requestedRevision: number; expiresAt: number; _etag?: string };
export type ShopifyLotLease = { owner: string; fence: number; revision: number };
export type LeaseRequest = { kind: "acquired"; lease: ShopifyLotLease } | { kind: "busy" };
export type LeaseFinish = { kind: "released" } | { kind: "lost" } | { kind: "dirty"; revision: number };
export type ShopifyLotLeaseStore = {
  request(scopeKey: string, lotId: number, ttlMs: number): Promise<LeaseRequest>;
  renew(scopeKey: string, lotId: number, lease: ShopifyLotLease, ttlMs: number): Promise<void>;
  finish(scopeKey: string, lotId: number, lease: ShopifyLotLease): Promise<LeaseFinish>;
  abandon(scopeKey: string, lotId: number, lease: ShopifyLotLease): Promise<void>;
};

export function createShopifyLotLeaseStore(config: ApiConfig): ShopifyLotLeaseStore {
  const { entitlements } = getContainers(config);
  const itemFor = (scopeKey: string, lotId: number) => entitlements.item(`shopify_reconcile_lease:${lotId}`, scopeKey);
  const read = async (scopeKey: string, lotId: number): Promise<LeaseDocument | null> => {
    try { const { resource } = await withCosmosRetry(() => itemFor(scopeKey, lotId).read<LeaseDocument>()); return resource ?? null; }
    catch (error) { if (isNotFoundError(error)) return null; throw error; }
  };
  const replace = async (scopeKey: string, lotId: number, current: LeaseDocument, next: LeaseDocument): Promise<boolean> => {
    if (!current._etag) throw new Error("Shopify reconciliation lease lacks a version");
    try { await withCosmosRetry(() => itemFor(scopeKey, lotId).replace(next, { accessCondition: { type: "IfMatch", condition: current._etag! } })); return true; }
    catch (error) { if (isPreconditionFailedError(error)) return false; throw error; }
  };
  return {
    async request(scopeKey, lotId, ttlMs) {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const current = await read(scopeKey, lotId);
        const now = Date.now();
        if (!current) {
          const owner = randomUUID();
          const document: LeaseDocument = { id: `shopify_reconcile_lease:${lotId}`, userId: scopeKey, docType: "shopify_reconcile_lease",
            owner, fence: 1, requestedRevision: 1, expiresAt: now + ttlMs };
          try { await withCosmosRetry(() => entitlements.items.create(document)); return { kind: "acquired", lease: { owner, fence: 1, revision: 1 } }; }
          catch (error) { if (isConflictError(error)) continue; throw error; }
        }
        if (current.docType !== "shopify_reconcile_lease" || current.userId !== scopeKey) throw new Error("Invalid Shopify reconciliation lease");
        const busy = Boolean(current.owner) && current.expiresAt > now;
        const owner = busy ? current.owner : randomUUID();
        const fence = busy ? current.fence : current.fence + 1;
        const revision = current.requestedRevision + 1;
        if (!await replace(scopeKey, lotId, current, { ...current, owner, fence, requestedRevision: revision, expiresAt: busy ? current.expiresAt : now + ttlMs })) continue;
        return busy ? { kind: "busy" } : { kind: "acquired", lease: { owner: owner!, fence, revision } };
      }
      throw new Error("Shopify reconciliation lease contention; retry");
    },
    async renew(scopeKey, lotId, lease, ttlMs) {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const current = await read(scopeKey, lotId);
        if (!current || current.owner !== lease.owner || current.fence !== lease.fence) throw new Error("Shopify reconciliation lease lost");
        if (await replace(scopeKey, lotId, current, { ...current, expiresAt: Date.now() + ttlMs })) return;
      }
      throw new Error("Shopify reconciliation lease contention; retry");
    },
    async finish(scopeKey, lotId, lease) {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const current = await read(scopeKey, lotId);
        if (!current || current.owner !== lease.owner || current.fence !== lease.fence) return { kind: "lost" };
        if (current.requestedRevision !== lease.revision) return { kind: "dirty", revision: current.requestedRevision };
        if (await replace(scopeKey, lotId, current, { ...current, owner: null, expiresAt: 0 })) return { kind: "released" };
      }
      throw new Error("Shopify reconciliation lease contention; retry");
    },
    async abandon(scopeKey, lotId, lease) {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const current = await read(scopeKey, lotId);
        if (!current || current.owner !== lease.owner || current.fence !== lease.fence) return;
        if (await replace(scopeKey, lotId, current, { ...current, owner: null, expiresAt: 0 })) return;
      }
    }
  };
}
