import {
    createGameSpectatorSession,
    fetchGameSpectatorCount,
    isGameSpectatorSessionNotFoundError,
    publishGameSpectatorSession
} from "../../../../app-core/methods/ui/spectator/game-spectator.ts";
import { buildGameSpectatorQrImageUrl, buildGameSpectatorSessionUrl, buildGameSpectatorSnapshot } from "../services/gameSpectator.ts";
import type { GameWindowThis } from "../coordinator/gameControllerState.ts";

const GAME_SPECTATOR_COUNT_POLL_MS = 10_000;

type GameSpectatorVm = Record<string, unknown> & Partial<GameWindowThis> & {
  notify?: (message: string, color?: string) => void;
};

function notifyGameSpectator(vm: GameSpectatorVm, message: string, color: string = "info"): void {
  if (typeof vm.notify === "function") {
    vm.notify(message, color);
  }
}

function isGameSpectatorConfigMode(vm: GameSpectatorVm): boolean {
  return String(vm.wheelMode || "") === "config";
}

function clearGameSpectatorCountPolling(vm: GameSpectatorVm): void {
  const intervalId = vm._gameSpectatorCountPollIntervalId;
  if (intervalId != null) {
    clearInterval(intervalId);
    vm._gameSpectatorCountPollIntervalId = undefined;
  }
  vm._gameSpectatorCountRequestPending = false;
}

