const CURRENT_WHEEL_PUBLIC_SESSION_SNAPSHOT_VERSION = 1;
const DEFAULT_SPECTATOR_COLOR = "#d4af37";

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value, maxLength) {
  return String(value ?? "").slice(0, maxLength).trim();
}

function cleanNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanInteger(value, fallback = 0) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanNonNegativeInteger(value, fallback = 0) {
  return Math.max(0, cleanInteger(value, fallback));
}

function normalizeHeatLevel(value) {
  return value === "very_low"
    || value === "low"
    || value === "medium"
    || value === "high"
    || value === "very_high"
    ? value
    : null;
}

function normalizeSessionStatus(value) {
  if (value === "live" || value === "ended") return value;
  return "starting";
}

function normalizeGameType(value, gridCells) {
  return value === "grid" || gridCells.length > 0 ? "grid" : "wheel";
}

function normalizeFairnessEntry(value) {
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

function normalizeChaseHistoryEntry(value) {
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

function normalizeChaseBoardEntry(value) {
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

function normalizeWheelSlot(value) {
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

function normalizeGridCell(value) {
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

function normalizeSpinAnimation(value) {
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

function normalizeArray(value, normalize, limit) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalize(entry))
    .filter((entry) => entry != null)
    .slice(0, limit);
}

function normalizeWheelPublicSessionSnapshot(value, fallbackUpdatedAt = Date.now()) {
  if (!isRecord(value)) return null;
  const gridCells = normalizeArray(value.gridCells, normalizeGridCell, 256);
  const gridHighlightCellIndex = cleanInteger(value.gridHighlightCellIndex, -1);
  const featuredChaseLabel = cleanString(value.featuredChaseLabel, 160);
  const fairnessVerificationUrl = cleanString(value.fairnessVerificationUrl, 512);
  return {
    snapshotVersion: CURRENT_WHEEL_PUBLIC_SESSION_SNAPSHOT_VERSION,
    wheelName: cleanString(value.wheelName, 120) || "Wheel Session",
    gameType: normalizeGameType(value.gameType, gridCells),
    sessionStatus: normalizeSessionStatus(value.sessionStatus),
    isSpinning: value.isSpinning === true,
    totalSpins: cleanNonNegativeInteger(value.totalSpins),
    lastResultLabel: cleanString(value.lastResultLabel, 160),
    lastResultColor: cleanString(value.lastResultColor, 40) || DEFAULT_SPECTATOR_COLOR,
    wheelCurrentAngle: cleanNumber(value.wheelCurrentAngle, 0),
    wheelSlots: normalizeArray(value.wheelSlots, normalizeWheelSlot, 256),
    gridCells,
    gridHighlightCellIndex: gridHighlightCellIndex >= 0 ? gridHighlightCellIndex : -1,
    gridResetAnimating: value.gridResetAnimating === true,
    spinAnimation: normalizeSpinAnimation(value.spinAnimation),
    recentFairnessHistory: normalizeArray(value.recentFairnessHistory, normalizeFairnessEntry, 10),
    chaseHistory: normalizeArray(value.chaseHistory, normalizeChaseHistoryEntry, 20),
    chaseBoard: normalizeArray(value.chaseBoard, normalizeChaseBoardEntry, 24),
    featuredChaseLabel: featuredChaseLabel || null,
    featuredChaseHeat: normalizeHeatLevel(value.featuredChaseHeat),
    fairnessVerificationUrl: fairnessVerificationUrl || null,
    updatedAt: cleanNonNegativeInteger(value.updatedAt, fallbackUpdatedAt)
  };
}

module.exports = {
  CURRENT_WHEEL_PUBLIC_SESSION_SNAPSHOT_VERSION,
  normalizeWheelPublicSessionSnapshot,
  normalizeWheelSpectatorSnapshot: normalizeWheelPublicSessionSnapshot
};
