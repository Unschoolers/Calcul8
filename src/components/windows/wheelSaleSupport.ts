import { getSinglesSoldQuantityForEntry } from "../../app-core/methods/sales-core.ts";
import type { Lot, Sale, SinglesPurchaseEntry, WheelTier } from "../../types/app.ts";

type WheelSalesContext = Record<string, unknown> & {
  currentLotId?: number | null;
  sales?: Sale[];
  lots?: Lot[];
  singlesSoldCountByPurchaseId?: Record<number, number>;
  loadSalesForLotId?: (lotId: number) => Sale[];
};

function getLotSales(context: WheelSalesContext, lotId: number): Sale[] {
  if (context.currentLotId === lotId && Array.isArray(context.sales)) {
    return context.sales as Sale[];
  }
  const loadSalesForLotId = context.loadSalesForLotId;
  if (typeof loadSalesForLotId === "function") {
    return loadSalesForLotId(lotId) || [];
  }
  return [];
}

export function getAvailableSinglesQuantityForWheelTier(
  context: WheelSalesContext,
  lotId: number,
  singlesEntryId: number
): number {
  const lots = (context.lots || []) as Lot[];
  const lot = lots.find((entry) => entry.id === lotId);
  const purchase = lot?.singlesPurchases?.find((entry) => entry.id === singlesEntryId);
  if (!purchase) return 0;

  const totalQuantity = Math.max(0, Math.floor(Number(purchase.quantity) || 0));
  const soldQuantity = getSinglesSoldQuantityForEntry({
    entryId: singlesEntryId,
    sales: getLotSales(context, lotId),
    singlesSoldCountByPurchaseId: context.currentLotId === lotId
      ? (context.singlesSoldCountByPurchaseId as Record<number, number> | undefined)
      : undefined
  });
  return Math.max(0, totalQuantity - soldQuantity);
}

export function hasAnyAvailableSinglesForWheelTier(
  context: WheelSalesContext,
  tier: WheelTier
): boolean {
  if (tier.boundLotId == null) return false;
  const lots = (context.lots || []) as Lot[];
  const lot = lots.find((entry) => entry.id === tier.boundLotId);
  const singlesPurchases = lot?.singlesPurchases || [];
  return singlesPurchases.some((entry) => (
    getAvailableSinglesQuantityForWheelTier(context, tier.boundLotId as number, entry.id) > 0
  ));
}
