import { DEFAULT_VALUES, WHATNOT_FEES } from "../../constants.ts";
import { calculateBoxPriceCostCad } from "../../domain/calculations.ts";
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
  const buyerTaxRate = Math.max(0, Number(sellingTaxPercent) || 0) / 100;
  const shipping = Math.max(0, Number(buyerShippingPerOrder) || 0);
  const effectiveRate = 1 - WHATNOT_FEES.COMMISSION - (WHATNOT_FEES.PROCESSING * (1 + buyerTaxRate));
  if (effectiveRate <= 0) return 0;
  const fixedFees = WHATNOT_FEES.FIXED + (WHATNOT_FEES.PROCESSING * shipping);
  return (targetNet + fixedFees) / effectiveRate;
}

export function getSinglesEntryUnitCostInSellingCurrency(
  entry: { cost: number; currency?: string },
  purchaseCurrency: "CAD" | "USD",
  sellingCurrency: "CAD" | "USD",
  exchangeRate: number
): number {
  const unitCost = Math.max(0, Number(entry.cost) || 0);
  const entryCurrency = entry.currency === "USD" || entry.currency === "CAD"
    ? entry.currency
    : purchaseCurrency;
  return calculateBoxPriceCostCad(
    unitCost,
    entryCurrency,
    sellingCurrency,
    exchangeRate,
    DEFAULT_VALUES.EXCHANGE_RATE
  );
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
  if (Array.isArray(sale.singlesItems) && sale.singlesItems.length > 0) {
    return sale.singlesItems
      .map((line) => ({
        singlesPurchaseEntryId: toPositiveIntOrNull(line.singlesPurchaseEntryId) ?? undefined,
        quantity: toNonNegativeInt(line.quantity),
        price: Math.max(0, Number(line.price) || 0)
      }))
      .filter((line) => line.quantity > 0);
  }

  const legacyQuantity = toNonNegativeInt(sale.quantity);
  if (legacyQuantity <= 0) return [];
  return [{
    singlesPurchaseEntryId: toPositiveIntOrNull(sale.singlesPurchaseEntryId) ?? undefined,
    quantity: legacyQuantity,
    price: Math.max(0, Number(sale.price) || 0)
  }];
}
