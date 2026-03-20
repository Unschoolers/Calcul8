import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const { queueWorkspaceConfigSyncPushMock } = vi.hoisted(() => ({
  queueWorkspaceConfigSyncPushMock: vi.fn()
}));

vi.mock("../src/app-core/methods/ui/workspace-config-sync.ts", () => ({
  queueWorkspaceConfigSyncPush: queueWorkspaceConfigSyncPushMock
}));

import { configLotMethods } from "../src/app-core/methods/config-lots.ts";
import { configPricingMethods } from "../src/app-core/methods/config-pricing.ts";

function makeBulkLot() {
  return {
    id: 101,
    name: "Bulk Lot",
    lotType: "bulk",
    boxPriceCost: 70,
    boxesPurchased: 16,
    packsPerBox: 16,
    spotsPerBox: 5,
    costInputMode: "total",
    currency: "CAD",
    sellingCurrency: "CAD",
    exchangeRate: 1.4,
    purchaseDate: "2026-03-19",
    purchaseShippingCost: 0,
    purchaseTaxPercent: 0,
    sellingTaxPercent: 15,
    sellingShippingPerOrder: 8,
    includeTax: false,
    spotPrice: 1,
    boxPriceSell: 2,
    packPrice: 3,
    targetProfitPercent: 15
  };
}

function makeSinglesLot() {
  return {
    ...makeBulkLot(),
    id: 202,
    name: "Singles Lot",
    lotType: "singles",
    singlesCatalogSource: "custom",
    singlesPurchases: []
  };
}

function createContext(overrides: Record<string, unknown> = {}) {
  const bulkLot = makeBulkLot();
  return {
    ...bulkLot,
    lots: [bulkLot],
    currentLotId: bulkLot.id,
    currentLotType: "bulk",
    purchaseUiMode: "simple",
    totalCaseCost: 1120,
    totalSpots: 80,
    totalPacks: 256,
    canUsePaidActions: true,
    hasProAccess: true,
    showProfitCalculator: false,
    liveSpotPrice: 0,
    liveBoxPriceSell: 0,
    livePackPrice: 0,
    singlesPurchases: [],
    saveLotsToStorage: vi.fn(),
    notify: vi.fn(),
    getCurrentSetup() {
      return configLotMethods.getCurrentSetup.call(this as never);
    },
    syncLivePricesFromDefaults() {
      return configLotMethods.syncLivePricesFromDefaults.call(this as never);
    },
    autoSaveSetup() {
      return configLotMethods.autoSaveSetup.call(this as never);
    },
    recalculateDefaultPrices(options?: { closeModal?: boolean }) {
      return configPricingMethods.recalculateDefaultPrices.call(this as never, options);
    },
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

test("bulk config recalculation queues shared workspace config sync push", () => {
  const lot = makeBulkLot();
  const context = createContext({
    lots: [lot],
    currentLotId: lot.id,
    currentLotType: "bulk",
    boxesPurchased: 12,
    targetProfitPercent: 20
  });

  configPricingMethods.onPurchaseConfigChange.call(context as never);

  assert.equal((context.saveLotsToStorage as ReturnType<typeof vi.fn>).mock.calls.length, 1);
  assert.equal(queueWorkspaceConfigSyncPushMock.mock.calls.length, 1);
  assert.equal(queueWorkspaceConfigSyncPushMock.mock.calls[0]?.[0], context);
});

test("singles purchase grid changes queue the same shared workspace config sync push", () => {
  const lot = makeSinglesLot();
  const context = createContext({
    ...lot,
    lots: [lot],
    currentLotId: lot.id,
    currentLotType: "singles",
    singlesPurchases: [
      {
        id: 1,
        item: " Card A ",
        cardNumber: " 001 ",
        cost: 5,
        currency: "CAD",
        quantity: 2,
        marketValue: 7
      }
    ]
  });

  configLotMethods.onSinglesPurchaseRowsChange.call(context as never);

  assert.equal((context.saveLotsToStorage as ReturnType<typeof vi.fn>).mock.calls.length, 1);
  assert.equal(queueWorkspaceConfigSyncPushMock.mock.calls.length, 1);
  assert.equal(queueWorkspaceConfigSyncPushMock.mock.calls[0]?.[0], context);
});
