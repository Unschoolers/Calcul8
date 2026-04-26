import assert from "node:assert/strict";
import { test, vi } from "vitest";

const {
  createWheelSpectatorSessionMock,
  publishWheelSpectatorSessionMock,
  buildWheelSpectatorSnapshotMock
} = vi.hoisted(() => ({
  createWheelSpectatorSessionMock: vi.fn(),
  publishWheelSpectatorSessionMock: vi.fn(),
  buildWheelSpectatorSnapshotMock: vi.fn()
}));

vi.mock("../src/app-core/methods/ui/wheel-spectator.ts", () => ({
  createWheelSpectatorSession: createWheelSpectatorSessionMock,
  fetchWheelSpectatorCount: vi.fn(),
  publishWheelSpectatorSession: publishWheelSpectatorSessionMock
}));

vi.mock("../src/components/windows/wheel/services/wheelSpectator.ts", () => ({
  buildWheelSpectatorQrImageUrl: vi.fn((value: string) => `qr:${value}`),
  buildWheelSpectatorSessionUrl: vi.fn((value: string) => `https://example.test/spectator.html?session=${value}`),
  buildWheelSpectatorSnapshot: buildWheelSpectatorSnapshotMock
}));

import { wheelSpectatorMethods } from "../src/components/windows/wheel/wheelSpectatorMethods.ts";

test("publishWheelSpectatorSessionSnapshot republishes the newest queued state after an in-flight publish", async () => {
  let resolveFirstPublish: (() => void) | null = null;
  publishWheelSpectatorSessionMock
    .mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveFirstPublish = resolve;
    }))
    .mockResolvedValueOnce(undefined);
  buildWheelSpectatorSnapshotMock.mockImplementation((vm: Record<string, unknown>, status: string) => ({
    wheelName: "Wheel",
    sessionStatus: status,
    updatedAt: Number(vm.snapshotVersion || 0)
  }));

  const vm = {
    wheelSpectatorSessionId: "abc123",
    wheelSpectatorSessionStatus: "starting",
    wheelSpectatorPublishPending: false,
    snapshotVersion: 1
  } as Record<string, unknown> & {
    publishWheelSpectatorSessionSnapshot: (statusOverride?: "starting" | "live" | "ended") => Promise<void>;
  };
  vm.publishWheelSpectatorSessionSnapshot = (statusOverride) =>
    wheelSpectatorMethods.publishWheelSpectatorSessionSnapshot.call(vm as never, statusOverride);

  const firstPublish = vm.publishWheelSpectatorSessionSnapshot();
  vm.snapshotVersion = 2;
  vm.wheelSpectatorSessionStatus = "live";
  const queuedPublish = vm.publishWheelSpectatorSessionSnapshot();

  assert.equal(publishWheelSpectatorSessionMock.mock.calls.length, 1);
  resolveFirstPublish?.();
  await firstPublish;
  await queuedPublish;

  assert.equal(publishWheelSpectatorSessionMock.mock.calls.length, 2);
  assert.equal(publishWheelSpectatorSessionMock.mock.calls[0]?.[2]?.updatedAt, 1);
  assert.equal(publishWheelSpectatorSessionMock.mock.calls[1]?.[2]?.updatedAt, 2);
  assert.equal(vm.wheelSpectatorPublishPending, false);
});

test("startWheelSpectatorMode restarts an ended spectator session as active", async () => {
  createWheelSpectatorSessionMock.mockResolvedValueOnce({ publicSessionId: "fresh123" });
  buildWheelSpectatorSnapshotMock.mockImplementation((vm: Record<string, unknown>, status: string) => ({
    wheelName: "Wheel",
    sessionStatus: status,
    updatedAt: Number(vm.snapshotVersion || 0)
  }));

  const vm = {
    wheelMode: "config",
    wheelTotalSpins: 0,
    snapshotVersion: 3,
    wheelSpectatorSessionId: "old123",
    wheelSpectatorSessionStatus: "ended",
    wheelSpectatorSessionUrl: "https://example.test/spectator.html?session=old123",
    wheelSpectatorSessionQrUrl: "qr:old123",
    wheelSpectatorPublishPending: false,
    wheelSpectatorConnectedCount: 2
  };

  await wheelSpectatorMethods.startWheelSpectatorMode.call(vm as never);

  assert.equal(createWheelSpectatorSessionMock.mock.calls.length, 1);
  assert.equal(createWheelSpectatorSessionMock.mock.calls[0]?.[1]?.sessionStatus, "starting");
  assert.equal(vm.wheelSpectatorSessionId, "fresh123");
  assert.equal(vm.wheelSpectatorSessionStatus, "starting");
  assert.equal(vm.wheelSpectatorConnectedCount, 0);
});
