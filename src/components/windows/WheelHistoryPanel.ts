import { inject, type PropType } from "vue";
import { translateAppMessage } from "../../app-core/i18n/index.ts";
import type { WheelFairnessEntry } from "../../types/app.ts";
import { createNestedWindowContextBridge } from "./contextBridge.ts";
import { getWheelController } from "./wheelControllerState.ts";
import {
  getWheelCurrentProofState,
  getWheelDisplayFairnessHistoryEntries,
  getWheelLatestFairnessEntry
} from "./wheelComputedShared.ts";

export const WheelHistoryPanel = {
  name: "WheelHistoryPanel",
  props: {
    ctx: {
      type: Object as PropType<Record<string, unknown>>,
      required: true
    },
    latestOnly: {
      type: Boolean,
      default: false
    },
    presentation: {
      type: Boolean,
      default: false
    },
    showEmptyState: {
      type: Boolean,
      default: true
    }
  },
  computed: {
    wheelHistoryPanelEntries(this: Record<string, unknown>) {
      return getWheelDisplayFairnessHistoryEntries(this as Record<string, unknown>);
    },
    wheelHistoryPanelSummary(this: Record<string, unknown>): string {
      const preferredLanguage = String((this as Record<string, unknown>).preferredLanguage ?? "");
      const count = (((this as Record<string, unknown>).wheelHistoryPanelEntries || []) as unknown[]).length;
      if (!count) return translateAppMessage(preferredLanguage, "wheelNoSpinsYetLabel");
      return translateAppMessage(preferredLanguage, "wheelFairnessRecentSpins", {
        count,
        suffix: count === 1 ? "" : "s"
      });
    },
    wheelHistoryPanelCurrentVerificationUrl(this: Record<string, unknown>): string {
      return getWheelCurrentProofState(this as Record<string, unknown>).spinVerificationUrl;
    },
    wheelHistoryPanelSpinHash(this: Record<string, unknown>): string {
      return getWheelCurrentProofState(this as Record<string, unknown>).spinHash;
    },
    wheelHistoryPanelSpinSeed(this: Record<string, unknown>): string {
      return getWheelCurrentProofState(this as Record<string, unknown>).spinSeed;
    },
    wheelHistoryPanelSpinClientSeed(this: Record<string, unknown>): string {
      return getWheelCurrentProofState(this as Record<string, unknown>).spinClientSeed;
    },
    wheelHistoryPanelSpinning(this: Record<string, unknown>): boolean {
      return !!(this as Record<string, unknown>).wheelSpinning;
    },
    wheelHistoryPanelLastResult(this: Record<string, unknown>): string {
      return String((this as Record<string, unknown>).wheelLastResult || "");
    },
    wheelHistoryPanelLastResultClean(this: Record<string, unknown>): string {
      return String((this as Record<string, unknown>).wheelHistoryPanelLastResult || "")
        .replace(/^🎉\s*/, "")
        .trim();
    },
    wheelHistoryPanelLastResultColor(this: Record<string, unknown>): string {
      return getWheelCurrentProofState(this as Record<string, unknown>).lastResultColor;
    },
    wheelHistoryPanelFairnessIcon(this: Record<string, unknown>): string {
      return (this as Record<string, unknown>).wheelHistoryPanelSpinning ? "mdi-lock" : "mdi-shield-check";
    },
    wheelHistoryPanelFairnessIconColor(this: Record<string, unknown>): string {
      return (this as Record<string, unknown>).wheelHistoryPanelSpinning ? "warning" : "success";
    },
    wheelHistoryPanelHistoryOpen: {
      get(this: Record<string, unknown>): boolean {
        const controller = getWheelController(this as Record<string, unknown>);
        return !!controller.fairnessHistoryOpen;
      },
      set(this: Record<string, unknown>, value: boolean) {
        const controller = getWheelController(this as Record<string, unknown>);
        controller.fairnessHistoryOpen = value;
      }
    },
    wheelHistoryPanelLatestEntry(this: Record<string, unknown>) {
      return getWheelLatestFairnessEntry(this as Record<string, unknown>);
    },
    wheelHistoryPanelTitle(this: Record<string, unknown>): string {
      const preferredLanguage = String((this as Record<string, unknown>).preferredLanguage ?? "");
      if ((this as Record<string, unknown>).wheelHistoryPanelSpinning) {
        return translateAppMessage(preferredLanguage, "wheelFairnessResultLockedTitle");
      }
      return String((this as Record<string, unknown>).wheelHistoryPanelCurrentVerificationUrl || "").trim()
        ? translateAppMessage(preferredLanguage, "wheelFairnessServerVerifiedTitle")
        : translateAppMessage(preferredLanguage, "wheelFairnessLocalVerifiedTitle");
    },
    wheelHistoryPanelSummaryText(this: Record<string, unknown>): string {
      if ((this as Record<string, unknown>).wheelHistoryPanelSpinning) {
        const preferredLanguage = String((this as Record<string, unknown>).preferredLanguage ?? "");
        return translateAppMessage(preferredLanguage, "wheelFairnessCommittedSummary");
      }
      const verificationUrl = String((this as Record<string, unknown>).wheelHistoryPanelCurrentVerificationUrl || "");
      const preferredLanguage = String((this as Record<string, unknown>).preferredLanguage ?? "");
      return verificationUrl
        ? translateAppMessage(preferredLanguage, "wheelFairnessServerVerificationSummary")
        : translateAppMessage(preferredLanguage, "wheelFairnessLocalVerificationSummary");
    },
    wheelHistoryPanelSpinVerificationUrl(this: Record<string, unknown>): string {
      return getWheelCurrentProofState(this as Record<string, unknown>).spinVerificationUrl;
    }
  },
  setup(props: { ctx: Record<string, unknown> }) {
    const injectedWheelCtx = inject<Record<string, unknown> | null>("wheelCtx", null);
    const injectedCtx = inject<Record<string, unknown> | null>("appCtx", null);
    const source = (injectedWheelCtx ?? props.ctx ?? injectedCtx) as Record<string, unknown>;
    return createNestedWindowContextBridge(source);
  }
};
