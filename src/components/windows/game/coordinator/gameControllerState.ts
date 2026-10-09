import type { GameCoordinatorContext } from "../../../../app-core/context/game.ts";
import type { WheelConfig } from "../../../../types/app.ts";
import { createGameHostState, type GameHostState } from "../services/gameHostState.ts";
import {
    createWheelControllerState,
    ensureWheelControllerState,
    getWheelController,
    type WheelControllerState
} from "../services/gameSessionState.ts";
import type { WheelSlot } from "../services/wheelSlots.ts";

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
  mysteryGridCells: import("../commands/mysteryGridMethods.ts").MysteryGridCell[];
  wheelIsCompactLayout: boolean;
  wheelCompactStageSummaryLabel: string;
  wheelCompactStageSummaryValue: string;
  wheelCompactStageSummaryColor: string;
  expectedMarginDisplay: string;
  wheelSessionMarginDisplay: string;
  expectedMarginColor: string;
  wheelSessionMarginColor: string;
  wheelStageTitle: string;
  wheelStageSlotsLabel: string;
  wheelStageSpinPriceLabel: string;
  wheelPresentationToggleTitle: string;
  wheelSoundToggleTitle: string;
  wheelMotionToggleTitle: string;
  gameSpectatorActionLabel: string;
  gameSpectatorDialogHint: string;
  gameSpectatorStartButtonLabel: string;
  bulkTierSourceItems: Array<{ title: string; value: number }>;
  wheelConfigItems: Array<{ title: string; value: number }>;
  wheelStageSummaryCards: Array<{ id: string; label: string; value: string; valueClass?: string; valueStyle?: string; meta: string }>;
  wheelSpinBlockedReason: string;
  wheelHasRequiredLotSelection: boolean;
  wheelIsMysteryGrid: boolean;
  wheelIsBracketBattle: boolean;
  wheelContextPrimaryAction: import("../../../shell/ContextActionDock.ts").ContextActionDockAction;
  wheelContextSecondaryActions: import("../../../shell/ContextActionDock.ts").ContextActionDockAction[];
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
  resetPreviewSession(): Promise<void>;
  resetWheelSession(): Promise<void>;
  startEndWheelSession(): Promise<void>;
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
  startGameSpectatorMode(): Promise<void>;
  syncGameSpectatorLinks(): void;
  syncGameSpectatorCountPolling(): void;
  applyRealtimeWheelSession(): void;
  ensureWheelEditorState(): void;
  showWheelConfigSaved?(): void;
  stopWheelAutospin(): void;
  cancelWheelSpinAnimation(): void;
  startWheelAutospin(): void;
  scheduleNextWheelAutospin(delayMs?: number): void;
  normalizeWheelCompactInspectorState(): void;
  refreshWheelCanvas(): void;
  openWheelInspector(tab: "config" | "session" | "history"): void;
  requestWheelSessionEnd(): void;
  requestWheelReset(): void;
  focusWheelInspector(tab: "config" | "session" | "history"): void;
  addTier(): void;
  removeTier(index: number): void;
  closeWheelInspector(): void;
  openWheelCreateDialog(): void;
  openWheelManageDialog(): void;
  toggleWheelSound(): void;
  toggleWheelReducedMotion(): void;
  handleWheelModeChange(nextMode: "config" | "live"): void;
  openGameSpectatorDialog(): void;
  createNewGameConfig(gameType: "wheel" | "grid" | "bracket"): void;
  closeWheelCreateDialog(): void;
  startGameSpectatorMode(): Promise<void>;
  endGameSpectatorMode(options?: { notifyOnSuccess?: boolean; closeDialog?: boolean }): Promise<void>;
  copyGameSpectatorLink(): Promise<void>;
  openGameSpectatorPage(): void;
  closeGameSpectatorDialog(): void;
  publishGameSpectatorSessionSnapshot(statusOverride?: "starting" | "live" | "ended"): Promise<void>;
  getSinglesItemsForTier(tier: import("../../../../types/app.ts").WheelTier): Array<{ title: string; value: number | null; image?: string; cardNumber?: string; stockLabel?: string }>;
  getTierInventoryMeta(tier: import("../../../../types/app.ts").WheelTier): { text: string; warning: boolean } | null;
  isBoundLotSingles(tier: import("../../../../types/app.ts").WheelTier): boolean;
  onTierPacksChange(tier: import("../../../../types/app.ts").WheelTier): void;
  onTierMultiLotChange(tier: import("../../../../types/app.ts").WheelTier, lotIds: unknown): void;
  onTierSinglesChange(tier: import("../../../../types/app.ts").WheelTier, singlesId: unknown): void;
  toggleTierChase(tier: import("../../../../types/app.ts").WheelTier): void;
  isWheelMobileViewport(): boolean;
};

