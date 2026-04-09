import { type PropType } from "vue";
import { translateAppMessage } from "../../../app-core/i18n/index.ts";
import type { WheelFairnessEntry } from "../../../types/app.ts";
import { getWheelController } from "./wheelControllerState.ts";
import {
  getWheelCurrentProofState,
  getWheelDisplayFairnessHistoryEntries,
  getWheelLatestFairnessEntry
} from "./wheelComputedShared.ts";

function getWheelHistoryPanelSource(vm: Record<string, unknown>): Record<string, unknown> {
  const explicitCtx = vm.ctx;
  if (explicitCtx && typeof explicitCtx === "object") {
    return explicitCtx as Record<string, unknown>;
  }
  return vm;
}

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
  methods: {
    t(this: Record<string, unknown>, key: string, params?: Record<string, string | number | null | undefined>): string {
      const source = getWheelHistoryPanelSource(this as Record<string, unknown>);
      const translator = source.t;
      if (typeof translator === "function") {
        return (translator as (translationKey: string, translationParams?: Record<string, string | number | null | undefined>) => string)(key, params);
      }
      return translateAppMessage(String(source.preferredLanguage ?? ""), key, params);
    }
  },
  computed: {
    wheelHistoryPanelLatestOnly(this: Record<string, unknown>): boolean {
      return Boolean((this as Record<string, unknown>).latestOnly);
    },
    wheelHistoryPanelPresentation(this: Record<string, unknown>): boolean {
      return Boolean((this as Record<string, unknown>).presentation);
    },
    wheelHistoryPanelShowEmptyState(this: Record<string, unknown>): boolean {
      return (this as Record<string, unknown>).showEmptyState !== false;
    },
    wheelHistoryPanelEntries(this: Record<string, unknown>) {
      return getWheelDisplayFairnessHistoryEntries(getWheelHistoryPanelSource(this as Record<string, unknown>));
    },
    wheelHistoryPanelSummary(this: Record<string, unknown>): string {
      const source = getWheelHistoryPanelSource(this as Record<string, unknown>);
      const preferredLanguage = String(source.preferredLanguage ?? "");
      const count = (((this as Record<string, unknown>).wheelHistoryPanelEntries || []) as unknown[]).length;
      if (!count) return translateAppMessage(preferredLanguage, "wheelNoSpinsYetLabel");
      return translateAppMessage(preferredLanguage, "wheelFairnessRecentSpins", {
        count,
        suffix: count === 1 ? "" : "s"
      });
    },
    wheelHistoryPanelCurrentVerificationUrl(this: Record<string, unknown>): string {
      return getWheelCurrentProofState(getWheelHistoryPanelSource(this as Record<string, unknown>)).spinVerificationUrl;
    },
    wheelHistoryPanelSpinHash(this: Record<string, unknown>): string {
      return getWheelCurrentProofState(getWheelHistoryPanelSource(this as Record<string, unknown>)).spinHash;
    },
    wheelHistoryPanelSpinSeed(this: Record<string, unknown>): string {
      return getWheelCurrentProofState(getWheelHistoryPanelSource(this as Record<string, unknown>)).spinSeed;
    },
    wheelHistoryPanelSpinClientSeed(this: Record<string, unknown>): string {
      return getWheelCurrentProofState(getWheelHistoryPanelSource(this as Record<string, unknown>)).spinClientSeed;
    },
    wheelHistoryPanelSpinning(this: Record<string, unknown>): boolean {
      const source = getWheelHistoryPanelSource(this as Record<string, unknown>);
      return !!source.wheelSpinning;
    },
    wheelHistoryPanelLastResult(this: Record<string, unknown>): string {
      const source = getWheelHistoryPanelSource(this as Record<string, unknown>);
      return String(source.wheelLastResult || "");
    },
    wheelHistoryPanelLastResultClean(this: Record<string, unknown>): string {
      return String((this as Record<string, unknown>).wheelHistoryPanelLastResult || "")
        .replace(/^🎉\s*/, "")
        .trim();
    },
    wheelHistoryPanelLastResultColor(this: Record<string, unknown>): string {
      return getWheelCurrentProofState(getWheelHistoryPanelSource(this as Record<string, unknown>)).lastResultColor;
    },
    wheelHistoryPanelFairnessIcon(this: Record<string, unknown>): string {
      return (this as Record<string, unknown>).wheelHistoryPanelSpinning ? "mdi-lock" : "mdi-shield-check";
    },
    wheelHistoryPanelFairnessIconColor(this: Record<string, unknown>): string {
      return (this as Record<string, unknown>).wheelHistoryPanelSpinning ? "warning" : "success";
    },
    wheelHistoryPanelHistoryOpen: {
      get(this: Record<string, unknown>): boolean {
        const controller = getWheelController(getWheelHistoryPanelSource(this as Record<string, unknown>));
        return !!controller.fairnessHistoryOpen;
      },
      set(this: Record<string, unknown>, value: boolean) {
        const controller = getWheelController(getWheelHistoryPanelSource(this as Record<string, unknown>));
        controller.fairnessHistoryOpen = value;
      }
    },
    wheelHistoryPanelLatestEntry(this: Record<string, unknown>) {
      return getWheelLatestFairnessEntry(getWheelHistoryPanelSource(this as Record<string, unknown>));
    },
    wheelHistoryPanelTitle(this: Record<string, unknown>): string {
      const source = getWheelHistoryPanelSource(this as Record<string, unknown>);
      const preferredLanguage = String(source.preferredLanguage ?? "");
      if ((this as Record<string, unknown>).wheelHistoryPanelSpinning) {
        return translateAppMessage(preferredLanguage, "wheelFairnessResultLockedTitle");
      }
      return String((this as Record<string, unknown>).wheelHistoryPanelCurrentVerificationUrl || "").trim()
        ? translateAppMessage(preferredLanguage, "wheelFairnessServerVerifiedTitle")
        : translateAppMessage(preferredLanguage, "wheelFairnessLocalVerifiedTitle");
    },
    wheelHistoryPanelSummaryText(this: Record<string, unknown>): string {
      if ((this as Record<string, unknown>).wheelHistoryPanelSpinning) {
        const source = getWheelHistoryPanelSource(this as Record<string, unknown>);
        const preferredLanguage = String(source.preferredLanguage ?? "");
        return translateAppMessage(preferredLanguage, "wheelFairnessCommittedSummary");
      }
      const verificationUrl = String((this as Record<string, unknown>).wheelHistoryPanelCurrentVerificationUrl || "");
      const source = getWheelHistoryPanelSource(this as Record<string, unknown>);
      const preferredLanguage = String(source.preferredLanguage ?? "");
      return verificationUrl
        ? translateAppMessage(preferredLanguage, "wheelFairnessServerVerificationSummary")
        : translateAppMessage(preferredLanguage, "wheelFairnessLocalVerificationSummary");
    },
    wheelHistoryPanelSpinVerificationUrl(this: Record<string, unknown>): string {
      return getWheelCurrentProofState(getWheelHistoryPanelSource(this as Record<string, unknown>)).spinVerificationUrl;
    },
    wheelHistoryPanelHasEntries(this: Record<string, unknown>): boolean {
      return (((this as Record<string, unknown>).wheelHistoryPanelEntries || []) as unknown[]).length > 0;
    }
  }
};
