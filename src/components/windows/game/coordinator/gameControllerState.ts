import { reactive } from "vue";
import type { GameCoordinatorContext } from "../../../../app-core/context/game.ts";
import type { MysteryGridReveal, PendingWheelInventoryIssue, WheelConfig, WheelFairnessEntry } from "../../../../types/app.ts";
import { unwrapWindowBridgeContext } from "../../shared/contextBridge.ts";
import type { WheelSlot } from "../services/wheelSlots.ts";
import type { GameStageOverlayCommand } from "../overlay/gameStageOverlayTypes.ts";
import type { BracketBattleRoll, BracketBattleSession } from "../bracket/bracketBattleDomain.ts";
import { GAME_CONTROLLER_LEGACY_ALIAS_MAP } from "./gameControllerLegacyAliases.ts";

/**
 * Typed `this` context shared across GameWindow computed properties, watchers,
 * lifecycle hooks, and game method objects (wheelSessionMethods,
 * wheelSpinMethods, wheelConfigMethods, gameSpectatorMethods).
 *
 * Replaces the previous `this: Record<string, unknown>` annotations and the
 * verbose `(this as Record<string, unknown>).prop` access casts throughout
 * those files.
 */
type GameControllerAliases = {
  [Key in keyof typeof GAME_CONTROLLER_LEGACY_ALIAS_MAP]:
    WheelControllerState[(typeof GAME_CONTROLLER_LEGACY_ALIAS_MAP)[Key]];
};

