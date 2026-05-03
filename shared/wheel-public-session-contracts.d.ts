export type LuckGameType = "wheel" | "grid";

export type WheelPublicSessionSnapshotVersion = 1;
export type WheelPublicSessionStatus = "starting" | "live" | "ended";
export type WheelSpectatorSessionStatus = "inactive" | WheelPublicSessionStatus;
export type WheelSpectatorHeatLevel = "very_low" | "low" | "medium" | "high" | "very_high";

export interface WheelPublicSessionFairnessEntry {
  spinNumber: number;
  label: string;
  color: string;
  verificationUrl?: string;
  timestamp: number;
}

export interface WheelPublicSessionChaseHistoryEntry {
  tierId: string;
  label: string;
  color: string;
  count: number;
}

export interface WheelPublicSessionChaseEntry {
  tierId: string;
  label: string;
  color: string;
  status: "live" | "claimed";
  hitCount: number;
  slots: number;
  remainingHits: number | null;
  isFeatured?: boolean;
}

export interface WheelPublicSessionSlot {
  name: string;
  color: string;
  tier: string;
  isChase: boolean;
}

export interface WheelPublicSessionGridCell {
  index: number;
  revealed: boolean;
  label: string;
  color: string;
  tier: string;
  slotIndex: number;
}

export interface WheelPublicSessionSpinAnimation {
  spinId: string;
  startedAt: number;
  durationMs: number;
  startAngle: number;
  endAngle: number;
  targetIndex: number;
}

export interface WheelPublicSessionSnapshot {
  snapshotVersion: WheelPublicSessionSnapshotVersion;
  wheelName: string;
  gameType: LuckGameType;
  sessionStatus: WheelPublicSessionStatus;
  isSpinning: boolean;
  totalSpins: number;
  lastResultLabel: string;
  lastResultColor: string;
  wheelCurrentAngle: number;
  wheelSlots: WheelPublicSessionSlot[];
  gridCells: WheelPublicSessionGridCell[];
  gridHighlightCellIndex: number;
  gridResetAnimating: boolean;
  spinAnimation?: WheelPublicSessionSpinAnimation | null;
  recentFairnessHistory: WheelPublicSessionFairnessEntry[];
  chaseHistory: WheelPublicSessionChaseHistoryEntry[];
  chaseBoard: WheelPublicSessionChaseEntry[];
  featuredChaseLabel: string | null;
  featuredChaseHeat: WheelSpectatorHeatLevel | null;
  fairnessVerificationUrl: string | null;
  updatedAt: number;
}

export type WheelSpectatorFairnessEntry = WheelPublicSessionFairnessEntry;
export type WheelSpectatorChaseHistoryEntry = WheelPublicSessionChaseHistoryEntry;
export type WheelSpectatorChaseBoardEntry = WheelPublicSessionChaseEntry;
export type WheelSpectatorSlot = WheelPublicSessionSlot;
export type WheelSpectatorGridCell = WheelPublicSessionGridCell;
export type WheelSpectatorSpinAnimation = WheelPublicSessionSpinAnimation;
export type WheelSpectatorSnapshot = WheelPublicSessionSnapshot;

export declare const CURRENT_WHEEL_PUBLIC_SESSION_SNAPSHOT_VERSION: WheelPublicSessionSnapshotVersion;

export declare function normalizeWheelPublicSessionSnapshot(
  value: unknown,
  fallbackUpdatedAt?: number
): WheelPublicSessionSnapshot | null;

export declare const normalizeWheelSpectatorSnapshot: typeof normalizeWheelPublicSessionSnapshot;
