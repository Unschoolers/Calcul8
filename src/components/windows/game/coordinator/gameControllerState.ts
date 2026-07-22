import type { GameCoordinatorContext } from "../../../../app-core/context/game.ts";
import type { WheelConfig } from "../../../../types/app.ts";
import type { WheelSlot } from "../services/wheelSlots.ts";
import {
  createWheelControllerState,
  ensureWheelControllerState,
  getWheelController,
  type WheelControllerState
} from "../services/gameSessionState.ts";
import { createGameHostState, type GameHostState } from "../services/gameHostState.ts";

/**
 * Typed `this` context shared across GameWindow computed properties, watchers,
 * lifecycle hooks, and game method objects (wheelSessionMethods,
 * wheelSpinMethods, wheelConfigMethods, gameSpectatorMethods).
 *
 * Replaces the previous `this: Record<string, unknown>` annotations and the
 * verbose `(this as Record<string, unknown>).prop` access casts throughout
 * those files.
 */
export type GameWindowHostState = GameHostState
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

  $refs?: Record<string, unknown>;

  // ===== Optional effect ports =====
  triggerWheelCelebration?(payload: { label: string; color: string; image?: string; emoji?: string; preview?: boolean }): void;
  endGameSpectatorMode?(options?: { notifyOnSuccess?: boolean; closeDialog?: boolean }): Promise<void>;
  publishGameSpectatorSessionSnapshot?(statusOverride?: "starting" | "live" | "ended"): Promise<void>;

  wheelConfigSavedSnackbar: boolean;
};

export type GameCommandPorts = {
  drawWheel(offset?: number): void;
  testSpinWheel(): Promise<void>;
  spinWheel(): Promise<void>;
  spinWheelInternal(recordSession?: boolean): Promise<void>;
  runWheelAutoPreviewAnimation(): Promise<void>;
  recordPreviewSpinResult(slotIndex: number): void;
  recordSpinResult(slotIndex: number): void;
  appendWheelFairnessHistory(entry: import("../../../../types/app.ts").WheelFairnessEntry, options?: { preview?: boolean }): void;
  landOnSlot(slotIndex: number, options?: { recordSession?: boolean }): void;
  animateMysteryGridRandomSelection(cellIndex: number): Promise<void>;
  revealMysteryGridCell(cellIndex: number, recordSession?: boolean): Promise<void>;
  revealMysteryGridRandomCell(recordSession?: boolean): Promise<void>;
  runMysteryGridAutoPreviewAnimation(): Promise<void>;
  saveWheelSession(): void;
  loadWheelFromSession(): boolean;
  resetPreviewSession(): void;
  resetWheelSession(): void;
  startEndWheelSession(): void;
  recordChaseSale(tierId: string): void;
  confirmBatchSale(index: number): void;
  deleteWheelConfig(): void;
  persistLastWheelConfigSelection(): void;
  restoreLastWheelConfigSelection(): void;
  loadWheelConfig(options?: { preserveLiveWheelState?: boolean }): void;
  queueWheelConfigSync(): void;
  clearWheelDraft(wheelConfigId?: number | null): void;
  applyWheelConfig(): void;
  saveWheelDraft(): void;
  getCostPerPackForTier(tier: import("../../../../types/app.ts").WheelTier): number;
  canTierBeChase(tier: import("../../../../types/app.ts").WheelTier): boolean;
  stopGameSpectatorCountPolling(): void;
  refreshGameSpectatorCount(): Promise<void>;
  syncGameSpectatorLinks(): void;
  syncGameSpectatorCountPolling(): void;
  applyRealtimeWheelSession(): void;
  ensureWheelEditorState(): void;
  showWheelConfigSaved?(): void;
  stopWheelAutospin(): void;
  startWheelAutospin(): void;
  scheduleNextWheelAutospin(delayMs?: number): void;
  normalizeWheelCompactInspectorState(): void;
  refreshWheelCanvas(): void;
  openWheelInspector(tab: "config" | "session" | "history"): void;
  isWheelMobileViewport(): boolean;
};

export type GameCommandContext = GameWindowHostState & GameCommandPorts;
export type GameWindowThis = GameCommandContext;

export { createWheelControllerState, ensureWheelControllerState, getWheelController };
export type { WheelControllerState };

export function getGameWindowLocalKeys(): string[] {
  return Object.keys(createGameHostState());
}

export function createGameWindowState(): GameHostState {
  return createGameHostState();
}


