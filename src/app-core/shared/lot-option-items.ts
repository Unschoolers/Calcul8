import type { LotType } from "../../types/app.ts";
import { resolveLotBusinessDate } from "../../shared/lot-dates.ts";
import { translateAppMessage } from "../i18n/index.ts";

export type LotOptionItem = {
  title: string;
  value: number;
  subtitle: string;
  lotType: LotType;
  isComplete: boolean;
  symbolIcon: string;
  completionIcon: string | null;
  groupLabel?: string | null;
};

type LotLike = {
  id: number;
  name: string;
  purchaseDate?: string;
  createdAt?: string;
  isComplete?: boolean;
  lotType?: LotType;
  singlesCatalogSource?: string;
};

function normalizeLotType(lotType: LotType | undefined): LotType {
  return lotType === "singles" ? "singles" : "bulk";
}

function getLotTypeGroupLabel(lotType: LotType, preferredLanguage = ""): string {
  return lotType === "singles"
    ? translateAppMessage(preferredLanguage, "lotOptionSinglesLotsLabel")
    : translateAppMessage(preferredLanguage, "lotOptionBulkLotsLabel");
}

function getLotSymbolIcon(lotType: LotType): string {
  return lotType === "singles" ? "mdi-cards-outline" : "mdi-cube-outline";
}
function getSinglesCatalogLabel(source: string | undefined, preferredLanguage = ""): string | null {
  if (source === "pokemon") return translateAppMessage(preferredLanguage, "itemCatalogPokemon");
  if (source === "none") return translateAppMessage(preferredLanguage, "itemCatalogCustom");
  if (source === "ua") return translateAppMessage(preferredLanguage, "itemCatalogUnionArena");
  return null;
}

function sortLotOptionItemsByType(items: Array<Omit<LotOptionItem, "groupLabel"> | LotOptionItem>) {
  const bulkItems = items.filter((item) => normalizeLotType(item.lotType) !== "singles");
  const singlesItems = items.filter((item) => normalizeLotType(item.lotType) === "singles");
  return [...bulkItems, ...singlesItems];
}

export function formatLotOptionSubtitle(lot: LotLike, preferredLanguage = ""): string {
  const purchaseDate = resolveLotBusinessDate({
    purchaseDate: lot.purchaseDate,
    createdAt: lot.createdAt,
    lotId: lot.id
  });
  const lotTypeLabel = normalizeLotType(lot.lotType) === "singles"
    ? translateAppMessage(preferredLanguage, "lotOptionSinglesLabel")
    : translateAppMessage(preferredLanguage, "lotOptionBulkLabel");
  const singlesCatalogLabel = normalizeLotType(lot.lotType) === "singles"
    ? getSinglesCatalogLabel(lot.singlesCatalogSource, preferredLanguage)
    : null;
  const subtitleParts = [
    lotTypeLabel,
    ...(singlesCatalogLabel ? [singlesCatalogLabel] : []),
    ...(purchaseDate ? [purchaseDate] : [])
  ];
  return subtitleParts.join(" | ");
}

export function attachLotOptionGroupLabels(
  items: Array<Omit<LotOptionItem, "groupLabel"> | LotOptionItem>,
  preferredLanguage = ""
): LotOptionItem[] {
  const baseItems = sortLotOptionItemsByType(items).map((item) => ({
    title: item.title,
    value: item.value,
    subtitle: item.subtitle,
    lotType: normalizeLotType(item.lotType),
    isComplete: item.isComplete === true,
    symbolIcon: typeof item.symbolIcon === "string" && item.symbolIcon.trim()
      ? item.symbolIcon
      : getLotSymbolIcon(normalizeLotType(item.lotType)),
    completionIcon: item.completionIcon === "mdi-check-circle" ? item.completionIcon : null
  }));

  return baseItems.map((item, index, allItems) => {
    const previousType = index > 0 ? allItems[index - 1]?.lotType : null;
    return {
      ...item,
      groupLabel: previousType !== item.lotType ? getLotTypeGroupLabel(item.lotType, preferredLanguage) : null
    };
  });
}

export function buildLotOptionItems(lots: LotLike[], preferredLanguage = ""): LotOptionItem[] {
  return attachLotOptionGroupLabels(
    lots.map((lot) => ({
      title: lot.name,
      value: lot.id,
      subtitle: formatLotOptionSubtitle(lot, preferredLanguage),
      lotType: normalizeLotType(lot.lotType),
      isComplete: lot.isComplete === true,
      symbolIcon: getLotSymbolIcon(normalizeLotType(lot.lotType)),
      completionIcon: lot.isComplete === true ? "mdi-check-circle" : null
    })),
    preferredLanguage
  );
}

export function filterLotOptionItems(
  items: LotOptionItem[],
  query: string | null | undefined,
  preferredLanguage = ""
): LotOptionItem[] {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  if (!normalizedQuery) {
    return attachLotOptionGroupLabels(items, preferredLanguage);
  }

  return attachLotOptionGroupLabels(
    items.filter((item) => {
      const haystack = `${item.title} ${item.subtitle}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    }),
    preferredLanguage
  );
}






