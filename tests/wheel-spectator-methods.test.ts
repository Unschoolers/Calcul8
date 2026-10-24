import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import { translateAppMessage } from "../src/app-core/i18n/index.ts";

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

type TranslatedVmBase = {
  preferredLanguage: string;
  t: (key: string, params?: Record<string, string | number | null | undefined>) => string;
  notify: ReturnType<typeof vi.fn>;
};

function translatedVm(language: string): TranslatedVmBase;
function translatedVm<T extends object>(language: string, overrides: T): TranslatedVmBase & T;
function translatedVm(language: string, overrides: object = {}): TranslatedVmBase {
  return {
    preferredLanguage: language,
    t: (key: string, params?: Record<string, string | number | null | undefined>) =>
      translateAppMessage(language, key, params),
    notify: vi.fn(),
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

test("publishGameSpectatorSessionSnapshot republishes the newest queued state after an in-flight publish", async () => {
  let resolveFirstPublish: () => void = () => {
    throw new Error("Publish resolver was not initialized.");
  };
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
  } as unknown as Record<string, unknown> & {
    publishGameSpectatorSessionSnapshot: (statusOverride?: "starting" | "live" | "ended") => Promise<void>;
  };
  vm.publishGameSpectatorSessionSnapshot = (statusOverride) =>
    gameSpectatorMethods.publishGameSpectatorSessionSnapshot.call(vm as never, statusOverride);

  const firstPublish = vm.publishGameSpectatorSessionSnapshot();
  vm.snapshotVersion = 2;
  vm.gameSpectatorSessionStatus = "live";
  const queuedPublish = vm.publishGameSpectatorSessionSnapshot();

  assert.equal(publishGameSpectatorSessionMock.mock.calls.length, 1);
  resolveFirstPublish();
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
    wheelMode: "live",
    wheelTotalSpins: 0,
    snapshotVersion: 3,
    gameSpectatorSessionId: "old123",
    gameSpectatorSessionStatus: "ended",
    gameSpectatorSessionUrl: "https://example.test/spectator.html?session=old123",
    gameSpectatorSessionQrUrl: "qr:old123",
    gameSpectatorPublishPending: false,
    gameSpectatorConnectedCount: 2,
    preferredLanguage: "en",
    t: (key: string, params?: Record<string, string | number | null | undefined>) =>
      translateAppMessage("en", key, params),
    notify: vi.fn()
  };

  await gameSpectatorMethods.startGameSpectatorMode.call(vm as never);

  assert.equal(createGameSpectatorSessionMock.mock.calls.length, 1);
  assert.equal(createGameSpectatorSessionMock.mock.calls[0]?.[1]?.sessionStatus, "live");
  assert.equal(vm.gameSpectatorSessionId, "fresh123");
  assert.equal(vm.gameSpectatorSessionStatus, "live");
  assert.equal(vm.gameSpectatorConnectedCount, 0);
  assert.deepEqual(vm.notify.mock.calls.at(-1), ["Spectator mode is live.", "success"]);
});

test("startGameSpectatorMode requests live confirmation from config mode", async () => {
  const vm = {
    wheelMode: "config",
    wheelTotalSpins: 0,
    gameSpectatorSessionId: "",
    gameSpectatorSessionStatus: "inactive",
    gameSpectatorDialog: true,
    gameSpectatorStartAfterLiveConfirm: false,
    gameSpectatorPublishPending: false,
    handleWheelModeChange: vi.fn()
  };

  await gameSpectatorMethods.startGameSpectatorMode.call(vm as never);

  assert.equal(createGameSpectatorSessionMock.mock.calls.length, 0);
  assert.equal(vm.gameSpectatorSessionId, "");
  assert.equal(vm.gameSpectatorSessionStatus, "inactive");
  assert.equal(vm.gameSpectatorDialog, false);
  assert.equal(vm.gameSpectatorStartAfterLiveConfirm, true);
  assert.deepEqual(vm.handleWheelModeChange.mock.calls, [["live"]]);
});

test("publishGameSpectatorSessionSnapshot ignores config mode preview updates", async () => {
  const vm = {
    wheelMode: "config",
    wheelTotalSpins: 0,
    wheelPreviewTotalSpins: 1,
    gameSpectatorSessionId: "preview123",
    gameSpectatorSessionStatus: "live",
    gameSpectatorPublishPending: false
  } as Record<string, unknown>;

  await gameSpectatorMethods.publishGameSpectatorSessionSnapshot.call(vm as never);

  assert.equal(publishGameSpectatorSessionMock.mock.calls.length, 0);
  assert.equal(buildGameSpectatorSnapshotMock.mock.calls.length, 0);
  assert.equal(vm.gameSpectatorSessionStatus, "live");
});

test.each([
  ["en", "Spectator session expired. Start spectator mode again to create a new link."],
  ["fr-CA", "La session spectateur a expiré. Démarrez-en une nouvelle pour obtenir un nouveau lien."]
])("publishGameSpectatorSessionSnapshot disables local spectator mode after backend 404 (%s)", async (language, expectedNotice) => {
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
    preferredLanguage: language,
    t: (key: string, params?: Record<string, string | number | null | undefined>) =>
      translateAppMessage(language, key, params),
    notify: vi.fn()
  } as unknown as Record<string, unknown> & {
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
    expectedNotice,
    "warning"
  ]);
});

