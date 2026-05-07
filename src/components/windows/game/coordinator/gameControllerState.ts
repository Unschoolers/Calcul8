import { reactive } from "vue";
import type { Lot, MysteryGridReveal, PendingWheelInventoryIssue, Sale, WheelConfig, WheelFairnessEntry, WorkspaceScopeType } from "../../../../types/app.ts";
import { unwrapWindowBridgeContext } from "../../shared/contextBridge.ts";
import type { WheelSlot } from "../services/wheelSlots.ts";

/**
 * Typed `this` context shared across GameWindow computed properties, watchers,
 * lifecycle hooks, and all wheel method objects (wheelSessionMethods,
 * wheelSpinMethods, wheelConfigMethods, wheelSpectatorMethods).
 *
 * Replaces the previous `this: Record<string, unknown>` annotations and the
 * verbose `(this as Record<string, unknown>).prop` access casts throughout
 * those files.
 */
export type GameWindowThis = {
  // ===== Local window state (from createGameWindowState) =====
  editingWheelConfig: WheelConfig | null;
  appliedWheelConfigSnapshot: WheelConfig | null;
  wheelConfigSyncPending: boolean;
  wheelController: WheelControllerState;
  wheelAutospinEnabled: boolean;
  wheelSoundEnabled: boolean;
  wheelReducedMotion: boolean;
  wheelMobileInspectorOpen: boolean;
  wheelCelebrationVisible: boolean;
  wheelCelebrationLabel: string;
  wheelCelebrationColor: string;
  wheelCelebrationImage: string;
  wheelCelebrationEmoji: string;
  wheelCelebrationPreview: boolean;
  wheelCelebrationNonce: number;
  wheelSpinning: boolean;
  wheelGridRevealAnimating: boolean;
  wheelGridResetAnimating: boolean;
  wheelGridHighlightCellIndex: number;
  wheelCurrentAngle: number;
  wheelCanvasSize: number;
  wheelConfigReady: boolean;
  wheelViewportWidth: number;
  wheelMode: "config" | "live";
  wheelInspectorTab: "config" | "session" | "history";
  wheelEndingSession: boolean;
  wheelEndSessionReviewActive: boolean;
  wheelPresentationMode: boolean;
  wheelConfirmDialog: boolean;
  wheelConfirmAction: "reset" | "delete" | "apply" | "end" | "";
  wheelLiveConfirmDialog: boolean;
  wheelRequestedMode: "config" | "live" | null;
  wheelPendingMenuOpen: boolean;
  wheelChaseDialog: boolean;
  wheelChasePreviewMode: boolean;
  wheelChaseReplacementSinglesId: number | null;
  wheelChasePendingTierId: string;
  wheelCreateDialog: boolean;
  wheelManageDialog: boolean;
  wheelManageName: string;
  wheelSpectatorDialog: boolean;
  wheelSpectatorSessionId: string;
  wheelSpectatorSessionStatus: "inactive" | "starting" | "live" | "ended";
  wheelSpectatorSessionUrl: string;
  wheelSpectatorSessionQrUrl: string;
  wheelSpectatorPublishPending: boolean;
  wheelSpectatorConnectedCount: number;

  // ===== WheelControllerState alias properties =====
  activeWheelSlots: WheelSlot[];
  wheelPreviewSlots: WheelSlot[];
  wheelInventoryWarning: string;
  wheelLastResultColor: string;
  wheelPreviewSpinCounts: number[];
  wheelPreviewTotalSpins: number;
  wheelSpinSeed: string;
  wheelSpinHash: string;
  wheelSpinClientSeed: string;
  wheelSpinVerificationUrl: string;
  wheelSpinAlgorithm: string;
  wheelShowSeed: boolean;
  wheelFairnessHistoryOpen: boolean;
  wheelSessionNetRevenue: number | null;
  wheelSessionCostAdjustment: number;
  wheelPreviewFairnessHistory: WheelFairnessEntry[];
  wheelFairnessHistory: WheelFairnessEntry[];
  wheelPreviewChaseTallyHistory: Array<{ tierId: string; label: string; color: string; count: number }>;
  wheelChaseTallyHistory: Array<{ tierId: string; label: string; color: string; count: number }>;
  wheelGridReveals: MysteryGridReveal[];
  wheelPreviewGridReveals: MysteryGridReveal[];
  wheelGridLayoutSeed: string;
  wheelPreviewGridLayoutSeed: string;
  wheelHighlightedSlotIndex: number;

  // ===== AppContext bridge properties =====
  currentTab: string;
  wheelConfigs: WheelConfig[];
  activeWheelConfigId: number | null;
  wheelSpinCounts: number[];
  wheelTotalSpins: number;
  lots: Lot[];
  currentLotId: number | null;
  activeScopeType: WorkspaceScopeType;
  activeWorkspaceId: string | null;
  googleAuthEpoch: number;
  hasProAccess: boolean;
  wheelLastResult: string;
  wheelSessionUpdatedAt: number;
  wheelPendingInventoryIssues: PendingWheelInventoryIssue[];
  wheelSkippedDeductions: PendingWheelInventoryIssue[];
  wheelSessionLotSelections: Record<string, number | null>;

  // ===== Computed properties =====
  activeWheelConfig: WheelConfig | null;
  wheelDisplayConfig: WheelConfig | null;
  wheelDisplaySlots: WheelSlot[];
  wheelIsCompactLayout: boolean;
  wheelCompactStageSummaryLabel: string;
  wheelCompactStageSummaryValue: string;
  wheelCompactStageSummaryColor: string;
  expectedMarginDisplay: string;
  wheelSessionMarginDisplay: string;
  expectedMarginColor: string;
  wheelSessionMarginColor: string;
  wheelSpinBlockedReason: string;
  wheelHasRequiredLotSelection: boolean;
  wheelIsMysteryGrid: boolean;

  // ===== Private internal state =====
  _wheelSkipConfigReload?: boolean;
  _wheelAutospinTimeoutId?: number;
  _wheelCelebrationTimeoutId?: number;
  _wheelHighlightTimeoutId?: number;
  _wheelCelebrationAnimId?: number;
  _wheelSpectatorPublishQueued?: boolean;
  _wheelSpectatorQueuedStatusOverride?: "starting" | "live" | "ended";
  _wheelSpectatorSpinAnimation?: import("../../../../types/app.ts").WheelSpectatorSpinAnimation | null;
  _wheelDraftSaveTimeoutId?: number;
  _wheelResizeObserver?: ResizeObserver;
  _wheelViewportResizeHandler?: () => void;
  _wheelStaticRenderCache?: unknown;
  _wheelHighlightTime?: number;
  _wheelAnimationAngle?: number;
  _wheelCanvasRefreshRetryCount?: number;
  _wheelCanvasRefreshTimeoutId?: number;

  // ===== Vue instance =====
  $refs: Record<string, unknown>;

  // ===== Methods from spread method objects =====
  drawWheel(offset?: number): void;
  testSpinWheel(): Promise<void>;
  spinWheel(): Promise<void>;
  runWheelAutoPreviewAnimation(): Promise<void>;
  saveWheelSession(): void;
  recordChaseSale(tierId: string): void;
  resetPreviewSession(): void;
  resetWheelSession(): void;
  startEndWheelSession(): void;
  loadWheelConfig(options?: { preserveLiveWheelState?: boolean }): void;
  persistLastWheelConfigSelection(): void;
  restoreLastWheelConfigSelection(): void;
  openWheelCreateDialog(): void;
  closeWheelCreateDialog(): void;
  createNewGameConfig(gameType: import("../../../../types/app.ts").LuckGameType): void;
  ensureWheelEditorState(): void;
  queueWheelConfigSync(): void;
  deleteWheelConfig(): void;
  syncWheelSpectatorCountPolling(): void;
  stopWheelSpectatorCountPolling(): void;
  syncWheelSpectatorLinks(): void;
  stopWheelAutospin(): void;
  toggleWheelSound(): void;
  toggleWheelReducedMotion(): void;
  startWheelAutospin(): void;
  scheduleNextWheelAutospin(delayMs?: number): void;
  normalizeWheelCompactInspectorState(): void;
  refreshWheelCanvas(): void;
  openWheelInspector(tab: "config" | "session" | "history"): void;
  isWheelMobileViewport(): boolean;
  confirmChaseReplacement(): void;
  keepChase(): void;
  recordPreviewSpinResult(slotIndex: number): void;
  recordSpinResult(slotIndex: number): void;
  landOnSlot(slotIndex: number, options?: { recordSession?: boolean }): void;
  revealMysteryGridRandomCell(recordSession?: boolean): Promise<void>;
  runMysteryGridAutoPreviewAnimation(): Promise<void>;
  revealMysteryGridCell(cellIndex: number, recordSession?: boolean): Promise<void>;
  appendWheelFairnessHistory(entry: WheelFairnessEntry, options?: { preview?: boolean }): void;
  confirmBatchSale(index: number): void;
  getPendingWheelIssueLotItems(entry: PendingWheelInventoryIssue): Array<{ title: string; value: number; lotType?: string }>;
  dismissBatchSale(index: number): void;
  confirmAllBatchSales(): void;
  cancelEndWheelSession(): void;
  requestWheelSessionEnd(): void;
  requestWheelReset(): void;

  // ===== Optional AppContext bridge methods =====
  addWheelSaleToLot(lotId: number, sale: Sale): void;
  triggerWheelCelebration?(payload: { label: string; color: string; image?: string; emoji?: string; preview?: boolean }): void;
  endWheelSpectatorMode?(options?: { notifyOnSuccess?: boolean; closeDialog?: boolean }): Promise<void>;
  publishWheelSpectatorSessionSnapshot?(statusOverride?: "starting" | "live" | "ended"): Promise<void>;

  // ===== Data-only properties defined in data() but not in state helpers =====
  wheelConfigSavedSnackbar: boolean;
};

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
  gridReveals: MysteryGridReveal[];
  previewGridReveals: MysteryGridReveal[];
  gridLayoutSeed: string;
  previewGridLayoutSeed: string;
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
    gridReveals: [],
    previewGridReveals: [],
    gridLayoutSeed: "",
    previewGridLayoutSeed: "",
    highlightedSlotIndex: -1
  };
}

