import Chart from "chart.js/auto";
import {
  calculateBoxPriceCostCad,
  calculateNetFromGross,
  calculateSparklineData,
  getGrossRevenueForSale
} from "../../domain/calculations.ts";
import { DEFAULT_VALUES } from "../../constants.ts";
import type {
  Sale,
  SaleType,
  SinglesPurchaseEntry,
  SinglesSaleDraftLine,
  SinglesSaleLine
} from "../../types/app.ts";
import type { AppContext, AppMethodState } from "../context.ts";
import { getTodayDate } from "./config-shared.ts";
import { toPositiveIntOrNull as normalizeSinglesPurchaseEntryId } from "../shared/singles-normalizers.ts";

function firstFiniteNonNegative(...values: Array<number | null | undefined>): number | null {
  for (const value of values) {
    const next = Number(value);
    if (Number.isFinite(next) && next >= 0) {
      return next;
    }
  }
  return null;
}

function resolveDefaultSaleUnitPrice(context: AppContext, type: SaleType): number {
  if (type === "box") {
    return firstFiniteNonNegative(context.liveBoxPriceSell, context.boxPriceSell) ?? 0;
  }
  if (type === "rtyh") {
    return firstFiniteNonNegative(context.liveSpotPrice, context.spotPrice) ?? 0;
  }
  return firstFiniteNonNegative(context.livePackPrice, context.packPrice) ?? 0;
}

