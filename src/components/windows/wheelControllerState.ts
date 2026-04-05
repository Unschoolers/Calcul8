import type { WheelConfig } from "../../types/app.ts";
import type { WheelSlot } from "./wheelHelpers.ts";

export function createWheelWindowState() {
  return {
    editingWheelConfig: null as WheelConfig | null,
    appliedWheelConfigSnapshot: null as WheelConfig | null,
    activeWheelSlots: [] as WheelSlot[],
    wheelPreviewSlots: [] as WheelSlot[],
    wheelMode: "config" as "config" | "live",
    wheelInspectorTab: "config" as "config" | "session" | "history",
    wheelMobileInspectorOpen: false,
    wheelCelebrationVisible: false,
    wheelCelebrationLabel: "" as string,
    wheelCelebrationColor: "#f0a500",
    wheelCelebrationImage: "" as string,
    wheelCelebrationPreview: false,
    wheelCelebrationNonce: 0,
    wheelInventoryWarning: "" as string,
    wheelLastResultColor: "rgb(var(--v-theme-primary))",
    wheelCanvasSize: 360,
    wheelEndingSession: false,
    wheelEndSessionReviewActive: false,
    wheelPresentationMode: false,
    wheelPreviewSpinCounts: [] as number[],
    wheelPreviewTotalSpins: 0,
    wheelSpinSeed: "" as string,
    wheelSpinHash: "" as string,
    wheelShowSeed: false,
    wheelConfirmDialog: false,
    wheelConfirmAction: "" as "reset" | "delete" | "apply" | "end" | "",
    wheelLiveConfirmDialog: false,
    wheelRequestedMode: null as "config" | "live" | null,
    wheelPendingMenuOpen: false,
    wheelConfigReady: false,
    wheelViewportWidth: 0,
    wheelChaseDialog: false,
    wheelChasePreviewMode: false,
    wheelChaseReplacementSinglesId: null as number | null,
    wheelChasePendingTierId: "" as string,
    wheelFairnessHistoryOpen: false,
    wheelSessionNetRevenue: 0 as number | null,
    wheelSessionCostAdjustment: 0,
    wheelPreviewFairnessHistory: [] as Array<{
      spinNumber: number;
      label: string;
      color: string;
      hash: string;
      seed: string;
      timestamp: number;
    }>,
    wheelFairnessHistory: [] as Array<{
      spinNumber: number;
      label: string;
      color: string;
      hash: string;
      seed: string;
      timestamp: number;
    }>,
    wheelPreviewChaseTallyHistory: [] as Array<{ tierId: string; label: string; color: string; count: number }>,
    wheelChaseTallyHistory: [] as Array<{ tierId: string; label: string; color: string; count: number }>,
    wheelHighlightedSlotIndex: -1,
    wheelManageDialog: false,
    wheelManageName: ""
  };
}