function getInternalWheelContext(context: object): Record<string, unknown> | null {
  const internal = (context as { $?: { ctx?: Record<string, unknown> } }).$?.ctx;
  return internal && typeof internal === "object" ? internal : null;
}

function getExistingWheelController(context: object): WheelControllerState | null {
  const ctx = context as Record<string, unknown>;
  const direct = ctx.wheelController;
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

function canAttachWheelControllerToContext(context: object): boolean {
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

export function getWheelController(context: object): WheelControllerState {
  const resolvedContext = unwrapWindowBridgeContext(context as Record<string, unknown>);
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
  wheelGridReveals: "gridReveals",
  wheelPreviewGridReveals: "previewGridReveals",
  wheelGridLayoutSeed: "gridLayoutSeed",
  wheelPreviewGridLayoutSeed: "previewGridLayoutSeed",
  wheelHighlightedSlotIndex: "highlightedSlotIndex"
} as const satisfies Record<string, keyof WheelControllerState>;

const WHEEL_LOCAL_TOP_LEVEL_KEYS = [
  "editingWheelConfig",
  "appliedWheelConfigSnapshot",
  "wheelConfigSyncPending",
  "wheelAutospinEnabled",
  "wheelSoundEnabled",
  "wheelReducedMotion",
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
  "wheelSpinning",
  "wheelGridRevealAnimating",
  "wheelGridResetAnimating",
  "wheelGridHighlightCellIndex",
  "wheelCurrentAngle",
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
  "wheelCreateDialog",
  "wheelManageDialog",
  "wheelManageName",
  "wheelSpectatorDialog",
  "wheelSpectatorSessionId",
  "wheelSpectatorSessionStatus",
  "wheelSpectatorSessionUrl",
  "wheelSpectatorSessionQrUrl",
  "wheelSpectatorPublishPending",
  "wheelSpectatorConnectedCount"
] as const;

export function getGameWindowLocalKeys(): string[] {
  return [
    "wheelController",
    ...WHEEL_LOCAL_TOP_LEVEL_KEYS,
    ...Object.keys(WHEEL_CONTROLLER_ALIAS_MAP)
  ];
}

export function createGameWindowState() {
  const state = {
    editingWheelConfig: null as WheelConfig | null,
    appliedWheelConfigSnapshot: null as WheelConfig | null,
    wheelConfigSyncPending: false,
    wheelController: createDefaultWheelControllerState(),
    wheelAutospinEnabled: false,
    wheelSoundEnabled: true,
    wheelReducedMotion: false,
    wheelMobileInspectorOpen: false,
    wheelCelebrationVisible: false,
    wheelCelebrationLabel: "",
    wheelCelebrationColor: "#f0a500",
    wheelCelebrationImage: "",
    wheelCelebrationEmoji: "",
    wheelCelebrationPreview: false,
    wheelCelebrationNonce: 0,
    wheelSpinning: false,
    wheelGridRevealAnimating: false,
    wheelGridResetAnimating: false,
    wheelGridHighlightCellIndex: -1,
    wheelCurrentAngle: 0,
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
    wheelCreateDialog: false,
    wheelManageDialog: false,
    wheelManageName: "",
    wheelSpectatorDialog: false,
    wheelSpectatorSessionId: "" as string,
    wheelSpectatorSessionStatus: "inactive" as "inactive" | "starting" | "live" | "ended",
    wheelSpectatorSessionUrl: "" as string,
    wheelSpectatorSessionQrUrl: "" as string,
    wheelSpectatorPublishPending: false,
    wheelSpectatorConnectedCount: 0
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

export type WheelWindowThis = GameWindowThis;
export const getWheelWindowLocalKeys = getGameWindowLocalKeys;
export const createWheelWindowState = createGameWindowState;

