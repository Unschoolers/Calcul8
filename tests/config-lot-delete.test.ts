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
    getItem: vi.fn(),
    removeItem: vi.fn()
  });
});

test("deleteCurrentLotWithPersistence returns early when there is no current lot or matching lot", () => {
  const noCurrentLot = createContext({
    currentLotId: null,
    askConfirmation: vi.fn()
  });

  deleteCurrentLotWithPersistence(noCurrentLot as never, {
    getLastLotStorageKey: () => "whatfees_last_lot_id",
    getStorageScope: () => ({ scopeType: "personal" })
  });

  assert.equal((noCurrentLot.askConfirmation as ReturnType<typeof vi.fn>).mock.calls.length, 0);

  const missingLot = createContext({
    currentLotId: 555,
    askConfirmation: vi.fn()
  });

  deleteCurrentLotWithPersistence(missingLot as never, {
    getLastLotStorageKey: () => "whatfees_last_lot_id",
    getStorageScope: () => ({ scopeType: "personal" })
  });

  assert.equal((missingLot.askConfirmation as ReturnType<typeof vi.fn>).mock.calls.length, 0);
});

test("deleteCurrentLotWithPersistence removes lot storage and allows empty overwrite only for final lot", () => {
  const localStorageMock = globalThis.localStorage as {
    getItem: ReturnType<typeof vi.fn>;
    removeItem: ReturnType<typeof vi.fn>;
  };
  localStorageMock.getItem.mockReturnValue("999");
  const ctx = createContext();

  deleteCurrentLotWithPersistence(ctx as never, {
    getLastLotStorageKey: () => "whatfees_last_lot_id",
    getStorageScope: () => ({ scopeType: "personal" })
  });

  assert.equal((ctx.lots as Array<{ id: number }>).length, 1);
  assert.deepEqual(localStorageMock.removeItem.mock.calls[0], ["sales_999"]);
  assert.deepEqual(localStorageMock.removeItem.mock.calls[1], ["whatfees_sales_status_999"]);
  assert.deepEqual(localStorageMock.removeItem.mock.calls[2], ["whatfees_last_lot_id"]);
  assert.deepEqual((ctx.pushCloudSync as ReturnType<typeof vi.fn>).mock.calls[0], [true, { allowEmptyOverwrite: false }]);

  localStorageMock.removeItem.mockClear();
  const lastCtx = createContext({
    lots: [makeLot({ id: 999, name: "Last Lot" })]
  });
  deleteCurrentLotWithPersistence(lastCtx as never, {
    getLastLotStorageKey: () => "whatfees_last_lot_id",
    getStorageScope: () => ({ scopeType: "personal" })
  });
  assert.deepEqual((lastCtx.pushCloudSync as ReturnType<typeof vi.fn>).mock.calls[0], [true, { allowEmptyOverwrite: true }]);
});

test("deleteCurrentLotWithPersistence uses workspace-scoped last lot storage without legacy fallback", () => {
  const localStorageMock = globalThis.localStorage as {
    getItem: ReturnType<typeof vi.fn>;
    removeItem: ReturnType<typeof vi.fn>;
  };
  localStorageMock.getItem.mockReturnValue("999");
  const ctx = createContext({
    activeScopeType: "workspace",
    activeWorkspaceId: "team-42"
  });

  deleteCurrentLotWithPersistence(ctx as never, {
    getLastLotStorageKey: () => "whatfees_workspace_last_lot_id",
    getStorageScope: () => ({ scopeType: "workspace", workspaceId: "team-42" })
  });

  assert.deepEqual(localStorageMock.removeItem.mock.calls[2], ["whatfees_workspace_last_lot_id"]);
});

test("deleteCurrentLotWithPersistence ignores localStorage cache status cleanup failures", () => {
  const localStorageMock = globalThis.localStorage as {
    getItem: ReturnType<typeof vi.fn>;
    removeItem: ReturnType<typeof vi.fn>;
  };
  localStorageMock.getItem.mockReturnValue("999");
  localStorageMock.removeItem.mockImplementation(() => {
    throw new Error("quota");
  });

  const ctx = createContext();

  deleteCurrentLotWithPersistence(ctx as never, {
    getLastLotStorageKey: () => "whatfees_last_lot_id",
    getStorageScope: () => ({ scopeType: "personal" })
  });

  assert.equal(ctx.currentLotId, null);
  assert.deepEqual((ctx.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1), ["Lot deleted", "info"]);
});
