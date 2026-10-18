import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { ensureWheelControllerState } from "../src/components/windows/game/coordinator/gameControllerState.ts";
import { wheelSessionMethods } from "../src/components/windows/game/commands/wheelSessionMethods.ts";
import { wheelSpinMethods } from "../src/components/windows/game/commands/wheelSpinMethods.ts";
import { wheelConfigMethods } from "../src/components/windows/game/commands/wheelConfigMethods.ts";
import { GameWindow } from "../src/components/windows/game/GameWindow.ts";
import { buildSlotsFromConfig } from "../src/components/windows/game/services/wheelSlots.ts";
import { getScopedWheelConfigSessionStorageKey } from "../src/app-core/storageKeys.ts";
import type { Lot, WheelConfig } from "../src/types/app.ts";

const stored: Record<string, string> = {};
const mockStorage = {
  getItem: (key: string) => stored[key] ?? null,
  setItem: (key: string, value: string) => { stored[key] = value; },
  removeItem: (key: string) => { delete stored[key]; }
};
const originalStorage = globalThis.localStorage;

afterEach(() => {
  for (const key of Object.keys(stored)) delete stored[key];
  Object.defineProperty(globalThis, "localStorage", { value: originalStorage, writable: true, configurable: true });
  vi.restoreAllMocks();
});

function fixture(options: { inventory?: boolean; changedSource?: boolean; addSale?: (lotId: number, sale: { id: number }) => boolean | Promise<boolean> } = {}) {
  Object.defineProperty(globalThis, "localStorage", { value: mockStorage, writable: true, configurable: true });
  const tier = {
    id: "chase", label: "Chase", color: "#ff0", slots: 1, costPerTier: 50, packsCount: options.inventory === false ? 0 : 1,
    deductionType: options.inventory === false ? "none" as const : "singles" as const, boundLotId: 10,
    boundSinglesId: 5, isChase: true, sets: []
  };
  const config: WheelConfig = {
    id: 7, name: "Live wheel", spinPrice: 10, targetMargin: 40, createdAt: "2026-01-01", tiers: [tier]
  };
  if (options.changedSource) config.tiers[0]!.label = "Changed chase";
  const lots = [{
    id: 10, name: "Singles", lotType: "singles", sellingShippingPerOrder: 1,
    singlesPurchases: [
      { id: 5, item: "Original card", cost: 40, marketValue: 60, quantity: 3, image: "https://img.test/original.png" },
      { id: 6, item: "Replacement card", cost: 25, marketValue: 30, quantity: 3 }
    ]
  }] as Lot[];
  const addWheelSaleToLot = vi.fn(async (lotId: number, sale: { id: number }) => options.addSale ? options.addSale(lotId, sale) : true);
  const context: Record<string, unknown> = {
    activeScopeType: "personal", activeWorkspaceId: null, googleAuthEpoch: 0, hasProAccess: true,
    wheelMode: "live", activeWheelConfigId: 7, wheelConfigs: [config], activeWheelConfig: config,
    editingWheelConfig: config, wheelDisplayConfig: config, lots, currentLotId: 10,
    activeWheelSlots: buildSlotsFromConfig(config), wheelPreviewSlots: buildSlotsFromConfig(config),
    wheelSpinCounts: [0], wheelTotalSpins: 0, wheelSessionNetRevenue: 0, wheelPendingInventoryIssues: [],
    wheelPendingChase: null, addWheelSaleToLot, saveWheelSession: (options?: { strict?: boolean }) => wheelSessionMethods.saveWheelSession.call(context as never, options),
    confirmBatchSale: (index: number) => wheelSessionMethods.confirmBatchSale.call(context as never, index),
    drawWheel: vi.fn(), syncGameSpectatorLinks: vi.fn(), recordChaseSale: (tierId: string) => wheelSessionMethods.recordChaseSale.call(context as never, tierId),
    stopWheelAutospin: vi.fn(), publishGameSpectatorSessionSnapshot: vi.fn(async () => undefined),
    wheelChaseDialog: false, wheelChasePendingTierId: "", wheelChasePreviewMode: false,
    wheelChaseReplacementSinglesId: null, wheelEndingSession: false, wheelEndSessionReviewActive: false,
    gameSpectatorDialog: false, gameSpectatorPublishPending: false, gameSpectatorSessionId: "",
    gameSpectatorSessionStatus: "inactive", gameSpectatorSessionUrl: "", gameSpectatorSessionQrUrl: "",
    wheelSessionUpdatedAt: 0
  };
  ensureWheelControllerState(context);
  return context;
}

