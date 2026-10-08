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

const CURRENT_GAME_PUBLIC_SESSION_SNAPSHOT_VERSION = 2;
const DEFAULT_SPECTATOR_COLOR = "#d4af37";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown, maxLength: number) {
  return String(value ?? "").slice(0, maxLength).trim();
}

function cleanNumber(value: unknown, fallback: number = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanInteger(value: unknown, fallback: number = 0) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanNonNegativeInteger(value: unknown, fallback: number = 0) {
  return Math.max(0, cleanInteger(value, fallback));
}

function normalizeHeatLevel(value: unknown) {
  return value === "very_low"
    || value === "low"
    || value === "medium"
    || value === "high"
    || value === "very_high"
    ? value
    : null;
}

function normalizeSessionStatus(value: unknown) {
  if (value === "live" || value === "ended") return value;
  return "starting";
}

function normalizeGameType(value: unknown, boardCells: readonly GamePublicSessionBoardCell[]) {
  if (value === "bracket") return "bracket";
  return value === "grid" || boardCells.length > 0 ? "grid" : "wheel";
}

function normalizeFairnessEntry(value: unknown) {
  if (!isRecord(value)) return null;
  const label = cleanString(value.label, 160);
  if (!label) return null;
  const verificationUrl = cleanString(value.verificationUrl, 512);
  return {
    spinNumber: cleanNonNegativeInteger(value.spinNumber),
    label,
    color: cleanString(value.color, 40) || DEFAULT_SPECTATOR_COLOR,
    verificationUrl: verificationUrl || undefined,
    timestamp: cleanNonNegativeInteger(value.timestamp)
  };
}

function normalizeChaseHistoryEntry(value: unknown) {
  if (!isRecord(value)) return null;
  const label = cleanString(value.label, 160);
  if (!label) return null;
  return {
    tierId: cleanString(value.tierId, 120),
    label,
    color: cleanString(value.color, 40) || DEFAULT_SPECTATOR_COLOR,
    count: cleanNonNegativeInteger(value.count)
  };
}

function normalizeChaseBoardEntry(value: unknown): GamePublicSessionChaseEntry | null {
  if (!isRecord(value)) return null;
  const label = cleanString(value.label, 160);
  if (!label) return null;
  const remainingHits = value.remainingHits == null
    ? null
    : cleanNonNegativeInteger(value.remainingHits);
  return {
    tierId: cleanString(value.tierId, 120),
    label,
    color: cleanString(value.color, 40) || DEFAULT_SPECTATOR_COLOR,
    status: value.status === "claimed" ? "claimed" : "live",
    hitCount: cleanNonNegativeInteger(value.hitCount),
    slots: cleanNonNegativeInteger(value.slots),
    remainingHits,
    isFeatured: value.isFeatured === true
  };
}

function normalizeOutcomeSlot(value: unknown) {
  if (!isRecord(value)) return null;
  const name = cleanString(value.name, 160);
  const tier = cleanString(value.tier, 120);
  if (!name || !tier) return null;
  return {
    name,
    color: cleanString(value.color, 40) || DEFAULT_SPECTATOR_COLOR,
    tier,
    isChase: value.isChase === true
  };
}

function normalizeBoardCell(value: unknown) {
  if (!isRecord(value)) return null;
  const index = cleanInteger(value.index, -1);
  if (index < 0) return null;
  const revealed = value.revealed === true;
  return {
    index,
    revealed,
    label: revealed ? cleanString(value.label, 160) : "",
    color: revealed ? cleanString(value.color, 40) || DEFAULT_SPECTATOR_COLOR : "",
    tier: revealed ? cleanString(value.tier, 120) : "",
    slotIndex: Math.max(-1, cleanInteger(value.slotIndex, -1))
  };
}

function normalizeResultAnimation(value: unknown) {
  if (!isRecord(value)) return null;
  const spinId = cleanString(value.spinId, 120);
  const startedAt = cleanNonNegativeInteger(value.startedAt);
  const durationMs = cleanNonNegativeInteger(value.durationMs);
  const startAngle = cleanNumber(value.startAngle, Number.NaN);
  const endAngle = cleanNumber(value.endAngle, Number.NaN);
  const targetIndex = cleanInteger(value.targetIndex, -1);
  if (
    !spinId
    || startedAt <= 0
    || durationMs <= 0
    || !Number.isFinite(startAngle)
    || !Number.isFinite(endAngle)
    || targetIndex < 0
  ) {
    return null;
  }
  return {
    spinId,
    startedAt,
    durationMs: Math.min(durationMs, 30_000),
    startAngle,
    endAngle,
    targetIndex
  };
}

function normalizeBracketStatus(value: unknown) {
  return value === "complete" || value === "active" ? value : "setup";
}

function normalizeBracketMatchStatus(value: unknown) {
  return value === "active" || value === "complete" ? value : "pending";
}

function normalizeBracketMatch(value: unknown): GamePublicSessionBracketMatch | null {
  if (!isRecord(value)) return null;
  const id = cleanString(value.id, 120);
  if (!id) return null;
  return {
    id,
    round: cleanNonNegativeInteger(value.round),
    position: cleanNonNegativeInteger(value.position),
    status: normalizeBracketMatchStatus(value.status),
    participantAId: cleanString(value.participantAId, 120) || null,
    participantALabel: cleanString(value.participantALabel, 160),
    participantBId: cleanString(value.participantBId, 120) || null,
    participantBLabel: cleanString(value.participantBLabel, 160),
    winnerParticipantId: cleanString(value.winnerParticipantId, 120) || null,
    prizeLabel: cleanString(value.prizeLabel, 160),
    participantAResult: value.participantAResult == null ? null : cleanNonNegativeInteger(value.participantAResult),
    participantBResult: value.participantBResult == null ? null : cleanNonNegativeInteger(value.participantBResult)
  };
}

function normalizeBracketRoll(value: unknown) {
  if (!isRecord(value)) return null;
  const id = cleanString(value.id, 120);
  const matchId = cleanString(value.matchId, 120);
  const participantId = cleanString(value.participantId, 120);
  if (!id || !matchId || !participantId) return null;
  return {
    id,
    matchId,
    participantId,
    participantLabel: cleanString(value.participantLabel, 160),
    value: cleanNonNegativeInteger(value.value),
    rollNumber: cleanNonNegativeInteger(value.rollNumber),
    tiebreakerIndex: cleanNonNegativeInteger(value.tiebreakerIndex)
  };
}

function normalizeBracketAward(value: unknown): GamePublicSessionBracketAward | null {
  if (!isRecord(value)) return null;
  const id = cleanString(value.id, 120);
  const matchId = cleanString(value.matchId, 120);
  const participantId = cleanString(value.participantId, 120);
  const prizeLabel = cleanString(value.prizeLabel, 160);
  if (!id || !matchId || !participantId || !prizeLabel) return null;
  return {
    id,
    matchId,
    participantId,
    participantLabel: cleanString(value.participantLabel, 160),
    prizeLabel,
    settlementStatus: value.settlementStatus === "settled" || value.settlementStatus === "error"
      ? value.settlementStatus
      : "pending"
  };
}

function normalizeBracketSnapshot(value: unknown): GamePublicSessionBracketSnapshot | null {
  if (!isRecord(value)) return null;
  const activeMatch = normalizeBracketMatch(value.activeMatch);
  return {
    status: normalizeBracketStatus(value.status),
    participantCount: cleanInteger(value.participantCount, 4) === 8 ? 8 : 4,
    activeMatchId: cleanString(value.activeMatchId, 120) || null,
    championParticipantId: cleanString(value.championParticipantId, 120) || null,
    activeMatch,
    matches: normalizeArray(value.matches, normalizeBracketMatch, 15),
    recentRolls: normalizeArray(value.recentRolls, normalizeBracketRoll, 12),
    awards: normalizeArray(value.awards, normalizeBracketAward, 15)
  };
}

function normalizeArray<Entry>(value: unknown, normalize: (value: unknown) => Entry | null, limit: number): Entry[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalize(entry))
    .filter((entry) => entry != null)
    .slice(0, limit);
}

