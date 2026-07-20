import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { applyCloudSnapshotToLocal, parseCloudSnapshot } from "../src/app-core/methods/ui/sync/sync-apply.ts";
import { createSyncPayload, getSyncPayloadSignature } from "../src/app-core/methods/ui/sync/sync-payload.ts";
import { normalizeSystemPricingDefaults } from "../src/app-core/shared/system-pricing-defaults.ts";
import { makeLot } from "./helpers/fixtures.ts";

test("createSyncPayload includes system pricing defaults in the synced signature", () => {
  const systemPricingDefaults = normalizeSystemPricingDefaults({
    sellingCurrency: "USD",
    sellingTaxPercent: 7,
    sellingShippingPerOrder: 3,
    targetProfitPercent: 19,
    spotsPerBox: 11,
    feeProfilePreset: "none"
  });

  const payload = createSyncPayload({
    lots: [],
    currentLotId: null,
    wheelConfigs: [],
    activeWheelConfigId: null,
    systemPricingDefaults
  });

  assert.deepEqual(payload.systemPricingDefaults, systemPricingDefaults);
  assert.match(getSyncPayloadSignature(payload), /systemPricingDefaults/);
});

test("parseCloudSnapshot treats system pricing defaults as syncable data", () => {
  const snapshot = parseCloudSnapshot({
    lots: [],
    salesByLot: {},
    wheelConfigs: [],
    activeWheelConfigId: null,
    systemPricingDefaults: {
      sellingCurrency: "USD",
      targetProfitPercent: 22
    },
    version: 4
  });

  assert.equal(snapshot.hasData, true);
  assert.equal(snapshot.systemPricingDefaults?.sellingCurrency, "USD");
  assert.equal(snapshot.systemPricingDefaults?.targetProfitPercent, 22);
});

test("applyCloudSnapshotToLocal restores system pricing defaults before normalizing inheriting lots", () => {
  const snapshot = parseCloudSnapshot({
    lots: [
      makeLot({
        id: 1,
        usesSystemPricingDefaults: true,
        sellingTaxPercent: 99,
        targetProfitPercent: 99
      })
    ],
    salesByLot: {},
    wheelConfigs: [],
    activeWheelConfigId: null,
    systemPricingDefaults: {
      sellingCurrency: "USD",
      sellingTaxPercent: 8,
      sellingShippingPerOrder: 2,
      targetProfitPercent: 21,
      spotsPerBox: 9,
      feeProfilePreset: "none"
    },
    version: 4
  });
  const context = {
    lots: [] as Array<ReturnType<typeof makeLot>>,
    wheelConfigs: [] as unknown[],
    activeWheelConfigId: null,
    currentLotId: 1,
    sales: [],
    activeScopeType: "personal" as const,
    activeWorkspaceId: null,
    systemPricingDefaults: normalizeSystemPricingDefaults({ sellingTaxPercent: 15 }),
    saveSystemPricingDefaultsToStorage: vi.fn(),
    saveLotsToStorage: vi.fn(),
    saveWheelConfigsToStorage: vi.fn(),
    getSalesStorageKey: (lotId: number) => `sales-${lotId}`,
    loadLot: vi.fn()
  };
  vi.stubGlobal("localStorage", {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn()
  });

  applyCloudSnapshotToLocal(context as never, snapshot);

  assert.equal(context.systemPricingDefaults.sellingCurrency, "USD");
  assert.equal(context.systemPricingDefaults.sellingTaxPercent, 8);
  assert.equal(context.systemPricingDefaults.targetProfitPercent, 21);
  assert.equal(context.lots[0]?.sellingCurrency, "USD");
  assert.equal(context.lots[0]?.sellingTaxPercent, 8);
  assert.equal(context.lots[0]?.targetProfitPercent, 21);
  assert.equal(context.saveSystemPricingDefaultsToStorage.mock.calls.length, 0);
});
