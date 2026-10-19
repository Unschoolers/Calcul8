import type { Lot, WheelConfig, WheelTier } from "../../../types/app.ts";
import type { WheelControllerState } from "./services/gameSessionState.ts";

/** Narrow view and commands exposed to focused game components. */
export type FocusedGameView = {
  t(key: string, params?: Record<string, string | number | null | undefined>): string;
  activeWheelConfig: WheelConfig | null;
  activeWheelConfigId: number | null;
  canApplyWheelConfig: boolean;
  bulkTierSourceItems: Array<{ title: string; value: number }>;
  editingWheelConfig: WheelConfig | null;
  gameSpectatorActionLabel: string;
  gameSpectatorSessionId: string | null;
  gameSpectatorSessionStatus: "starting" | "live" | "ended" | "inactive" | null;
  lots: Lot[];
  wheelCompactStageSummaryColor: string;
  wheelCompactStageSummaryLabel: string;
  wheelCompactStageSummaryValue: string;
  wheelConfigItems: Array<{ title: string; value: number }>;
  wheelDisplayConfig: WheelConfig | null;
  wheelIsCompactLayout: boolean;
  wheelMode: "config" | "live";
  wheelMotionToggleTitle: string;
  wheelPresentationMode: boolean;
  wheelPresentationToggleTitle: string;
  wheelReducedMotion: boolean;
  wheelSoundEnabled: boolean;
  wheelSoundToggleTitle: string;
  wheelStageSlotsLabel: string;
  wheelStageSpinPriceLabel: string;
  wheelStageTitle: string;
};

export type FocusedGameCommands = {
  applyWheelConfig(): void;
  canTierBeChase(tier: WheelTier): boolean;
  getSinglesItemsForTier(tier: WheelTier): Array<{ title: string; value: number | null; image?: string; cardNumber?: string; stockLabel?: string }>;
  getTierInventoryMeta(tier: WheelTier): { text: string; warning: boolean } | null;
  handleWheelModeChange(value: "config" | "live"): void;
  isBoundLotSingles(tier: WheelTier): boolean;
  onTierMultiLotChange(tier: WheelTier, lotIds: unknown): void;
  onTierPacksChange(tier: WheelTier): void;
  onTierSinglesChange(tier: WheelTier, singlesId: unknown): void;
  openGameSpectatorDialog(): void;
  openWheelInspector(tab: "config" | "session" | "history"): void;
  openWheelCreateDialog(): void;
  openWheelManageDialog(): void;
  removeTier(index: number): void;
  toggleTierChase(tier: WheelTier): void;
  toggleWheelReducedMotion(): void;
  toggleWheelSound(): void;
};

export type GameController = {
  session: WheelControllerState;
  view: FocusedGameView;
  commands: FocusedGameCommands;
};