function getLegacyOrCurrent(value: Record<string, unknown>, currentKey: string, legacyKey: string) {
  return value[currentKey] === undefined ? value[legacyKey] : value[currentKey];
}

function normalizeGamePublicSessionSnapshot(value: unknown, fallbackUpdatedAt: number = Date.now()): GamePublicSessionSnapshot | null {
  if (!isRecord(value)) return null;
  const boardCells = normalizeArray(
    getLegacyOrCurrent(value, "boardCells", "gridCells"),
    normalizeBoardCell,
    256
  );
  const boardHighlightCellIndex = cleanInteger(
    getLegacyOrCurrent(value, "boardHighlightCellIndex", "gridHighlightCellIndex"),
    -1
  );
  const featuredChaseLabel = cleanString(value.featuredChaseLabel, 160);
  const fairnessVerificationUrl = cleanString(value.fairnessVerificationUrl, 512);
  const gameType = normalizeGameType(value.gameType, boardCells);
  return {
    snapshotVersion: CURRENT_GAME_PUBLIC_SESSION_SNAPSHOT_VERSION,
    gameName: cleanString(getLegacyOrCurrent(value, "gameName", "wheelName"), 120) || "Game Session",
    gameType,
    sessionStatus: normalizeSessionStatus(value.sessionStatus),
    isSpinning: value.isSpinning === true,
    sessionResultCount: cleanNonNegativeInteger(getLegacyOrCurrent(value, "sessionResultCount", "totalSpins")),
    lastResultLabel: cleanString(value.lastResultLabel, 160),
    lastResultColor: cleanString(value.lastResultColor, 40) || DEFAULT_SPECTATOR_COLOR,
    gameCurrentAngle: cleanNumber(getLegacyOrCurrent(value, "gameCurrentAngle", "wheelCurrentAngle"), 0),
    outcomeSlots: normalizeArray(
      getLegacyOrCurrent(value, "outcomeSlots", "wheelSlots"),
      normalizeOutcomeSlot,
      256
    ),
    boardCells,
    boardHighlightCellIndex: boardHighlightCellIndex >= 0 ? boardHighlightCellIndex : -1,
    boardResetAnimating: getLegacyOrCurrent(value, "boardResetAnimating", "gridResetAnimating") === true,
    resultAnimation: normalizeResultAnimation(getLegacyOrCurrent(value, "resultAnimation", "spinAnimation")),
    recentFairnessHistory: normalizeArray(value.recentFairnessHistory, normalizeFairnessEntry, 10),
    chaseHistory: normalizeArray(value.chaseHistory, normalizeChaseHistoryEntry, 20),
    chaseBoard: normalizeArray(value.chaseBoard, normalizeChaseBoardEntry, 24),
    featuredChaseLabel: featuredChaseLabel || null,
    featuredChaseHeat: normalizeHeatLevel(value.featuredChaseHeat),
    fairnessVerificationUrl: fairnessVerificationUrl || null,
    bracket: gameType === "bracket" ? normalizeBracketSnapshot(value.bracket) : null,
    updatedAt: cleanNonNegativeInteger(value.updatedAt, fallbackUpdatedAt)
  };
}

export {
  CURRENT_GAME_PUBLIC_SESSION_SNAPSHOT_VERSION,
  normalizeGamePublicSessionSnapshot,
  normalizeGamePublicSessionSnapshot as normalizeGameSpectatorSnapshot
};