test("live chase draft and obligation are strictly saved before animation or sale", async () => {
  const vm = fixture();
  await wheelSpinMethods.recordSpinResult.call(vm as never, 0);
  const saved = JSON.parse(Object.values(stored)[0]!) as Record<string, unknown>;
  const obligation = saved.wheelPendingChase as Record<string, unknown>;
  const draft = obligation.saleDraft as Record<string, unknown>;
  assert.equal(obligation.spinNumber, 1);
  assert.equal(obligation.tierId, "chase");
  assert.equal((obligation.originalPrize as Record<string, unknown>).itemLabel, "Original card");
  assert.equal(typeof draft.id, "number");
  assert.equal((vm.addWheelSaleToLot as ReturnType<typeof vi.fn>).mock.calls.length, 0);
  assert.equal(vm.wheelChaseDialog, false);
  wheelSpinMethods.landOnSlot.call(vm as never, 0);
  assert.equal(vm.wheelChaseDialog, true);
});

test("preview chase spins remain isolated from live obligations", () => {
  const vm = fixture();
  vm.wheelMode = "config";
  wheelSpinMethods.recordPreviewSpinResult.call(vm as never, 0);
  assert.equal(vm.wheelPendingChase, null);
  assert.deepEqual(vm.wheelPendingInventoryIssues, []);
});

test("failed strict persistence prevents a chase spin from proceeding to animation", async () => {
  const vm = fixture();
  Object.defineProperty(globalThis, "localStorage", {
    value: { ...mockStorage, setItem: () => { throw new Error("quota"); } },
    writable: true,
    configurable: true
  });
  await assert.rejects(wheelSpinMethods.recordSpinResult.call(vm as never, 0), /quota/u);
  assert.notEqual(vm.wheelPendingChase, null);
  assert.equal((vm.addWheelSaleToLot as ReturnType<typeof vi.fn>).mock.calls.length, 0);
});

test("reload reopens the same chase and retries a lost sale response with the same ID once", async () => {
  let responses = [false, true];
  const addSale = (_lotId: number, _sale: { id: number }) => responses.shift() ?? true;
  const first = fixture({ addSale });
  await wheelSpinMethods.recordSpinResult.call(first as never, 0);
  const firstDraftId = (first.wheelPendingChase as { saleDraft: { id: number } }).saleDraft.id;
  const second = fixture({ addSale });
  const loaded = wheelSessionMethods.loadWheelFromSession.call(second as never);
  assert.equal(loaded, true);
  assert.equal(second.wheelChaseDialog, true);
  assert.equal((second.wheelPendingChase as { saleDraft: { id: number } }).saleDraft.id, firstDraftId);
  await wheelSessionMethods.keepChase.call(second as never);
  assert.equal(second.wheelPendingChase != null, true);
  await wheelSessionMethods.keepChase.call(second as never);
  assert.equal((second.addWheelSaleToLot as ReturnType<typeof vi.fn>).mock.calls.length, 2);
  assert.deepEqual((second.addWheelSaleToLot as ReturnType<typeof vi.fn>).mock.calls.map(([_, sale]) => (sale as { id: number }).id), [firstDraftId, firstDraftId]);
  assert.equal(second.wheelPendingChase, null);
});

