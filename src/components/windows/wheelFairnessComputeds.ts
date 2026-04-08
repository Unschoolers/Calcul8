import { translateAppMessage } from "../../app-core/i18n/index.ts";
import type { WheelFairnessEntry } from "../../types/app.ts";
import { getWheelController } from "./wheelControllerState.ts";
import { getWheelDisplayFairnessHistory, getWheelDisplayTotalSpins } from "./wheelComputedShared.ts";

export const wheelFairnessComputeds = {
  wheelFairnessIcon(this: Record<string, unknown>): string {
    return (this as Record<string, unknown>).wheelSpinning ? "mdi-lock" : "mdi-shield-check";
  },

  wheelFairnessIconColor(this: Record<string, unknown>): string {
    return (this as Record<string, unknown>).wheelSpinning ? "warning" : "success";
  },

  wheelFairnessTitle(this: Record<string, unknown>): string {
    const preferredLanguage = String((this as Record<string, unknown>).preferredLanguage ?? "");
    if ((this as Record<string, unknown>).wheelSpinning) {
      return translateAppMessage(preferredLanguage, "wheelFairnessResultLockedTitle");
    }
    const controller = getWheelController(this as Record<string, unknown>);
    return String(controller.spinVerificationUrl || "").trim()
      ? translateAppMessage(preferredLanguage, "wheelFairnessServerVerifiedTitle")
      : translateAppMessage(preferredLanguage, "wheelFairnessLocalVerifiedTitle");
  },

  wheelFairnessChevron(this: Record<string, unknown>): string {
    const controller = getWheelController(this as Record<string, unknown>);
    return controller.showSeed ? "mdi-chevron-up" : "mdi-chevron-down";
  },

  wheelDisplayFairnessHistory(this: Record<string, unknown>): Array<{
    spinNumber: number;
    label: string;
    color: string;
    hash: string;
    seed: string;
    clientSeed?: string;
    verificationUrl?: string;
    algorithm?: string;
    timestamp: number;
  }> {
    const history = getWheelDisplayFairnessHistory(this as Record<string, unknown>);
    return [...history].reverse();
  },

  wheelFairnessHistorySummary(this: Record<string, unknown>): string {
    const count = (((this as Record<string, unknown>).wheelDisplayFairnessHistory || []) as unknown[]).length;
    if (!count) return translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelNoSpinsYetLabel");
    return translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelFairnessRecentSpins", {
      count,
      suffix: count === 1 ? "" : "s"
    });
  },

  wheelLatestFairnessEntry(this: Record<string, unknown>): {
    spinNumber: number;
    label: string;
    color: string;
    hash: string;
    seed: string;
    clientSeed?: string;
    verificationUrl?: string;
    algorithm?: string;
    timestamp: number;
  } | null {
    const preferredLanguage = String((this as Record<string, unknown>).preferredLanguage ?? "");
    const history = (((this as Record<string, unknown>).wheelDisplayFairnessHistory || []) as WheelFairnessEntry[]);
    const latestHistory = history[0] || null;
    const controller = getWheelController(this as Record<string, unknown>);
    const currentHash = String(controller.spinHash || "");
    const currentSeed = String(controller.spinSeed || "");
    const currentClientSeed = String(controller.spinClientSeed || "");
    const currentVerificationUrl = String(controller.spinVerificationUrl || "");
    const currentAlgorithm = String(controller.spinAlgorithm || "");

    if (!currentHash) {
      return latestHistory;
    }

    const currentLabel = String((this as Record<string, unknown>).wheelLastResult || "")
      .replace(/^🎉\s*/, "")
      .trim();
    const spinNumber = getWheelDisplayTotalSpins(this as Record<string, unknown>) || Number(latestHistory?.spinNumber || 0);

    return {
      spinNumber: spinNumber > 0 ? spinNumber : (latestHistory?.spinNumber || 1),
      label: currentLabel || latestHistory?.label || translateAppMessage(preferredLanguage, "wheelFairnessLatestSpinLabel"),
      color: String(controller.lastResultColor || latestHistory?.color || "rgb(var(--v-theme-primary))"),
      hash: currentHash,
      seed: currentSeed || (latestHistory?.hash === currentHash ? latestHistory.seed : ""),
      clientSeed: currentClientSeed || (latestHistory?.hash === currentHash ? latestHistory.clientSeed : undefined),
      verificationUrl: currentVerificationUrl || (latestHistory?.hash === currentHash ? latestHistory.verificationUrl : undefined),
      algorithm: currentAlgorithm || (latestHistory?.hash === currentHash ? latestHistory.algorithm : undefined),
      timestamp: latestHistory?.timestamp || Date.now()
    };
  }
};
