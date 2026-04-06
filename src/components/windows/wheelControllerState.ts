import type { WheelConfig, WheelFairnessEntry } from "../../types/app.ts";
import type { WheelSlot } from "./wheelHelpers.ts";

type WheelControllerState = {
  editingWheelConfig: WheelConfig | null;
  appliedWheelConfigSnapshot: WheelConfig | null;
  activeWheelSlots: WheelSlot[];
  previewSlots: WheelSlot[];
  mobileInspectorOpen: boolean;
  celebrationVisible: boolean;
  celebrationLabel: string;
  celebrationColor: string;
  celebrationImage: string;
  celebrationPreview: boolean;
  celebrationNonce: number;
  inventoryWarning: string;
  lastResultColor: string;
  canvasSize: number;
  previewSpinCounts: number[];
  previewTotalSpins: number;
  spinSeed: string;
  spinHash: string;
  spinClientSeed: string;
  spinVerificationUrl: string;
  spinAlgorithm: string;
  showSeed: boolean;
  configReady: boolean;
  viewportWidth: number;
  fairnessHistoryOpen: boolean;
  sessionNetRevenue: number | null;
  sessionCostAdjustment: number;
  previewFairnessHistory: WheelFairnessEntry[];
  fairnessHistory: WheelFairnessEntry[];
  previewChaseTallyHistory: Array<{ tierId: string; label: string; color: string; count: number }>;
  chaseTallyHistory: Array<{ tierId: string; label: string; color: string; count: number }>;
  highlightedSlotIndex: number;
  manageDialog: boolean;
  manageName: string;
};

const WHEEL_CONTROLLER_ALIAS_MAP = {
  editingWheelConfig: "editingWheelConfig",
  appliedWheelConfigSnapshot: "appliedWheelConfigSnapshot",
  activeWheelSlots: "activeWheelSlots",
  wheelPreviewSlots: "previewSlots",
  wheelMobileInspectorOpen: "mobileInspectorOpen",
  wheelCelebrationVisible: "celebrationVisible",
  wheelCelebrationLabel: "celebrationLabel",
  wheelCelebrationColor: "celebrationColor",
  wheelCelebrationImage: "celebrationImage",
  wheelCelebrationPreview: "celebrationPreview",
  wheelCelebrationNonce: "celebrationNonce",
  wheelInventoryWarning: "inventoryWarning",
  wheelLastResultColor: "lastResultColor",
  wheelCanvasSize: "canvasSize",
  wheelPreviewSpinCounts: "previewSpinCounts",
  wheelPreviewTotalSpins: "previewTotalSpins",
  wheelSpinSeed: "spinSeed",
  wheelSpinHash: "spinHash",
  wheelSpinClientSeed: "spinClientSeed",
  wheelSpinVerificationUrl: "spinVerificationUrl",
  wheelSpinAlgorithm: "spinAlgorithm",
  wheelShowSeed: "showSeed",
  wheelConfigReady: "configReady",
  wheelViewportWidth: "viewportWidth",
  wheelFairnessHistoryOpen: "fairnessHistoryOpen",
  wheelSessionNetRevenue: "sessionNetRevenue",
  wheelSessionCostAdjustment: "sessionCostAdjustment",
  wheelPreviewFairnessHistory: "previewFairnessHistory",
  wheelFairnessHistory: "fairnessHistory",
  wheelPreviewChaseTallyHistory: "previewChaseTallyHistory",
  wheelChaseTallyHistory: "chaseTallyHistory",
  wheelHighlightedSlotIndex: "highlightedSlotIndex",
  wheelManageDialog: "manageDialog",
  wheelManageName: "manageName"
} as const satisfies Record<string, keyof WheelControllerState>;

export function getWheelWindowLocalKeys(): string[] {
  return ["wheelController", ...Object.keys(WHEEL_CONTROLLER_ALIAS_MAP)];
}

export function createWheelWindowState() {
  const state = {
    wheelController: {
      editingWheelConfig: null,
      appliedWheelConfigSnapshot: null,
      activeWheelSlots: [],
      previewSlots: [],
      mobileInspectorOpen: false,
      celebrationVisible: false,
      celebrationLabel: "",
      celebrationColor: "#f0a500",
      celebrationImage: "",
      celebrationPreview: false,
      celebrationNonce: 0,
      inventoryWarning: "",
      lastResultColor: "rgb(var(--v-theme-primary))",
      canvasSize: 360,
      previewSpinCounts: [],
      previewTotalSpins: 0,
      spinSeed: "",
      spinHash: "",
      spinClientSeed: "",
      spinVerificationUrl: "",
      spinAlgorithm: "",
      showSeed: false,
      configReady: false,
      viewportWidth: 0,
      fairnessHistoryOpen: false,
      sessionNetRevenue: 0,
      sessionCostAdjustment: 0,
      previewFairnessHistory: [],
      fairnessHistory: [],
      previewChaseTallyHistory: [],
      chaseTallyHistory: [],
      highlightedSlotIndex: -1,
      manageDialog: false,
      manageName: ""
    } satisfies WheelControllerState,
    wheelMode: "config" as "config" | "live",
    wheelInspectorTab: "config" as "config" | "session" | "history",
    wheelEndingSession: false,
    wheelEndSessionReviewActive: false,
    wheelPresentationMode: false,
    wheelConfirmDialog: false,
    wheelConfirmAction: "" as "reset" | "delete" | "apply" | "end" | "",
    wheelLiveConfirmDialog: false,
    wheelRequestedMode: null as "config" | "live" | null,
    wheelPendingMenuOpen: false,
    wheelChaseDialog: false,
    wheelChasePreviewMode: false,
    wheelChaseReplacementSinglesId: null as number | null,
    wheelChasePendingTierId: "" as string
  } as Record<string, unknown>;

  for (const [legacyKey, controllerKey] of Object.entries(WHEEL_CONTROLLER_ALIAS_MAP)) {
    Object.defineProperty(state, legacyKey, {
      enumerable: true,
      configurable: true,
      get() {
        return (state.wheelController as WheelControllerState)[controllerKey];
      },
      set(value: unknown) {
        (state.wheelController as WheelControllerState)[controllerKey] = value as never;
      }
    });
  }

  return state;
}
