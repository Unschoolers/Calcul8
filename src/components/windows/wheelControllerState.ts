import { reactive } from "vue";
import type { WheelConfig, WheelFairnessEntry } from "../../types/app.ts";
import type { WheelSlot } from "./wheelHelpers.ts";
import { unwrapWindowBridgeContext } from "./contextBridge.ts";

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

function getInternalWheelContext(context: Record<string, unknown>): Record<string, unknown> | null {
  const internal = (context as { $?: { ctx?: Record<string, unknown> } }).$?.ctx;
  return internal && typeof internal === "object" ? internal : null;
}

function getExistingWheelController(context: Record<string, unknown>): WheelControllerState | null {
  const direct = context.wheelController;
  if (direct && typeof direct === "object") {
    return direct as WheelControllerState;
  }

  const internal = getInternalWheelContext(context);
  const internalController = internal?.wheelController;
  if (internalController && typeof internalController === "object") {
    return internalController as WheelControllerState;
  }

  return null;
}

function canAttachWheelControllerToContext(context: Record<string, unknown>): boolean {
  if (!context || typeof context !== "object") return false;

  const internal = getInternalWheelContext(context);
  if (internal && internal !== context) {
    return false;
  }

  if (Reflect.ownKeys(context).length === 0) {
    return false;
  }

  return true;
}

export function getWheelController(context: Record<string, unknown>): WheelControllerState {
  const resolvedContext = unwrapWindowBridgeContext(context);
  const existing = getExistingWheelController(resolvedContext);
  if (existing) {
    return existing;
  }

  const controller = reactive(createDefaultWheelControllerState());
  for (const [legacyKey, controllerKey] of Object.entries(WHEEL_CONTROLLER_ALIAS_MAP)) {
    if (Object.prototype.hasOwnProperty.call(resolvedContext, legacyKey)) {
      (controller as Record<string, unknown>)[controllerKey] = resolvedContext[legacyKey];
    }
  }

  if (!canAttachWheelControllerToContext(resolvedContext)) {
    return controller;
  }

  resolvedContext.wheelController = controller;

  for (const [legacyKey, controllerKey] of Object.entries(WHEEL_CONTROLLER_ALIAS_MAP)) {
    const descriptor = Object.getOwnPropertyDescriptor(resolvedContext, legacyKey);
    if (descriptor?.get || descriptor?.set) continue;
    Object.defineProperty(resolvedContext, legacyKey, {
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
  "wheelCelebrationEmoji",
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
    wheelCelebrationEmoji: "",
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
  for (const [legacyKey, controllerKey] of Object.entries(WHEEL_CONTROLLER_ALIAS_MAP)) {
    Object.defineProperty(state, legacyKey, {
      enumerable: true,
      configurable: true,
      get() {
        return (state.wheelController as WheelControllerState)[controllerKey];
      },
      set(value: unknown) {
        (state.wheelController as Record<string, unknown>)[controllerKey] = value;
      }
    });
  }

  return state;
}
