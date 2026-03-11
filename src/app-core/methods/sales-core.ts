import type {
  LotType,
  NewSaleDraft,
  Sale,
  SinglesPurchaseEntry,
  SinglesSaleDraftLine,
  SinglesSaleLine,
  UiColor
} from "../../types/app.ts";
import { toDateOnly, getTodayDate } from "./config-shared.ts";
import { toPositiveIntOrNull as normalizeSinglesPurchaseEntryId } from "../shared/singles-normalizers.ts";

export interface SaleSaveParams {
  canUsePaidActions: boolean;
  currentLotType: LotType;
  sales: Sale[];
  editingSale: Sale | null;
  newSale: NewSaleDraft;
  packsPerBox: number;
  singlesPurchases: SinglesPurchaseEntry[];
  singlesSoldCountByPurchaseId?: Record<number, number>;
  todayDate?: string;
}

export type SaleSaveResult =
  | {
    ok: true;
    sale: Sale;
    editingIndex: number;
  }
  | {
    ok: false;
    color: UiColor;
    message: string;
  };

function normalizeWholeQuantity(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  const whole = Math.floor(parsed);
  return whole > 0 ? whole : null;
}

function normalizeNonNegativePrice(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

export function createEmptySinglesSaleDraftLine(): SinglesSaleDraftLine {
  return {
    lineId: Date.now() + Math.floor(Math.random() * 1000),
    singlesPurchaseEntryId: null,
    quantity: 1,
    price: null
  };
}

export function getDraftSinglesSaleLinesFromSale(sale: Sale | null | undefined): SinglesSaleDraftLine[] {
  if (!sale) return [createEmptySinglesSaleDraftLine()];

  if (Array.isArray(sale.singlesItems) && sale.singlesItems.length > 0) {
    return sale.singlesItems.map((line, index) => ({
      lineId: Date.now() + index,
      singlesPurchaseEntryId: normalizeSinglesPurchaseEntryId(line.singlesPurchaseEntryId),
      quantity: normalizeWholeQuantity(line.quantity) ?? 1,
      price: normalizeNonNegativePrice(line.price)
    }));
  }

  return [{
    lineId: Date.now(),
    singlesPurchaseEntryId: normalizeSinglesPurchaseEntryId(sale.singlesPurchaseEntryId),
    quantity: normalizeWholeQuantity(sale.quantity) ?? 1,
    price: normalizeNonNegativePrice(sale.price)
  }];
}

export function normalizeDraftSinglesSaleLines(draft: Pick<
  NewSaleDraft,
  "singlesItems" | "singlesPurchaseEntryId" | "quantity" | "price"
>): SinglesSaleLine[] {
  const seedLine = {
    lineId: 0,
    singlesPurchaseEntryId: normalizeSinglesPurchaseEntryId(draft.singlesPurchaseEntryId),
    quantity: normalizeWholeQuantity(draft.quantity) ?? 1,
    price: normalizeNonNegativePrice(draft.price)
  };
  const sourceLines = Array.isArray(draft.singlesItems) && draft.singlesItems.length > 0
    ? draft.singlesItems
    : [seedLine];

  return sourceLines
    .map((line) => {
      const quantity = normalizeWholeQuantity(line.quantity);
      const price = normalizeNonNegativePrice(line.price);
      if (!quantity || price == null) return null;
      return {
        singlesPurchaseEntryId: normalizeSinglesPurchaseEntryId(line.singlesPurchaseEntryId) ?? undefined,
        quantity,
        price
      } as SinglesSaleLine;
    })
    .filter((line): line is SinglesSaleLine => line != null);
}

export function getLinkedQuantityMapForSinglesLines(lines: SinglesSaleLine[]): Map<number, number> {
  const quantities = new Map<number, number>();
  for (const line of lines) {
    const entryId = normalizeSinglesPurchaseEntryId(line.singlesPurchaseEntryId);
    const quantity = normalizeWholeQuantity(line.quantity);
    if (!entryId || !quantity) continue;
    quantities.set(entryId, (quantities.get(entryId) || 0) + quantity);
  }
  return quantities;
}

export function getLinkedQuantityMapForSale(sale: Sale | null | undefined): Map<number, number> {
  if (!sale) return new Map<number, number>();
  if (Array.isArray(sale.singlesItems) && sale.singlesItems.length > 0) {
    return getLinkedQuantityMapForSinglesLines(sale.singlesItems);
  }

  const quantities = new Map<number, number>();
  const entryId = normalizeSinglesPurchaseEntryId(sale.singlesPurchaseEntryId);
  const quantity = normalizeWholeQuantity(sale.quantity);
  if (entryId && quantity) {
    quantities.set(entryId, quantity);
  }
  return quantities;
}

function getSinglesPurchaseEntryById(entries: SinglesPurchaseEntry[], entryId: number): SinglesPurchaseEntry | null {
  return entries.find((entry) => entry.id === entryId) ?? null;
}

export function getSinglesSoldQuantityForEntry(params: {
  entryId: number;
  sales: Sale[];
  singlesSoldCountByPurchaseId?: Record<number, number>;
}): number {
  const soldMapQuantity = Math.max(
    0,
    Math.floor(Number(params.singlesSoldCountByPurchaseId?.[params.entryId]) || 0)
  );
  if (soldMapQuantity > 0) return soldMapQuantity;

  return (params.sales || []).reduce((sum, sale) => {
    if (Array.isArray(sale.singlesItems) && sale.singlesItems.length > 0) {
      const lineSum = sale.singlesItems.reduce((lineTotal, line) => {
        const linkedEntryId = normalizeSinglesPurchaseEntryId(line.singlesPurchaseEntryId);
        if (linkedEntryId !== params.entryId) return lineTotal;
        const quantity = normalizeWholeQuantity(line.quantity) ?? 0;
        return lineTotal + quantity;
      }, 0);
      return sum + lineSum;
    }

    const linkedEntryId = normalizeSinglesPurchaseEntryId(sale.singlesPurchaseEntryId);
    if (linkedEntryId !== params.entryId) return sum;
    const quantity = Math.max(0, Math.floor(Number(sale.quantity) || 0));
    return sum + quantity;
  }, 0);
}

function fail(message: string, color: UiColor = "warning"): SaleSaveResult {
  return {
    ok: false,
    color,
    message
  };
}

export function buildSaleSaveResult(params: SaleSaveParams): SaleSaveResult {
  if (!params.canUsePaidActions) {
    return fail("Pro access required to add or update sales");
  }

  const buyerShipping = Number(params.newSale.buyerShipping);
  if (!Number.isFinite(buyerShipping) || buyerShipping < 0) {
    return fail("Please enter a valid buyer shipping amount (0 or greater)");
  }

  let editingIndex = -1;
  if (params.editingSale) {
    editingIndex = params.sales.findIndex((sale) => sale.id === params.editingSale?.id);
    if (editingIndex === -1) {
      return fail("Could not find the sale to update. Please try again.", "error");
    }
  }

  const isSinglesLot = params.currentLotType === "singles";
  const rtyhPacks = Number(params.newSale.packsCount);
  if (!isSinglesLot && params.newSale.type === "rtyh" && (!Number.isFinite(rtyhPacks) || rtyhPacks <= 0)) {
    return fail("Please enter the number of items sold for RTYH");
  }

  let quantity = Number(params.newSale.quantity);
  let price = Number(params.newSale.price);
  let singlesItems: SinglesSaleLine[] | undefined;
  let selectedSinglesPurchaseEntryId: number | null = null;

  if (isSinglesLot) {
    singlesItems = normalizeDraftSinglesSaleLines(params.newSale);
    if (singlesItems.length === 0) {
      return fail("Please add at least one item sale line.");
    }

    for (const line of singlesItems) {
      if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
        return fail("Items sold must be a whole number.");
      }
      if (!Number.isFinite(line.price) || line.price < 0) {
        return fail("Please enter a valid price (0 or greater)");
      }
      const lineEntryId = normalizeSinglesPurchaseEntryId(line.singlesPurchaseEntryId);
      if (!lineEntryId && line.price <= 0) {
        return fail("Please enter a total price when no item is linked.");
      }
    }

    const previousLinkedQuantities = getLinkedQuantityMapForSale(params.editingSale);
    const requestedQuantities = getLinkedQuantityMapForSinglesLines(singlesItems);
    for (const [entryId, requestedQuantity] of requestedQuantities.entries()) {
      const selectedEntry = getSinglesPurchaseEntryById(params.singlesPurchases, entryId);
      if (!selectedEntry) {
        return fail("Selected item is no longer available.");
      }
      const totalQuantity = normalizeWholeQuantity(selectedEntry.quantity) ?? 0;
      const soldQuantity = getSinglesSoldQuantityForEntry({
        entryId,
        sales: params.sales,
        singlesSoldCountByPurchaseId: params.singlesSoldCountByPurchaseId
      });
      const releasedQuantity = previousLinkedQuantities.get(entryId) || 0;
      const maxAllowed = Math.max(0, totalQuantity - soldQuantity + releasedQuantity);
      if (requestedQuantity > maxAllowed) {
        return fail(`Quantity exceeds selected item stock (${maxAllowed} available).`);
      }
    }

    quantity = singlesItems.reduce((sum, line) => sum + line.quantity, 0);
    price = singlesItems.reduce((sum, line) => sum + line.price, 0);
    const uniqueLinkedIds = new Set(
      singlesItems
        .map((line) => normalizeSinglesPurchaseEntryId(line.singlesPurchaseEntryId))
        .filter((entryId): entryId is number => entryId != null)
    );
    selectedSinglesPurchaseEntryId = uniqueLinkedIds.size === 1 && singlesItems.length === 1
      ? (uniqueLinkedIds.values().next().value as number)
      : null;
  } else {
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return fail("Please enter a valid quantity greater than 0");
    }
    if (!Number.isFinite(price) || price < 0) {
      return fail("Please enter a valid price (0 or greater)");
    }
  }

  const normalizedSaleType = isSinglesLot ? "pack" : params.newSale.type;
  let packsCount: number;
  if (normalizedSaleType === "pack") {
    packsCount = quantity;
  } else if (normalizedSaleType === "box") {
    packsCount = quantity * params.packsPerBox;
  } else {
    packsCount = rtyhPacks;
  }

  const normalizedSaleDate = toDateOnly(params.newSale.date) ?? params.todayDate ?? getTodayDate();
  const memo = typeof params.newSale.memo === "string" ? params.newSale.memo.trim() : "";
  const sale: Sale = {
    id: params.editingSale ? params.editingSale.id : Date.now(),
    type: normalizedSaleType,
    quantity,
    packsCount: packsCount || 0,
    singlesPurchaseEntryId: isSinglesLot ? (selectedSinglesPurchaseEntryId ?? undefined) : undefined,
    singlesItems: isSinglesLot ? singlesItems : undefined,
    price,
    priceIsTotal: isSinglesLot ? true : undefined,
    memo: memo || undefined,
    buyerShipping,
    date: normalizedSaleDate
  };

  return {
    ok: true,
    sale,
    editingIndex
  };
}
