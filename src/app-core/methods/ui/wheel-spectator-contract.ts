import type {
  LuckGameType,
  WheelSpectatorChaseBoardEntry,
  WheelSpectatorChaseHistoryEntry,
  WheelSpectatorFairnessEntry,
  WheelSpectatorGridCell,
  WheelSpectatorHeatLevel,
  WheelSpectatorSlot,
  WheelSpectatorSnapshot,
  WheelSpectatorSpinAnimation
} from "../../../types/app.ts";

export const CURRENT_WHEEL_PUBLIC_SESSION_SNAPSHOT_VERSION = 1;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function cleanString(value: unknown, maxLength: number): string {
  return String(value ?? "").slice(0, maxLength).trim();
}

function cleanNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanInteger(value: unknown, fallback = 0): number {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeHeatLevel(value: unknown): WheelSpectatorHeatLevel | null {
  if (
    value === "very_low"
    || value === "low"
    || value === "medium"
    || value === "high"
    || value === "very_high"
  ) return value;
  return null;
}

function normalizeGameType(value: unknown, gridCells: WheelSpectatorGridCell[]): LuckGameType {
  return value === "grid" || gridCells.length > 0 ? "grid" : "wheel";
}

function normalizeFairnessEntry(value: unknown): WheelSpectatorFairnessEntry | null {
  const candidate = asRecord(value);
  if (!candidate) return null;
  const label = cleanString(candidate.label, 160);
  if (!label) return null;
  const verificationUrl = cleanString(candidate.verificationUrl, 512);
  return {
    spinNumber: Math.max(0, cleanInteger(candidate.spinNumber)),
    label,
    color: cleanString(candidate.color, 40) || "#d4af37",
    verificationUrl: verificationUrl || undefined,
    timestamp: Math.max(0, cleanInteger(candidate.timestamp))
  };
}

function normalizeChaseHistoryEntry(value: unknown): WheelSpectatorChaseHistoryEntry | null {
  const candidate = asRecord(value);
  if (!candidate) return null;
  const label = cleanString(candidate.label, 160);
  if (!label) return null;
  return {
    tierId: cleanString(candidate.tierId, 120),
    label,
    color: cleanString(candidate.color, 40) || "#d4af37",
    count: Math.max(0, cleanInteger(candidate.count))
  };
}

function normalizeChaseBoardEntry(value: unknown): WheelSpectatorChaseBoardEntry | null {
  const candidate = asRecord(value);
  if (!candidate) return null;
  const label = cleanString(candidate.label, 160);
  if (!label) return null;
  const remainingHits = candidate.remainingHits == null
    ? null
    : Math.max(0, cleanInteger(candidate.remainingHits));
  return {
    tierId: cleanString(candidate.tierId, 120),
    label,
    color: cleanString(candidate.color, 40) || "#d4af37",
    status: candidate.status === "claimed" ? "claimed" : "live",
    hitCount: Math.max(0, cleanInteger(candidate.hitCount)),
    slots: Math.max(0, cleanInteger(candidate.slots)),
    remainingHits,
    isFeatured: candidate.isFeatured === true
  };
}

function normalizeWheelSlot(value: unknown): WheelSpectatorSlot | null {
  const candidate = asRecord(value);
  if (!candidate) return null;
  const name = cleanString(candidate.name, 160);
  const tier = cleanString(candidate.tier, 120);
  if (!name || !tier) return null;
  return {
    name,
    color: cleanString(candidate.color, 40) || "#d4af37",
    tier,
    isChase: candidate.isChase === true
  };
}

function normalizeGridCell(value: unknown): WheelSpectatorGridCell | null {
  const candidate = asRecord(value);
  if (!candidate) return null;
  const index = cleanInteger(candidate.index, -1);
  if (index < 0) return null;
  const revealed = candidate.revealed === true;
  const slotIndex = cleanInteger(candidate.slotIndex, -1);
  return {
    index,
    revealed,
    label: revealed ? cleanString(candidate.label, 160) : "",
    color: revealed ? cleanString(candidate.color, 40) || "#d4af37" : "",
    tier: revealed ? cleanString(candidate.tier, 120) : "",
    slotIndex: Math.max(-1, slotIndex)
  };
}

function normalizeSpinAnimation(value: unknown): WheelSpectatorSpinAnimation | null {
  const candidate = asRecord(value);
  if (!candidate) return null;
  const spinId = cleanString(candidate.spinId, 120);
  const startedAt = Math.max(0, cleanInteger(candidate.startedAt));
  const durationMs = Math.max(0, cleanInteger(candidate.durationMs));
  const startAngle = cleanNumber(candidate.startAngle, Number.NaN);
  const endAngle = cleanNumber(candidate.endAngle, Number.NaN);
  const targetIndex = cleanInteger(candidate.targetIndex, -1);
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

function normalizeArray<T>(
  value: unknown,
  normalize: (entry: unknown) => T | null,
  limit: number
): T[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalize(entry))
    .filter((entry): entry is T => entry != null)
    .slice(0, limit);
}

export function normalizeWheelSpectatorSnapshot(value: unknown): WheelSpectatorSnapshot | null {
  const candidate = asRecord(value);
  if (!candidate) return null;

  const wheelSlots = normalizeArray(candidate.wheelSlots, normalizeWheelSlot, 256);
  const gridCells = normalizeArray(candidate.gridCells, normalizeGridCell, 256);
  const gameType = normalizeGameType(candidate.gameType, gridCells);
  const gridHighlightCellIndex = cleanInteger(candidate.gridHighlightCellIndex, -1);
  const sessionStatus = candidate.sessionStatus === "ended"
    ? "ended"
    : candidate.sessionStatus === "live"
      ? "live"
      : "starting";
  const featuredChaseLabel = cleanString(candidate.featuredChaseLabel, 160);
  const fairnessVerificationUrl = cleanString(candidate.fairnessVerificationUrl, 512);

  return {
    snapshotVersion: CURRENT_WHEEL_PUBLIC_SESSION_SNAPSHOT_VERSION,
    wheelName: cleanString(candidate.wheelName, 120) || "Wheel Session",
    gameType,
    sessionStatus,
    isSpinning: candidate.isSpinning === true,
    totalSpins: Math.max(0, cleanInteger(candidate.totalSpins)),
    lastResultLabel: cleanString(candidate.lastResultLabel, 160),
    lastResultColor: cleanString(candidate.lastResultColor, 40) || "#d4af37",
    wheelCurrentAngle: cleanNumber(candidate.wheelCurrentAngle, 0),
    wheelSlots,
    gridCells,
    gridHighlightCellIndex: gridHighlightCellIndex >= 0 ? gridHighlightCellIndex : -1,
    gridResetAnimating: candidate.gridResetAnimating === true,
    spinAnimation: normalizeSpinAnimation(candidate.spinAnimation),
    recentFairnessHistory: normalizeArray(candidate.recentFairnessHistory, normalizeFairnessEntry, 10),
    chaseHistory: normalizeArray(candidate.chaseHistory, normalizeChaseHistoryEntry, 20),
    chaseBoard: normalizeArray(candidate.chaseBoard, normalizeChaseBoardEntry, 24),
    featuredChaseLabel: featuredChaseLabel || null,
    featuredChaseHeat: normalizeHeatLevel(candidate.featuredChaseHeat),
    fairnessVerificationUrl: fairnessVerificationUrl || null,
    updatedAt: Math.max(0, cleanInteger(candidate.updatedAt, Date.now()))
  };
}
