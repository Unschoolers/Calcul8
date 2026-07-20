import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const {
  refreshWorkspaceRealtimeMock,
  stopWorkspaceRealtimeMock,
  resetWhatnotSignedOutStateMock,
  resetWhatnotTransientUiStateMock
} = vi.hoisted(() => ({
  refreshWorkspaceRealtimeMock: vi.fn(),
  stopWorkspaceRealtimeMock: vi.fn(),
  resetWhatnotSignedOutStateMock: vi.fn(),
  resetWhatnotTransientUiStateMock: vi.fn()
}));

vi.mock("../src/app-core/methods/ui/workspace/workspace-realtime.ts", () => ({
  refreshWorkspaceRealtime: refreshWorkspaceRealtimeMock,
  stopWorkspaceRealtime: stopWorkspaceRealtimeMock
}));

vi.mock("../src/app-core/methods/ui/whatnot/whatnot.ts", () => ({
  resetWhatnotSignedOutState: resetWhatnotSignedOutStateMock,
  resetWhatnotTransientUiState: resetWhatnotTransientUiStateMock
}));

import { appWatch } from "../src/app-core/watch.ts";

function createSignedInContext(isAuthSessionResolving: boolean) {
  return {
    isGoogleSignedIn: true,
    isAuthSessionResolving,
    currentLotId: null,
    pendingWorkspaceInviteToken: "",
    whatnotCallbackStatus: null,
    whatnotCallbackMessage: "",
    startCloudSyncScheduler: vi.fn(),
    refreshWorkspaces: vi.fn(async () => true),
    refreshWhatnotStatus: vi.fn(async () => undefined),
    hydrateBuyerProfiles: vi.fn(async () => undefined),
    retryPendingBuyerProfiles: vi.fn(async () => undefined),
    previewPendingWorkspaceInvite: vi.fn(async () => undefined),
    syncGuidedOnboarding: vi.fn()
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

test("auth watcher waits for session bootstrap before starting signed-in services", () => {
  const context = createSignedInContext(true);

  appWatch.googleAuthEpoch.call(context as never);

  assert.equal(context.startCloudSyncScheduler.mock.calls.length, 0);
  assert.equal(refreshWorkspaceRealtimeMock.mock.calls.length, 0);
  assert.equal(context.refreshWorkspaces.mock.calls.length, 0);
  assert.equal(context.refreshWhatnotStatus.mock.calls.length, 0);
  assert.equal(context.hydrateBuyerProfiles.mock.calls.length, 0);
  assert.equal(context.retryPendingBuyerProfiles.mock.calls.length, 0);
});

test("auth watcher starts signed-in services after session bootstrap resolves", () => {
  const context = createSignedInContext(false);

  appWatch.googleAuthEpoch.call(context as never);

  assert.equal(context.startCloudSyncScheduler.mock.calls.length, 1);
  assert.equal(refreshWorkspaceRealtimeMock.mock.calls.length, 1);
  assert.equal(context.refreshWorkspaces.mock.calls.length, 1);
  assert.equal(context.refreshWhatnotStatus.mock.calls.length, 1);
  assert.equal(context.hydrateBuyerProfiles.mock.calls.length, 1);
  assert.equal(context.retryPendingBuyerProfiles.mock.calls.length, 1);
});