const PORTFOLIO_CHART_COLORS = [
  "#34C759",
  "#5AC8FA",
  "#FFB800",
  "#AF52DE",
  "#FF9500",
  "#00C7BE",
  "#FF3B30",
  "#30B0C7"
];

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDateOnly(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  if (DATE_ONLY_REGEX.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return formatLocalDate(date);
}

function inferDateFromLotId(lotId: number): string | null {
  const timestamp = Number(lotId);
  if (!Number.isFinite(timestamp) || timestamp < 946684800000 || timestamp > 4102444800000) {
    return null;
  }
  return formatLocalDate(new Date(timestamp));
}

function getEarliestSaleDate(sales: Sale[]): string | null {
  let earliest: string | null = null;
  for (const sale of sales) {
    const dateKey = toDateOnly(sale.date);
    if (!dateKey) continue;
    if (!earliest || dateKey < earliest) {
      earliest = dateKey;
    }
  }
  return earliest;
}

function safeDestroyChart(chart: Chart | null): void {
  if (!chart) return;
  try {
    chart.stop();
    chart.destroy();
  } catch {
    // Ignore teardown errors from stale canvas/context during rapid UI toggles.
  }
}

function isSmallDisplay(context: AppContext): boolean {
  const vuetify = (context as unknown as { $vuetify?: { display?: { smAndDown?: boolean } } }).$vuetify;
  return Boolean(vuetify?.display?.smAndDown);
}

function refreshChartsForCurrentTab(context: AppContext): void {
  const runRefresh = () => {
    if (context.currentTab === "sales") {
      context.initSalesChart();
      return;
    }
    if (context.currentTab === "portfolio") {
      context.initPortfolioChart();
    }
  };

  const scheduleNextTick = (context as Partial<AppContext>).$nextTick;
  if (typeof scheduleNextTick === "function") {
    void scheduleNextTick.call(context, runRefresh);
    return;
  }
  runRefresh();
}

function focusSaleQuantityInput(context: AppContext): void {
  const scheduleNextTick = (context as Partial<AppContext>).$nextTick;
  const runFocus = () => {
    if (!context.$refs) return;
    const refs = context.$refs as {
      saleQuantityInput?:
        | HTMLInputElement
        | { focus?: () => void; $el?: Element | null }
        | null;
    };
    const quantityRef = refs.saleQuantityInput;
    if (!quantityRef) return;

    if (typeof quantityRef.focus === "function") {
      quantityRef.focus();
      return;
    }

    if (typeof quantityRef === "object" && quantityRef !== null && "$el" in quantityRef) {
      const input = quantityRef.$el?.querySelector("input");
      if (input instanceof HTMLInputElement) {
        input.focus();
      }
    }
  };

  if (typeof scheduleNextTick === "function") {
    void scheduleNextTick.call(context, runFocus);
    return;
  }

  runFocus();
}

function resolveCanvasRef(
  context: AppContext,
  windowRefName: "salesWindow" | "portfolioWindow",
  canvasRefName: string
): HTMLCanvasElement | null {
  if (!context.$refs) return null;
  const rootRefs = context.$refs as Record<string, unknown>;

  const direct = rootRefs[canvasRefName];
  if (direct instanceof HTMLCanvasElement) {
    return direct;
  }

  const windowComponent = rootRefs[windowRefName] as { $refs?: Record<string, unknown> } | undefined;
  const nested = windowComponent?.$refs?.[canvasRefName];
  if (nested instanceof HTMLCanvasElement) {
    return nested;
  }

  return null;
}

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

function createEmptySinglesSaleDraftLine(): SinglesSaleDraftLine {
  return {
    lineId: Date.now() + Math.floor(Math.random() * 1000),
    singlesPurchaseEntryId: null,
    quantity: 1,
    price: null
  };
}

function getDraftSinglesSaleLinesFromSale(sale: Sale | null | undefined): SinglesSaleDraftLine[] {
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

function ensureDraftSinglesSaleLines(context: AppContext): SinglesSaleDraftLine[] {
  if (!Array.isArray(context.newSale.singlesItems) || context.newSale.singlesItems.length === 0) {
    const seededLine: SinglesSaleDraftLine = {
      lineId: Date.now() + Math.floor(Math.random() * 1000),
      singlesPurchaseEntryId: normalizeSinglesPurchaseEntryId(context.newSale.singlesPurchaseEntryId),
      quantity: normalizeWholeQuantity(context.newSale.quantity) ?? 1,
      price: normalizeNonNegativePrice(context.newSale.price)
    };
    context.newSale.singlesItems = [seededLine];
    return context.newSale.singlesItems;
  }
  return context.newSale.singlesItems;
}

function normalizeDraftSinglesSaleLines(context: AppContext): SinglesSaleLine[] {
  const lines = ensureDraftSinglesSaleLines(context);
  return lines
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

function getLinkedQuantityMapForSinglesLines(lines: SinglesSaleLine[]): Map<number, number> {
  const quantities = new Map<number, number>();
  for (const line of lines) {
    const entryId = normalizeSinglesPurchaseEntryId(line.singlesPurchaseEntryId);
    const quantity = normalizeWholeQuantity(line.quantity);
    if (!entryId || !quantity) continue;
    quantities.set(entryId, (quantities.get(entryId) || 0) + quantity);
  }
  return quantities;
}

function getLinkedQuantityMapForSale(sale: Sale | null | undefined): Map<number, number> {
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

function calculateSinglesTargetLinePrice(
  context: AppContext,
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

function syncSinglesSaleDraftSummary(context: AppContext): void {
  const lines = ensureDraftSinglesSaleLines(context);
  const normalizedLines = normalizeDraftSinglesSaleLines(context);
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

function computeSinglesSaleLineMaxQuantity(context: AppContext, lineIndex: number): number | null {
  const lines = ensureDraftSinglesSaleLines(context);
  const line = lines[lineIndex];
  if (!line) return null;

  const selectedEntryId = normalizeSinglesPurchaseEntryId(line.singlesPurchaseEntryId);
  if (!selectedEntryId) return null;
  const selectedEntry = getSinglesPurchaseEntryById(context, selectedEntryId);
  if (!selectedEntry) return null;

  const totalQuantity = normalizeWholeQuantity(selectedEntry.quantity) ?? 0;
  const soldQuantity = getSinglesSoldQuantityForEntry(context, selectedEntryId);
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

function applySinglesSaleLineCardSelection(context: AppContext, lineIndex: number, value: number | null): void {
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
  const cappedQuantity = maxAllowed == null
    ? currentQuantity
    : Math.max(1, Math.min(currentQuantity, maxAllowed));
  line.quantity = cappedQuantity;
  line.price = calculateSinglesTargetLinePrice(context, selectedEntry, cappedQuantity);
  syncSinglesSaleDraftSummary(context);
}

function applySinglesSaleLineQuantityChange(context: AppContext, lineIndex: number, value?: unknown): void {
  const lines = ensureDraftSinglesSaleLines(context);
  const line = lines[lineIndex];
  if (!line) return;
  if (value !== undefined) {
    line.quantity = value as number;
  }

  const normalizedQuantity = normalizeWholeQuantity(line.quantity) ?? 1;
  const maxAllowed = computeSinglesSaleLineMaxQuantity(context, lineIndex);
  const cappedQuantity = maxAllowed == null
    ? normalizedQuantity
    : Math.max(1, Math.min(normalizedQuantity, maxAllowed));
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

function getSinglesPurchaseEntryById(context: AppContext, entryId: number): SinglesPurchaseEntry | null {
  return context.singlesPurchases.find((entry) => entry.id === entryId) ?? null;
}

function getSinglesSoldQuantityForEntry(context: AppContext, entryId: number): number {
  const soldMapQuantity = Math.max(
    0,
    Math.floor(Number(context.singlesSoldCountByPurchaseId?.[entryId]) || 0)
  );
  if (soldMapQuantity > 0) return soldMapQuantity;

  return (context.sales || []).reduce((sum, sale) => {
    if (Array.isArray(sale.singlesItems) && sale.singlesItems.length > 0) {
      const lineSum = sale.singlesItems.reduce((lineTotal, line) => {
        const linkedEntryId = normalizeSinglesPurchaseEntryId(line.singlesPurchaseEntryId);
        if (linkedEntryId !== entryId) return lineTotal;
        const quantity = normalizeWholeQuantity(line.quantity) ?? 0;
        return lineTotal + quantity;
      }, 0);
      return sum + lineSum;
    }

    const linkedEntryId = normalizeSinglesPurchaseEntryId(sale.singlesPurchaseEntryId);
    if (linkedEntryId !== entryId) return sum;
    const quantity = Math.max(0, Math.floor(Number(sale.quantity) || 0));
    return sum + quantity;
  }, 0);
}

export const salesMethods: ThisType<AppContext> & Pick<
  AppMethodState,
  | "loadSalesFromStorage"
  | "saveSalesToStorage"
  | "openAddSaleModal"
  | "onNewSaleTypeChange"
  | "onSinglesSaleCardSelectionChange"
  | "addSinglesSaleLine"
  | "removeSinglesSaleLine"
  | "onSinglesSaleLineCardSelectionChange"
  | "onSinglesSaleLineQuantityChange"
  | "onSinglesSaleLinePriceChange"
  | "getSinglesSaleLineMaxQuantity"
  | "saveSale"
  | "editSale"
  | "deleteSale"
  | "cancelSale"
  | "initSalesChart"
  | "initPortfolioChart"
> = {
  loadSalesFromStorage(): void {
    if (!this.currentLotId) return;

    try {
      this.sales = this.loadSalesForLotId(this.currentLotId);
    } catch (error) {
      console.error("Failed to load sales:", error);
      this.sales = [];
    }
  },

  saveSalesToStorage(): void {
    if (!this.currentLotId) return;

    try {
      const key = this.getSalesStorageKey(this.currentLotId);
      localStorage.setItem(key, JSON.stringify(this.sales));
    } catch (error) {
      console.error("Failed to save sales:", error);
    }
  },

  openAddSaleModal(saleType: SaleType = "pack"): void {
    const normalizedType: SaleType = this.currentLotType === "singles" ? "pack" : saleType;
    const nextPrice = this.currentLotType === "singles"
      ? null
      : resolveDefaultSaleUnitPrice(this, normalizedType);
    this.editingSale = null;
    this.newSale = {
      type: normalizedType,
      quantity: null,
      packsCount: null,
      singlesPurchaseEntryId: null,
      singlesItems: this.currentLotType === "singles" ? [createEmptySinglesSaleDraftLine()] : undefined,
      price: nextPrice,
      memo: "",
      buyerShipping: Number(this.sellingShippingPerOrder) || 0,
      date: getTodayDate()
    };
    if (this.currentLotType === "singles") {
      syncSinglesSaleDraftSummary(this);
    }
    this.showAddSaleModal = true;
    focusSaleQuantityInput(this);
  },

  onNewSaleTypeChange(type: SaleType): void {
    if (this.currentLotType === "singles") {
      this.newSale.type = "pack";
      return;
    }
    const nextType: SaleType = type === "box" || type === "rtyh" ? type : "pack";
    this.newSale.type = nextType;
    this.newSale.singlesPurchaseEntryId = null;
    this.newSale.singlesItems = undefined;
    if (this.editingSale) return;
    this.newSale.price = resolveDefaultSaleUnitPrice(this, nextType);
  },

  onSinglesSaleCardSelectionChange(value: number | null): void {
    if (this.currentLotType !== "singles") return;
    applySinglesSaleLineCardSelection(this, 0, value);
  },

  addSinglesSaleLine(): void {
    if (this.currentLotType !== "singles") return;
    const lines = ensureDraftSinglesSaleLines(this);
    lines.push(createEmptySinglesSaleDraftLine());
    syncSinglesSaleDraftSummary(this);
  },

  removeSinglesSaleLine(lineIndex: number): void {
    if (this.currentLotType !== "singles") return;
    const lines = ensureDraftSinglesSaleLines(this);
    if (lineIndex < 0 || lineIndex >= lines.length) return;
    if (lines.length <= 1) {
      lines[0] = createEmptySinglesSaleDraftLine();
      syncSinglesSaleDraftSummary(this);
      return;
    }
    lines.splice(lineIndex, 1);
    syncSinglesSaleDraftSummary(this);
  },

  getSinglesSaleLineMaxQuantity(lineIndex: number): number | null {
    if (this.currentLotType !== "singles") return null;
    return computeSinglesSaleLineMaxQuantity(this, lineIndex);
  },

  onSinglesSaleLineCardSelectionChange(lineIndex: number, value: number | null): void {
    if (this.currentLotType !== "singles") return;
    applySinglesSaleLineCardSelection(this, lineIndex, value);
  },

  onSinglesSaleLineQuantityChange(lineIndex: number, value?: unknown): void {
    if (this.currentLotType !== "singles") return;
    applySinglesSaleLineQuantityChange(this, lineIndex, value);
  },

  onSinglesSaleLinePriceChange(): void {
    if (this.currentLotType !== "singles") return;
    syncSinglesSaleDraftSummary(this);
  },

  saveSale(): void {
    if (!this.canUsePaidActions) {
      this.notify("Pro access required to add or update sales", "warning");
      return;
    }

    const buyerShipping = Number(this.newSale.buyerShipping);
    const memo = typeof this.newSale.memo === "string" ? this.newSale.memo.trim() : "";
    const rtyhPacks = Number(this.newSale.packsCount);
    const isSinglesLot = this.currentLotType === "singles";
    let editingIndex = -1;
    let quantity = Number(this.newSale.quantity);
    let price = Number(this.newSale.price);
    let singlesItems: SinglesSaleLine[] | undefined;
    let selectedSinglesPurchaseEntryId: number | null = null;

    if (!Number.isFinite(buyerShipping) || buyerShipping < 0) {
      this.notify("Please enter a valid buyer shipping amount (0 or greater)", "warning");
      return;
    }

    if (!isSinglesLot && this.newSale.type === "rtyh" && (!Number.isFinite(rtyhPacks) || rtyhPacks <= 0)) {
      this.notify("Please enter the number of items sold for RTYH", "warning");
      return;
    }

    if (this.editingSale) {
      editingIndex = this.sales.findIndex((s) => s.id === this.editingSale?.id);
      if (editingIndex === -1) {
        this.notify("Could not find the sale to update. Please try again.", "error");
        return;
      }
    }

    if (isSinglesLot) {
      singlesItems = normalizeDraftSinglesSaleLines(this);
      if (singlesItems.length === 0) {
        this.notify("Please add at least one item sale line.", "warning");
        return;
      }

      for (const line of singlesItems) {
        if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
          this.notify("Items sold must be a whole number.", "warning");
          return;
        }
        if (!Number.isFinite(line.price) || line.price < 0) {
          this.notify("Please enter a valid price (0 or greater)", "warning");
          return;
        }
        const lineEntryId = normalizeSinglesPurchaseEntryId(line.singlesPurchaseEntryId);
        if (!lineEntryId && line.price <= 0) {
          this.notify("Please enter a total price when no item is linked.", "warning");
          return;
        }
      }

      const previousLinkedQuantities = getLinkedQuantityMapForSale(this.editingSale);
      const requestedQuantities = getLinkedQuantityMapForSinglesLines(singlesItems);
      for (const [entryId, requestedQuantity] of requestedQuantities.entries()) {
        const selectedEntry = getSinglesPurchaseEntryById(this, entryId);
        if (!selectedEntry) {
          this.notify("Selected item is no longer available.", "warning");
          return;
        }
        const totalQuantity = normalizeWholeQuantity(selectedEntry.quantity) ?? 0;
        const soldQuantity = getSinglesSoldQuantityForEntry(this, entryId);
        const releasedQuantity = previousLinkedQuantities.get(entryId) || 0;
        const maxAllowed = Math.max(0, totalQuantity - soldQuantity + releasedQuantity);
        if (requestedQuantity > maxAllowed) {
          this.notify(`Quantity exceeds selected item stock (${maxAllowed} available).`, "warning");
          return;
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
        this.notify("Please enter a valid quantity greater than 0", "warning");
        return;
      }
      if (!Number.isFinite(price) || price < 0) {
        this.notify("Please enter a valid price (0 or greater)", "warning");
        return;
      }
    }

    const normalizedSaleType: SaleType = isSinglesLot ? "pack" : this.newSale.type;

    let packsCount: number;
    if (normalizedSaleType === "pack") {
      packsCount = quantity;
    } else if (normalizedSaleType === "box") {
      packsCount = quantity * this.packsPerBox;
    } else {
      packsCount = rtyhPacks;
    }

    const normalizedSaleDate = toDateOnly(this.newSale.date) ?? getTodayDate();

    const sale: Sale = {
      id: this.editingSale ? this.editingSale.id : Date.now(),
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

    if (this.editingSale) {
      this.sales.splice(editingIndex, 1, sale);
      this.sales = [...this.sales];
    } else {
      this.sales = [...this.sales, sale];
    }

    this.cancelSale();
    refreshChartsForCurrentTab(this);
  },

  editSale(sale: Sale): void {
    this.editingSale = sale;
    const singlesItems = this.currentLotType === "singles"
      ? getDraftSinglesSaleLinesFromSale(sale)
      : undefined;
    this.newSale = {
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
    if (this.currentLotType === "singles") {
      syncSinglesSaleDraftSummary(this);
    }
    this.showAddSaleModal = true;
    focusSaleQuantityInput(this);
  },

  deleteSale(id: number): void {
    this.askConfirmation(
      {
        title: "Delete Sale?",
        text: "This action cannot be undone.",
        color: "error"
      },
      () => {
        this.sales = this.sales.filter((s) => s.id !== id);
        this.notify("Sale deleted", "info");
        refreshChartsForCurrentTab(this);
      }
    );
  },

  cancelSale(): void {
    this.showAddSaleModal = false;
    this.editingSale = null;
    this.newSale = {
      type: "pack",
      quantity: null,
      packsCount: null,
      singlesPurchaseEntryId: null,
      singlesItems: [createEmptySinglesSaleDraftLine()],
      price: 0,
      memo: "",
      buyerShipping: this.sellingShippingPerOrder,
      date: getTodayDate()
    };
  },

  initSalesChart(): void {
    safeDestroyChart(this.salesChart);
    this.salesChart = null;

    const chartCanvas = this.chartView === "pie"
      ? resolveCanvasRef(this, "salesWindow", "salesChartCanvas")
      : resolveCanvasRef(this, "salesWindow", "salesTrendChart");
    if (!chartCanvas) return;
    const existingSalesChart = Chart.getChart(chartCanvas);
    if (existingSalesChart) {
      safeDestroyChart(existingSalesChart);
    }

    const ctx = chartCanvas.getContext("2d");
    if (!ctx) return;
    if (this.chartView !== "pie") {
      if (this.sales.length === 0) return;

      const sortedSales = [...this.sales].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const data = calculateSparklineData(this.sales, this.totalCaseCost, this.sellingTaxPercent);
      const labels = ["Start", ...sortedSales.map((sale) => this.formatDate(sale.date))];
      const finalValue = data[data.length - 1] ?? 0;
      const lineColor = finalValue > 0 ? "#34C759" : "#FF3B30";
      const fillColor = finalValue > 0 ? "rgba(52, 199, 89, 0.16)" : "rgba(255, 59, 48, 0.16)";

      this.salesChart = new Chart(ctx, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              data,
              borderColor: lineColor,
              backgroundColor: fillColor,
              borderWidth: 3,
              pointRadius: 0,
              pointHoverRadius: 3,
              tension: 0.3,
              fill: true
            }
          ]
        },
        options: {
          animation: false,
          responsive: true,
          maintainAspectRatio: false,
          layout: {
            padding: {
              top: 2,
              bottom: 2,
              left: 2,
              right: 2
            }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title(items: Array<{ dataIndex?: number }>) {
                  const index = Number(items?.[0]?.dataIndex ?? 0);
                  return labels[index] ?? "Sale";
                },
                label: (context) => `Progress: $${this.formatCurrency(Number(context.parsed?.y || 0))}`
              }
            }
          },
          scales: {
            x: {
              display: true,
              grid: { display: false },
              ticks: {
                autoSkip: true,
                maxTicksLimit: 5,
                maxRotation: 0
              }
            },
            y: {
              display: true,
              grid: { display: true, color: "rgba(255,255,255,0.08)" },
              ticks: {
                callback: (value) => `$${this.formatCurrency(Number(value), 0)}`
              }
            }
          }
        }
      });
      return;
    }

    const soldPacks = this.soldPacksCount;
    const totalPacks = this.totalPacks;
    const unsoldPacks = Math.max(0, totalPacks - soldPacks);
    const isSinglesLot = this.currentLotType === "singles";
    const soldNet = this.totalRevenue;
    const grossUnsold = unsoldPacks * (this.packPrice || 0);
    const unsoldNet = this.netFromGross(grossUnsold, this.sellingShippingPerOrder, unsoldPacks);

    const labels = isSinglesLot
      ? [
        `Sold items: ${soldPacks}`,
        `Remaining items: ${unsoldPacks}`
      ]
      : [
        `Sold (Net): $${this.formatCurrency(soldNet)} | ${soldPacks} items`,
        `Unsold (Net est.): $${this.formatCurrency(unsoldNet)} | ${unsoldPacks} items`
      ];
    const data = isSinglesLot
      ? [Math.max(0, soldPacks), Math.max(0, unsoldPacks)]
      : [Math.max(0, soldNet), Math.max(0, unsoldNet)];

    this.salesChart = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels,
        datasets: [
          {
            data,
            backgroundColor: ["#34C759", "#FF3B30"],
            borderWidth: 0
          }
        ]
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              padding: 15,
              font: { size: 12 }
            }
          },
          tooltip: {
            callbacks: {
              label(context: { label?: string }) {
                return context.label;
              }
            }
          }
        }
      }
    });
  },

  initPortfolioChart(): void {
    safeDestroyChart(this.portfolioChart);
    this.portfolioChart = null;

    if (this.currentTab !== "portfolio") return;

    const chartCanvas = resolveCanvasRef(this, "portfolioWindow", "portfolioChartCanvas");
    if (!chartCanvas) return;
    const existingPortfolioChart = Chart.getChart(chartCanvas);
    if (existingPortfolioChart) {
      safeDestroyChart(existingPortfolioChart);
    }

    const ctx = chartCanvas.getContext("2d");
    if (!ctx) return;

    if (this.portfolioChartView === "breakdown") {
      const rows = this.allLotPerformance.filter((row) => row.totalRevenue > 0);
      if (rows.length === 0) return;

      const compactLegend = isSmallDisplay(this);
      const labels = rows.map((row) => row.lotName);
      const data = rows.map((row) => row.totalRevenue);
      const colors = rows.map((_, index) => PORTFOLIO_CHART_COLORS[index % PORTFOLIO_CHART_COLORS.length]);

      this.portfolioChart = new Chart(ctx, {
        type: "doughnut",
        data: {
          labels,
          datasets: [
            {
              data,
              backgroundColor: colors,
              borderWidth: 0
            }
          ]
        },
        options: {
          animation: false,
          responsive: true,
          maintainAspectRatio: true,
          aspectRatio: 2,
          plugins: {
            legend: {
              position: compactLegend ? "right" : "bottom",
              labels: {
                padding: compactLegend ? 10 : 14,
                font: { size: compactLegend ? 11 : 12 },
                boxWidth: compactLegend ? 10 : 14
              }
            },
            tooltip: {
              callbacks: {
                label: (context) => {
                  const row = rows[context.dataIndex ?? 0];
                  if (!row) return String(context.label ?? "");
                  return `${row.lotName}: $${this.formatCurrency(row.totalRevenue)}`;
                }
              }
            }
          }
        }
      });
      return;
    }

    const selectedLotIdSet = new Set(this.portfolioSelectedLotIds);
    const filteredLots = this.lots.filter((lot) => selectedLotIdSet.has(lot.id));
    const lotById = new Map(filteredLots.map((lot) => [lot.id, lot]));
    const performanceByLotId = new Map(this.allLotPerformance.map((row) => [row.lotId, row]));
    const salesByLotId = new Map(
      filteredLots.map((lot) => [
        lot.id,
        this.currentLotId === lot.id ? this.sales : this.loadSalesForLotId(lot.id)
      ])
    );
    const labels: string[] = [];
    const values: number[] = [];
    const todayDate = getTodayDate();

    const netByDate = new Map<string, number>();
    const costByDate = new Map<string, number>();
    const soldByDate = new Map<string, number>();

    for (const lot of filteredLots) {
      const sales = salesByLotId.get(lot.id) ?? [];
      const performance = performanceByLotId.get(lot.id);
      if (!performance) continue;

      const lotCreatedDate =
        toDateOnly(lot.purchaseDate) ??
        toDateOnly(lot.createdAt) ??
        inferDateFromLotId(lot.id) ??
        getEarliestSaleDate(sales) ??
        todayDate;
      costByDate.set(lotCreatedDate, (costByDate.get(lotCreatedDate) ?? 0) - performance.totalCost);

      for (const sale of sales) {
        const lotFromMap = lotById.get(lot.id);
        if (!lotFromMap) continue;
        const saleDate = toDateOnly(sale.date);
        if (!saleDate) continue;
        const grossRevenue = getGrossRevenueForSale(sale);
        const netRevenue = calculateNetFromGross(
          grossRevenue,
          lotFromMap.sellingTaxPercent,
          sale.buyerShipping || 0,
          1
        );
        netByDate.set(saleDate, (netByDate.get(saleDate) ?? 0) + netRevenue);
        const soldUnits = Math.max(0, Number(sale.packsCount) || 0);
        if (soldUnits > 0) {
          soldByDate.set(saleDate, (soldByDate.get(saleDate) ?? 0) + soldUnits);
        }
      }
    }

    const sortedDates = [...new Set([...costByDate.keys(), ...netByDate.keys(), ...soldByDate.keys()])].sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime()
    );

    if (sortedDates.length === 0) return;

    if (this.portfolioChartView === "sellthrough") {
      const totalSelectedItems = filteredLots.reduce((sum, lot) => {
        const performance = performanceByLotId.get(lot.id);
        return sum + Math.max(0, Number(performance?.totalPacks) || 0);
      }, 0);
      if (totalSelectedItems <= 0) return;

      let cumulativeSold = 0;
      for (const date of sortedDates) {
        cumulativeSold += soldByDate.get(date) ?? 0;
        labels.push(this.formatDate(date));
        values.push((cumulativeSold / totalSelectedItems) * 100);
      }

      const maxValue = values.reduce((max, value) => Math.max(max, value), 0);
      const yMax = Math.max(100, Math.ceil(maxValue / 10) * 10);

      this.portfolioChart = new Chart(ctx, {
        type: "bar",
        data: {
          labels,
          datasets: [
            {
              label: "Sell-through %",
              data: values,
              backgroundColor: "rgba(247, 181, 0, 0.35)",
              borderColor: "#F7B500",
              borderWidth: 1.5,
              borderRadius: 4,
              maxBarThickness: 18
            }
          ]
        },
        options: {
          animation: false,
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (context) => `Sell-through: ${this.formatCurrency(Number(context.parsed?.y || 0), 1)}%`
              }
            }
          },
          scales: {
            x: { grid: { display: false } },
            y: {
              min: 0,
              max: yMax,
              ticks: {
                callback: (value) => `${this.formatCurrency(Number(value), 0)}%`
              }
            }
          }
        }
      });
      return;
    }

    let cumulativeProfit = 0;
    for (const date of sortedDates) {
      cumulativeProfit += (costByDate.get(date) ?? 0) + (netByDate.get(date) ?? 0);
      labels.push(this.formatDate(date));
      values.push(cumulativeProfit);
    }

    const targetProfit = filteredLots.reduce((sum, lot) => {
      const performance = performanceByLotId.get(lot.id);
      if (!performance) return sum;
      const lotTargetPercent = Math.max(0, Number(lot.targetProfitPercent) || 0);
      return sum + ((performance.totalCost || 0) * (lotTargetPercent / 100));
    }, 0);
    const targetValues = labels.map(() => targetProfit);

    const finalProfit = values[values.length - 1] ?? 0;
    const lineColor = finalProfit >= 0 ? "#34C759" : "#FF3B30";
    const fillColor = finalProfit >= 0 ? "rgba(52, 199, 89, 0.18)" : "rgba(255, 59, 48, 0.18)";

    this.portfolioChart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Actual cumulative P/L",
            data: values,
            borderColor: lineColor,
            backgroundColor: fillColor,
            borderWidth: 3,
            pointRadius: 2,
            tension: 0.25,
            fill: true
          },
          {
            label: "Target P/L",
            data: targetValues,
            borderColor: "#F7B500",
            backgroundColor: "transparent",
            borderWidth: 2,
            borderDash: [7, 5],
            pointRadius: 0,
            pointHoverRadius: 0,
            tension: 0,
            fill: false
          }
        ]
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            display: true,
            position: "top",
            labels: {
              boxWidth: 14,
              usePointStyle: true
            }
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const datasetLabel = String(context.dataset?.label || "Value");
                return `${datasetLabel}: $${this.formatCurrency(Number(context.parsed?.y || 0))}`;
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            ticks: {
              callback: (value) => `$${this.formatCurrency(Number(value), 0)}`
            }
          }
        }
      }
    });
  }
};
