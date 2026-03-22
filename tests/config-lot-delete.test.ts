import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import { deleteCurrentLotWithPersistence } from "../src/app-core/methods/config-lot-delete.ts";
import { makeLot } from "./helpers/fixtures.ts";

function createContext(overrides: Record<string, unknown> = {}) {
  return {
    currentLotId: 999,
    lots: [makeLot({ id: 999, name: "To Delete" }), makeLot({ id: 123, name: "Keep" })],
    activeScopeType: "personal",
    activeWorkspaceId: null,
    loadSalesForLotId: vi.fn(() => [{ id: 1 }]),
    saveLotsToStorage: vi.fn(),
    getSalesStorageKey: (lotId: number) => `sales_${lotId}`,
    askConfirmation: vi.fn((_opts, onConfirm: () => void) => onConfirm()),
    notify: vi.fn(),
    pushCloudSync: vi.fn(async () => undefined),
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("localStorage", {
    getItem: vi.fn()
  });
});

test("deleteCurrentLotWithPersistence removes lot storage and allows empty overwrite only for final lot", () => {
  const removeStorage = vi.fn();
  const readStorage = vi.fn(() => "999");
  const ctx = createContext();

  deleteCurrentLotWithPersistence(ctx as never, {
    readStorage,
    removeStorage,
    getLegacySalesKey: (lotId) => `legacy_sales_${lotId}`,
    getLastLotStorageKey: () => "whatfees_last_lot_id",
    getStorageScope: () => ({ type: "personal" }),
    legacyKeys: { LAST_LOT_ID: "legacy_last_lot_id" }
  });

  assert.equal((ctx.lots as Array<{ id: number }>).length, 1);
  assert.deepEqual(removeStorage.mock.calls[0], ["sales_999", "legacy_sales_999"]);
  assert.deepEqual(removeStorage.mock.calls[1], ["whatfees_last_lot_id", "legacy_last_lot_id"]);
  assert.deepEqual((ctx.pushCloudSync as ReturnType<typeof vi.fn>).mock.calls[0], [true, { allowEmptyOverwrite: false }]);

  const lastCtx = createContext({
    lots: [makeLot({ id: 999, name: "Last Lot" })]
  });
  deleteCurrentLotWithPersistence(lastCtx as never, {
    readStorage,
    removeStorage: vi.fn(),
    getLegacySalesKey: (lotId) => `legacy_sales_${lotId}`,
    getLastLotStorageKey: () => "whatfees_last_lot_id",
    getStorageScope: () => ({ type: "personal" }),
    legacyKeys: { LAST_LOT_ID: "legacy_last_lot_id" }
  });
  assert.deepEqual((lastCtx.pushCloudSync as ReturnType<typeof vi.fn>).mock.calls[0], [true, { allowEmptyOverwrite: true }]);
});
