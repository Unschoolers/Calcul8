import type {
    Sale,
    SaleType,
    SinglesSaleLine,
    SkippedWheelDeduction,
    WheelConfig
} from "../../types/app.ts";
import type { AppContext, AppMethodState } from "../context-app.ts";
import {
    getScopedWheelConfigsStorageKey,
    getScopedWheelSessionStorageKey
} from "../storageKeys.ts";
import { getActiveStorageScope } from "../workspace-scope.ts";
import { getTodayDate } from "./config-shared.ts";
import { initPortfolioCharts, initSalesChartDisplay } from "./sales-charts.ts";
import { buildSaleSaveResult } from "./sales-core.ts";
import {
    addSinglesSaleDraftLine,
    applySinglesSaleLineCardSelection,
    applySinglesSaleLineQuantityChange,
    changeNewSaleType,
    computeSinglesSaleLineMaxQuantity,
    editSaleDraft,
    openAddSaleDraft,
    openConvertedLiveSinglesSaleDraft,
    removeSinglesSaleDraftLine,
    resetSaleDraft,
    syncSinglesSaleDraftSummary
} from "./sales-draft.ts";
import {
    cacheAuthoritativeSales,
    canUseAuthoritativeSalesLiveApi,
    saveAuthoritativeSale
} from "./sales-live-api.ts";
import {
    deleteSaleWithPersistence,
    persistSaleLocally,
    saveSaleAuthoritatively,
    saveSaleWithPersistence
} from "./sales-persistence.ts";
import {
    refreshChartsForCurrentTab
} from "./sales-ui-helpers.ts";
import { normalizeWheelConfigs } from "../shared/normalize-wheel-config.ts";

