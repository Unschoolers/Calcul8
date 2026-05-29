import type { Lot } from "../../../../types/app.ts";
import { isSinglesLot } from "../../../../app-core/shared/lot-types.ts";
import {
  createBracketBattleSession,
  getBracketBattleMatchCount,
  type BracketBattleParticipantCount,
  type BracketBattlePrizeInput,
  type BracketBattlePrizeSource,
  type BracketBattleSession
} from "./bracketBattleDomain.ts";

export type BracketBattleDraftPrize = {
  id: string;
  sourceType: BracketBattlePrizeSource;
  sourceKey: string;
  label: string;
  lotId: number | null;
  singlesPurchaseEntryId: number | null;
  quantity: number | null;
  cost: number | null;
  value: number | null;
};

export type BracketBattleDraft = {
  name: string;
  participantCount: BracketBattleParticipantCount;
  participants: string[];
  prizes: BracketBattleDraftPrize[];
};

export type BracketBattlePrizeCatalogItem = {
  value: string;
  title: string;
  subtitle: string;
  sourceType: "lot" | "singles";
  label: string;
  lotId: number;
  singlesPurchaseEntryId: number | null;
  quantity: number;
  cost: number | null;
  valueEstimate: number | null;
};

export type BracketBattleDraftValidation = {
  valid: boolean;
  message: string;
};

export type CreateBracketBattleSessionFromDraftOptions = {
  now?: () => number;
  randomInt?: (minInclusive: number, maxInclusive: number) => number;
};

function createEmptyPrize(index: number): BracketBattleDraftPrize {
  return {
    id: `draft-prize-${index + 1}`,
    sourceType: "manual",
    sourceKey: "",
    label: `Match ${index + 1} prize`,
    lotId: null,
    singlesPurchaseEntryId: null,
    quantity: null,
    cost: null,
    value: null
  };
}

function normalizeParticipantCount(value: unknown): BracketBattleParticipantCount {
  return Number(value) === 8 ? 8 : 4;
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.floor(numeric);
}

function normalizeNonNegativeNumber(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return numeric;
}

function normalizeText(value: unknown): string {
  return String(value || "").trim();
}

export function createBracketBattleDraft(participantCount: BracketBattleParticipantCount = 4): BracketBattleDraft {
  const normalizedCount = normalizeParticipantCount(participantCount);
  return {
    name: "Bracket Battle",
    participantCount: normalizedCount,
    participants: Array.from({ length: normalizedCount }, () => ""),
    prizes: Array.from({ length: getBracketBattleMatchCount(normalizedCount) }, (_unused, index) => createEmptyPrize(index))
  };
}

export function resizeBracketBattleDraft(
  draft: BracketBattleDraft,
  participantCount: BracketBattleParticipantCount
): BracketBattleDraft {
  const normalizedCount = normalizeParticipantCount(participantCount);
  const matchCount = getBracketBattleMatchCount(normalizedCount);
  return {
    name: normalizeText(draft.name) || "Bracket Battle",
    participantCount: normalizedCount,
    participants: Array.from({ length: normalizedCount }, (_unused, index) => draft.participants[index] ?? ""),
    prizes: Array.from({ length: matchCount }, (_unused, index) => draft.prizes[index] ?? createEmptyPrize(index))
  };
}

function getLotCost(lot: Lot): number | null {
  const cost = Number(lot.boxPriceCost);
  return Number.isFinite(cost) && cost >= 0 ? cost : null;
}

