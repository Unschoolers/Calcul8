import { translateAppMessage } from "../../../../app-core/i18n/index.ts";
import { getWheelController } from "../coordinator/gameControllerState.ts";
import {
  getWheelCurrentProofState,
  getWheelDisplayFairnessHistoryEntries,
  getWheelLatestFairnessEntry
} from "../coordinator/gameComputedShared.ts";

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
    return getWheelCurrentProofState(this as Record<string, unknown>).spinVerificationUrl.trim()
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
    return getWheelDisplayFairnessHistoryEntries(this as Record<string, unknown>);
  },

  wheelFairnessHistorySummary(this: Record<string, unknown>): string {
    const count = (((this as Record<string, unknown>).wheelDisplayFairnessHistory || []) as unknown[]).length;
    if (!count) return translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelNoSpinsYetLabel");
    return translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelFairnessRecentSpins", {
      count,
      suffix: count === 1 ? "" : "s"
    });
  },

  wheelLatestFairnessEntry(this: Record<string, unknown>) {
    return getWheelLatestFairnessEntry(this as Record<string, unknown>);
  }
};

