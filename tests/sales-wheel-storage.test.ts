import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";

import { salesMethods } from "../src/app-core/methods/sales.ts";
import {
  getScopedWheelConfigsStorageKey,
  getScopedWheelSessionStorageKey,
  STORAGE_KEYS
} from "../src/app-core/storageKeys.ts";

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

function createContext(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    activeScopeType: "personal",
    activeWorkspaceId: null,
    lots: [],
    wheelConfigs: [],
    activeWheelConfigId: null,
    wheelTotalSpins: 0,
    wheelSpinCounts: [],
    wheelLastResult: "",
    wheelSessionUpdatedAt: 0,
    wheelSessionLotSelections: {},
    wheelSkippedDeductions: [],
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("loadWheelFromStorage clears stale wheel config and session state when scoped storage is empty", async () => {
  await withMockedLocalStorage(async () => {
    const context = createContext({
      activeScopeType: "workspace",
      activeWorkspaceId: "team-42",
      wheelConfigs: [{ id: 91, name: "Personal Wheel", spinPrice: 10, targetMargin: 40, createdAt: "", tiers: [] }],
      activeWheelConfigId: 91,
      wheelTotalSpins: 7,
      wheelSpinCounts: [7],
      wheelLastResult: "Old result",
      wheelSessionUpdatedAt: 123,
      wheelSessionLotSelections: { t1: 10 },
      wheelSkippedDeductions: [{ tierId: "t1" }]
    });

    salesMethods.loadWheelFromStorage.call(context as never);

    assert.deepEqual(context.wheelConfigs, []);
    assert.equal(context.activeWheelConfigId, null);
    assert.equal(context.wheelTotalSpins, 0);
    assert.deepEqual(context.wheelSpinCounts, []);
    assert.equal(context.wheelLastResult, "");
    assert.equal(context.wheelSessionUpdatedAt, 0);
    assert.deepEqual(context.wheelSessionLotSelections, {});
    assert.deepEqual(context.wheelSkippedDeductions, []);
  });
});

test("loadWheelFromStorage reads workspace-scoped wheel state without falling back to personal storage", async () => {
  await withMockedLocalStorage(async (data) => {
    data.set(
      STORAGE_KEYS.WHEEL_CONFIGS,
      JSON.stringify([{ id: 91, name: "Personal Wheel", spinPrice: 10, targetMargin: 40, createdAt: "", tiers: [] }])
    );
    data.set(
      getScopedWheelConfigsStorageKey({
        scopeType: "workspace",
        workspaceId: "team-42"
      }),
      JSON.stringify([{ id: 42, name: "Workspace Wheel", spinPrice: 12, targetMargin: 35, createdAt: "", tiers: [] }])
    );
    data.set(
      getScopedWheelSessionStorageKey({
        scopeType: "workspace",
        workspaceId: "team-42"
      }),
      JSON.stringify({
        activeWheelConfigId: 42,
        wheelTotalSpins: 3,
        wheelSpinCounts: [3],
        wheelLastResult: "Workspace result",
        wheelSessionUpdatedAt: 456,
        wheelSessionNetRevenue: 24.5,
        wheelSessionCostAdjustment: 5,
        wheelFairnessHistory: [{ spinNumber: 1, label: "Prize", color: "#f00", hash: "h", seed: "s", timestamp: 1 }],
        wheelChaseTallyHistory: [{ tierId: "t2", label: "Prize", color: "#f00", count: 1 }],
        wheelSessionLotSelections: { t2: 77 },
        wheelSkippedDeductions: [{ tierId: "t2" }],
        wheelCurrentAngle: 1.25,
        wheelLastResultColor: "#f00"
      })
    );

    const context = createContext({
      activeScopeType: "workspace",
      activeWorkspaceId: "team-42"
    });

    salesMethods.loadWheelFromStorage.call(context as never);

    assert.equal((context.wheelConfigs as Array<{ id: number; name: string }>).length, 1);
    assert.equal((context.wheelConfigs as Array<{ id: number; name: string }>)[0]?.id, 42);
    assert.equal((context.wheelConfigs as Array<{ id: number; name: string }>)[0]?.name, "Workspace Wheel");
    assert.equal(context.activeWheelConfigId, 42);
    assert.equal(context.wheelTotalSpins, 3);
    assert.deepEqual(context.wheelSpinCounts, [3]);
    assert.equal(context.wheelLastResult, "Workspace result");
    assert.equal(context.wheelSessionUpdatedAt, 456);
    assert.equal(context.wheelSessionNetRevenue, 24.5);
    assert.equal(context.wheelSessionCostAdjustment, 5);
    assert.equal((context.wheelFairnessHistory as Array<{ spinNumber: number }>)[0]?.spinNumber, 1);
    assert.equal((context.wheelChaseTallyHistory as Array<{ tierId: string }>)[0]?.tierId, "t2");
    assert.deepEqual(context.wheelSessionLotSelections, { t2: 77 });
    assert.deepEqual(context.wheelSkippedDeductions, [{ tierId: "t2" }]);
    assert.equal(context.wheelCurrentAngle, 1.25);
    assert.equal(context.wheelLastResultColor, "#f00");
  });
});

test("saveWheelSessionToStorage preserves richer wheel session fields already mirrored by the wheel window", async () => {
  await withMockedLocalStorage(async (data) => {
    data.set(
      getScopedWheelSessionStorageKey({
        scopeType: "personal"
      }),
      JSON.stringify({
        activeWheelConfigId: 42,
        wheelSessionNetRevenue: 24.5,
        wheelSessionCostAdjustment: 5,
        wheelFairnessHistory: [{ spinNumber: 1, label: "Prize", color: "#f00", hash: "h", seed: "s", timestamp: 1 }],
        wheelChaseTallyHistory: [{ tierId: "t2", label: "Prize", color: "#f00", count: 1 }],
        wheelCurrentAngle: 1.25,
        wheelLastResultColor: "#f00"
      })
    );

    const context = createContext({
      activeWheelConfigId: 42,
      wheelTotalSpins: 3,
      wheelSpinCounts: [3],
      wheelLastResult: "Workspace result",
      wheelSessionUpdatedAt: 456,
      wheelSessionLotSelections: { t2: 77 },
      wheelSkippedDeductions: [{ tierId: "t2" }]
    });

    salesMethods.saveWheelSessionToStorage.call(context as never);

    const saved = JSON.parse(data.get(getScopedWheelSessionStorageKey({ scopeType: "personal" })) || "{}");
    assert.equal(saved.activeWheelConfigId, 42);
    assert.equal(saved.wheelSessionNetRevenue, 24.5);
    assert.equal(saved.wheelSessionCostAdjustment, 5);
    assert.equal(saved.wheelCurrentAngle, 1.25);
    assert.equal(saved.wheelLastResultColor, "#f00");
    assert.equal(saved.wheelLastResult, "Workspace result");
    assert.deepEqual(saved.wheelSessionLotSelections, { t2: 77 });
  });
});
