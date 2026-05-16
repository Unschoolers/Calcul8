import {
    createGameSpectatorSession,
    fetchGameSpectatorCount,
    isGameSpectatorSessionNotFoundError,
    publishGameSpectatorSession
} from "../../../../app-core/methods/ui/spectator/game-spectator.ts";
import { buildGameSpectatorQrImageUrl, buildGameSpectatorSessionUrl, buildGameSpectatorSnapshot } from "../services/gameSpectator.ts";
import type { GameWindowThis } from "../coordinator/gameControllerState.ts";

const GAME_SPECTATOR_COUNT_POLL_MS = 10_000;

type GameSpectatorVm = GameWindowThis & {
  notify?: (message: string, color?: string) => void;
};

function notifyGameSpectator(vm: GameSpectatorVm, message: string, color: string = "info"): void {
  if (typeof vm.notify === "function") {
    vm.notify(message, color);
  }
}

function isGameSpectatorConfigMode(vm: Record<string, unknown>): boolean {
  return String(vm.wheelMode || "") === "config";
}

function clearGameSpectatorCountPolling(vm: Record<string, unknown>): void {
  const intervalId = vm._gameSpectatorCountPollIntervalId as number | undefined;
  if (intervalId != null) {
    clearInterval(intervalId);
    vm._gameSpectatorCountPollIntervalId = undefined;
  }
  vm._gameSpectatorCountRequestPending = false;
}

function disableStaleGameSpectatorSession(vm: GameSpectatorVm): void {
  clearGameSpectatorCountPolling(vm as unknown as Record<string, unknown>);
  (vm as Record<string, unknown>).gameSpectatorSessionId = "";
  (vm as Record<string, unknown>).gameSpectatorSessionStatus = "inactive";
  (vm as Record<string, unknown>).gameSpectatorSessionUrl = "";
  (vm as Record<string, unknown>).gameSpectatorSessionQrUrl = "";
  (vm as Record<string, unknown>).gameSpectatorConnectedCount = 0;
  vm.saveWheelSession();
  notifyGameSpectator(vm, "Spectator session expired. Start spectator mode again to create a new link.", "warning");
}

function mergeQueuedSpectatorStatusOverride(
  current: "starting" | "live" | "ended" | undefined,
  next: "starting" | "live" | "ended" | undefined
): "starting" | "live" | "ended" | undefined {
  if (current === "ended" || next === "ended") return "ended";
  if (current === "live" || next === "live") return "live";
  return next ?? current;
}

function resolveNextSpectatorStatus(
  vm: Record<string, unknown>,
  override?: "starting" | "live" | "ended",
  options: { preserveEnded?: boolean } = {}
): "starting" | "live" | "ended" {
  if (override) return override;
  if (options.preserveEnded !== false && vm.gameSpectatorSessionStatus === "ended") return "ended";
  return Number(vm.wheelTotalSpins || 0) > 0 || vm.wheelMode === "live" ? "live" : "starting";
}

function fallbackCopyText(value: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  document.body.removeChild(textarea);
  return copied;
}

