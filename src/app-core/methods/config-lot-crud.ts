import { DEFAULT_VALUES } from "../../constants.ts";
import type { Lot, LotSetup, LotType, SinglesCatalogSource, SinglesPurchaseEntry } from "../../types/app.ts";
import { normalizeSinglesCatalogSource } from "../shared/singles-catalog-source.ts";

export type CreateNewLotOptions = {
  lots: Lot[];
  currentLotId: number | null;
  newLotName: string;
  newLotType: LotType;
  newLotCatalogSource: SinglesCatalogSource;
  purchaseUiMode: "simple" | "expert";
  setup: LotSetup;
  todayDate: string;
  generatedId?: number;
};

export type RenameLotValidationResult =
  | { ok: true; nextName: string; changed: boolean }
  | { ok: false; message: string };

export function createNewLotRecord({
  lots,
  currentLotId,
  newLotName,
  newLotType,
  newLotCatalogSource,
  purchaseUiMode,
  setup,
  todayDate,
  generatedId = Date.now()
}: CreateNewLotOptions): {
  lot: Lot;
  nextLotType: LotType;
  nextLotCatalogSource: SinglesCatalogSource;
} {
  const selectedLot = currentLotId ? lots.find((lot) => lot.id === currentLotId) : null;
  const selectedLotCatalogSource = normalizeSinglesCatalogSource(
    selectedLot?.lotType === "singles" ? selectedLot.singlesCatalogSource : undefined
  );
  const nextLotType: LotType = newLotType === "singles" ? "singles" : "bulk";
  const nextLotCatalogSource = nextLotType === "singles"
    ? normalizeSinglesCatalogSource(newLotCatalogSource, selectedLotCatalogSource)
    : "none";
  const fallbackPreviousLot = lots.length > 0 ? lots[lots.length - 1] : null;
  const previousSellingTaxRaw =
    selectedLot?.sellingTaxPercent ??
    fallbackPreviousLot?.sellingTaxPercent ??
    DEFAULT_VALUES.SELLING_TAX_RATE_PERCENT;
  const previousSellingTax = Number(previousSellingTaxRaw);
  const nextSetup: LotSetup = {
    ...setup,
    sellingTaxPercent:
      Number.isFinite(previousSellingTax) && previousSellingTax >= 0
        ? previousSellingTax
        : DEFAULT_VALUES.SELLING_TAX_RATE_PERCENT,
    purchaseDate: todayDate
  };

  if (purchaseUiMode === "simple") {
    nextSetup.purchaseShippingCost = 0;
    nextSetup.purchaseTaxPercent = 0;
  }

  if (nextLotType === "singles") {
    nextSetup.costInputMode = "total";
    nextSetup.boxPriceCost = 0;
    nextSetup.boxesPurchased = 0;
    nextSetup.packsPerBox = 1;
    nextSetup.purchaseShippingCost = 0;
    nextSetup.purchaseTaxPercent = 0;
    nextSetup.includeTax = false;
    nextSetup.spotPrice = 0;
    nextSetup.boxPriceSell = 0;
    nextSetup.packPrice = 0;
  }

  return {
    lot: {
      id: generatedId,
      name: newLotName.trim(),
      createdAt: todayDate,
      lotType: nextLotType,
      singlesCatalogSource: nextLotType === "singles" ? nextLotCatalogSource : undefined,
      singlesPurchases: nextLotType === "singles" ? [] as SinglesPurchaseEntry[] : undefined,
      ...nextSetup
    },
    nextLotType,
    nextLotCatalogSource
  };
}

export function normalizeSelectedLotId(lotId: number | null): number | null {
  const parsedLotId = Number(lotId);
  return Number.isFinite(parsedLotId) && parsedLotId > 0
    ? parsedLotId
    : null;
}

export function validateRenameLotName(lots: Lot[], lot: Lot, renameLotName: string): RenameLotValidationResult {
  const nextName = String(renameLotName || "").trim();
  if (!nextName) {
    return { ok: false, message: "Please enter a lot name" };
  }

  const nextNameKey = nextName.toLocaleLowerCase();
  const hasDuplicate = lots.some(
    (candidate) => candidate.id !== lot.id && String(candidate.name || "").trim().toLocaleLowerCase() === nextNameKey
  );
  if (hasDuplicate) {
    return { ok: false, message: "A lot with this name already exists" };
  }

  return {
    ok: true,
    nextName,
    changed: lot.name !== nextName
  };
}

export function getDeleteLotConfirmationText(lotName: string, linkedSalesCount: number): string {
  return linkedSalesCount > 0
    ? `Delete "${lotName}" and ${linkedSalesCount} linked sale${linkedSalesCount === 1 ? "" : "s"} permanently?`
    : `Delete "${lotName}" permanently?`;
}
