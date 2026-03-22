import { calculateBoxPriceCostCad } from "../../domain/calculations.ts";
import { DEFAULT_VALUES } from "../../constants.ts";
import type { Sale, SaleType, SinglesPurchaseEntry, SinglesSaleDraftLine, SinglesSaleLine } from "../../types/app.ts";
import { toPositiveIntOrNull as normalizeSinglesPurchaseEntryId } from "../shared/singles-normalizers.ts";
import { getTodayDate, toDateOnly } from "./config-shared.ts";
import {
  createEmptySinglesSaleDraftLine,
  getDraftSinglesSaleLinesFromSale,
  getLinkedQuantityMapForSale,
  getSinglesSoldQuantityForEntry,
  normalizeDraftSinglesSaleLines
} from "./sales-core.ts";
import { focusSaleQuantityInput, resolveDefaultSaleUnitPrice } from "./sales-ui-helpers.ts";

export type SalesDraftTarget = {
  currentLotType: "bulk" | "singles";
  hasProAccess: boolean;
  targetProfitPercent: number;
  currency: "CAD" | "USD";
  sellingCurrency: "CAD" | "USD";
  exchangeRate: number;
  sellingShippingPerOrder: number;
  editingSale: Sale | null;
  singlesPurchases: SinglesPurchaseEntry[];
  sales: Sale[];
  singlesSoldCountByPurchaseId?: Record<number, number>;
  newSale: {
    type: SaleType;
    quantity?: number | null;
    packsCount?: number | null;
    singlesPurchaseEntryId?: number | null;
    singlesItems?: SinglesSaleDraftLine[];
    price?: number | null;
    memo?: string;
    buyerShipping: number;
    date: string;
  };
  showAddSaleModal: boolean;
  calculatePriceForUnits(units: number, targetNetRevenue: number): number;
};

export function normalizeWholeQuantity(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  const whole = Math.floor(parsed);
  return whole > 0 ? whole : null;
}

