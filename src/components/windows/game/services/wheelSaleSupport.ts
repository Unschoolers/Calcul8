import { getSinglesSoldQuantityForEntry } from "../../../../app-core/methods/sales-core.ts";
import type { CommerceContext, CommerceMethodState } from "../../../../app-core/context/commerce.ts";
import { translateAppMessage } from "../../../../app-core/i18n/index.ts";
import { isSinglesLot } from "../../../../app-core/shared/lot-types.ts";
import { getRootLotSales } from "../../../../app-core/shared/sales-root-state.ts";
import { getWheelTierSourceLotIds, isWheelTierMultiLot } from "../../../../app-core/shared/wheel-tier-sources.ts";
import type { Lot, Sale, SinglesPurchaseEntry, WheelTier } from "../../../../types/app.ts";

type WheelSalesContext = Partial<CommerceContext & Pick<CommerceMethodState, "getSalesCacheEntry" | "loadSalesForLotId">>;

function getLotSales(context: WheelSalesContext, lotId: number): Sale[] {
  if (context.currentLotId === lotId && Array.isArray(context.sales)) {
    return context.sales as Sale[];
  }
  const inMemorySales = getRootLotSales(context as Record<string, unknown>, lotId);
  if (inMemorySales) {
    return inMemorySales;
  }
  if (typeof context.getSalesCacheEntry === "function") {
    return context.getSalesCacheEntry(lotId)?.sales || [];
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
  if (isWheelTierMultiLot(tier)) {
    const lots = (context.lots || []) as Lot[];
    const sourceIds = getWheelTierSourceLotIds(tier);
    const bulkIds = sourceIds.filter((id) => !isSinglesLot(lots.find((entry) => entry.id === id)));
    if (!bulkIds.length) return null;
    const remainingPacks = bulkIds.reduce((sum, id) => sum + getRemainingPacksForWheelLot(context, id), 0);
    const perHit = Math.max(1, Number(tier.packsCount) || 0);
    return {
      text: `${remainingPacks} items left across ${bulkIds.length} lot${bulkIds.length === 1 ? "" : "s"} • ${perHit} per hit`,
      warning: !bulkIds.some((id) => getRemainingPacksForWheelLot(context, id) >= perHit)
    };
  }
  if (tier.boundLotId == null) return null;
  const lots = (context.lots || []) as Lot[];
  const lot = lots.find((entry) => entry.id === tier.boundLotId);
  if (!lot) return null;

  if (isSinglesLot(lot)) {
    const preferredLanguage = String(context.preferredLanguage ?? "");
    if (tier.boundSinglesId != null) {
      const purchase = lot.singlesPurchases?.find((entry) => entry.id === tier.boundSinglesId);
      const remaining = getAvailableSinglesQuantityForWheelTier(context, tier.boundLotId, tier.boundSinglesId);
      if (!purchase) {
        return { text: translateAppMessage(preferredLanguage, "wheelSourceSelectedItemMissing"), warning: true };
      }
      return {
        text: `${translateAppMessage(preferredLanguage, "wheelSourceItemsLeft", {
          count: remaining,
          suffix: remaining === 1 ? "" : "s"
        })} • ${Math.max(1, Number(tier.packsCount) || 1)} per hit`,
        warning: remaining <= Math.max(1, Number(tier.packsCount) || 1)
      };
    }

    return {
      text: translateAppMessage(preferredLanguage, "wheelSourceSinglesOptionsLeft", {
        count: (lot.singlesPurchases || []).length,
        suffix: (lot.singlesPurchases || []).length === 1 ? "" : "s"
      }),
      warning: false
    };
  }

  const remainingPacks = getRemainingPacksForWheelLot(context, tier.boundLotId);
  const preferredLanguage = String(context.preferredLanguage ?? "");
  return {
    text: `${translateAppMessage(preferredLanguage, "wheelSourceItemsLeft", {
      count: remainingPacks,
      suffix: remainingPacks === 1 ? "" : "s"
    })} • ${Math.max(1, Number(tier.packsCount) || 0)} per hit`,
    warning: remainingPacks <= Math.max(1, Number(tier.packsCount) || 1)
  };
}
