import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const {
  createGameSpectatorSessionMock,
  publishGameSpectatorSessionMock,
  buildGameSpectatorSnapshotMock
} = vi.hoisted(() => ({
  createGameSpectatorSessionMock: vi.fn(),
  publishGameSpectatorSessionMock: vi.fn(),
  buildGameSpectatorSnapshotMock: vi.fn()
}));

vi.mock("../src/app-core/methods/ui/spectator/game-spectator.ts", () => ({
  createGameSpectatorSession: createGameSpectatorSessionMock,
  fetchGameSpectatorCount: vi.fn(),
  isGameSpectatorSessionNotFoundError: (error: unknown) =>
    error instanceof Error && error.name === "GameSpectatorSessionNotFoundError",
  publishGameSpectatorSession: publishGameSpectatorSessionMock
}));

vi.mock("../src/components/windows/game/services/gameSpectator.ts", () => ({
  buildGameSpectatorQrImageUrl: vi.fn((value: string) => `qr:${value}`),
  buildGameSpectatorSessionUrl: vi.fn((value: string) => `https://example.test/spectator.html?session=${value}`),
  buildGameSpectatorSnapshot: buildGameSpectatorSnapshotMock
}));

import { gameSpectatorMethods } from "../src/components/windows/game/commands/gameSpectatorMethods.ts";

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

test("publishGameSpectatorSessionSnapshot republishes the newest queued state after an in-flight publish", async () => {
  let resolveFirstPublish: (() => void) | null = null;
  publishGameSpectatorSessionMock
    .mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveFirstPublish = resolve;
    }))
    .mockResolvedValueOnce(undefined);
  buildGameSpectatorSnapshotMock.mockImplementation((vm: Record<string, unknown>, status: string) => ({
    wheelName: "Wheel",
    sessionStatus: status,
    updatedAt: Number(vm.snapshotVersion || 0)
  }));

  const vm = {
    gameSpectatorSessionId: "abc123",
    gameSpectatorSessionStatus: "starting",
    gameSpectatorPublishPending: false,
    snapshotVersion: 1
  } as Record<string, unknown> & {
    publishGameSpectatorSessionSnapshot: (statusOverride?: "starting" | "live" | "ended") => Promise<void>;
  };
  vm.publishGameSpectatorSessionSnapshot = (statusOverride) =>
    gameSpectatorMethods.publishGameSpectatorSessionSnapshot.call(vm as never, statusOverride);

  const firstPublish = vm.publishGameSpectatorSessionSnapshot();
  vm.snapshotVersion = 2;
  vm.gameSpectatorSessionStatus = "live";
  const queuedPublish = vm.publishGameSpectatorSessionSnapshot();

  assert.equal(publishGameSpectatorSessionMock.mock.calls.length, 1);
  resolveFirstPublish?.();
  await firstPublish;
  await queuedPublish;

  assert.equal(publishGameSpectatorSessionMock.mock.calls.length, 2);
  assert.equal(publishGameSpectatorSessionMock.mock.calls[0]?.[2]?.updatedAt, 1);
  assert.equal(publishGameSpectatorSessionMock.mock.calls[1]?.[2]?.updatedAt, 2);
  assert.equal(vm.gameSpectatorPublishPending, false);
});

test("startGameSpectatorMode restarts an ended spectator session as active", async () => {
  createGameSpectatorSessionMock.mockResolvedValueOnce({ publicSessionId: "fresh123" });
  buildGameSpectatorSnapshotMock.mockImplementation((vm: Record<string, unknown>, status: string) => ({
    wheelName: "Wheel",
    sessionStatus: status,
    updatedAt: Number(vm.snapshotVersion || 0)
  }));

  const vm = {
    wheelMode: "config",
    wheelTotalSpins: 0,
    snapshotVersion: 3,
    gameSpectatorSessionId: "old123",
    gameSpectatorSessionStatus: "ended",
    gameSpectatorSessionUrl: "https://example.test/spectator.html?session=old123",
    gameSpectatorSessionQrUrl: "qr:old123",
    gameSpectatorPublishPending: false,
    gameSpectatorConnectedCount: 2
  };

  await gameSpectatorMethods.startGameSpectatorMode.call(vm as never);

  assert.equal(createGameSpectatorSessionMock.mock.calls.length, 1);
  assert.equal(createGameSpectatorSessionMock.mock.calls[0]?.[1]?.sessionStatus, "starting");
  assert.equal(vm.gameSpectatorSessionId, "fresh123");
  assert.equal(vm.gameSpectatorSessionStatus, "starting");
  assert.equal(vm.gameSpectatorConnectedCount, 0);
});

