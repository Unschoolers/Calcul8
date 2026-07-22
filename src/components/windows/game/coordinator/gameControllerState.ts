import type { GameCoordinatorContext, GameSessionStateContext } from "../../../../app-core/context/game.ts";
import type { PendingWheelInventoryIssue, WheelConfig, WheelFairnessEntry } from "../../../../types/app.ts";
import { unwrapWindowBridgeContext } from "../../shared/contextBridge.ts";
import type { WheelSlot } from "../services/wheelSlots.ts";
import type { GameStageOverlayCommand } from "../overlay/gameStageOverlayTypes.ts";
import type { BracketBattleRoll, BracketBattleSession } from "../bracket/bracketBattleDomain.ts";

/**
 * Typed `this` context shared across GameWindow computed properties, watchers,
 * lifecycle hooks, and game method objects (wheelSessionMethods,
 * wheelSpinMethods, wheelConfigMethods, gameSpectatorMethods).
 *
 * Replaces the previous `this: Record<string, unknown>` annotations and the
 * verbose `(this as Record<string, unknown>).prop` access casts throughout
 * those files.
 */
export type GameWindowThis = ReturnType<typeof createGameWindowBaseState>
  & WheelControllerState
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
  _wheelAppliedRealtimeRevision: number;
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
  applyRealtimeWheelSession(): void;
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

export type WheelControllerState = GameSessionStateContext;

export function createWheelControllerState(): WheelControllerState {
  return {
    wheelSpinning: false, wheelCurrentAngle: 0, wheelSpinCounts: [], wheelTotalSpins: 0, wheelLastResult: "",
    wheelSessionUpdatedAt: 0, wheelSessionLotSelections: {}, wheelPendingInventoryIssues: [],
    activeWheelSlots: [], wheelPreviewSlots: [], wheelInventoryWarning: "", wheelLastResultColor: "rgb(var(--v-theme-primary))",
    wheelPreviewSpinCounts: [], wheelPreviewTotalSpins: 0, wheelShowSeed: false, wheelFairnessHistoryOpen: false,
    wheelSpinSeed: "", wheelSpinHash: "", wheelSpinClientSeed: "", wheelSpinVerificationUrl: "", wheelSpinAlgorithm: "",
    wheelSessionNetRevenue: null, wheelSessionCostAdjustment: 0, wheelPreviewFairnessHistory: [], wheelFairnessHistory: [],
    wheelPreviewChaseTallyHistory: [], wheelChaseTallyHistory: [], wheelGridReveals: [], wheelPreviewGridReveals: [],
    wheelGridLayoutSeed: "", wheelPreviewGridLayoutSeed: "",
    wheelHighlightedSlotIndex: -1
  };
}

export function getWheelController(context: object): WheelControllerState {
  const input = context as Record<string, unknown>;
  const owner = unwrapWindowBridgeContext(input);
  const missing = Object.keys(createWheelControllerState()).find((key) => !(key in owner));
  if (missing) throw new Error(`Missing game session field: ${missing}`);
  return owner as unknown as WheelControllerState;
}

/** Explicit compatibility boundary for isolated tests and legacy partial hosts. */
export function ensureWheelControllerState(context: object): WheelControllerState {
  const owner = unwrapWindowBridgeContext(context as Record<string, unknown>);
  for (const [key, value] of Object.entries(createWheelControllerState())) if (!(key in owner)) owner[key] = value;
  return owner as unknown as WheelControllerState;
}

export function getGameWindowLocalKeys(): string[] {
  return Object.keys(createGameWindowBaseState());
}

function createGameWindowBaseState() {
  return {
    editingWheelConfig: null as WheelConfig | null,
    appliedWheelConfigSnapshot: null as WheelConfig | null,
    wheelConfigSyncPending: false,
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
    wheelGridRevealAnimating: false,
    wheelGridResetAnimating: false,
    wheelGridHighlightCellIndex: -1,
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
    bracketBattleShowcaseMatchId: null as string | null,
    _wheelAppliedRealtimeRevision: 0
  };
}

export function createGameWindowState(): ReturnType<typeof createGameWindowBaseState> {
  return createGameWindowBaseState();
}