test("changed source keeps an unresolved obligation visible and never sells against the new source", async () => {
  const original = fixture();
  await wheelSpinMethods.recordSpinResult.call(original as never, 0);
  const changed = fixture({ changedSource: true });
  wheelSessionMethods.loadWheelFromSession.call(changed as never);
  assert.equal(changed.wheelChaseDialog, true);
  assert.equal(wheelSessionMethods.isPendingChaseSourceCurrent.call(changed as never), false);
  await wheelSessionMethods.keepChase.call(changed as never);
  assert.equal((changed.addWheelSaleToLot as ReturnType<typeof vi.fn>).mock.calls.length, 0);
  assert.notEqual(changed.wheelPendingChase, null);
});

test("repurposing the same singles entry is unresolved, while price and stock updates remain valid", async () => {
  const original = fixture();
  await wheelSpinMethods.recordSpinResult.call(original as never, 0);
  const updatedStock = fixture();
  updatedStock.lots[0]!.singlesPurchases![0]!.quantity = 2;
  updatedStock.lots[0]!.singlesPurchases![0]!.cost = 45;
  updatedStock.lots[0]!.singlesPurchases![0]!.marketValue = 70;
  wheelSessionMethods.loadWheelFromSession.call(updatedStock as never);
  assert.equal(wheelSessionMethods.isPendingChaseSourceCurrent.call(updatedStock as never), true);

  const changed = fixture();
  changed.lots[0]!.singlesPurchases![0]!.item = "Repurposed card";
  changed.lots[0]!.singlesPurchases![0]!.image = "https://img.test/repurposed.png";
  wheelSessionMethods.loadWheelFromSession.call(changed as never);
  assert.equal(changed.wheelChaseDialog, true);
  assert.equal(wheelSessionMethods.isPendingChaseSourceCurrent.call(changed as never), false);
  await wheelSessionMethods.keepChase.call(changed as never);
  assert.notEqual(changed.wheelPendingChase, null);
  assert.equal((changed.addWheelSaleToLot as ReturnType<typeof vi.fn>).mock.calls.length, 0);
});

test("a bound bulk lot must still exist and retain its expected type", async () => {
  const createBulkChase = async () => {
    const vm = fixture({ inventory: false });
    const lot = vm.lots[0]!;
    lot.lotType = "bulk";
    lot.singlesPurchases = [];
    const config = (vm.wheelConfigs as WheelConfig[])[0]!;
    config.tiers[0]!.deductionType = "packs";
    config.tiers[0]!.packsCount = 1;
    config.tiers[0]!.boundSinglesId = null;
    await wheelSpinMethods.recordSpinResult.call(vm as never, 0);
    return vm;
  };

  const deletedLot = await createBulkChase();
  const deletedObligation = deletedLot.wheelPendingChase as { originalPrize: { lotType?: string } };
  assert.equal(deletedObligation.originalPrize.lotType, "bulk");
  deletedLot.lots = [];
  assert.equal(wheelSessionMethods.isPendingChaseSourceCurrent.call(deletedLot as never), false);

  const repurposedLot = await createBulkChase();
  repurposedLot.lots[0]!.lotType = "singles";
  assert.equal(wheelSessionMethods.isPendingChaseSourceCurrent.call(repurposedLot as never), false);
});

test("source matching ignores object key order in a semantically identical wheel config", async () => {
  const vm = fixture();
  await wheelSpinMethods.recordSpinResult.call(vm as never, 0);
  const config = (vm.wheelConfigs as WheelConfig[])[0]!;
  const tier = config.tiers[0]!;
  const reorderedTier = Object.fromEntries(Object.entries(tier).reverse()) as typeof tier;
  const reorderedConfig = Object.fromEntries(Object.entries({ ...config, tiers: [reorderedTier] }).reverse()) as WheelConfig;
  vm.wheelConfigs = [reorderedConfig];
  assert.equal(wheelSessionMethods.isPendingChaseSourceCurrent.call(vm as never), true);
});