function disableStaleGameSpectatorSession(vm: GameSpectatorVm): void {
  clearGameSpectatorCountPolling(vm);
  vm.gameSpectatorSessionId = "";
  vm.gameSpectatorSessionStatus = "inactive";
  vm.gameSpectatorSessionUrl = "";
  vm.gameSpectatorSessionQrUrl = "";
  vm.gameSpectatorConnectedCount = 0;
  vm.saveWheelSession?.();
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
  vm: GameSpectatorVm,
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
  openGameSpectatorDialog(this: GameSpectatorVm): void {
    this.gameSpectatorDialog = true;
  },

  closeGameSpectatorDialog(this: GameSpectatorVm): void {
    this.gameSpectatorDialog = false;
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
    if (isGameSpectatorConfigMode(this)) {
      notifyGameSpectator(this, "Switch to live mode before starting spectator mode.", "warning");
      return;
    }
    if ((this.gameSpectatorPublishPending as boolean) === true) return;
    this.gameSpectatorPublishPending = true;

    try {
      const status = resolveNextSpectatorStatus(this, undefined, { preserveEnded: false });
      const snapshot = buildGameSpectatorSnapshot(this, status);
      const { publicSessionId } = await createGameSpectatorSession(this as never, snapshot);
      const publicUrl = buildGameSpectatorSessionUrl(publicSessionId);
      this.gameSpectatorSessionId = publicSessionId;
      this.gameSpectatorSessionStatus = status;
      this.gameSpectatorSessionUrl = publicUrl;
      this.gameSpectatorSessionQrUrl = buildGameSpectatorQrImageUrl(publicUrl);
      this.gameSpectatorConnectedCount = 0;
      notifyGameSpectator(this, "Spectator mode is live.", "success");
    } catch (error) {
      console.warn("Failed to start spectator mode:", error);
      notifyGameSpectator(this, "Could not start spectator mode right now.", "error");
    } finally {
      this.gameSpectatorPublishPending = false;
    }
  },

  async publishGameSpectatorSessionSnapshot(
    this: GameSpectatorVm,
    statusOverride?: "starting" | "live" | "ended"
  ): Promise<void> {
    const publicSessionId = String(this.gameSpectatorSessionId || "").trim();
    if (!publicSessionId) return;
    if (this.gameSpectatorSessionStatus === "inactive") return;
    if (isGameSpectatorConfigMode(this) && statusOverride !== "ended") return;
    if ((this.gameSpectatorPublishPending as boolean) === true) {
      this._gameSpectatorPublishQueued = true;
      this._gameSpectatorQueuedStatusOverride = mergeQueuedSpectatorStatusOverride(
        this._gameSpectatorQueuedStatusOverride,
        statusOverride
      );
      return;
    }

    this.gameSpectatorPublishPending = true;
    this._gameSpectatorPublishQueued = false;
    this._gameSpectatorQueuedStatusOverride = undefined;

    try {
      const status = resolveNextSpectatorStatus(this, statusOverride);
      const snapshot = buildGameSpectatorSnapshot(this, status);
      await publishGameSpectatorSession(this as never, publicSessionId, snapshot);
      this.gameSpectatorSessionStatus = status;
    } catch (error) {
      if (isGameSpectatorSessionNotFoundError(error)) {
        disableStaleGameSpectatorSession(this);
        return;
      }
      console.warn("Failed to publish spectator snapshot:", error);
    } finally {
      this.gameSpectatorPublishPending = false;
    }

    // The awaited publisher may queue another snapshot through this same VM.
    const queuedPublish = Reflect.get(this, "_gameSpectatorPublishQueued") === true;
    const queuedStatusOverride = this._gameSpectatorQueuedStatusOverride;
    this._gameSpectatorPublishQueued = false;
    this._gameSpectatorQueuedStatusOverride = undefined;
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
      this.gameSpectatorSessionStatus = "ended";
      this.gameSpectatorConnectedCount = 0;
      await this.publishGameSpectatorSessionSnapshot?.("ended");
      if (options.notifyOnSuccess !== false) {
        notifyGameSpectator(this, "Spectator mode ended. The public page is now a recap.", "success");
      }
      if (options.closeDialog !== false) {
        this.gameSpectatorDialog = false;
      }
    } catch (error) {
      console.warn("Failed to end spectator mode:", error);
      notifyGameSpectator(this, "Could not end spectator mode cleanly.", "error");
    }
  },

  syncGameSpectatorLinks(this: GameSpectatorVm): void {
    const publicSessionId = String(this.gameSpectatorSessionId || "").trim();
    if (!publicSessionId) {
      this.gameSpectatorSessionUrl = "";
      this.gameSpectatorSessionQrUrl = "";
      return;
    }
    const publicUrl = buildGameSpectatorSessionUrl(publicSessionId);
    this.gameSpectatorSessionUrl = publicUrl;
    this.gameSpectatorSessionQrUrl = buildGameSpectatorQrImageUrl(publicUrl);
  },

  async refreshGameSpectatorCount(this: GameSpectatorVm): Promise<void> {
    const publicSessionId = String(this.gameSpectatorSessionId || "").trim();
    if (!publicSessionId || this.gameSpectatorSessionStatus === "ended") {
      this.gameSpectatorConnectedCount = 0;
      return;
    }
    if (this._gameSpectatorCountRequestPending === true) {
      return;
    }

    this._gameSpectatorCountRequestPending = true;
    try {
      this.gameSpectatorConnectedCount = await fetchGameSpectatorCount(this as never, publicSessionId);
    } catch (error) {
      if (isGameSpectatorSessionNotFoundError(error)) {
        disableStaleGameSpectatorSession(this);
        return;
      }
      // Keep the last known count on transient failures.
    } finally {
      this._gameSpectatorCountRequestPending = false;
    }
  },

  stopGameSpectatorCountPolling(this: GameSpectatorVm): void {
    clearGameSpectatorCountPolling(this);
  },

  syncGameSpectatorCountPolling(this: GameSpectatorVm): void {
    const publicSessionId = String(this.gameSpectatorSessionId || "").trim();
    const sessionStatus = String(this.gameSpectatorSessionStatus || "inactive");
    const shouldPoll = publicSessionId.length > 0 && sessionStatus !== "inactive" && sessionStatus !== "ended";

    if (!shouldPoll) {
      this.stopGameSpectatorCountPolling?.();
      this.gameSpectatorConnectedCount = 0;
      return;
    }

    void this.refreshGameSpectatorCount?.();

    const existingIntervalId = this._gameSpectatorCountPollIntervalId;
    if (existingIntervalId != null) {
      return;
    }

    this._gameSpectatorCountPollIntervalId = window.setInterval(() => {
      void this.refreshGameSpectatorCount?.();
    }, GAME_SPECTATOR_COUNT_POLL_MS);
  }
};