test.each([
  ["en", "Spectator session expired. Start spectator mode again to create a new link."],
  ["fr-CA", "La session spectateur a expiré. Démarrez-en une nouvelle pour obtenir un nouveau lien."]
])("refreshGameSpectatorCount clears stale local spectator state after a backend 404 (%s)", async (language, expectedNotice) => {
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
    preferredLanguage: language,
    t: (key: string, params?: Record<string, string | number | null | undefined>) =>
      translateAppMessage(language, key, params),
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
    expectedNotice,
    "warning"
  ]);
});

test("spectator command notifications use translated French and English catalog messages", async () => {
  const french = translatedVm("fr-CA", { gameSpectatorSessionUrl: "" });
  await gameSpectatorMethods.copyGameSpectatorLink.call(french as never);
  assert.deepEqual(french.notify.mock.calls.at(-1), ["Démarrez d’abord le mode spectateur.", "warning"]);

  const english = translatedVm("en", { gameSpectatorSessionUrl: "https://example.test/live" });
  vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn(async () => undefined) } });
  await gameSpectatorMethods.copyGameSpectatorLink.call(english as never);
  assert.deepEqual(english.notify.mock.calls.at(-1), ["Spectator link copied.", "success"]);
});

test("spectator command notifications use the English default and preserve controlled failure detail", async () => {
  const defaultLanguage = translatedVm("", { gameSpectatorSessionUrl: "https://example.test/live" });
  vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn(async () => { throw new Error("clipboard denied"); }) } });
  await gameSpectatorMethods.copyGameSpectatorLink.call(defaultLanguage as never);
  assert.deepEqual(defaultLanguage.notify.mock.calls.at(-1), ["Could not copy the spectator link.", "error"]);

  const failedStart = translatedVm("fr-CA", {
    wheelMode: "live",
    wheelTotalSpins: 0,
    gameSpectatorPublishPending: false
  });
  createGameSpectatorSessionMock.mockRejectedValueOnce(new Error("upstream detail"));
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  await gameSpectatorMethods.startGameSpectatorMode.call(failedStart as never);
  assert.deepEqual(failedStart.notify.mock.calls.at(-1), ["Impossible de démarrer le mode spectateur pour le moment.", "error"]);
  assert.match(String(warn.mock.calls[0]?.[0]), /Failed to start spectator mode/);
});

test("French spectator creation and clipboard failures use localized messages", async () => {
  const created = translatedVm("fr-CA", {
    wheelMode: "live",
    wheelTotalSpins: 0,
    gameSpectatorPublishPending: false
  });
  createGameSpectatorSessionMock.mockResolvedValueOnce({ publicSessionId: "fresh123" });
  buildGameSpectatorSnapshotMock.mockReturnValueOnce({ wheelName: "Wheel", sessionStatus: "starting" });
  await gameSpectatorMethods.startGameSpectatorMode.call(created as never);
  assert.deepEqual(created.notify.mock.calls.at(-1), ["Mode spectateur démarré.", "success"]);

  const copyFailure = translatedVm("fr-CA", { gameSpectatorSessionUrl: "https://example.test/live" });
  vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn(async () => { throw new Error("clipboard denied"); }) } });
  await gameSpectatorMethods.copyGameSpectatorLink.call(copyFailure as never);
  assert.deepEqual(copyFailure.notify.mock.calls.at(-1), ["Impossible de copier le lien spectateur.", "error"]);
});

test.each([
  ["en", "Spectator mode ended. The public page is now a recap."],
  ["fr-CA", "Mode spectateur terminé."]
])("ending a spectator session preserves its localized notice when real publishing absorbs a network error (%s)", async (language, expectedNotice) => {
  publishGameSpectatorSessionMock.mockRejectedValueOnce(new Error("temporary network failure"));
  buildGameSpectatorSnapshotMock.mockReturnValueOnce({ wheelName: "Wheel", sessionStatus: "ended" });
  const vm = translatedVm(language, {
    gameSpectatorSessionId: "abc123",
    gameSpectatorSessionStatus: "live",
    gameSpectatorConnectedCount: 2,
    gameSpectatorDialog: true,
    wheelMode: "live",
    wheelTotalSpins: 0,
    gameSpectatorPublishPending: false,
    async publishGameSpectatorSessionSnapshot(status?: "starting" | "live" | "ended") {
      await gameSpectatorMethods.publishGameSpectatorSessionSnapshot.call(this as never, status);
    }
  });
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

  await gameSpectatorMethods.endGameSpectatorMode.call(vm as never);

  assert.equal(vm.gameSpectatorSessionStatus, "ended");
  assert.equal(vm.gameSpectatorConnectedCount, 0);
  assert.equal(publishGameSpectatorSessionMock.mock.calls.length, 1);
  assert.match(String(warn.mock.calls[0]?.[0]), /Failed to publish spectator snapshot/);
  assert.deepEqual(vm.notify.mock.calls.at(-1), [expectedNotice, "success"]);
  if (language === "fr-CA") {
    assert.doesNotMatch(vm.notify.mock.calls.at(-1)?.[0] ?? "", /public|page publique|actualis/i);
  }
});

test("ending failure is translated and keeps the failure diagnostic", async () => {
  const vm = translatedVm("fr-CA", {
    gameSpectatorSessionId: "abc123",
    gameSpectatorSessionStatus: "live",
    gameSpectatorConnectedCount: 1,
    publishGameSpectatorSessionSnapshot: vi.fn(async () => { throw new Error("publish failed"); })
  });
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

  await gameSpectatorMethods.endGameSpectatorMode.call(vm as never);

  assert.deepEqual(vm.notify.mock.calls.at(-1), ["Impossible de terminer le mode spectateur.", "error"]);
  assert.match(String(warn.mock.calls[0]?.[0]), /Failed to end spectator mode/);
});
