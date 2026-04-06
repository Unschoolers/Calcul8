import { reactive } from "vue";
import type { WheelConfig, WheelFairnessEntry } from "../../types/app.ts";
import type { WheelSlot } from "./wheelHelpers.ts";

export type WheelControllerState = {
  activeSlots: WheelSlot[];
  previewSlots: WheelSlot[];
  inventoryWarning: string;
  lastResultColor: string;
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
};

function createDefaultWheelControllerState(): WheelControllerState {
  return {
    activeSlots: [],
    previewSlots: [],
    inventoryWarning: "",
    lastResultColor: "rgb(var(--v-theme-primary))",
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
    sessionNetRevenue: null,
    sessionCostAdjustment: 0,
    previewFairnessHistory: [],
    fairnessHistory: [],
    previewChaseTallyHistory: [],
    chaseTallyHistory: [],
    highlightedSlotIndex: -1
  };
}

export function getWheelController(context: Record<string, unknown>): WheelControllerState {
  const existing = context.wheelController;
  if (existing && typeof existing === "object") {
    return existing as WheelControllerState;
  }

  const controller = reactive(createDefaultWheelControllerState());
  for (const [legacyKey, controllerKey] of Object.entries(WHEEL_CONTROLLER_ALIAS_MAP)) {
    if (Object.prototype.hasOwnProperty.call(context, legacyKey)) {
      (controller as Record<string, unknown>)[controllerKey] = context[legacyKey];
    }
  }
  context.wheelController = controller;

  for (const [legacyKey, controllerKey] of Object.entries(WHEEL_CONTROLLER_ALIAS_MAP)) {
    const descriptor = Object.getOwnPropertyDescriptor(context, legacyKey);
    if (descriptor?.get || descriptor?.set) continue;
    Object.defineProperty(context, legacyKey, {
      enumerable: true,
      configurable: true,
      get() {
        return (controller as Record<string, unknown>)[controllerKey];
      },
      set(value: unknown) {
        (controller as Record<string, unknown>)[controllerKey] = value;
      }
    });
  }

  return controller;
}

const WHEEL_CONTROLLER_ALIAS_MAP = {
  activeWheelSlots: "activeSlots",
  wheelPreviewSlots: "previewSlots",
  wheelInventoryWarning: "inventoryWarning",
  wheelLastResultColor: "lastResultColor",
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
  wheelHighlightedSlotIndex: "highlightedSlotIndex"
} as const satisfies Record<string, keyof WheelControllerState>;

const WHEEL_LOCAL_TOP_LEVEL_KEYS = [
  "editingWheelConfig",
  "appliedWheelConfigSnapshot",
  "wheelMode",
  "wheelInspectorTab",
  "wheelMobileInspectorOpen",
  "wheelCelebrationVisible",
  "wheelCelebrationLabel",
  "wheelCelebrationColor",
  "wheelCelebrationImage",
  "wheelCelebrationPreview",
  "wheelCelebrationNonce",
  "wheelCanvasSize",
  "wheelConfigReady",
  "wheelViewportWidth",
  "wheelEndingSession",
  "wheelEndSessionReviewActive",
  "wheelPresentationMode",
  "wheelConfirmDialog",
  "wheelConfirmAction",
  "wheelLiveConfirmDialog",
  "wheelRequestedMode",
  "wheelPendingMenuOpen",
  "wheelChaseDialog",
  "wheelChasePreviewMode",
  "wheelChaseReplacementSinglesId",
  "wheelChasePendingTierId",
  "wheelManageDialog",
  "wheelManageName"
] as const;

export function getWheelWindowLocalKeys(): string[] {
  return [
    "wheelController",
    ...WHEEL_LOCAL_TOP_LEVEL_KEYS,
    ...Object.keys(WHEEL_CONTROLLER_ALIAS_MAP)
  ];
}

export function createWheelWindowState() {
  const state = {
    editingWheelConfig: null as WheelConfig | null,
    appliedWheelConfigSnapshot: null as WheelConfig | null,
    wheelController: createDefaultWheelControllerState(),
    wheelMobileInspectorOpen: false,
    wheelCelebrationVisible: false,
    wheelCelebrationLabel: "",
    wheelCelebrationColor: "#f0a500",
    wheelCelebrationImage: "",
    wheelCelebrationPreview: false,
    wheelCelebrationNonce: 0,
    wheelCanvasSize: 360,
    wheelConfigReady: false,
    wheelViewportWidth: 0,
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
    wheelChasePendingTierId: "" as string,
    wheelManageDialog: false,
    wheelManageName: ""
  } as Record<string, unknown>;

  // Seed legacy alias keys as plain reactive data so that existing code
  // (wheelComputeds, wheelConfigMethods, wheelSpinMethods) which reads/writes
  // these keys on `this` continues to work through Vue's reactivity system.
  // NOTE: these are NOT linked to wheelController — code that was migrated to
  // the controller should use getWheelController() instead.
  const defaults = createDefaultWheelControllerState();
  for (const [legacyKey, controllerKey] of Object.entries(WHEEL_CONTROLLER_ALIAS_MAP)) {
    if (!(legacyKey in state)) {
      state[legacyKey] = defaults[controllerKey];
    }
  }

  return state;
}
