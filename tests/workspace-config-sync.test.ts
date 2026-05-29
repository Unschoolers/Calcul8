import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";

import {
  queueWorkspaceConfigSyncPush,
  stopWorkspaceConfigSyncPush
} from "../src/app-core/methods/ui/workspace/workspace-config-sync.ts";

function createApp(overrides: Record<string, unknown> = {}) {
  return {
    activeScopeType: "workspace",
    activeWorkspaceId: "team-42",
    currentLotId: 101,
    isOffline: false,
    pushCloudSync: vi.fn(async () => undefined),
    ...overrides
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

test("queueWorkspaceConfigSyncPush debounces repeated workspace edits into one push", async () => {
  const app = createApp();

  queueWorkspaceConfigSyncPush(app as never);
  queueWorkspaceConfigSyncPush(app as never);
  queueWorkspaceConfigSyncPush(app as never);

  await vi.advanceTimersByTimeAsync(399);
  assert.equal((app.pushCloudSync as ReturnType<typeof vi.fn>).mock.calls.length, 0);

  await vi.advanceTimersByTimeAsync(1);
  assert.equal((app.pushCloudSync as ReturnType<typeof vi.fn>).mock.calls.length, 1);
});

test("queueWorkspaceConfigSyncPush no-ops outside workspace scope or while offline", async () => {
  const personalApp = createApp({
    activeScopeType: "personal",
    activeWorkspaceId: null
  });
  const offlineApp = createApp({
    isOffline: true
  });

  queueWorkspaceConfigSyncPush(personalApp as never);
  queueWorkspaceConfigSyncPush(offlineApp as never);
  await vi.advanceTimersByTimeAsync(500);

  assert.equal((personalApp.pushCloudSync as ReturnType<typeof vi.fn>).mock.calls.length, 0);
  assert.equal((offlineApp.pushCloudSync as ReturnType<typeof vi.fn>).mock.calls.length, 0);
});

test("queueWorkspaceConfigSyncPush can sync global system defaults without an active lot", async () => {
  const app = createApp({
    currentLotId: null
  });

  queueWorkspaceConfigSyncPush(app as never);
  await vi.advanceTimersByTimeAsync(500);

  assert.equal((app.pushCloudSync as ReturnType<typeof vi.fn>).mock.calls.length, 1);
});

test("stopWorkspaceConfigSyncPush cancels a pending debounced push", async () => {
  const app = createApp();

  queueWorkspaceConfigSyncPush(app as never);
  stopWorkspaceConfigSyncPush(app as never);
  await vi.advanceTimersByTimeAsync(500);

  assert.equal((app.pushCloudSync as ReturnType<typeof vi.fn>).mock.calls.length, 0);
});
