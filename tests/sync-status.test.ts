import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import {
  setSyncStatusError,
  setSyncStatusSuccess,
  startSyncStatus
} from "../src/app-core/methods/ui/sync/sync-status.ts";

function createContext(overrides: Record<string, unknown> = {}) {
  return {
    syncStatus: "idle" as "idle" | "syncing" | "success" | "error",
    syncStatusResetTimeoutId: null as number | null,
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("window", {
    clearTimeout: vi.fn()
  });
});

test("startSyncStatus updates status and leaves null timeout ids alone", () => {
  const context = createContext();

  startSyncStatus(context as never);

  assert.equal(context.syncStatus, "syncing");
  assert.equal(context.syncStatusResetTimeoutId, null);
  assert.equal((window.clearTimeout as ReturnType<typeof vi.fn>).mock.calls.length, 0);
});

test("startSyncStatus clears an existing timeout id", () => {
  const context = createContext({
    syncStatusResetTimeoutId: 42
  });

  startSyncStatus(context as never);

  assert.equal(context.syncStatus, "syncing");
  assert.equal(context.syncStatusResetTimeoutId, null);
  assert.deepEqual((window.clearTimeout as ReturnType<typeof vi.fn>).mock.calls, [[42]]);
});

test("setSyncStatusSuccess handles both empty and existing reset timers", () => {
  const withoutTimer = createContext();
  setSyncStatusSuccess(withoutTimer as never);
  assert.equal(withoutTimer.syncStatus, "success");
  assert.equal(withoutTimer.syncStatusResetTimeoutId, null);

  const withTimer = createContext({
    syncStatusResetTimeoutId: 77
  });
  setSyncStatusSuccess(withTimer as never);
  assert.equal(withTimer.syncStatus, "success");
  assert.equal(withTimer.syncStatusResetTimeoutId, null);
  assert.deepEqual((window.clearTimeout as ReturnType<typeof vi.fn>).mock.calls, [[77]]);
});

test("setSyncStatusError handles both empty and existing reset timers", () => {
  const withoutTimer = createContext();
  setSyncStatusError(withoutTimer as never);
  assert.equal(withoutTimer.syncStatus, "error");
  assert.equal(withoutTimer.syncStatusResetTimeoutId, null);

  const withTimer = createContext({
    syncStatusResetTimeoutId: 91
  });
  setSyncStatusError(withTimer as never);
  assert.equal(withTimer.syncStatus, "error");
  assert.equal(withTimer.syncStatusResetTimeoutId, null);
  assert.deepEqual((window.clearTimeout as ReturnType<typeof vi.fn>).mock.calls, [[91]]);
});