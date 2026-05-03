import {
    createWheelSpectatorSession,
    fetchWheelSpectatorCount,
    publishWheelSpectatorSession
} from "../../../../app-core/methods/ui/spectator/wheel-spectator.ts";
import { buildWheelSpectatorQrImageUrl, buildWheelSpectatorSessionUrl, buildWheelSpectatorSnapshot } from "../services/wheelSpectator.ts";
import type { WheelWindowThis } from "../coordinator/wheelControllerState.ts";

const WHEEL_SPECTATOR_COUNT_POLL_MS = 10_000;

type WheelSpectatorVm = WheelWindowThis & {
  notify?: (message: string, color?: string) => void;
};

function notifyWheelSpectator(vm: WheelSpectatorVm, message: string, color: string = "info"): void {
  if (typeof vm.notify === "function") {
    vm.notify(message, color);
  }
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
  if (options.preserveEnded !== false && vm.wheelSpectatorSessionStatus === "ended") return "ended";
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

export const wheelSpectatorMethods = {
  openWheelSpectatorDialog(this: Record<string, unknown>): void {
    (this as Record<string, unknown>).wheelSpectatorDialog = true;
  },

  closeWheelSpectatorDialog(this: Record<string, unknown>): void {
    (this as Record<string, unknown>).wheelSpectatorDialog = false;
  },

  async copyWheelSpectatorLink(this: WheelSpectatorVm): Promise<void> {
    const publicUrl = String(this.wheelSpectatorSessionUrl || "").trim();
    if (!publicUrl) {
      notifyWheelSpectator(this, "Start spectator mode first.", "warning");
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(publicUrl);
      } else if (!fallbackCopyText(publicUrl)) {
        throw new Error("Clipboard copy fallback failed.");
      }
      notifyWheelSpectator(this, "Spectator link copied.", "success");
    } catch {
      notifyWheelSpectator(this, "Could not copy the spectator link.", "error");
    }
  },

  openWheelSpectatorPage(this: WheelSpectatorVm): void {
    const publicUrl = String(this.wheelSpectatorSessionUrl || "").trim();
    if (!publicUrl) return;
    window.open(publicUrl, "_blank", "noopener,noreferrer");
  },

  async startWheelSpectatorMode(this: WheelSpectatorVm): Promise<void> {
    if ((this.wheelSpectatorPublishPending as boolean) === true) return;
    (this as Record<string, unknown>).wheelSpectatorPublishPending = true;

    try {
      const status = resolveNextSpectatorStatus(this as Record<string, unknown>, undefined, { preserveEnded: false });
      const snapshot = buildWheelSpectatorSnapshot(this as Record<string, unknown>, status);
      const { publicSessionId } = await createWheelSpectatorSession(this as never, snapshot);
      const publicUrl = buildWheelSpectatorSessionUrl(publicSessionId);
      (this as Record<string, unknown>).wheelSpectatorSessionId = publicSessionId;
      (this as Record<string, unknown>).wheelSpectatorSessionStatus = status;
      (this as Record<string, unknown>).wheelSpectatorSessionUrl = publicUrl;
      (this as Record<string, unknown>).wheelSpectatorSessionQrUrl = buildWheelSpectatorQrImageUrl(publicUrl);
      (this as Record<string, unknown>).wheelSpectatorConnectedCount = 0;
      notifyWheelSpectator(this, "Spectator mode is live.", "success");
    } catch (error) {
      console.warn("Failed to start spectator mode:", error);
      notifyWheelSpectator(this, "Could not start spectator mode right now.", "error");
    } finally {
      (this as Record<string, unknown>).wheelSpectatorPublishPending = false;
    }
  },

  async publishWheelSpectatorSessionSnapshot(
    this: WheelSpectatorVm,
    statusOverride?: "starting" | "live" | "ended"
  ): Promise<void> {
    const publicSessionId = String(this.wheelSpectatorSessionId || "").trim();
    if (!publicSessionId) return;
    if (this.wheelSpectatorSessionStatus === "inactive") return;
    if ((this.wheelSpectatorPublishPending as boolean) === true) {
      (this as Record<string, unknown>)._wheelSpectatorPublishQueued = true;
      (this as Record<string, unknown>)._wheelSpectatorQueuedStatusOverride = mergeQueuedSpectatorStatusOverride(
        (this as Record<string, unknown>)._wheelSpectatorQueuedStatusOverride as "starting" | "live" | "ended" | undefined,
        statusOverride
      );
      return;
    }

    (this as Record<string, unknown>).wheelSpectatorPublishPending = true;
    (this as Record<string, unknown>)._wheelSpectatorPublishQueued = false;
    (this as Record<string, unknown>)._wheelSpectatorQueuedStatusOverride = undefined;

    try {
      const status = resolveNextSpectatorStatus(this as Record<string, unknown>, statusOverride);
      const snapshot = buildWheelSpectatorSnapshot(this as Record<string, unknown>, status);
      await publishWheelSpectatorSession(this as never, publicSessionId, snapshot);
      (this as Record<string, unknown>).wheelSpectatorSessionStatus = status;
    } catch (error) {
      console.warn("Failed to publish spectator snapshot:", error);
    } finally {
      (this as Record<string, unknown>).wheelSpectatorPublishPending = false;
    }

    const queuedPublish = (this as Record<string, unknown>)._wheelSpectatorPublishQueued === true;
    const queuedStatusOverride = (this as Record<string, unknown>)._wheelSpectatorQueuedStatusOverride as "starting" | "live" | "ended" | undefined;
    (this as Record<string, unknown>)._wheelSpectatorPublishQueued = false;
    (this as Record<string, unknown>)._wheelSpectatorQueuedStatusOverride = undefined;
    const replayPublish = this.publishWheelSpectatorSessionSnapshot;
    if (queuedPublish && typeof replayPublish === "function") {
      await replayPublish.call(this, queuedStatusOverride);
    }
  },

  async endWheelSpectatorMode(
    this: WheelSpectatorVm,
    options: {
      notifyOnSuccess?: boolean;
      closeDialog?: boolean;
    } = {}
  ): Promise<void> {
    const publicSessionId = String(this.wheelSpectatorSessionId || "").trim();
    if (!publicSessionId) return;
    try {
      (this as Record<string, unknown>).wheelSpectatorSessionStatus = "ended";
      (this as Record<string, unknown>).wheelSpectatorConnectedCount = 0;
      await (this as Record<string, unknown> & {
        publishWheelSpectatorSessionSnapshot: (statusOverride?: "starting" | "live" | "ended") => Promise<void>;
      }).publishWheelSpectatorSessionSnapshot("ended");
      if (options.notifyOnSuccess !== false) {
        notifyWheelSpectator(this, "Spectator mode ended. The public page is now a recap.", "success");
      }
      if (options.closeDialog !== false) {
        (this as Record<string, unknown>).wheelSpectatorDialog = false;
      }
    } catch (error) {
      console.warn("Failed to end spectator mode:", error);
      notifyWheelSpectator(this, "Could not end spectator mode cleanly.", "error");
    }
  },

  syncWheelSpectatorLinks(this: Record<string, unknown>): void {
    const publicSessionId = String(this.wheelSpectatorSessionId || "").trim();
    if (!publicSessionId) {
      (this as Record<string, unknown>).wheelSpectatorSessionUrl = "";
      (this as Record<string, unknown>).wheelSpectatorSessionQrUrl = "";
      return;
    }
    const publicUrl = buildWheelSpectatorSessionUrl(publicSessionId);
    (this as Record<string, unknown>).wheelSpectatorSessionUrl = publicUrl;
    (this as Record<string, unknown>).wheelSpectatorSessionQrUrl = buildWheelSpectatorQrImageUrl(publicUrl);
  },

  async refreshWheelSpectatorCount(this: WheelSpectatorVm): Promise<void> {
    const publicSessionId = String(this.wheelSpectatorSessionId || "").trim();
    if (!publicSessionId || this.wheelSpectatorSessionStatus === "ended") {
      (this as Record<string, unknown>).wheelSpectatorConnectedCount = 0;
      return;
    }
    if ((this as Record<string, unknown>)._wheelSpectatorCountRequestPending === true) {
      return;
    }

    (this as Record<string, unknown>)._wheelSpectatorCountRequestPending = true;
    try {
      (this as Record<string, unknown>).wheelSpectatorConnectedCount = await fetchWheelSpectatorCount(this as never, publicSessionId);
    } catch {
      // Keep the last known count on transient failures.
    } finally {
      (this as Record<string, unknown>)._wheelSpectatorCountRequestPending = false;
    }
  },

  stopWheelSpectatorCountPolling(this: Record<string, unknown>): void {
    const intervalId = (this as Record<string, unknown>)._wheelSpectatorCountPollIntervalId as number | undefined;
    if (intervalId != null) {
      clearInterval(intervalId);
      (this as Record<string, unknown>)._wheelSpectatorCountPollIntervalId = undefined;
    }
    (this as Record<string, unknown>)._wheelSpectatorCountRequestPending = false;
  },

  syncWheelSpectatorCountPolling(this: Record<string, unknown>): void {
    const publicSessionId = String((this as Record<string, unknown>).wheelSpectatorSessionId || "").trim();
    const sessionStatus = String((this as Record<string, unknown>).wheelSpectatorSessionStatus || "inactive");
    const shouldPoll = publicSessionId.length > 0 && sessionStatus !== "inactive" && sessionStatus !== "ended";

    if (!shouldPoll) {
      (this as Record<string, unknown> & { stopWheelSpectatorCountPolling: () => void }).stopWheelSpectatorCountPolling();
      (this as Record<string, unknown>).wheelSpectatorConnectedCount = 0;
      return;
    }

    void ((this as Record<string, unknown> & { refreshWheelSpectatorCount: () => Promise<void> }).refreshWheelSpectatorCount());

    const existingIntervalId = (this as Record<string, unknown>)._wheelSpectatorCountPollIntervalId as number | undefined;
    if (existingIntervalId != null) {
      return;
    }

    (this as Record<string, unknown>)._wheelSpectatorCountPollIntervalId = window.setInterval(() => {
      void ((this as Record<string, unknown> & { refreshWheelSpectatorCount: () => Promise<void> }).refreshWheelSpectatorCount());
    }, WHEEL_SPECTATOR_COUNT_POLL_MS);
  }
};
