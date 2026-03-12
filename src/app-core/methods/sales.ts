import Chart from "chart.js/auto";
import { calculateBoxPriceCostCad } from "../../domain/calculations.ts";
import { DEFAULT_VALUES } from "../../constants.ts";
import type {
  Sale,
  SaleType,
  SinglesPurchaseEntry,
  SinglesSaleDraftLine
} from "../../types/app.ts";
import type { AppContext, AppMethodState } from "../context.ts";
import { getTodayDate, toDateOnly } from "./config-shared.ts";
import { toPositiveIntOrNull as normalizeSinglesPurchaseEntryId } from "../shared/singles-normalizers.ts";
import {
  buildSaleSaveResult,
  createEmptySinglesSaleDraftLine,
  getDraftSinglesSaleLinesFromSale,
  getLinkedQuantityMapForSale,
  getSinglesSoldQuantityForEntry,
  normalizeDraftSinglesSaleLines
} from "./sales-core.ts";
import {
  buildPortfolioBreakdownChartConfig,
  buildPortfolioMarginChartConfig,
  buildPortfolioHistoryChartConfig,
  buildSalesPieChartConfig,
  buildSalesTrendChartConfig
} from "./sales-chart-config.ts";

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

function safeDestroyChart(chart: { stop: () => void; destroy: () => void } | null): void {
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

function formatCompactChartDate(value: string): string {
  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = dateOnlyMatch
    ? new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric"
  }).format(date);
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
  const normalizedLines = normalizeDraftSinglesSaleLines(context.newSale);
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
    const saveResult = buildSaleSaveResult({
      canUsePaidActions: this.canUsePaidActions,
      currentLotType: this.currentLotType,
      sales: this.sales,
      editingSale: this.editingSale,
      newSale: this.newSale,
      packsPerBox: this.packsPerBox,
      singlesPurchases: this.singlesPurchases,
      singlesSoldCountByPurchaseId: this.singlesSoldCountByPurchaseId,
      todayDate: getTodayDate()
    });
    if (saveResult.ok === false) {
      this.notify(saveResult.message, saveResult.color);
      return;
    }

    if (this.editingSale) {
      this.sales.splice(saveResult.editingIndex, 1, saveResult.sale);
      this.sales = [...this.sales];
    } else {
      this.sales = [...this.sales, saveResult.sale];
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
      const trendConfig = buildSalesTrendChartConfig({
        sales: this.sales,
        totalCaseCost: this.totalCaseCost,
        sellingTaxPercent: this.sellingTaxPercent,
        formatCurrency: (value, decimals) => this.formatCurrency(value, decimals),
        formatDate: (value) => this.formatDate(value),
        formatCompactDate: (value) => formatCompactChartDate(value)
      });
      if (!trendConfig) return;
      this.salesChart = new Chart(ctx, trendConfig);
      return;
    }

    const soldPacks = this.soldPacksCount;
    const totalPacks = this.totalPacks;
    const unsoldPacks = Math.max(0, totalPacks - soldPacks);
    const soldNet = this.totalRevenue;
    const grossUnsold = unsoldPacks * (this.packPrice || 0);
    const unsoldNet = this.netFromGross(grossUnsold, this.sellingShippingPerOrder, unsoldPacks);
    this.salesChart = new Chart(ctx, buildSalesPieChartConfig({
      soldPacks,
      totalPacks,
      currentLotType: this.currentLotType,
      soldNet,
      unsoldNet,
      formatCurrency: (value, decimals) => this.formatCurrency(value, decimals),
      compactMode: isSmallDisplay(this)
    }));
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
      const breakdownConfig = buildPortfolioBreakdownChartConfig({
        rows: this.allLotPerformance,
        compactLegend: isSmallDisplay(this),
        formatCurrency: (value, decimals) => this.formatCurrency(value, decimals)
      });
      if (!breakdownConfig) return;
      this.portfolioChart = new Chart(ctx, breakdownConfig);
      return;
    }

    if (this.portfolioChartView === "margin") {
      const marginConfig = buildPortfolioMarginChartConfig({
        rows: this.allLotPerformance,
        compactMode: isSmallDisplay(this),
        formatCurrency: (value, decimals) => this.formatCurrency(value, decimals)
      });
      if (!marginConfig) return;
      this.portfolioChart = new Chart(ctx, marginConfig);
      return;
    }

    const selectedLotIdSet = new Set(this.portfolioSelectedLotIds);
    const filteredLots = this.lots.filter((lot) => selectedLotIdSet.has(lot.id));
    const salesByLotId = new Map(
      filteredLots.map((lot) => [
        lot.id,
        this.currentLotId === lot.id ? this.sales : this.loadSalesForLotId(lot.id)
      ])
    );
    const historyConfig = buildPortfolioHistoryChartConfig({
      portfolioChartView: this.portfolioChartView,
      filteredLots,
      allLotPerformance: this.allLotPerformance,
      salesByLotId,
      formatCurrency: (value, decimals) => this.formatCurrency(value, decimals),
      formatDate: (value) => this.formatDate(value),
      formatCompactDate: (value) => formatCompactChartDate(value),
      compactMode: isSmallDisplay(this),
      todayDate: getTodayDate()
    });
    if (!historyConfig) return;
    if (historyConfig.type === "bar") {
      this.portfolioChart = new Chart(ctx, historyConfig);
      return;
    }
    this.portfolioChart = new Chart(ctx, historyConfig);
  }
};
