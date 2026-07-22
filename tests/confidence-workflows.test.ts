import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";

import {
    applySinglesCsvImportRows,
    buildSinglesCsvImportDraft,
    parseSinglesCsvRowsWithMapping
} from "../src/app-core/methods/config-lots-import.ts";
import { normalizeStoredLot } from "../src/app-core/shared/normalize-lot.ts";
import {
    getScopedWheelConfigSessionStorageKey,
    getScopedWheelSessionStorageKey
} from "../src/app-core/storageKeys.ts";
import { createGameWindowState, ensureWheelControllerState, getWheelController } from "../src/components/windows/game/coordinator/gameControllerState.ts";
import { wheelSessionMethods } from "../src/components/windows/game/commands/wheelSessionMethods.ts";
import { wheelSpinMethods } from "../src/components/windows/game/commands/wheelSpinMethods.ts";
import {
    calculateLotPerformanceSummary,
    calculateNetFromGross,
    calculateSaleProfit,
    calculateSinglesPurchaseTotalMarketValueInSellingCurrency
} from "../src/domain/calculations.ts";
import type { Lot, Sale } from "../src/types/app.ts";

const wheelLayoutHash = "c3ca5e1eef7edf9b0625f714c6eb25287a9e8bcc63a16d0de00ce711ddbe67ad";

vi.mock("../src/app-core/methods/wheel-fairness-api.ts", () => ({
  createWheelFairnessCommit: vi
    .fn(async () => ({
      commitToken: "commit-token",
      serverSeedHash: "server-seed-hash",
      layoutHash: wheelLayoutHash,
      slotCount: 1,
      algorithm: "whatfees-wheel-v1",
      committedAt: 123,
      expiresAt: 456
    })),
  revealWheelFairnessResult: vi
    .fn(async (_commitToken: string, clientSeed: string) => ({
      resultIndex: 0,
      serverSeedHash: "server-seed-hash",
      serverSeed: "server-seed-value",
      clientSeed,
      layoutHash: wheelLayoutHash,
      slotCount: 1,
      verificationUrl: `https://example.test/wheel/fairness/verify?serverSeed=server-seed-value&clientSeed=${clientSeed}&slotCount=1`,
      algorithm: "whatfees-wheel-v1"
    })),
  createWheelFairnessProofLink: vi
    .fn(async () => ({
      verificationUrl: "https://example.test/wheel/fairness/verify?proofId=proof-123",
      jsonUrl: "https://example.test/wheel/fairness/verify?proofId=proof-123&format=json"
    }))
}));

type MockStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
};

function withMockedLocalStorage(
  run: (data: Map<string, string>) => Promise<void> | void
): Promise<void> | void {
  const original = (globalThis as { localStorage?: MockStorage }).localStorage;
  const data = new Map<string, string>();
  const storage: MockStorage = {
    getItem(key: string): string | null {
      return data.has(key) ? data.get(key)! : null;
    },
    setItem(key: string, value: string): void {
      data.set(key, String(value));
    },
    removeItem(key: string): void {
      data.delete(key);
    },
    clear(): void {
      data.clear();
    }
  };

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage
  });

  const restore = () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: original
    });
  };

  try {
    const result = run(data);
    if (result && typeof (result as Promise<void>).then === "function") {
      return (result as Promise<void>).finally(restore);
    }
    restore();
    return;
  } catch (error) {
    restore();
    throw error;
  }
}

function stubFinishedAnimation(): void {
  vi.spyOn(performance, "now").mockReturnValue(0);
  vi.stubGlobal("requestAnimationFrame", ((callback: FrameRequestCallback) => {
    callback(10_000);
    return 1;
  }) as typeof requestAnimationFrame);
}

