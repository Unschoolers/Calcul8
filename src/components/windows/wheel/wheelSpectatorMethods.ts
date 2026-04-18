import {
  createWheelSpectatorSession,
  publishWheelSpectatorSession
} from "../../../app-core/methods/ui/wheel-spectator.ts";
import { buildWheelSpectatorQrImageUrl, buildWheelSpectatorSessionUrl, buildWheelSpectatorSnapshot } from "./wheelSpectator.ts";

type WheelSpectatorVm = Record<string, unknown> & {
  notify?: (message: string, color?: string) => void;
};

function notifyWheelSpectator(vm: WheelSpectatorVm, message: string, color: string = "info"): void {
  if (typeof vm.notify === "function") {
    vm.notify(message, color);
  }
}

function resolveNextSpectatorStatus(
  vm: Record<string, unknown>,
  override?: "starting" | "live" | "ended"
): "starting" | "live" | "ended" {
  if (override) return override;
  if (vm.wheelSpectatorSessionStatus === "ended") return "ended";
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
      const status = resolveNextSpectatorStatus(this as Record<string, unknown>);
      const snapshot = buildWheelSpectatorSnapshot(this as Record<string, unknown>, status);
      const { publicSessionId } = await createWheelSpectatorSession(this as never, snapshot);
      const publicUrl = buildWheelSpectatorSessionUrl(publicSessionId);
      (this as Record<string, unknown>).wheelSpectatorSessionId = publicSessionId;
      (this as Record<string, unknown>).wheelSpectatorSessionStatus = status;
      (this as Record<string, unknown>).wheelSpectatorSessionUrl = publicUrl;
      (this as Record<string, unknown>).wheelSpectatorSessionQrUrl = buildWheelSpectatorQrImageUrl(publicUrl);
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
    if ((this.wheelSpectatorPublishPending as boolean) === true && statusOverride == null) return;
    if (this.wheelSpectatorSessionStatus === "inactive") return;

    (this as Record<string, unknown>).wheelSpectatorPublishPending = true;

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
  }
};
