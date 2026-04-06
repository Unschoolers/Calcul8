import { inject, type PropType } from "vue";
import { createNestedWindowContextBridge } from "./contextBridge.ts";
import { translateAppMessage } from "../../app-core/i18n/index.ts";
import type { WheelFairnessEntry } from "../../types/app.ts";
import { getWheelController } from "./wheelControllerState.ts";

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
    wheelHistoryPanelEntries(this: Record<string, unknown>): WheelFairnessEntry[] {
      const controller = getWheelController(this as Record<string, unknown>);
      const history = (((this as Record<string, unknown>).wheelMode === "config"
        ? controller.previewFairnessHistory
        : controller.fairnessHistory) || []) as WheelFairnessEntry[];
      return [...history].reverse();
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
      const controller = getWheelController(this as Record<string, unknown>);
      return String(controller.spinVerificationUrl || "");
    },
    wheelHistoryPanelLatestEntry(this: Record<string, unknown>): WheelFairnessEntry | null {
      const preferredLanguage = String((this as Record<string, unknown>).preferredLanguage ?? "");
      const controller = getWheelController(this as Record<string, unknown>);
      const entries = ((this as Record<string, unknown>).wheelHistoryPanelEntries || []) as WheelFairnessEntry[];
      const latestHistory = entries[0] || null;
      const currentHash = String(controller.spinHash || "");
      if (!currentHash) {
        return latestHistory;
      }
      const currentLabel = String((this as Record<string, unknown>).wheelLastResult || "")
        .replace(/^🎉\s*/, "")
        .trim();
      const currentSpinNumber = Number(((this as Record<string, unknown>).wheelMode === "config"
        ? controller.previewTotalSpins
        : (this as Record<string, unknown>).wheelTotalSpins) || latestHistory?.spinNumber || 0);
      return {
        spinNumber: currentSpinNumber > 0 ? currentSpinNumber : (latestHistory?.spinNumber || 1),
        label: currentLabel || latestHistory?.label || translateAppMessage(preferredLanguage, "wheelFairnessLatestSpinLabel"),
        color: String(controller.lastResultColor || latestHistory?.color || "rgb(var(--v-theme-primary))"),
        hash: currentHash,
        seed: String(controller.spinSeed || latestHistory?.seed || ""),
        clientSeed: String(controller.spinClientSeed || latestHistory?.clientSeed || ""),
        verificationUrl: String(controller.spinVerificationUrl || latestHistory?.verificationUrl || ""),
        algorithm: String(controller.spinAlgorithm || latestHistory?.algorithm || ""),
        timestamp: latestHistory?.timestamp || Date.now()
      };
    },
    wheelHistoryPanelTitle(this: Record<string, unknown>): string {
      const preferredLanguage = String((this as Record<string, unknown>).preferredLanguage ?? "");
      if ((this as Record<string, unknown>).wheelSpinning) {
        return translateAppMessage(preferredLanguage, "wheelFairnessResultLockedTitle");
      }
      return String((this as Record<string, unknown>).wheelHistoryPanelCurrentVerificationUrl || "").trim()
        ? translateAppMessage(preferredLanguage, "wheelFairnessServerVerifiedTitle")
        : translateAppMessage(preferredLanguage, "wheelFairnessLocalVerifiedTitle");
    }
  },
  setup(props: { ctx: Record<string, unknown> }) {
    const injectedWheelCtx = inject<Record<string, unknown> | null>("wheelCtx", null);
    const injectedCtx = inject<Record<string, unknown> | null>("appCtx", null);
    const source = (injectedWheelCtx ?? props.ctx ?? injectedCtx) as Record<string, unknown>;
    return createNestedWindowContextBridge(source);
  }
};
