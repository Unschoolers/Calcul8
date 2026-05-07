export type LuckGameType = "wheel" | "grid";

export type GamePublicSessionSnapshotVersion = 2;
export type GamePublicSessionStatus = "starting" | "live" | "ended";
export type GameSpectatorSessionStatus = "inactive" | GamePublicSessionStatus;
export type GameSpectatorHeatLevel = "very_low" | "low" | "medium" | "high" | "very_high";

export interface GamePublicSessionFairnessEntry {
  spinNumber: number;
  label: string;
  color: string;
  verificationUrl?: string;
  timestamp: number;
}

export interface GamePublicSessionChaseHistoryEntry {
  tierId: string;
  label: string;
  color: string;
  count: number;
}

export interface GamePublicSessionChaseEntry {
  tierId: string;
  label: string;
  color: string;
  status: "live" | "claimed";
  hitCount: number;
  slots: number;
  remainingHits: number | null;
  isFeatured?: boolean;
}

export interface GamePublicSessionOutcomeSlot {
  name: string;
  color: string;
  tier: string;
  isChase: boolean;
}

export interface GamePublicSessionBoardCell {
  index: number;
  revealed: boolean;
  label: string;
  color: string;
  tier: string;
  slotIndex: number;
}

export interface GamePublicSessionResultAnimation {
  spinId: string;
  startedAt: number;
  durationMs: number;
  startAngle: number;
  endAngle: number;
  targetIndex: number;
}

export interface GamePublicSessionSnapshot {
  snapshotVersion: GamePublicSessionSnapshotVersion;
  gameName: string;
  gameType: LuckGameType;
  sessionStatus: GamePublicSessionStatus;
  isSpinning: boolean;
  sessionResultCount: number;
  lastResultLabel: string;
  lastResultColor: string;
  gameCurrentAngle: number;
  outcomeSlots: GamePublicSessionOutcomeSlot[];
  boardCells: GamePublicSessionBoardCell[];
  boardHighlightCellIndex: number;
  boardResetAnimating: boolean;
  resultAnimation?: GamePublicSessionResultAnimation | null;
  recentFairnessHistory: GamePublicSessionFairnessEntry[];
  chaseHistory: GamePublicSessionChaseHistoryEntry[];
  chaseBoard: GamePublicSessionChaseEntry[];
  featuredChaseLabel: string | null;
  featuredChaseHeat: GameSpectatorHeatLevel | null;
  fairnessVerificationUrl: string | null;
  updatedAt: number;
}

export type GameSpectatorFairnessEntry = GamePublicSessionFairnessEntry;
export type GameSpectatorChaseHistoryEntry = GamePublicSessionChaseHistoryEntry;
export type GameSpectatorChaseBoardEntry = GamePublicSessionChaseEntry;
export type GameSpectatorOutcomeSlot = GamePublicSessionOutcomeSlot;
export type GameSpectatorBoardCell = GamePublicSessionBoardCell;
export type GameSpectatorResultAnimation = GamePublicSessionResultAnimation;
export type GameSpectatorSnapshot = GamePublicSessionSnapshot;

export declare const CURRENT_GAME_PUBLIC_SESSION_SNAPSHOT_VERSION: GamePublicSessionSnapshotVersion;

export declare function normalizeGamePublicSessionSnapshot(
  value: unknown,
  fallbackUpdatedAt?: number
): GamePublicSessionSnapshot | null;

export declare const normalizeGameSpectatorSnapshot: typeof normalizeGamePublicSessionSnapshot;