test("a stored obligation with a missing original source remains unresolved instead of being discarded", async () => {
  const original = fixture();
  await wheelSpinMethods.recordSpinResult.call(original as never, 0);
  const key = getScopedWheelConfigSessionStorageKey({ scopeType: "personal", workspaceId: null }, 7);
  const session = JSON.parse(stored[key]!) as Record<string, unknown>;
  const obligation = session.wheelPendingChase as Record<string, unknown>;
  delete obligation.originalConfig;
  stored[key] = JSON.stringify(session);
  const restored = fixture();
  wheelSessionMethods.loadWheelFromSession.call(restored as never);
  assert.equal(restored.wheelChaseDialog, true);
  assert.equal(wheelSessionMethods.isPendingChaseSourceCurrent.call(restored as never), false);
  await wheelSessionMethods.keepChase.call(restored as never);
  assert.notEqual(restored.wheelPendingChase, null);
  assert.equal((restored.addWheelSaleToLot as ReturnType<typeof vi.fn>).mock.calls.length, 0);
});

test("loading another wheel session does not erase the previous unresolved chase", async () => {
  const vm = fixture();
  await wheelSpinMethods.recordSpinResult.call(vm as never, 0);
  const obligation = vm.wheelPendingChase;
  const nextConfig = { ...(vm.wheelConfigs as WheelConfig[])[0]!, id: 8, name: "Another wheel" };
  vm.wheelConfigs = [...(vm.wheelConfigs as WheelConfig[]), nextConfig];
  vm.activeWheelConfigId = 8;
  vm.activeWheelConfig = nextConfig;
  vm.wheelDisplayConfig = nextConfig;
  vm.activeWheelSlots = buildSlotsFromConfig(nextConfig);
  stored[getScopedWheelConfigSessionStorageKey({ scopeType: "personal", workspaceId: null }, 8)] = JSON.stringify({ wheelSpinCounts: [0] });
  assert.equal(wheelSessionMethods.loadWheelFromSession.call(vm as never), true);
  assert.equal(vm.wheelPendingChase, obligation);
  assert.equal(vm.wheelChaseDialog, true);
  assert.equal(wheelSessionMethods.isPendingChaseSourceCurrent.call(vm as never), false);
});

test("replace settles the captured prize sale before changing the wheel source", async () => {
  const vm = fixture();
  await wheelSpinMethods.recordSpinResult.call(vm as never, 0);
  const draftId = (vm.wheelPendingChase as { saleDraft: { id: number } }).saleDraft.id;
  vm.wheelChaseReplacementSinglesId = 6;
  await wheelSessionMethods.confirmChaseReplacement.call(vm as never);
  const sale = (vm.addWheelSaleToLot as ReturnType<typeof vi.fn>).mock.calls[0]![1] as { id: number; singlesPurchaseEntryId?: number };
  assert.equal(sale.id, draftId);
  assert.equal(sale.singlesPurchaseEntryId, 5);
  assert.equal((vm.wheelConfigs as WheelConfig[])[0]!.tiers[0]!.boundSinglesId, 6);
  assert.equal(vm.wheelPendingChase, null);
});

test("reset preserves a noninventory unresolved chase and config deletion stays blocked", async () => {
  const vm = fixture({ inventory: false });
  await wheelSpinMethods.recordSpinResult.call(vm as never, 0);
  const obligation = vm.wheelPendingChase;
  wheelSessionMethods.resetWheelSession.call(vm as never);
  assert.equal(vm.wheelPendingChase, obligation);
  assert.equal(vm.wheelChaseDialog, true);
  wheelConfigMethods.deleteWheelConfig.call(vm as never);
  assert.equal((vm.wheelConfigs as WheelConfig[]).length, 1);
  assert.equal(vm.wheelPendingChase, obligation);
});

