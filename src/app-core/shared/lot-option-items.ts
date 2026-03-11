import type { LotType } from "../../types/app.ts";
import { inferDateFromLotId, toDateOnly } from "../methods/config-shared.ts";

export type LotOptionItem = {
  title: string;
  value: number;
  subtitle: string;
  lotType: LotType;
  groupLabel?: string | null;
};

type LotLike = {
  id: number;
  name: string;
  purchaseDate?: string;
  createdAt?: string;
  lotType?: LotType;
};

function normalizeLotType(lotType: LotType | undefined): LotType {
  return lotType === "singles" ? "singles" : "bulk";
}

function getLotTypeGroupLabel(lotType: LotType): string {
  return lotType === "singles" ? "Singles lots" : "Bulk lots";
}

function sortLotOptionItemsByType(items: Array<Omit<LotOptionItem, "groupLabel"> | LotOptionItem>) {
  const bulkItems = items.filter((item) => normalizeLotType(item.lotType) !== "singles");
  const singlesItems = items.filter((item) => normalizeLotType(item.lotType) === "singles");
  return [...bulkItems, ...singlesItems];
}

export function formatLotOptionSubtitle(lot: LotLike): string {
  const purchaseDate =
    toDateOnly(lot.purchaseDate) ??
    toDateOnly(lot.createdAt) ??
    inferDateFromLotId(lot.id);
  const lotTypeLabel = normalizeLotType(lot.lotType) === "singles" ? "Singles" : "Bulk";
  return purchaseDate ? `${lotTypeLabel} • ${purchaseDate}` : lotTypeLabel;
}

export function attachLotOptionGroupLabels(items: Array<Omit<LotOptionItem, "groupLabel"> | LotOptionItem>): LotOptionItem[] {
  const baseItems = sortLotOptionItemsByType(items).map((item) => ({
    title: item.title,
    value: item.value,
    subtitle: item.subtitle,
    lotType: normalizeLotType(item.lotType)
  }));

  return baseItems.map((item, index, allItems) => {
    const previousType = index > 0 ? allItems[index - 1]?.lotType : null;
    return {
      ...item,
      groupLabel: previousType !== item.lotType ? getLotTypeGroupLabel(item.lotType) : null
    };
  });
}

export function buildLotOptionItems(lots: LotLike[]): LotOptionItem[] {
  return attachLotOptionGroupLabels(
    lots.map((lot) => ({
      title: lot.name,
      value: lot.id,
      subtitle: formatLotOptionSubtitle(lot),
      lotType: normalizeLotType(lot.lotType)
    }))
  );
}

export function filterLotOptionItems(items: LotOptionItem[], query: string | null | undefined): LotOptionItem[] {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  if (!normalizedQuery) {
    return attachLotOptionGroupLabels(items);
  }

  return attachLotOptionGroupLabels(
    items.filter((item) => {
      const haystack = `${item.title} ${item.subtitle}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    })
  );
}

