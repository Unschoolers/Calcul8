import type { ApiConfig } from "../../types";
import { createShopifyLotLeaseStore } from "../../lib/cosmos/shopifyLotLeaseRepository";

const LEASE_TTL_MS = 120_000;

/** Busy callers mark the lot dirty; the current owner recomputes before releasing. */
export async function withShopifyLotLease(config: ApiConfig, scopeKey: string, lotId: number,
  work: (assertCurrent: () => Promise<void>) => Promise<void>): Promise<boolean> {
  const store = createShopifyLotLeaseStore(config);
  const request = await store.request(scopeKey, lotId, LEASE_TTL_MS);
  if (request.kind === "busy") return false;
  const lease = request.lease;
  let heartbeatError: unknown;
  const assertCurrent = async () => {
    if (heartbeatError) throw heartbeatError;
    await store.renew(scopeKey, lotId, lease, LEASE_TTL_MS);
  };
  const heartbeat = setInterval(() => {
    void store.renew(scopeKey, lotId, lease, LEASE_TTL_MS).catch((error: unknown) => { heartbeatError = error; });
  }, 20_000);
  heartbeat.unref();
  try {
    for (let pass = 0; pass < 16; pass += 1) {
      await assertCurrent();
      await work(assertCurrent);
      const finish = await store.finish(scopeKey, lotId, lease);
      if (finish.kind === "released") return true;
      if (finish.kind === "lost") throw new Error("Shopify reconciliation lease lost");
      lease.revision = finish.revision;
    }
    throw new Error("Shopify inventory changed too often; retry reconciliation");
  } catch (error) {
    await store.abandon(scopeKey, lotId, lease).catch(() => {});
    throw error;
  } finally {
    clearInterval(heartbeat);
  }
}