export const gameSpectatorMethods = {
  openGameSpectatorDialog(this: Record<string, unknown>): void {
    (this as Record<string, unknown>).gameSpectatorDialog = true;
  },

  closeGameSpectatorDialog(this: Record<string, unknown>): void {
    (this as Record<string, unknown>).gameSpectatorDialog = false;
  },

  async copyGameSpectatorLink(this: GameSpectatorVm): Promise<void> {
    const publicUrl = String(this.gameSpectatorSessionUrl || "").trim();
    if (!publicUrl) {
      notifyGameSpectator(this, "Start spectator mode first.", "warning");
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(publicUrl);
      } else if (!fallbackCopyText(publicUrl)) {
        throw new Error("Clipboard copy fallback failed.");
      }
      notifyGameSpectator(this, "Spectator link copied.", "success");
    } catch {
      notifyGameSpectator(this, "Could not copy the spectator link.", "error");
    }
  },

  openGameSpectatorPage(this: GameSpectatorVm): void {
    const publicUrl = String(this.gameSpectatorSessionUrl || "").trim();
    if (!publicUrl) return;
    window.open(publicUrl, "_blank", "noopener,noreferrer");
  },

  async startGameSpectatorMode(this: GameSpectatorVm): Promise<void> {
    if (isGameSpectatorConfigMode(this as Record<string, unknown>)) {
      notifyGameSpectator(this, "Switch to live mode before starting spectator mode.", "warning");
      return;
    }
    if ((this.gameSpectatorPublishPending as boolean) === true) return;
    (this as Record<string, unknown>).gameSpectatorPublishPending = true;

    try {
      const status = resolveNextSpectatorStatus(this as Record<string, unknown>, undefined, { preserveEnded: false });
      const snapshot = buildGameSpectatorSnapshot(this as Record<string, unknown>, status);
      const { publicSessionId } = await createGameSpectatorSession(this as never, snapshot);
      const publicUrl = buildGameSpectatorSessionUrl(publicSessionId);
      (this as Record<string, unknown>).gameSpectatorSessionId = publicSessionId;
      (this as Record<string, unknown>).gameSpectatorSessionStatus = status;
      (this as Record<string, unknown>).gameSpectatorSessionUrl = publicUrl;
      (this as Record<string, unknown>).gameSpectatorSessionQrUrl = buildGameSpectatorQrImageUrl(publicUrl);
      (this as Record<string, unknown>).gameSpectatorConnectedCount = 0;
      notifyGameSpectator(this, "Spectator mode is live.", "success");
    } catch (error) {
      console.warn("Failed to start spectator mode:", error);
      notifyGameSpectator(this, "Could not start spectator mode right now.", "error");
    } finally {
      (this as Record<string, unknown>).gameSpectatorPublishPending = false;
    }
  },

  async publishGameSpectatorSessionSnapshot(
    this: GameSpectatorVm,
    statusOverride?: "starting" | "live" | "ended"
  ): Promise<void> {
    const publicSessionId = String(this.gameSpectatorSessionId || "").trim();
    if (!publicSessionId) return;
    if (this.gameSpectatorSessionStatus === "inactive") return;
    if (isGameSpectatorConfigMode(this as Record<string, unknown>) && statusOverride !== "ended") return;
    if ((this.gameSpectatorPublishPending as boolean) === true) {
      (this as Record<string, unknown>)._gameSpectatorPublishQueued = true;
      (this as Record<string, unknown>)._gameSpectatorQueuedStatusOverride = mergeQueuedSpectatorStatusOverride(
        (this as Record<string, unknown>)._gameSpectatorQueuedStatusOverride as "starting" | "live" | "ended" | undefined,
        statusOverride
      );
      return;
    }

    (this as Record<string, unknown>).gameSpectatorPublishPending = true;
    (this as Record<string, unknown>)._gameSpectatorPublishQueued = false;
    (this as Record<string, unknown>)._gameSpectatorQueuedStatusOverride = undefined;

    try {
      const status = resolveNextSpectatorStatus(this as Record<string, unknown>, statusOverride);
      const snapshot = buildGameSpectatorSnapshot(this as Record<string, unknown>, status);
      await publishGameSpectatorSession(this as never, publicSessionId, snapshot);
      (this as Record<string, unknown>).gameSpectatorSessionStatus = status;
    } catch (error) {
      if (isGameSpectatorSessionNotFoundError(error)) {
        disableStaleGameSpectatorSession(this);
        return;
      }
      console.warn("Failed to publish spectator snapshot:", error);
    } finally {
      (this as Record<string, unknown>).gameSpectatorPublishPending = false;
    }

    const queuedPublish = (this as Record<string, unknown>)._gameSpectatorPublishQueued === true;
    const queuedStatusOverride = (this as Record<string, unknown>)._gameSpectatorQueuedStatusOverride as "starting" | "live" | "ended" | undefined;
    (this as Record<string, unknown>)._gameSpectatorPublishQueued = false;
    (this as Record<string, unknown>)._gameSpectatorQueuedStatusOverride = undefined;
    const replayPublish = this.publishGameSpectatorSessionSnapshot;
    if (queuedPublish && typeof replayPublish === "function") {
      await replayPublish.call(this, queuedStatusOverride);
    }
  },

  async endGameSpectatorMode(
    this: GameSpectatorVm,
    options: {
      notifyOnSuccess?: boolean;
      closeDialog?: boolean;
    } = {}
  ): Promise<void> {
    const publicSessionId = String(this.gameSpectatorSessionId || "").trim();
    if (!publicSessionId) return;
    try {
      (this as Record<string, unknown>).gameSpectatorSessionStatus = "ended";
      (this as Record<string, unknown>).gameSpectatorConnectedCount = 0;
      await (this as Record<string, unknown> & {
        publishGameSpectatorSessionSnapshot: (statusOverride?: "starting" | "live" | "ended") => Promise<void>;
      }).publishGameSpectatorSessionSnapshot("ended");
      if (options.notifyOnSuccess !== false) {
        notifyGameSpectator(this, "Spectator mode ended. The public page is now a recap.", "success");
      }
      if (options.closeDialog !== false) {
        (this as Record<string, unknown>).gameSpectatorDialog = false;
      }
    } catch (error) {
      console.warn("Failed to end spectator mode:", error);
      notifyGameSpectator(this, "Could not end spectator mode cleanly.", "error");
    }
  },

  syncGameSpectatorLinks(this: Record<string, unknown>): void {
    const publicSessionId = String(this.gameSpectatorSessionId || "").trim();
    if (!publicSessionId) {
      (this as Record<string, unknown>).gameSpectatorSessionUrl = "";
      (this as Record<string, unknown>).gameSpectatorSessionQrUrl = "";
      return;
    }
    const publicUrl = buildGameSpectatorSessionUrl(publicSessionId);
    (this as Record<string, unknown>).gameSpectatorSessionUrl = publicUrl;
    (this as Record<string, unknown>).gameSpectatorSessionQrUrl = buildGameSpectatorQrImageUrl(publicUrl);
  },

  async refreshGameSpectatorCount(this: GameSpectatorVm): Promise<void> {
    const publicSessionId = String(this.gameSpectatorSessionId || "").trim();
    if (!publicSessionId || this.gameSpectatorSessionStatus === "ended") {
      (this as Record<string, unknown>).gameSpectatorConnectedCount = 0;
      return;
    }
    if ((this as Record<string, unknown>)._gameSpectatorCountRequestPending === true) {
      return;
    }

    (this as Record<string, unknown>)._gameSpectatorCountRequestPending = true;
    try {
      (this as Record<string, unknown>).gameSpectatorConnectedCount = await fetchGameSpectatorCount(this as never, publicSessionId);
    } catch (error) {
      if (isGameSpectatorSessionNotFoundError(error)) {
        disableStaleGameSpectatorSession(this);
        return;
      }
      // Keep the last known count on transient failures.
    } finally {
      (this as Record<string, unknown>)._gameSpectatorCountRequestPending = false;
    }
  },

  stopGameSpectatorCountPolling(this: Record<string, unknown>): void {
    clearGameSpectatorCountPolling(this as Record<string, unknown>);
  },

  syncGameSpectatorCountPolling(this: Record<string, unknown>): void {
    const publicSessionId = String((this as Record<string, unknown>).gameSpectatorSessionId || "").trim();
    const sessionStatus = String((this as Record<string, unknown>).gameSpectatorSessionStatus || "inactive");
    const shouldPoll = publicSessionId.length > 0 && sessionStatus !== "inactive" && sessionStatus !== "ended";

    if (!shouldPoll) {
      (this as Record<string, unknown> & { stopGameSpectatorCountPolling: () => void }).stopGameSpectatorCountPolling();
      (this as Record<string, unknown>).gameSpectatorConnectedCount = 0;
      return;
    }

    void ((this as Record<string, unknown> & { refreshGameSpectatorCount: () => Promise<void> }).refreshGameSpectatorCount());

    const existingIntervalId = (this as Record<string, unknown>)._gameSpectatorCountPollIntervalId as number | undefined;
    if (existingIntervalId != null) {
      return;
    }

    (this as Record<string, unknown>)._gameSpectatorCountPollIntervalId = window.setInterval(() => {
      void ((this as Record<string, unknown> & { refreshGameSpectatorCount: () => Promise<void> }).refreshGameSpectatorCount());
    }, GAME_SPECTATOR_COUNT_POLL_MS);
  }
};