function getLotValue(lot: Lot): number | null {
  const value = Number(lot.packPrice || lot.boxPriceSell || lot.spotPrice);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function buildBracketBattlePrizeCatalog(lots: Lot[]): BracketBattlePrizeCatalogItem[] {
  const items: BracketBattlePrizeCatalogItem[] = [];
  for (const lot of lots || []) {
    if (!lot || !Number.isFinite(Number(lot.id))) continue;
    if (isSinglesLot(lot)) {
      for (const entry of lot.singlesPurchases || []) {
        if (!entry || !Number.isFinite(Number(entry.id))) continue;
        const cardNumber = normalizeText(entry.cardNumber);
        const title = `${normalizeText(entry.item) || "Singles item"}${cardNumber ? ` #${cardNumber}` : ""}`;
        items.push({
          value: `singles:${lot.id}:${entry.id}`,
          title,
          subtitle: lot.name,
          sourceType: "singles",
          label: title,
          lotId: lot.id,
          singlesPurchaseEntryId: entry.id,
          quantity: 1,
          cost: normalizeNonNegativeNumber(entry.cost),
          valueEstimate: normalizeNonNegativeNumber(entry.marketValue)
        });
      }
      continue;
    }

    items.push({
      value: `lot:${lot.id}`,
      title: normalizeText(lot.name) || `Lot ${lot.id}`,
      subtitle: "Bulk lot",
      sourceType: "lot",
      label: normalizeText(lot.name) || `Lot ${lot.id}`,
      lotId: lot.id,
      singlesPurchaseEntryId: null,
      quantity: 1,
      cost: getLotCost(lot),
      valueEstimate: getLotValue(lot)
    });
  }
  return items;
}

export function applyBracketBattlePrizeCatalogSelection(
  prize: BracketBattleDraftPrize,
  sourceKey: string,
  catalog: BracketBattlePrizeCatalogItem[]
): void {
  const selected = catalog.find((entry) => entry.value === sourceKey);
  if (!selected) {
    prize.sourceType = "manual";
    prize.sourceKey = "";
    prize.lotId = null;
    prize.singlesPurchaseEntryId = null;
    return;
  }

  prize.sourceType = selected.sourceType;
  prize.sourceKey = selected.value;
  prize.label = selected.label;
  prize.lotId = selected.lotId;
  prize.singlesPurchaseEntryId = selected.singlesPurchaseEntryId;
  prize.quantity = selected.quantity;
  prize.cost = selected.cost;
  prize.value = selected.valueEstimate;
}

export function getBracketBattleDraftValidation(draft: BracketBattleDraft): BracketBattleDraftValidation {
  const participantCount = normalizeParticipantCount(draft.participantCount);
  const participants = (draft.participants || []).map(normalizeText).filter(Boolean);
  if (participants.length !== participantCount) {
    return { valid: false, message: `Add exactly ${participantCount} buyers.` };
  }

  const matchCount = getBracketBattleMatchCount(participantCount);
  const prizes = (draft.prizes || []).map((prize) => normalizeText(prize?.label)).filter(Boolean);
  if (prizes.length !== matchCount) {
    return { valid: false, message: `Assign exactly ${matchCount} match prizes.` };
  }

  return { valid: true, message: "" };
}

function toPrizeInput(prize: BracketBattleDraftPrize): BracketBattlePrizeInput {
  const sourceType = prize.sourceType === "lot" || prize.sourceType === "singles" ? prize.sourceType : "manual";
  return {
    sourceType,
    label: normalizeText(prize.label),
    lotId: sourceType === "lot" || sourceType === "singles" ? normalizePositiveInteger(prize.lotId, 0) || null : null,
    singlesPurchaseEntryId: sourceType === "singles" ? normalizePositiveInteger(prize.singlesPurchaseEntryId, 0) || null : null,
    quantity: normalizePositiveInteger(prize.quantity, 1),
    cost: normalizeNonNegativeNumber(prize.cost),
    value: normalizeNonNegativeNumber(prize.value)
  };
}

export function createBracketBattleSessionFromDraft(
  draft: BracketBattleDraft,
  options: CreateBracketBattleSessionFromDraftOptions = {}
): BracketBattleSession {
  const validation = getBracketBattleDraftValidation(draft);
  if (!validation.valid) {
    throw new Error(validation.message);
  }
  const normalizedDraft = resizeBracketBattleDraft(draft, draft.participantCount);
  return createBracketBattleSession({
    name: normalizedDraft.name,
    participantCount: normalizedDraft.participantCount,
    participants: normalizedDraft.participants,
    prizes: normalizedDraft.prizes.map(toPrizeInput),
    now: options.now,
    randomInt: options.randomInt
  });
}