function createWheelWorkflowVm(): any {
  const state = createGameWindowState() as Record<string, any>;
  const controller = ensureWheelControllerState(state);
  controller.activeWheelSlots = [{
    name: "1 Pack",
    color: "#e74c3c",
    cost: 6.125,
    tier: "tier-1",
    packsCount: 1,
    deductionType: "packs",
    isChase: false
  }];
  controller.wheelPreviewSlots = [...controller.activeWheelSlots];
  state.activeWheelConfigId = 42;
  state.activeScopeType = "personal";
  state.activeWorkspaceId = null;
  state.wheelSpinCounts = [0];
  state.wheelTotalSpins = 0;
  state.wheelCurrentAngle = 0;
  state.wheelLastResult = "";
  state.wheelSpinning = false;
  state.wheelPendingInventoryIssues = [];
  state.wheelDisplaySlots = controller.wheelPreviewSlots;
  state.drawWheel = vi.fn();
  state.landOnSlot = vi.fn();
  state.saveWheelSession = vi.fn(function (this: Record<string, any>) {
    wheelSessionMethods.saveWheelSession.call(this as never);
  });
  state.loadWheelFromSession = vi.fn(function (this: Record<string, any>) {
    return wheelSessionMethods.loadWheelFromSession.call(this as never);
  });
  state.recordSpinResult = vi.fn(function (this: Record<string, any>, slotIndex: number) {
    wheelSpinMethods.recordSpinResult.call(this as never, slotIndex);
  });
  state.recordPreviewSpinResult = vi.fn(function (this: Record<string, any>, slotIndex: number) {
    wheelSpinMethods.recordPreviewSpinResult.call(this as never, slotIndex);
  });
  state.appendWheelFairnessHistory = vi.fn(function (
    this: Record<string, any>,
    entry,
    options
  ) {
    wheelSessionMethods.appendWheelFairnessHistory.call(this as never, entry, options);
  });

  return state as any;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("workflow: singles market currencies stay coherent across UA/custom normalization", () => {
  const normalizedUaLot = normalizeStoredLot({
    id: 1,
    name: "Union Arena",
    lotType: "singles",
    currency: "CAD",
    sellingCurrency: "CAD",
    exchangeRate: 1.5,
    singlesCatalogSource: "ua",
    singlesPurchases: [
      {
        id: 101,
        item: "EVA Test Type-01",
        cost: 18,
        currency: "CAD",
        quantity: 2,
        marketValue: 42
      }
    ]
  } as Lot, "2026-04-08");

  const normalizedCustomLot = normalizeStoredLot({
    id: 2,
    name: "Custom Singles",
    lotType: "singles",
    currency: "CAD",
    sellingCurrency: "CAD",
    exchangeRate: 1.5,
    singlesCatalogSource: "none",
    singlesPurchases: [
      {
        id: 202,
        item: "Custom Hit",
        cost: 9,
        currency: "CAD",
        quantity: 3,
        marketValue: 10
      }
    ]
  } as Lot, "2026-04-08");

  assert.equal(normalizedUaLot.singlesPurchases![0]?.marketValueCurrency, "USD");
  assert.equal(normalizedCustomLot.singlesPurchases![0]?.marketValueCurrency, "CAD");

  const totalMarketValue = calculateSinglesPurchaseTotalMarketValueInSellingCurrency({
    entries: [
      ...normalizedUaLot.singlesPurchases!,
      ...normalizedCustomLot.singlesPurchases!
    ],
    fallbackMarketCurrency: "CAD",
    sellingCurrency: "CAD",
    exchangeRate: 1.5,
    defaultExchangeRate: 1.4
  });

  assert.equal(totalMarketValue, 156);
});

test("workflow: imported singles flow into linked sales profit and final lot margin", () => {
  const baseLot = normalizeStoredLot({
    id: 77,
    name: "Singles Workflow",
    lotType: "singles",
    currency: "CAD",
    sellingCurrency: "CAD",
    exchangeRate: 1.5,
    purchaseDate: "2026-04-01",
    singlesCatalogSource: "none",
    purchaseTaxPercent: 15,
    sellingTaxPercent: 15,
    singlesPurchases: [
      {
        id: 1,
        item: "Starter",
        cardNumber: "001",
        condition: "Near Mint",
        language: "English",
        cost: 10,
        currency: "CAD",
        quantity: 1,
        marketValue: 12
      }
    ]
  } as Lot, "2026-04-08");

  const draft = buildSinglesCsvImportDraft(
    "Item,Card Number,Condition,Language,Price,Qty,Market Value\nPikachu,025,Near Mint,English,$3.50,2,$5.75"
  );
  assert.ok(draft);

  const parsed = parseSinglesCsvRowsWithMapping(
    draft!.rows,
    draft!.headers.length,
    draft!.mapping,
    "USD"
  );
  assert.equal(parsed.entries.length, 1);

  const applied = applySinglesCsvImportRows({
    existingRows: baseLot.singlesPurchases!,
    parsedRows: parsed.entries,
    importMode: "merge",
    now: 10_000
  });

  const importedEntry = applied.rows.find((entry) => entry.item === "Pikachu");
  assert.ok(importedEntry);
  assert.equal(importedEntry?.marketValueCurrency, "USD");

  const lot = {
    ...baseLot,
    singlesPurchases: applied.rows
  };

  const sales: Sale[] = [{
    id: 500,
    type: "pack",
    quantity: 2,
    packsCount: 2,
    singlesPurchaseEntryId: importedEntry!.id,
    price: 12,
    buyerShipping: 0,
    date: "2026-04-03"
  } as Sale];

  const saleProfit = calculateSaleProfit({
    sale: sales[0]!,
    lotType: "singles",
    sellingTaxPercent: 15,
    totalCaseCost: 0,
    totalPacks: 0,
    purchaseCurrency: lot.currency,
    sellingCurrency: lot.sellingCurrency,
    exchangeRate: lot.exchangeRate,
    singlesPurchases: lot.singlesPurchases!
  });

  const summary = calculateLotPerformanceSummary(lot, sales, 1.4);
  const expectedNetRevenue = calculateNetFromGross(24, 15, 0, 1);

  assert.ok(Math.abs(saleProfit - (expectedNetRevenue - 10.5)) < 0.000001);
  assert.equal(summary.salesCount, 1);
  assert.equal(summary.totalCost, 20.5);
  assert.ok(Math.abs(summary.totalRevenue - expectedNetRevenue) < 0.000001);
  assert.ok(Math.abs(summary.totalProfit - (expectedNetRevenue - 20.5)) < 0.000001);
  assert.ok(Math.abs((summary.marginPercent ?? 0) - (((expectedNetRevenue - 20.5) / expectedNetRevenue) * 100)) < 0.000001);
});

test("workflow: wheel preview and live sessions keep separate full histories across save and reload", async () => {
  await withMockedLocalStorage(async (data) => {
    stubFinishedAnimation();

    const vm = createWheelWorkflowVm();
    const controller = getWheelController(vm);

    vm.wheelMode = "config";
    vm.wheelDisplaySlots = controller.wheelPreviewSlots;
    await wheelSpinMethods.spinWheelInternal.call(vm, true);
    await wheelSpinMethods.spinWheelInternal.call(vm, true);

    assert.equal(controller.wheelPreviewTotalSpins, 2);
    assert.equal(controller.wheelPreviewFairnessHistory.length, 2);
    assert.equal(vm.wheelTotalSpins, 0);
    assert.equal(controller.wheelFairnessHistory.length, 0);

    vm.wheelMode = "live";
    vm.wheelDisplaySlots = controller.activeWheelSlots;
    await wheelSpinMethods.spinWheelInternal.call(vm, true);
    await wheelSpinMethods.spinWheelInternal.call(vm, true);
    await wheelSpinMethods.spinWheelInternal.call(vm, true);

    assert.equal(vm.wheelTotalSpins, 3);
    assert.equal(controller.wheelFairnessHistory.length, 3);
    assert.equal(controller.wheelPreviewFairnessHistory.length, 2);

    wheelSessionMethods.saveWheelSession.call(vm);

    const configSessionKey = getScopedWheelConfigSessionStorageKey({ scopeType: "personal" }, 42);
    const rootSessionKey = getScopedWheelSessionStorageKey({ scopeType: "personal" });
    const savedConfigSession = JSON.parse(data.get(configSessionKey) || "{}");
    const savedRootSession = JSON.parse(data.get(rootSessionKey) || "{}");

    assert.equal(savedConfigSession.wheelPreviewFairnessHistory.length, 2);
    assert.equal(savedConfigSession.wheelFairnessHistory.length, 3);
    assert.equal(savedRootSession.wheelPreviewFairnessHistory.length, 2);
    assert.equal(savedRootSession.wheelFairnessHistory.length, 3);

    const reloadedVm = createWheelWorkflowVm();
    const reloadedController = getWheelController(reloadedVm);
    reloadedController.activeWheelSlots = controller.activeWheelSlots;
    reloadedController.wheelPreviewSlots = controller.wheelPreviewSlots;

    const restored = wheelSessionMethods.loadWheelFromSession.call(reloadedVm);

    assert.equal(restored, true);
    assert.equal(reloadedVm.wheelTotalSpins, 3);
    assert.deepEqual(reloadedVm.wheelSpinCounts, [3]);
    assert.equal(reloadedController.wheelPreviewTotalSpins, 2);
    assert.deepEqual(reloadedController.wheelPreviewSpinCounts, [2]);
    assert.deepEqual(
      reloadedController.wheelPreviewFairnessHistory.map((entry) => entry.spinNumber),
      [1, 2]
    );
    assert.deepEqual(
      reloadedController.wheelFairnessHistory.map((entry) => entry.spinNumber),
      [1, 2, 3]
    );
    assert.match(String(reloadedController.wheelFairnessHistory[2]?.verificationUrl || ""), /wheel\/fairness\/verify/);
  });
});