export function normalizeNonNegativePrice(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

export function ensureDraftSinglesSaleLines(context: SalesDraftTarget): SinglesSaleDraftLine[] {
  if (!Array.isArray(context.newSale.singlesItems) || context.newSale.singlesItems.length === 0) {
    context.newSale.singlesItems = [{
      lineId: Date.now() + Math.floor(Math.random() * 1000),
      singlesPurchaseEntryId: normalizeSinglesPurchaseEntryId(context.newSale.singlesPurchaseEntryId),
      quantity: normalizeWholeQuantity(context.newSale.quantity) ?? 1,
      price: normalizeNonNegativePrice(context.newSale.price)
    }];
  }
  return context.newSale.singlesItems;
}

function getSinglesPurchaseEntryById(context: SalesDraftTarget, entryId: number): SinglesPurchaseEntry | null {
  return context.singlesPurchases.find((entry) => entry.id === entryId) ?? null;
}

export function calculateSinglesTargetLinePrice(
  context: SalesDraftTarget,
  selectedEntry: SinglesPurchaseEntry,
  quantity: number
): number {
  const saleQuantity = Math.max(1, Math.floor(Number(quantity) || 1));
  const unitCost = Math.max(0, Number(selectedEntry.cost) || 0);
  const purchaseCurrency = selectedEntry.currency === "USD" || selectedEntry.currency === "CAD"
    ? selectedEntry.currency
    : (context.currency === "USD" ? "USD" : "CAD");
  const convertedUnitCost = calculateBoxPriceCostCad(
    unitCost,
    purchaseCurrency,
    context.sellingCurrency,
    context.exchangeRate,
    DEFAULT_VALUES.EXCHANGE_RATE
  );
  const totalCost = convertedUnitCost * saleQuantity;
  const unitMarket = Math.max(0, Number(selectedEntry.marketValue) || 0);
  const totalMarket = unitMarket * saleQuantity;
  const targetBase = totalMarket > 0 ? totalMarket : totalCost;
  const targetProfitPercent = context.hasProAccess
    ? Math.max(0, Number(context.targetProfitPercent) || 0)
    : 0;
  const targetNetRevenue = targetBase * (1 + (targetProfitPercent / 100));
  const unitPrice = context.calculatePriceForUnits(saleQuantity, targetNetRevenue);
  return unitPrice * saleQuantity;
}

export function syncSinglesSaleDraftSummary(context: SalesDraftTarget): void {
  const lines = ensureDraftSinglesSaleLines(context);
  const normalizedLines = normalizeDraftSinglesSaleLines({
    ...context.newSale,
    quantity: context.newSale.quantity ?? null,
    singlesPurchaseEntryId: context.newSale.singlesPurchaseEntryId ?? null,
    price: context.newSale.price ?? null
  });
  const totalQuantity = normalizedLines.reduce((sum, line) => sum + line.quantity, 0);
  const totalPrice = normalizedLines.reduce((sum, line) => sum + line.price, 0);
  const linkedIds = new Set(
    normalizedLines
      .map((line) => normalizeSinglesPurchaseEntryId(line.singlesPurchaseEntryId))
      .filter((id): id is number => id != null)
  );

  context.newSale.quantity = totalQuantity > 0 ? totalQuantity : null;
  context.newSale.price = normalizedLines.length > 0 ? totalPrice : null;
  context.newSale.singlesPurchaseEntryId = linkedIds.size === 1 && lines.length === 1
    ? (linkedIds.values().next().value as number)
    : null;
}

export function computeSinglesSaleLineMaxQuantity(context: SalesDraftTarget, lineIndex: number): number | null {
  const lines = ensureDraftSinglesSaleLines(context);
  const line = lines[lineIndex];
  if (!line) return null;
  const selectedEntryId = normalizeSinglesPurchaseEntryId(line.singlesPurchaseEntryId);
  if (!selectedEntryId) return null;
  const selectedEntry = getSinglesPurchaseEntryById(context, selectedEntryId);
  if (!selectedEntry) return null;
  const totalQuantity = normalizeWholeQuantity(selectedEntry.quantity) ?? 0;
  const soldQuantity = getSinglesSoldQuantityForEntry({
    entryId: selectedEntryId,
    sales: context.sales,
    singlesSoldCountByPurchaseId: context.singlesSoldCountByPurchaseId
  });
  const editingQuantities = getLinkedQuantityMapForSale(context.editingSale);
  const releasedQuantity = editingQuantities.get(selectedEntryId) || 0;
  const availableForDraft = Math.max(0, totalQuantity - soldQuantity + releasedQuantity);
  const requestedInOtherLines = lines.reduce((sum, draftLine, index) => {
    if (index === lineIndex) return sum;
    const draftEntryId = normalizeSinglesPurchaseEntryId(draftLine.singlesPurchaseEntryId);
    if (draftEntryId !== selectedEntryId) return sum;
    return sum + (normalizeWholeQuantity(draftLine.quantity) ?? 0);
  }, 0);
  return Math.max(0, availableForDraft - requestedInOtherLines);
}

export function applySinglesSaleLineCardSelection(context: SalesDraftTarget, lineIndex: number, value: number | null): void {
  const lines = ensureDraftSinglesSaleLines(context);
  const line = lines[lineIndex];
  if (!line) return;
  const selectedEntryId = normalizeSinglesPurchaseEntryId(value);
  line.singlesPurchaseEntryId = selectedEntryId;
  if (!selectedEntryId) {
    line.price = null;
    syncSinglesSaleDraftSummary(context);
    return;
  }
  const selectedEntry = getSinglesPurchaseEntryById(context, selectedEntryId);
  if (!selectedEntry) {
    syncSinglesSaleDraftSummary(context);
    return;
  }
  const currentQuantity = normalizeWholeQuantity(line.quantity) ?? 1;
  const maxAllowed = computeSinglesSaleLineMaxQuantity(context, lineIndex);
  const cappedQuantity = maxAllowed == null ? currentQuantity : Math.max(1, Math.min(currentQuantity, maxAllowed));
  line.quantity = cappedQuantity;
  line.price = calculateSinglesTargetLinePrice(context, selectedEntry, cappedQuantity);
  syncSinglesSaleDraftSummary(context);
}

export function applySinglesSaleLineQuantityChange(context: SalesDraftTarget, lineIndex: number, value?: unknown): void {
  const lines = ensureDraftSinglesSaleLines(context);
  const line = lines[lineIndex];
  if (!line) return;
  if (value !== undefined) {
    line.quantity = value as number;
  }
  const normalizedQuantity = normalizeWholeQuantity(line.quantity) ?? 1;
  const maxAllowed = computeSinglesSaleLineMaxQuantity(context, lineIndex);
  const cappedQuantity = maxAllowed == null ? normalizedQuantity : Math.max(1, Math.min(normalizedQuantity, maxAllowed));
  line.quantity = cappedQuantity;
  const selectedEntryId = normalizeSinglesPurchaseEntryId(line.singlesPurchaseEntryId);
  if (selectedEntryId != null) {
    const selectedEntry = getSinglesPurchaseEntryById(context, selectedEntryId);
    if (selectedEntry) {
      line.price = calculateSinglesTargetLinePrice(context, selectedEntry, cappedQuantity);
    }
  }
  syncSinglesSaleDraftSummary(context);
}

export function openAddSaleDraft(context: SalesDraftTarget, saleType: SaleType = "pack"): void {
  const normalizedType: SaleType = context.currentLotType === "singles" ? "pack" : saleType;
  const nextPrice = context.currentLotType === "singles" ? null : resolveDefaultSaleUnitPrice(context as never, normalizedType);
  context.editingSale = null;
  context.newSale = {
    type: normalizedType,
    quantity: null,
    packsCount: null,
    singlesPurchaseEntryId: null,
    singlesItems: context.currentLotType === "singles" ? [createEmptySinglesSaleDraftLine()] : undefined,
    price: nextPrice,
    memo: "",
    buyerShipping: Number(context.sellingShippingPerOrder) || 0,
    date: getTodayDate()
  };
  if (context.currentLotType === "singles") {
    syncSinglesSaleDraftSummary(context);
  }
  context.showAddSaleModal = true;
  focusSaleQuantityInput(context as never);
}

export function openConvertedLiveSinglesSaleDraft(
  context: SalesDraftTarget,
  lines: SinglesSaleLine[],
  options?: { buyerShipping?: number; memo?: string; date?: string }
): void {
  if (context.currentLotType !== "singles") return;
  const normalizedLines = Array.isArray(lines)
    ? lines
      .map((line, index) => ({
        lineId: Date.now() + index,
        singlesPurchaseEntryId: normalizeSinglesPurchaseEntryId(line?.singlesPurchaseEntryId),
        quantity: normalizeWholeQuantity(line?.quantity) ?? 1,
        price: normalizeNonNegativePrice(line?.price) ?? 0
      }))
      .filter((line) => line.singlesPurchaseEntryId != null || line.price > 0)
    : [];
  if (normalizedLines.length === 0) return;
  const todayDate = getTodayDate();
  const buyerShipping = Number(options?.buyerShipping);
  context.editingSale = null;
  context.newSale = {
    type: "pack",
    quantity: null,
    packsCount: null,
    singlesPurchaseEntryId: null,
    singlesItems: normalizedLines,
    price: null,
    memo: typeof options?.memo === "string" ? options.memo.trim() : "",
    buyerShipping: Number.isFinite(buyerShipping) && buyerShipping >= 0
      ? buyerShipping
      : (Number(context.sellingShippingPerOrder) || 0),
    date: toDateOnly(options?.date) ?? todayDate
  };
  syncSinglesSaleDraftSummary(context);
  context.showAddSaleModal = true;
  focusSaleQuantityInput(context as never);
}

export function changeNewSaleType(context: SalesDraftTarget, type: SaleType): void {
  if (context.currentLotType === "singles") {
    context.newSale.type = "pack";
    return;
  }
  const nextType: SaleType = type === "box" || type === "rtyh" ? type : "pack";
  context.newSale.type = nextType;
  context.newSale.singlesPurchaseEntryId = null;
  context.newSale.singlesItems = undefined;
  if (context.editingSale) return;
  context.newSale.price = resolveDefaultSaleUnitPrice(context as never, nextType);
}

export function addSinglesSaleDraftLine(context: SalesDraftTarget): void {
  const lines = ensureDraftSinglesSaleLines(context);
  lines.push(createEmptySinglesSaleDraftLine());
  syncSinglesSaleDraftSummary(context);
}

export function removeSinglesSaleDraftLine(context: SalesDraftTarget, lineIndex: number): void {
  const lines = ensureDraftSinglesSaleLines(context);
  if (lineIndex < 0 || lineIndex >= lines.length) return;
  if (lines.length <= 1) {
    lines[0] = createEmptySinglesSaleDraftLine();
    syncSinglesSaleDraftSummary(context);
    return;
  }
  lines.splice(lineIndex, 1);
  syncSinglesSaleDraftSummary(context);
}

export function editSaleDraft(context: SalesDraftTarget, sale: Sale): void {
  context.editingSale = sale;
  const singlesItems = context.currentLotType === "singles" ? getDraftSinglesSaleLinesFromSale(sale) : undefined;
  context.newSale = {
    type: sale.type,
    quantity: sale.quantity,
    packsCount: sale.type === "rtyh" ? sale.packsCount : null,
    singlesPurchaseEntryId: normalizeSinglesPurchaseEntryId(sale.singlesPurchaseEntryId),
    singlesItems,
    price: sale.price,
    memo: sale.memo ?? "",
    buyerShipping: sale.buyerShipping ?? 0,
    date: toDateOnly(sale.date) ?? getTodayDate()
  };
  if (context.currentLotType === "singles") {
    syncSinglesSaleDraftSummary(context);
  }
  context.showAddSaleModal = true;
  focusSaleQuantityInput(context as never);
}

export function resetSaleDraft(context: SalesDraftTarget): void {
  context.showAddSaleModal = false;
  context.editingSale = null;
  context.newSale = {
    type: "pack",
    quantity: null,
    packsCount: null,
    singlesPurchaseEntryId: null,
    singlesItems: [createEmptySinglesSaleDraftLine()],
    price: 0,
    memo: "",
    buyerShipping: context.sellingShippingPerOrder,
    date: getTodayDate()
  };
}