test("applying an edited config cannot hide the chase decision when returning to live mode", async () => {
  const vm = fixture();
  await wheelSpinMethods.recordSpinResult.call(vm as never, 0);
  const obligation = vm.wheelPendingChase;
  const draftId = (obligation as { saleDraft: { id: number } }).saleDraft.id;
  const originalConfig = (vm.wheelConfigs as WheelConfig[])[0]!;
  vm.wheelMode = "config";
  vm.editingWheelConfig = { ...originalConfig, tiers: [{ ...originalConfig.tiers[0]!, id: "renamed-tier" }] };
  vm.wheelChaseDialog = false;

  wheelConfigMethods.applyWheelConfig.call(vm as never);
  assert.equal((vm.wheelConfigs as WheelConfig[])[0]!.tiers[0]!.id, "chase");
  assert.equal(vm.wheelPendingChase, obligation);
  assert.equal((vm.wheelPendingChase as { saleDraft: { id: number } }).saleDraft.id, draftId);
  assert.equal(vm.wheelChaseDialog, true);

  vm.wheelRequestedMode = "live";
  vm.wheelLiveConfirmDialog = true;
  GameWindow.methods!.confirmWheelModeChange.call(vm as never);
  assert.equal(vm.wheelMode, "live");
  assert.equal(vm.wheelChaseDialog, true);
  assert.equal(vm.wheelPendingChase, obligation);
  assert.equal((vm.wheelPendingChase as { saleDraft: { id: number } }).saleDraft.id, draftId);
});

test("batch record-all settles ordinary issues but always routes the chase through its decision", async () => {
  for (const changedSource of [false, true]) {
    const vm = fixture();
    await wheelSpinMethods.recordSpinResult.call(vm as never, 0);
    const obligation = vm.wheelPendingChase;
    const chaseIssue = vm.wheelPendingInventoryIssues[0]!;
    vm.wheelPendingInventoryIssues.push({
      slotName: "Ordinary pack", slotColor: "#0f0", slotCost: 5, slotTier: "ordinary", slotPacksCount: 1,
      slotDeductionType: "packs", slotIndex: 1, selectedLotId: 10, spinNumber: 2
    });
    if (changedSource) vm.lots[0]!.singlesPurchases![0]!.item = "Repurposed card";

    await wheelSessionMethods.confirmAllBatchSales.call(vm as never);

    assert.equal((vm.addWheelSaleToLot as ReturnType<typeof vi.fn>).mock.calls.length, 1, "only the ordinary sale is recorded");
    assert.equal((vm.addWheelSaleToLot as ReturnType<typeof vi.fn>).mock.calls[0]![1].winningTierId, "ordinary");
    assert.equal(vm.wheelPendingChase, obligation);
    assert.ok(vm.wheelPendingInventoryIssues.some((entry) => entry.pendingSale?.id === chaseIssue.pendingSale?.id));
    assert.equal(vm.wheelChaseDialog, true);
    assert.equal(wheelSessionMethods.isPendingChaseSourceCurrent.call(vm as never), !changedSource);

    const chaseIndex = vm.wheelPendingInventoryIssues.findIndex((entry) => entry.pendingSale?.id === chaseIssue.pendingSale?.id);
    await wheelSessionMethods.confirmBatchSale.call(vm as never, chaseIndex);
    assert.equal((vm.addWheelSaleToLot as ReturnType<typeof vi.fn>).mock.calls.length, 1);
    assert.equal(vm.wheelPendingChase, obligation);
  }
});

test("legacy session without a chase obligation loads with a safe empty default", () => {
  const vm = fixture({ inventory: false });
  stored[getScopedWheelConfigSessionStorageKey({ scopeType: "personal", workspaceId: null }, 7)] = JSON.stringify({ activeWheelConfigId: 7, wheelSpinCounts: [0] });
  assert.equal(wheelSessionMethods.loadWheelFromSession.call(vm as never), true);
  assert.equal(vm.wheelPendingChase, null);
});