export const salesMethods: ThisType<AppContext> & Pick<
  AppMethodState,
  | "loadSalesFromStorage"
  | "saveSalesToStorage"
  | "openAddSaleModal"
  | "openConvertLiveSinglesSaleModal"
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
  | "addWheelSaleToLot"
  | "loadWheelFromStorage"
  | "saveWheelConfigsToStorage"
  | "saveWheelSessionToStorage"
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
    openAddSaleDraft(this, saleType);
  },

  openConvertLiveSinglesSaleModal(
    lines: SinglesSaleLine[],
    options?: { buyerShipping?: number; memo?: string; date?: string }
  ): void {
    openConvertedLiveSinglesSaleDraft(this, lines, options);
  },

  onNewSaleTypeChange(type: SaleType): void {
    changeNewSaleType(this, type);
  },

  onSinglesSaleCardSelectionChange(value: number | null): void {
    if (this.currentLotType !== "singles") return;
    applySinglesSaleLineCardSelection(this, 0, value);
  },

  addSinglesSaleLine(): void {
    if (this.currentLotType !== "singles") return;
    addSinglesSaleDraftLine(this);
  },

  removeSinglesSaleLine(lineIndex: number): void {
    if (this.currentLotType !== "singles") return;
    removeSinglesSaleDraftLine(this, lineIndex);
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

    const currentLotId = this.currentLotId;
    const editingSaleId = this.editingSale?.id ?? null;
    const baseVersion = this.editingSale?.version ?? 0;
    saveSaleWithPersistence(this, {
      lotId: currentLotId,
      pendingSale: saveResult.sale,
      editingSaleId,
      editingIndex: saveResult.editingIndex,
      baseVersion
    }, {
      canUseAuthoritativeApi: canUseAuthoritativeSalesLiveApi,
      persistLocally: persistSaleLocally,
      refreshCharts: refreshChartsForCurrentTab,
      saveAuthoritatively: saveSaleAuthoritatively
    });
  },

  editSale(sale: Sale): void {
    editSaleDraft(this, sale);
  },

  deleteSale(id: number): void {
    deleteSaleWithPersistence(this, id);
  },

  cancelSale(): void {
    resetSaleDraft(this);
  },

  initSalesChart(): void {
    initSalesChartDisplay(this);
  },

  initPortfolioChart(): void {
    initPortfolioCharts(this);
  },

  addWheelSaleToLot(lotId: number, sale: Sale): void {
    try {
      if (this.currentLotId === lotId) {
        // Use the same persistence pipeline as regular sales (handles API + local)
        saveSaleWithPersistence(this, {
          lotId,
          pendingSale: sale,
          editingSaleId: null,
          editingIndex: -1,
          baseVersion: 0
        }, {
          canUseAuthoritativeApi: canUseAuthoritativeSalesLiveApi,
          persistLocally: (ctx, s) => { ctx.sales = [...ctx.sales, s]; },
          refreshCharts: refreshChartsForCurrentTab,
          saveAuthoritatively: saveSaleAuthoritatively
        });
      } else if (canUseAuthoritativeSalesLiveApi()) {
        void (async () => {
          try {
            const savedSale = await saveAuthoritativeSale(this, lotId, sale, 0);
            const nextSales = [...this.loadSalesForLotId(lotId), savedSale];
            cacheAuthoritativeSales(this, lotId, nextSales);
            this.notify("Wheel sale recorded", "success");
          } catch (error) {
            console.error("Failed to save wheel sale:", error);
            this.notify("Failed to save wheel sale", "error");
          }
        })();
        return;
      } else {
        // Different lot — persist to localStorage directly
        const storageKey = this.getSalesStorageKey(lotId);
        const raw = localStorage.getItem(storageKey);
        const existingSales: Sale[] = raw ? JSON.parse(raw) : [];
        existingSales.push(sale);
        localStorage.setItem(storageKey, JSON.stringify(existingSales));
      }

      this.notify(`Wheel sale recorded`, "success");
    } catch (error) {
      console.error("Failed to save wheel sale:", error);
      this.notify("Failed to save wheel sale", "error");
    }
  },

  loadWheelFromStorage(): void {
    const wheelSessionState = this as unknown as Record<string, unknown>;
    this.wheelConfigs = [];
    this.activeWheelConfigId = null;

    try {
      const raw = localStorage.getItem(getScopedWheelConfigsStorageKey(getActiveStorageScope(this)));
      if (raw) {
        const parsed = JSON.parse(raw) as WheelConfig[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.wheelConfigs = normalizeWheelConfigs(parsed, this.lots);
          this.activeWheelConfigId = this.wheelConfigs[0]?.id ?? null;
        }
      }
    } catch {
      // Ignore parse errors
    }

    this.wheelTotalSpins = 0;
    this.wheelSpinCounts = [];
    this.wheelLastResult = "";
    this.wheelSessionUpdatedAt = 0;
    this.wheelSessionLotSelections = {};
    this.wheelSkippedDeductions = [];
    wheelSessionState.wheelSessionNetRevenue = 0;
    wheelSessionState.wheelSessionCostAdjustment = 0;
    wheelSessionState.wheelFairnessHistory = [];
    wheelSessionState.wheelChaseTallyHistory = [];
    this.wheelCurrentAngle = 0;
    wheelSessionState.wheelLastResultColor = "rgb(var(--v-theme-primary))";

    try {
      const rawSession = localStorage.getItem(getScopedWheelSessionStorageKey(getActiveStorageScope(this)));
      if (rawSession) {
        const session = JSON.parse(rawSession) as Record<string, unknown>;
        if (session.activeWheelConfigId != null) {
          this.activeWheelConfigId = session.activeWheelConfigId as number;
        }
        if (typeof session.wheelTotalSpins === "number") {
          this.wheelTotalSpins = session.wheelTotalSpins;
        }
        if (Array.isArray(session.wheelSpinCounts)) {
          this.wheelSpinCounts = session.wheelSpinCounts as number[];
        }
        if (typeof session.wheelLastResult === "string") {
          this.wheelLastResult = session.wheelLastResult;
        }
        if (typeof session.wheelSessionUpdatedAt === "number") {
          this.wheelSessionUpdatedAt = session.wheelSessionUpdatedAt;
        }
        if (Number.isFinite(Number(session.wheelSessionNetRevenue))) {
          wheelSessionState.wheelSessionNetRevenue = Number(session.wheelSessionNetRevenue) || 0;
        }
        if (Number.isFinite(Number(session.wheelSessionCostAdjustment))) {
          wheelSessionState.wheelSessionCostAdjustment = Number(session.wheelSessionCostAdjustment) || 0;
        }
        if (Array.isArray(session.wheelFairnessHistory)) {
          wheelSessionState.wheelFairnessHistory = session.wheelFairnessHistory.slice(-20);
        }
        if (Array.isArray(session.wheelChaseTallyHistory)) {
          wheelSessionState.wheelChaseTallyHistory = session.wheelChaseTallyHistory;
        }
        if (session.wheelSessionLotSelections && typeof session.wheelSessionLotSelections === "object") {
          this.wheelSessionLotSelections = session.wheelSessionLotSelections as Record<string, number | null>;
        }
        if (Array.isArray(session.wheelSkippedDeductions)) {
          this.wheelSkippedDeductions = session.wheelSkippedDeductions as SkippedWheelDeduction[];
        }
        if (Number.isFinite(Number(session.wheelCurrentAngle))) {
          this.wheelCurrentAngle = Number(session.wheelCurrentAngle) || 0;
        }
        if (typeof session.wheelLastResultColor === "string" && session.wheelLastResultColor.trim()) {
          wheelSessionState.wheelLastResultColor = session.wheelLastResultColor;
        }
      }
    } catch {
      // Ignore parse errors
    }
  },

  saveWheelConfigsToStorage(): void {
    try {
      localStorage.setItem(
        getScopedWheelConfigsStorageKey(getActiveStorageScope(this)),
        JSON.stringify(this.wheelConfigs)
      );
    } catch {
      // Storage full or unavailable
    }
  },

  saveWheelSessionToStorage(): void {
    try {
      const wheelSessionState = this as unknown as Record<string, unknown>;
      const storageKey = getScopedWheelSessionStorageKey(getActiveStorageScope(this));
      let preserved: Record<string, unknown> = {};
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw) as Record<string, unknown>;
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            preserved = parsed;
          }
        }
      } catch {
        preserved = {};
      }
      const session = {
        ...preserved,
        activeWheelConfigId: this.activeWheelConfigId,
        wheelTotalSpins: this.wheelTotalSpins,
        wheelSpinCounts: this.wheelSpinCounts,
        wheelLastResult: this.wheelLastResult,
        wheelSessionUpdatedAt: this.wheelSessionUpdatedAt,
        wheelSessionLotSelections: this.wheelSessionLotSelections,
        wheelSkippedDeductions: this.wheelSkippedDeductions,
        wheelSessionNetRevenue: wheelSessionState.wheelSessionNetRevenue ?? preserved.wheelSessionNetRevenue ?? 0,
        wheelSessionCostAdjustment: wheelSessionState.wheelSessionCostAdjustment ?? preserved.wheelSessionCostAdjustment ?? 0,
        wheelFairnessHistory: wheelSessionState.wheelFairnessHistory ?? preserved.wheelFairnessHistory ?? [],
        wheelChaseTallyHistory: wheelSessionState.wheelChaseTallyHistory ?? preserved.wheelChaseTallyHistory ?? [],
        wheelCurrentAngle: this.wheelCurrentAngle ?? preserved.wheelCurrentAngle ?? 0,
        wheelLastResultColor: wheelSessionState.wheelLastResultColor
          ?? preserved.wheelLastResultColor
          ?? "rgb(var(--v-theme-primary))"
      };
      localStorage.setItem(
        storageKey,
        JSON.stringify(session)
      );
    } catch {
      // Storage full or unavailable
    }
  }
};

