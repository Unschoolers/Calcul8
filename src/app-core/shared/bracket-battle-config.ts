import type { BracketBattleConfig, BracketBattleConfigPrize } from "../../types/app.ts";

export function getBracketBattleConfigMatchCount(participantCount: 4 | 8): number {
  return participantCount === 8 ? 7 : 3;
}

function normalizeParticipantCount(value: unknown): 4 | 8 {
  return Number(value) === 8 ? 8 : 4;
}

function normalizeText(value: unknown): string {
  return String(value || "").trim();
}

function normalizeNullablePositiveInteger(value: unknown): number | null {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.floor(numeric);
}

function normalizeNullableNonNegativeNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return numeric;
}

function createDefaultPrize(index: number): BracketBattleConfigPrize {
  return {
    id: `bracket-prize-${index + 1}`,
    sourceType: "manual",
    sourceKey: "",
    label: `Match ${index + 1} prize`,
    lotId: null,
    singlesPurchaseEntryId: null,
    quantity: 1,
    cost: null,
    value: null
  };
}

export function createDefaultBracketBattleConfig(participantCount: 4 | 8 = 4): BracketBattleConfig {
  const count = normalizeParticipantCount(participantCount);
  return {
    participantCount: count,
    participants: Array.from({ length: count }, () => ""),
    prizes: Array.from({ length: getBracketBattleConfigMatchCount(count) }, (_unused, index) => createDefaultPrize(index))
  };
}

function normalizePrize(value: unknown, index: number): BracketBattleConfigPrize {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const sourceType = raw.sourceType === "lot" || raw.sourceType === "singles" ? raw.sourceType : "manual";
  return {
    id: normalizeText(raw.id) || `bracket-prize-${index + 1}`,
    sourceType,
    sourceKey: sourceType === "manual" ? "" : normalizeText(raw.sourceKey),
    label: normalizeText(raw.label) || `Match ${index + 1} prize`,
    lotId: sourceType === "manual" ? null : normalizeNullablePositiveInteger(raw.lotId),
    singlesPurchaseEntryId: sourceType === "singles" ? normalizeNullablePositiveInteger(raw.singlesPurchaseEntryId) : null,
    quantity: normalizeNullablePositiveInteger(raw.quantity) ?? 1,
    cost: normalizeNullableNonNegativeNumber(raw.cost),
    value: normalizeNullableNonNegativeNumber(raw.value)
  };
}

export function normalizeBracketBattleConfig(value: unknown): BracketBattleConfig {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const participantCount = normalizeParticipantCount(raw.participantCount);
  const defaults = createDefaultBracketBattleConfig(participantCount);
  const rawParticipants = Array.isArray(raw.participants) ? raw.participants : [];
  const rawPrizes = Array.isArray(raw.prizes) ? raw.prizes : [];
  const matchCount = getBracketBattleConfigMatchCount(participantCount);

  return {
    participantCount,
    participants: Array.from({ length: participantCount }, (_unused, index) => normalizeText(rawParticipants[index] ?? defaults.participants[index])),
    prizes: Array.from({ length: matchCount }, (_unused, index) => normalizePrize(rawPrizes[index] ?? defaults.prizes[index], index))
  };
}

export function resizeBracketBattleConfig(config: BracketBattleConfig, participantCount: 4 | 8): BracketBattleConfig {
  return normalizeBracketBattleConfig({
    ...config,
    participantCount
  });
}
