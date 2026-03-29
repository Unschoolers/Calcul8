import {
  calculateExactPriceForUnits,
  calculatePriceForUnits,
  getSaleSinglesLines as getNormalizedSaleSinglesLines,
  getSinglesEntryUnitCostInSellingCurrency as getConvertedSinglesEntryUnitCost
} from "../../domain/calculations.ts";
import {
  normalizeSinglesCatalogSource,
  resolveDefaultSinglesCatalogSourceFromEnv
} from "../shared/singles-catalog-source.ts";
import {
  normalizeUniquePositiveIntIds,
  toNonNegativeInt,
  toPositiveIntOrNull
} from "../shared/singles-normalizers.ts";

export { normalizeSinglesCatalogSource, resolveDefaultSinglesCatalogSourceFromEnv };
export { toNonNegativeInt, toPositiveIntOrNull };

export function normalizeLiveSelectionIds(values: unknown): number[] {
  return normalizeUniquePositiveIntIds(values);
}

export function getSinglesRemainingQuantity(
  entry: { id: number; quantity: number },
  soldByEntryId: Record<number, number> | undefined
): number {
  const totalQuantity = toNonNegativeInt(entry.quantity);
  const soldQuantity = toNonNegativeInt(soldByEntryId?.[entry.id]);
  return Math.max(0, totalQuantity - soldQuantity);
}

export function getTrackedSinglesSoldCount(
  entries: Array<{ id: number }> | undefined,
  soldByEntryId: Record<number, number> | undefined
): number {
  const existingEntryIds = new Set(
    (entries || [])
      .map((entry) => Number(entry.id))
      .filter((entryId) => Number.isFinite(entryId) && entryId > 0)
  );

  return Object.entries(soldByEntryId || {})
    .reduce((sum, [entryId, value]) => {
      const numericEntryId = Number(entryId);
      if (!existingEntryIds.has(numericEntryId)) return sum;
      return sum + Math.max(0, Math.floor(Number(value) || 0));
    }, 0);
}

export function calculateProfitableOrderPrice(
  targetNetRevenue: number,
  sellingTaxPercent: number,
  buyerShippingPerOrder: number
): number {
  const targetNet = Math.max(0, Number(targetNetRevenue) || 0);
  if (targetNet <= 0) return 0;
  return calculateExactPriceForUnits(1, targetNet, sellingTaxPercent, buyerShippingPerOrder);
}

export function getSinglesEntryUnitCostInSellingCurrency(
  entry: { cost: number; currency?: string },
  purchaseCurrency: "CAD" | "USD",
  sellingCurrency: "CAD" | "USD",
  exchangeRate: number
): number {
  return getConvertedSinglesEntryUnitCost(entry, purchaseCurrency, sellingCurrency, exchangeRate);
}

type SaleLineLike = {
  singlesPurchaseEntryId?: number;
  quantity: number;
  price: number;
};

export function getSaleSinglesLines(sale: {
  singlesItems?: Array<{ singlesPurchaseEntryId?: number; quantity: number; price: number }>;
  singlesPurchaseEntryId?: number;
  quantity: number;
  price: number;
}): SaleLineLike[] {
  return getNormalizedSaleSinglesLines(sale)
    .map((line) => ({
      singlesPurchaseEntryId: toPositiveIntOrNull(line.singlesPurchaseEntryId) ?? undefined,
      quantity: toNonNegativeInt(line.quantity),
      price: Math.max(0, Number(line.price) || 0)
    }));
}
