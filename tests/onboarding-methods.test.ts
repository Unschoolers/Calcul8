import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import type { LotType } from "../src/types/app.ts";

const { driverMock } = vi.hoisted(() => ({
  driverMock: vi.fn()
}));

vi.mock("driver.js", () => ({
  driver: driverMock
}));

import { uiOnboardingMethods } from "../src/app-core/methods/ui/common/onboarding.ts";
import { STORAGE_KEYS } from "../src/app-core/storageKeys.ts";

type MockStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function createMockStorage(seed: Record<string, string> = {}): MockStorage {
  const map = new Map(Object.entries(seed));
  return {
    getItem(key: string): string | null {
      return map.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      map.set(key, String(value));
    },
    removeItem(key: string): void {
      map.delete(key);
    }
  };
}

function createContext(overrides: Record<string, unknown> = {}) {
  const ctx = {
    isGoogleSignedIn: true,
    activeScopeType: "personal",
    lots: [],
    guidedOnboardingStatus: "idle",
    guidedOnboardingLotType: null as LotType | null,
    guidedOnboardingTargetLotId: null as number | null,
    currentTab: "dashboard",
    newLotType: "bulk" as LotType,
    showNewLotModal: false,
    t: (key: string) => key,
    $nextTick: vi.fn((callback: () => void) => {
      callback();
      return Promise.resolve();
    }),
    ...overrides
  } as unknown as Record<string, unknown>;

  for (const [name, method] of Object.entries(uiOnboardingMethods as unknown as Record<string, unknown>)) {
    if (typeof method === "function") {
      ctx[name] = (method as (...args: unknown[]) => unknown).bind(ctx);
    }
  }

  return ctx;
}

function stubTourTargets(targets: string[]): void {
  vi.stubGlobal("document", {
    querySelector: vi.fn((selector: string) => {
      const matchedTarget = targets.find((target) => selector.includes(target));
      return matchedTarget ? { id: matchedTarget } : null;
    })
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("localStorage", createMockStorage());
  vi.stubGlobal("window", {
    setTimeout: vi.fn((callback: () => void) => {
      callback();
      return 1;
    })
  });
  stubTourTargets([]);
  driverMock.mockImplementation((config: unknown) => ({
    config,
    destroy: vi.fn(),
    drive: vi.fn()
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("syncGuidedOnboarding derives runtime state from persisted onboarding status", () => {
  const ctx = createContext();

  uiOnboardingMethods.syncGuidedOnboarding.call(ctx as never);
  assert.equal(ctx.guidedOnboardingStatus, "available");

  localStorage.setItem(STORAGE_KEYS.ONBOARDING_STATUS, "completed");
  uiOnboardingMethods.syncGuidedOnboarding.call(ctx as never);
  assert.equal(ctx.guidedOnboardingStatus, "completed");
  assert.equal(ctx.guidedOnboardingLotType, null);
  assert.equal(ctx.guidedOnboardingTargetLotId, null);

  localStorage.setItem(STORAGE_KEYS.ONBOARDING_STATUS, "dismissed");
  uiOnboardingMethods.syncGuidedOnboarding.call(ctx as never);
  assert.equal(ctx.guidedOnboardingStatus, "dismissed");

  localStorage.removeItem(STORAGE_KEYS.ONBOARDING_STATUS);
  ctx.lots = [{ id: 1, name: "Existing lot" }];
  uiOnboardingMethods.syncGuidedOnboarding.call(ctx as never);
  assert.equal(ctx.guidedOnboardingStatus, "idle");
});

test("startGuidedOnboarding opens the new-lot tour and dismisses from the driver close action", () => {
  stubTourTargets(["guided-onboarding-new-lot-card"]);
  const ctx = createContext();

  uiOnboardingMethods.startGuidedOnboarding.call(ctx as never, "singles");

  assert.equal(ctx.guidedOnboardingStatus, "running");
  assert.equal(ctx.guidedOnboardingLotType, "singles");
  assert.equal(ctx.currentTab, "config");
  assert.equal(ctx.newLotType, "singles");
  assert.equal(ctx.showNewLotModal, true);
  assert.equal(driverMock.mock.calls.length, 1);

  const driverInstance = driverMock.mock.results[0]?.value;
  assert.equal(driverInstance.drive.mock.calls.length, 1);
  const config = driverMock.mock.calls[0]?.[0] as {
    steps: Array<{ element: string; popover: Record<string, unknown> }>;
    onCloseClick: () => void;
  };
  assert.equal(config.steps[0]?.element, "guided-onboarding-new-lot-card");
  assert.deepEqual(config.steps[0]?.popover.showButtons, ["close"]);

  config.onCloseClick();

  assert.equal(ctx.guidedOnboardingStatus, "dismissed");
  assert.equal(localStorage.getItem(STORAGE_KEYS.ONBOARDING_STATUS), "dismissed");
  assert.equal(driverInstance.destroy.mock.calls.length, 1);
});

test("handleGuidedOnboardingLotCreated completes the post-create singles tour", () => {
  stubTourTargets([
    "guided-onboarding-singles-purchasing",
    "guided-onboarding-singles-add-fab"
  ]);
  const ctx = createContext({
    guidedOnboardingStatus: "running",
    guidedOnboardingLotType: "singles"
  });

  uiOnboardingMethods.handleGuidedOnboardingLotCreated.call(ctx as never, "singles", 42);

  assert.equal(ctx.guidedOnboardingTargetLotId, 42);
  assert.equal(ctx.currentTab, "config");
  assert.equal((ctx.$nextTick as ReturnType<typeof vi.fn>).mock.calls.length, 1);
  assert.equal(driverMock.mock.calls.length, 1);

  const config = driverMock.mock.calls[0]?.[0] as {
    steps: Array<{ element: string; popover: Record<string, unknown> }>;
    onDestroyed: () => void;
  };
  assert.deepEqual(config.steps.map((step) => step.element), [
    "guided-onboarding-singles-purchasing",
    "guided-onboarding-singles-add-fab"
  ]);
  assert.equal(config.steps.at(-1)?.popover.doneBtnText, "commonDone");

  config.onDestroyed();

  assert.equal(localStorage.getItem(STORAGE_KEYS.ONBOARDING_STATUS), "completed");
  assert.equal(ctx.guidedOnboardingStatus, "completed");
  assert.equal(ctx.guidedOnboardingLotType, null);
  assert.equal(ctx.guidedOnboardingTargetLotId, null);
});

test("stopGuidedOnboarding restores an available prompt when a running tour stops", () => {
  const driverInstance = {
    destroy: vi.fn(),
    drive: vi.fn()
  };
  driverMock.mockReturnValue(driverInstance);
  stubTourTargets(["guided-onboarding-new-lot-card"]);
  const ctx = createContext();

  uiOnboardingMethods.startGuidedOnboarding.call(ctx as never, "bulk");
  uiOnboardingMethods.stopGuidedOnboarding.call(ctx as never);

  assert.equal(driverInstance.destroy.mock.calls.length, 1);
  assert.equal(ctx.guidedOnboardingStatus, "available");
  assert.equal(ctx.guidedOnboardingLotType, null);
  assert.equal(ctx.guidedOnboardingTargetLotId, null);
});
