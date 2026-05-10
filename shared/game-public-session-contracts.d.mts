export type GameType = "wheel" | "grid" | "bracket";

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

export interface GamePublicSessionBracketMatch {
  id: string;
  round: number;
  position: number;
  status: "pending" | "active" | "complete";
  participantAId: string | null;
  participantALabel: string;
  participantBId: string | null;
  participantBLabel: string;
  winnerParticipantId: string | null;
  prizeLabel: string;
  participantAResult: number | null;
  participantBResult: number | null;
}

export interface GamePublicSessionBracketRoll {
  id: string;
  matchId: string;
  participantId: string;
  participantLabel: string;
  value: number;
  rollNumber: number;
  tiebreakerIndex: number;
}

export interface GamePublicSessionBracketAward {
  id: string;
  matchId: string;
  participantId: string;
  participantLabel: string;
  prizeLabel: string;
  settlementStatus: "pending" | "settled" | "error";
}

export interface GamePublicSessionBracketSnapshot {
  status: "setup" | "active" | "complete";
  participantCount: 4 | 8;
  activeMatchId: string | null;
  championParticipantId: string | null;
  activeMatch: GamePublicSessionBracketMatch | null;
  matches: GamePublicSessionBracketMatch[];
  recentRolls: GamePublicSessionBracketRoll[];
  awards: GamePublicSessionBracketAward[];
}

export interface GamePublicSessionSnapshot {
  snapshotVersion: GamePublicSessionSnapshotVersion;
  gameName: string;
  gameType: GameType;
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
  bracket: GamePublicSessionBracketSnapshot | null;
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
