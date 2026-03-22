import type { Lot, SinglesPurchaseEntry } from "../../types/app.ts";
import { toNonNegativeInt as toNonNegativeInteger, toNonNegativeNumber } from "../shared/singles-normalizers.ts";

export type SinglesCsvImportStateTarget = {
  showSinglesCsvMapperModal: boolean;
  singlesCsvImportHeaders: string[];
  singlesCsvImportRows: string[][];
  singlesCsvImportCurrency: "CAD" | "USD";
  singlesCsvImportMode: "append" | "merge" | "sync";
  singlesCsvMapItem: number | null;
  singlesCsvMapCardNumber: number | null;
  singlesCsvMapCondition: number | null;
  singlesCsvMapLanguage: number | null;
  singlesCsvMapCost: number | null;
  singlesCsvMapQuantity: number | null;
  singlesCsvMapMarketValue: number | null;
};

export function createNextSinglesEntryId(entries: SinglesPurchaseEntry[]): number {
  const highestId = entries.reduce((maxId, entry) => {
    const candidateId = Number(entry.id);
    if (!Number.isFinite(candidateId) || candidateId <= 0) return maxId;
    return Math.max(maxId, Math.floor(candidateId));
  }, 0);
  return Math.max(Date.now(), highestId + 1);
}

export function normalizeSinglesPurchaseEntries(
  entries: SinglesPurchaseEntry[] | undefined,
  fallbackCurrency: "CAD" | "USD" = "CAD"
): SinglesPurchaseEntry[] {
  if (!Array.isArray(entries)) return [];
  const usedIds = new Set<number>();
  let nextGeneratedId = createNextSinglesEntryId(entries);

  return entries.map((entry) => {
    const parsedId = Number(entry.id);
    let id = Number.isFinite(parsedId) && parsedId > 0
      ? Math.floor(parsedId)
      : 0;
    if (id <= 0 || usedIds.has(id)) {
      while (usedIds.has(nextGeneratedId)) {
        nextGeneratedId += 1;
      }
      id = nextGeneratedId;
      nextGeneratedId += 1;
    }
    usedIds.add(id);
    const currency = entry.currency === "USD" || entry.currency === "CAD"
      ? entry.currency
      : fallbackCurrency;
    return {
      id,
      item: typeof entry.item === "string" ? entry.item.trim() : "",
      cardNumber: typeof entry.cardNumber === "string" ? entry.cardNumber.trim() : "",
      externalSku: typeof entry.externalSku === "string" ? entry.externalSku.trim() : "",
      image: typeof entry.image === "string" ? entry.image.trim() : "",
      condition: typeof entry.condition === "string" ? entry.condition.trim() : "",
      language: typeof entry.language === "string" ? entry.language.trim() : "",
      cost: toNonNegativeNumber(entry.cost),
      currency,
      quantity: toNonNegativeInteger(entry.quantity),
      marketValue: toNonNegativeNumber(entry.marketValue)
    };
  });
}

export function resolveCurrentLot(lots: Lot[], lotId: number | null): Lot | null {
  if (!lotId) return null;
  return lots.find((lot) => lot.id === lotId) ?? null;
}

export function resetSinglesCsvImportState(
  target: SinglesCsvImportStateTarget,
  fallbackCurrency: "CAD" | "USD"
): void {
  target.showSinglesCsvMapperModal = false;
  target.singlesCsvImportHeaders = [];
  target.singlesCsvImportRows = [];
  target.singlesCsvImportCurrency = fallbackCurrency;
  target.singlesCsvImportMode = "merge";
  target.singlesCsvMapItem = null;
  target.singlesCsvMapCardNumber = null;
  target.singlesCsvMapCondition = null;
  target.singlesCsvMapLanguage = null;
  target.singlesCsvMapCost = null;
  target.singlesCsvMapQuantity = null;
  target.singlesCsvMapMarketValue = null;
}