export type GameCommandContext = GameWindowHostState & GameCommandPorts;
export type GameWindowThis = GameCommandContext;

export type GameControllerCommands = Pick<
  GameCommandPorts,
  "spinWheel" | "revealMysteryGridCell" | "requestWheelSessionEnd" | "requestWheelReset"
  | "focusWheelInspector" | "addTier" | "closeWheelInspector"
  | "openWheelCreateDialog" | "openWheelManageDialog" | "toggleWheelSound"
  | "toggleWheelReducedMotion" | "handleWheelModeChange" | "openGameSpectatorDialog"
  | "createNewGameConfig" | "closeWheelCreateDialog" | "startGameSpectatorMode"
  | "endGameSpectatorMode" | "copyGameSpectatorLink" | "openGameSpectatorPage"
  | "closeGameSpectatorDialog" | "publishGameSpectatorSessionSnapshot"
  | "getSinglesItemsForTier" | "getTierInventoryMeta" | "isBoundLotSingles" | "removeTier"
  | "onTierPacksChange" | "onTierMultiLotChange" | "onTierSinglesChange" | "toggleTierChase"
  | "applyWheelConfig" | "canTierBeChase"
>;

/** Explicit game boundary shared with nested game components. */
export type GameController = {
  session: WheelControllerState;
  view: GameWindowThis;
  commands: GameControllerCommands;
};

export function createGameController(view: GameWindowThis): GameController {
  return {
    session: getWheelController(view),
    view,
    commands: {
      spinWheel: (...args) => view.spinWheel(...args),
      revealMysteryGridCell: (...args) => view.revealMysteryGridCell(...args),
      requestWheelSessionEnd: (...args) => view.requestWheelSessionEnd(...args),
      requestWheelReset: (...args) => view.requestWheelReset(...args),
      focusWheelInspector: (...args) => view.focusWheelInspector(...args),
      addTier: (...args) => view.addTier(...args),
      closeWheelInspector: (...args) => view.closeWheelInspector(...args),
      openWheelCreateDialog: (...args) => view.openWheelCreateDialog(...args),
      openWheelManageDialog: (...args) => view.openWheelManageDialog(...args),
      toggleWheelSound: (...args) => view.toggleWheelSound(...args),
      toggleWheelReducedMotion: (...args) => view.toggleWheelReducedMotion(...args),
      handleWheelModeChange: (...args) => view.handleWheelModeChange(...args),
      openGameSpectatorDialog: (...args) => view.openGameSpectatorDialog(...args),
      createNewGameConfig: (...args) => view.createNewGameConfig(...args),
      closeWheelCreateDialog: (...args) => view.closeWheelCreateDialog(...args),
      startGameSpectatorMode: (...args) => view.startGameSpectatorMode(...args),
      endGameSpectatorMode: (...args) => view.endGameSpectatorMode(...args),
      copyGameSpectatorLink: (...args) => view.copyGameSpectatorLink(...args),
      openGameSpectatorPage: (...args) => view.openGameSpectatorPage(...args),
      closeGameSpectatorDialog: (...args) => view.closeGameSpectatorDialog(...args),
      publishGameSpectatorSessionSnapshot: (...args) => view.publishGameSpectatorSessionSnapshot?.(...args) ?? Promise.resolve(),
      getSinglesItemsForTier: (...args) => view.getSinglesItemsForTier(...args),
      getTierInventoryMeta: (...args) => view.getTierInventoryMeta(...args),
      isBoundLotSingles: (...args) => view.isBoundLotSingles(...args),
      onTierPacksChange: (...args) => view.onTierPacksChange(...args),
      onTierMultiLotChange: (...args) => view.onTierMultiLotChange(...args),
      onTierSinglesChange: (...args) => view.onTierSinglesChange(...args),
      toggleTierChase: (...args) => view.toggleTierChase(...args),
      removeTier: (...args) => view.removeTier(...args),
      applyWheelConfig: (...args) => view.applyWheelConfig(...args),
      canTierBeChase: (...args) => view.canTierBeChase(...args)
    }
  };
}

export { createWheelControllerState, ensureWheelControllerState, getWheelController };
export type { WheelControllerState };

export function getGameWindowLocalKeys(): string[] {
  return Object.keys(createGameHostState());
}

export function createGameWindowState(): GameHostState {
  return createGameHostState();
}