test("publishGameSpectatorSessionSnapshot disables local spectator mode after backend 404", async () => {
  const staleError = new Error("stale");
  staleError.name = "GameSpectatorSessionNotFoundError";
  publishGameSpectatorSessionMock.mockRejectedValueOnce(staleError);
  buildGameSpectatorSnapshotMock.mockImplementation((vm: Record<string, unknown>, status: string) => ({
    wheelName: "Wheel",
    sessionStatus: status,
    updatedAt: Number(vm.snapshotVersion || 0)
  }));

  const vm = {
    wheelMode: "live",
    wheelTotalSpins: 1,
    snapshotVersion: 4,
    gameSpectatorSessionId: "dead123",
    gameSpectatorSessionStatus: "live",
    gameSpectatorSessionUrl: "https://example.test/spectator.html?session=dead123",
    gameSpectatorSessionQrUrl: "qr:dead123",
    gameSpectatorPublishPending: false,
    gameSpectatorConnectedCount: 3,
    saveWheelSession: vi.fn(),
    notify: vi.fn()
  } as Record<string, unknown> & {
    publishGameSpectatorSessionSnapshot: (statusOverride?: "starting" | "live" | "ended") => Promise<void>;
  };
  vm.publishGameSpectatorSessionSnapshot = (statusOverride) =>
    gameSpectatorMethods.publishGameSpectatorSessionSnapshot.call(vm as never, statusOverride);

  await vm.publishGameSpectatorSessionSnapshot();

  assert.equal(publishGameSpectatorSessionMock.mock.calls.length, 1);
  assert.equal(publishGameSpectatorSessionMock.mock.calls[0]?.[1], "dead123");
  assert.equal(createGameSpectatorSessionMock.mock.calls.length, 0);
  assert.equal(vm.gameSpectatorSessionId, "");
  assert.equal(vm.gameSpectatorSessionStatus, "inactive");
  assert.equal(vm.gameSpectatorSessionUrl, "");
  assert.equal(vm.gameSpectatorSessionQrUrl, "");
  assert.equal(vm.gameSpectatorConnectedCount, 0);
  assert.equal((vm.saveWheelSession as ReturnType<typeof vi.fn>).mock.calls.length, 1);
  assert.deepEqual((vm.notify as ReturnType<typeof vi.fn>).mock.calls[0], [
    "Spectator session expired. Start spectator mode again to create a new link.",
    "warning"
  ]);
});

test("refreshGameSpectatorCount clears stale local spectator state after a backend 404", async () => {
  const spectatorApi = await import("../src/app-core/methods/ui/spectator/game-spectator.ts");
  const countMock = vi.mocked(spectatorApi.fetchGameSpectatorCount);
  const staleError = new Error("stale");
  staleError.name = "GameSpectatorSessionNotFoundError";
  countMock.mockRejectedValueOnce(staleError);

  const vm = {
    gameSpectatorSessionId: "dead123",
    gameSpectatorSessionStatus: "live",
    gameSpectatorSessionUrl: "https://example.test/spectator.html?session=dead123",
    gameSpectatorSessionQrUrl: "qr:dead123",
    gameSpectatorConnectedCount: 2,
    _gameSpectatorCountRequestPending: false,
    _gameSpectatorCountPollIntervalId: 123,
    saveWheelSession: vi.fn(),
    notify: vi.fn()
  } as Record<string, unknown>;
  vi.stubGlobal("clearInterval", vi.fn());

  await gameSpectatorMethods.refreshGameSpectatorCount.call(vm as never);

  assert.equal(vm.gameSpectatorSessionId, "");
  assert.equal(vm.gameSpectatorSessionStatus, "inactive");
  assert.equal(vm.gameSpectatorSessionUrl, "");
  assert.equal(vm.gameSpectatorSessionQrUrl, "");
  assert.equal(vm.gameSpectatorConnectedCount, 0);
  assert.equal(vm._gameSpectatorCountPollIntervalId, undefined);
  assert.equal((vm.saveWheelSession as ReturnType<typeof vi.fn>).mock.calls.length, 1);
  assert.deepEqual((vm.notify as ReturnType<typeof vi.fn>).mock.calls[0], [
    "Spectator session expired. Start spectator mode again to create a new link.",
    "warning"
  ]);
});
