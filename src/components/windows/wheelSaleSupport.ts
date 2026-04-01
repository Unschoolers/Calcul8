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

export function getRemainingPacksForWheelLot(
  context: WheelSalesContext,
  lotId: number
): number {
  const lots = (context.lots || []) as Lot[];
  const lot = lots.find((entry) => entry.id === lotId);
  if (!lot) return 0;
  const totalPacks = Math.max(0, (Number(lot.boxesPurchased) || 0) * (Number(lot.packsPerBox) || 0));
  const soldPacks = getLotSales(context, lotId).reduce((sum, sale) => {
    return sum + Math.max(0, Math.floor(Number(sale.packsCount) || 0));
  }, 0);
  return Math.max(0, totalPacks - soldPacks);
}

export function getWheelTierInventoryMeta(
  context: WheelSalesContext,
  tier: WheelTier
): { text: string; warning: boolean } | null {
  if (tier.boundLotId == null) return null;
  const lots = (context.lots || []) as Lot[];
  const lot = lots.find((entry) => entry.id === tier.boundLotId);
  if (!lot) return null;

  if (lot.lotType === "singles") {
    if (tier.boundSinglesId != null) {
      const purchase = lot.singlesPurchases?.find((entry) => entry.id === tier.boundSinglesId);
      const remaining = getAvailableSinglesQuantityForWheelTier(context, tier.boundLotId, tier.boundSinglesId);
      if (!purchase) {
        return { text: "Selected card is no longer in this lot", warning: true };
      }
      return {
        text: `${remaining} card${remaining === 1 ? "" : "s"} left • ${Math.max(1, Number(tier.packsCount) || 1)} per hit`,
        warning: remaining <= Math.max(1, Number(tier.packsCount) || 1)
      };
    }

    return {
      text: `${(lot.singlesPurchases || []).length} singles option${(lot.singlesPurchases || []).length === 1 ? "" : "s"} left • untracked sale`,
      warning: false
    };
  }

  const remainingPacks = getRemainingPacksForWheelLot(context, tier.boundLotId);
  return {
    text: `${remainingPacks} pack${remainingPacks === 1 ? "" : "s"} left • ${Math.max(1, Number(tier.packsCount) || 0)} per hit`,
    warning: remainingPacks <= Math.max(1, Number(tier.packsCount) || 1)
  };
}