export type GameWindowThis = ReturnType<typeof createGameWindowBaseState>
  & GameControllerAliases
  & GameCoordinatorContext
  & {
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
  wheelIsBracketBattle: boolean;
  currentLotCostPerPack: number;
  hasPendingWheelChanges: boolean;
  canApplyWheelConfig: boolean;

  // ===== Private internal state =====
  _wheelSkipConfigReload?: boolean;
  _wheelAutospinTimeoutId?: number;
  _wheelCelebrationTimeoutId?: number;
  _wheelHighlightTimeoutId?: number;
  _wheelCelebrationAnimId?: number;
  _gameSpectatorPublishQueued?: boolean;
  _gameSpectatorQueuedStatusOverride?: "starting" | "live" | "ended";
  _gameSpectatorSpinAnimation?: import("../../../../types/app.ts").GameSpectatorSpinAnimation | null;
  _gameSpectatorCountPollIntervalId?: number;
  _gameSpectatorCountRequestPending?: boolean;
  _wheelDraftSaveTimeoutId?: ReturnType<typeof globalThis.setTimeout>;
  _wheelResizeObserver?: ResizeObserver;
  _wheelViewportResizeHandler?: () => void;
  _wheelStaticRenderCache?: unknown;
  _wheelHighlightTime?: number;
  _wheelAnimationAngle?: number;
  _wheelCanvasRefreshRetryCount?: number;
  _wheelCanvasRefreshTimeoutId?: number;

  // ===== Vue instance =====
  $refs?: Record<string, unknown>;

  // ===== Methods from spread method objects =====
  drawWheel(offset?: number): void;
  testSpinWheel(): Promise<void>;
  spinWheel(): Promise<void>;
  spinWheelInternal(recordSession?: boolean): Promise<void>;
  runWheelAutoPreviewAnimation(): Promise<void>;
  saveWheelSession(): void;
  recordChaseSale(tierId: string): void;
  resetPreviewSession(): void;
  resetWheelSession(): void;
  startEndWheelSession(): void;
  loadWheelConfig(options?: { preserveLiveWheelState?: boolean }): void;
  loadWheelFromSession(): boolean;
  applyWheelConfig(): void;
  saveWheelDraft(): void;
  clearWheelDraft(wheelConfigId?: number | null): void;
  showWheelConfigSaved?(): void;
  getCostPerPackForTier(tier: import("../../../../types/app.ts").WheelTier): number;
  canTierBeChase(tier: import("../../../../types/app.ts").WheelTier): boolean;
  persistLastWheelConfigSelection(): void;
  restoreLastWheelConfigSelection(): void;
  openWheelCreateDialog(): void;
  closeWheelCreateDialog(): void;
  createNewGameConfig(gameType: import("../../../../types/app.ts").LuckGameType): void;
  ensureWheelEditorState(): void;
  queueWheelConfigSync(): void;
  deleteWheelConfig(): void;
  syncGameSpectatorCountPolling(): void;
  stopGameSpectatorCountPolling(): void;
  refreshGameSpectatorCount(): Promise<void>;
  syncGameSpectatorLinks(): void;
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
  animateMysteryGridRandomSelection(cellIndex: number): Promise<void>;
  revealMysteryGridRandomCell(recordSession?: boolean): Promise<void>;
  runMysteryGridAutoPreviewAnimation(): Promise<void>;
  revealMysteryGridCell(cellIndex: number, recordSession?: boolean): Promise<void>;
  appendWheelFairnessHistory(entry: WheelFairnessEntry, options?: { preview?: boolean }): void;
  syncBracketBattleState(payload: {
    session: BracketBattleSession | null;
    lastRolls: BracketBattleRoll[];
    rolling: boolean;
    showcaseMatchId: string | null;
    publishLive: boolean;
  }): void;
  confirmBatchSale(index: number): void;
  getPendingWheelIssueLotItems(entry: PendingWheelInventoryIssue): Array<{ title: string; value: number; lotType?: string }>;
  dismissBatchSale(index: number): void;
  confirmAllBatchSales(): void;
  cancelEndWheelSession(): void;
  requestWheelSessionEnd(): void;
  requestWheelReset(): void;

  // ===== Optional effect ports =====
  triggerWheelCelebration?(payload: { label: string; color: string; image?: string; emoji?: string; preview?: boolean }): void;
  endGameSpectatorMode?(options?: { notifyOnSuccess?: boolean; closeDialog?: boolean }): Promise<void>;
  publishGameSpectatorSessionSnapshot?(statusOverride?: "starting" | "live" | "ended"): Promise<void>;

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
  for (const [legacyKey, controllerKey] of Object.entries(GAME_CONTROLLER_LEGACY_ALIAS_MAP)) {
    if (Object.prototype.hasOwnProperty.call(resolvedContext, legacyKey)) {
      (controller as Record<string, unknown>)[controllerKey] = resolvedContext[legacyKey];
    }
  }

  if (!canAttachWheelControllerToContext(resolvedContext)) {
    return controller;
  }

  resolvedContext.wheelController = controller;

  for (const [legacyKey, controllerKey] of Object.entries(GAME_CONTROLLER_LEGACY_ALIAS_MAP)) {
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

export function getGameWindowLocalKeys(): string[] {
  return [
    ...Object.keys(createGameWindowBaseState()),
    ...Object.keys(GAME_CONTROLLER_LEGACY_ALIAS_MAP)
  ];
}

function createGameWindowBaseState() {
  return {
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
    gameSpectatorDialog: false,
    gameSpectatorSessionId: "" as string,
    gameSpectatorSessionStatus: "inactive" as "inactive" | "starting" | "live" | "ended",
    gameSpectatorSessionUrl: "" as string,
    gameSpectatorSessionQrUrl: "" as string,
    gameSpectatorPublishPending: false,
    gameSpectatorConnectedCount: 0,
    gameStageOverlayEnabled: false,
    gameStageOverlayMounted: false,
    gameStageOverlayActiveCommand: null as GameStageOverlayCommand | null,
    gameStageOverlayLastResolvedAt: 0,
    bracketBattleSession: null as BracketBattleSession | null,
    bracketBattleLastRolls: [] as BracketBattleRoll[],
    bracketBattleRolling: false,
    bracketBattleShowcaseMatchId: null as string | null
  };
}

export function createGameWindowState(): ReturnType<typeof createGameWindowBaseState> & GameControllerAliases {
  const state = createGameWindowBaseState();
  for (const [legacyKey, controllerKey] of Object.entries(GAME_CONTROLLER_LEGACY_ALIAS_MAP)) {
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

  return state as ReturnType<typeof createGameWindowBaseState> & GameControllerAliases;
}


