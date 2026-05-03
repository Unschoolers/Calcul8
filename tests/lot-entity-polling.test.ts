import assert from "node:assert/strict";
import { test } from "vitest";

import {
  createLivePricingPollingHash,
  markLivePricingPollingBaseline,
  pollAuthoritativeLotEntities,
  reconcileIncomingLivePricingSnapshot,
  refreshLotEntityPolling,
  startLotEntityPolling,
  stopLotEntityPolling
} from "../src/app-core/methods/ui/sync/lot-entity-polling.ts";

function createContext(overrides: Record<string, unknown> = {}) {
  return {
    liveSpotPrice: 1,
    liveBoxPriceSell: 2,
    livePackPrice: 3,
    currentLivePricingVersion: 1,
    ...overrides
  };
}

test("reconcileIncomingLivePricingSnapshot applies remote pricing when local state still matches baseline", () => {
  const context = createContext();

  markLivePricingPollingBaseline(context, {
    liveSpotPrice: 1,
    liveBoxPriceSell: 2,
    livePackPrice: 3,
    currentLivePricingVersion: 1
  });

  const applied = reconcileIncomingLivePricingSnapshot(context as never, {
    liveSpotPrice: 11,
    liveBoxPriceSell: 22,
    livePackPrice: 33,
    version: 4
  });

  assert.equal(applied, true);
  assert.equal(context.liveSpotPrice, 11);
  assert.equal(context.liveBoxPriceSell, 22);
  assert.equal(context.livePackPrice, 33);
  assert.equal(context.currentLivePricingVersion, 4);
});

test("reconcileIncomingLivePricingSnapshot preserves unsaved local edits when baseline no longer matches", () => {
  const context = createContext({
    liveSpotPrice: 9,
    liveBoxPriceSell: 19,
    livePackPrice: 29,
    currentLivePricingVersion: 1
  });

  markLivePricingPollingBaseline(context, {
    liveSpotPrice: 1,
    liveBoxPriceSell: 2,
    livePackPrice: 3,
    currentLivePricingVersion: 1
  });

  const applied = reconcileIncomingLivePricingSnapshot(context as never, {
    liveSpotPrice: 11,
    liveBoxPriceSell: 22,
    livePackPrice: 33,
    version: 2
  });

  assert.equal(applied, false);
  assert.equal(context.liveSpotPrice, 9);
  assert.equal(context.liveBoxPriceSell, 19);
  assert.equal(context.livePackPrice, 29);
  assert.equal(context.currentLivePricingVersion, 1);
});

test("createLivePricingPollingHash normalizes numeric values consistently", () => {
  const hash = createLivePricingPollingHash({
    liveSpotPrice: 1,
    liveBoxPriceSell: 2,
    livePackPrice: 3,
    currentLivePricingVersion: 4
  });

  assert.equal(hash, JSON.stringify({
    liveSpotPrice: 1,
    liveBoxPriceSell: 2,
    livePackPrice: 3,
    version: 4
  }));
});

test("polling entrypoints are intentional no-ops now that websocket-only workspace freshness is enabled", async () => {
  const context = createContext();

  startLotEntityPolling(context as never);
  refreshLotEntityPolling(context as never);
  await pollAuthoritativeLotEntities(context as never);
  stopLotEntityPolling(context as never);

  assert.equal(context.liveSpotPrice, 1);
  assert.equal(context.liveBoxPriceSell, 2);
  assert.equal(context.livePackPrice, 3);
  assert.equal(context.currentLivePricingVersion, 1);
});
