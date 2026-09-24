import type {
    Lot,
    Sale,
    SaleType,
    SinglesSaleLine,
    WheelConfig
} from "../../types/app.ts";
import type { SalesMethodImplementation } from "../context/commerce.ts";
import { getScopedWheelConfigsStorageKey } from "../storageKeys.ts";
import { captureWorkspaceScopeGuard, getActiveStorageScope } from "../workspace-scope.ts";
import { getTodayDate } from "./config-shared.ts";
import { calculateNetFromGross, getGrossRevenueForSale } from "../../domain/calculations.ts";
import { resolveEffectiveWhatnotFeeInput, summarizeWhatnotFeePeriod } from "../shared/whatnot-fee-summary.ts";
import { hydrateMissingWhatnotScopeSales } from "./whatnot-fee-hydration.ts";
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
    fetchAuthoritativeSales,
    saveAuthoritativeSale
} from "./lot-sales-api.ts";
import { canUseAuthoritativeSalesLiveApi } from "./entity-api-shared.ts";
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
import { restoreStoredWheelConfigSelection } from "../shared/wheel-config-selection.ts";
import { upsertById } from "../shared/collection-updaters.ts";
import { persistSalesCacheToStorage } from "../shared/sales-cache-storage.ts";
import { cacheRootLotSales, replaceRootLotSales } from "../shared/sales-root-state.ts";
import {
  clearStorageReadFailure,
  clearStorageWriteFailure,
  markStorageReadFailure,
  markStorageWriteFailure
} from "../storage-health.ts";

export const salesMethods = {
  loadSalesFromStorage(): void {
    if (!this.currentLotId) return;

    try {
      this.sales = this.loadSalesForLotId(this.currentLotId);
    } catch (error) {
      console.error("Failed to load sales:", error);
      this.sales = [];
    }
  },

  getAllSalesByLotId(lotIds: number[] | null = null): Map<number, Sale[]> {
    const targetLotIds = Array.isArray(lotIds) && lotIds.length > 0
      ? lotIds
      : this.lots.map((lot) => lot.id);
    const uniqueLotIds = Array.from(new Set(
      targetLotIds
        .map((lotId) => Number(lotId))
        .filter((lotId) => Number.isFinite(lotId) && lotId > 0)
    ));

    return new Map(
      uniqueLotIds.map((lotId) => [
        lotId,
        this.currentLotId === lotId
          ? [...this.sales]
          : this.loadSalesForLotId(lotId)
      ] as const)
    );
  },

  saveSalesToStorage(): void {
    if (!this.currentLotId) return;

    const scope = getActiveStorageScope(this);
    const storageKey = this.getSalesStorageKey(this.currentLotId);
    try {
      persistSalesCacheToStorage(this, this.currentLotId, this.sales);
      // Keep the root cache in sync without reassigning `sales` from inside the `sales` watcher.
      cacheRootLotSales(this, this.currentLotId, this.sales);
      clearStorageWriteFailure(this, scope, storageKey);
    } catch (error) {
      console.error("Failed to save sales:", error);
      if (markStorageWriteFailure(this, scope, storageKey)) {
        this.notify("Could not save sales. Storage may be full.", "error");
      }
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

  onSinglesSaleLineQuantityChange(lineIndex: number, value?: number | string | null): void {
    if (this.currentLotType !== "singles") return;
    applySinglesSaleLineQuantityChange(this, lineIndex, value);
  },

  onSinglesSaleLinePriceChange(): void {
    if (this.currentLotType !== "singles") return;
    syncSinglesSaleDraftSummary(this);
  },

  saveSale(): void {
    type ActivePricingSnapshot = Partial<Pick<Lot,
      "feeProfilePreset" | "platformFeePercent" | "additionalFeePercent" | "additionalFeeAppliesTo"
      | "fixedFeePerOrder" | "whatnotVertical" | "sellingTaxPercent" | "sellingCurrency" | "exchangeRate"
    >>;
    const activePricing = this as typeof this & ActivePricingSnapshot;
    const lotRecord = (this.lots || []).find((lot) => lot.id === this.currentLotId);
    const currentLot = lotRecord ? {
      ...lotRecord,
      feeProfilePreset: activePricing.feeProfilePreset ?? lotRecord.feeProfilePreset,
      platformFeePercent: activePricing.platformFeePercent ?? lotRecord.platformFeePercent,
      additionalFeePercent: activePricing.additionalFeePercent ?? lotRecord.additionalFeePercent,
      additionalFeeAppliesTo: activePricing.additionalFeeAppliesTo ?? lotRecord.additionalFeeAppliesTo,
      fixedFeePerOrder: activePricing.fixedFeePerOrder ?? lotRecord.fixedFeePerOrder,
      whatnotVertical: activePricing.whatnotVertical ?? lotRecord.whatnotVertical,
      sellingTaxPercent: activePricing.sellingTaxPercent ?? lotRecord.sellingTaxPercent,
      sellingCurrency: activePricing.sellingCurrency ?? lotRecord.sellingCurrency,
      exchangeRate: activePricing.exchangeRate ?? lotRecord.exchangeRate
    } : undefined;
    const saveResult = buildSaleSaveResult({
      canUsePaidActions: this.canUsePaidActions,
      currentLotType: this.currentLotType,
      isWhatnotLot: currentLot?.feeProfilePreset === "whatnot",
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

    const pendingSale = saveResult.sale;
    const previousSale = this.editingSale;
    const isImportedSale = Boolean(previousSale?.externalProvider || previousSale?.externalSaleId || previousSale?.externalOrderId
      || previousSale?.externalTransactionRefs?.length);
    const isFinancialOrDateEdit = Boolean(previousSale && (
      previousSale.price !== pendingSale.price || previousSale.quantity !== pendingSale.quantity
      || previousSale.buyerShipping !== pendingSale.buyerShipping || previousSale.type !== pendingSale.type
      || previousSale.date !== pendingSale.date
      || (previousSale.type !== "wheel" && Boolean(previousSale.priceIsTotal) !== Boolean(pendingSale.priceIsTotal))
    ));
    const shouldSnapshot = !isImportedSale && pendingSale.type !== "wheel" && (
      (!previousSale && currentLot?.feeProfilePreset === "whatnot")
      || (isFinancialOrDateEdit && (previousSale?.wasWhatnotSale === true
        || (previousSale?.wasWhatnotSale !== false && currentLot?.feeProfilePreset === "whatnot")))
    );
    let provisionalSnapshotDeferred = false;
    if (shouldSnapshot && currentLot) {
      const lots = (this.lots || []).map((lot) => lot.id === currentLot.id ? currentLot : lot);
      const missingLotIds = typeof this.getSalesCacheEntry === "function"
        ? lots.filter((lot) => this.getSalesCacheEntry(lot.id).status !== "loaded").map((lot) => lot.id)
        : [];
      if (missingLotIds.length > 0 && !this.isOffline && canUseAuthoritativeSalesLiveApi()) {
        hydrateMissingWhatnotScopeSales(this);
        this.notify("Sales history is still loading. Your sale was not saved; try again when history finishes loading.", "warning");
        return;
      }
      let salesByLotId = new Map<number, Sale[]>();
      try {
        salesByLotId = typeof this.getAllSalesByLotId === "function"
          ? this.getAllSalesByLotId() as Map<number, Sale[]>
          : new Map([[currentLot.id, [...(this.sales || [])]]]);
      } catch {
        salesByLotId = new Map([[currentLot.id, [...(this.sales || [])]]]);
      }
      if (previousSale) {
        const activeLotSales = salesByLotId.get(currentLot.id) ?? [];
        salesByLotId.set(currentLot.id, activeLotSales.filter((sale) => sale.id !== previousSale.id));
      }
      const summary = summarizeWhatnotFeePeriod({
        lots,
        salesByLotId,
        dateOnly: pendingSale.date,
        missingLotIds
      });
      if (missingLotIds.length > 0) {
        // A partial tracked tier must not become a durable historical snapshot.
        delete pendingSale.netRevenue;
        provisionalSnapshotDeferred = true;
      } else {
        const feeLot = pendingSale.wasWhatnotSale
          ? { ...currentLot, feeProfilePreset: "whatnot" as const }
          : currentLot;
        const feeInput = resolveEffectiveWhatnotFeeInput(feeLot, summary);
        pendingSale.netRevenue = calculateNetFromGross(
          getGrossRevenueForSale(pendingSale),
          currentLot.sellingTaxPercent,
          pendingSale.buyerShipping,
          1,
          feeInput
        );
      }
      pendingSale.wasWhatnotSale = true;
    }

    const currentLotId = this.currentLotId;
    const editingSaleId = this.editingSale?.id ?? null;
    const baseVersion = this.editingSale?.version ?? 0;
    saveSaleWithPersistence(this, {
      lotId: currentLotId,
      pendingSale,
      editingSaleId,
      editingIndex: saveResult.editingIndex,
      baseVersion
    }, {
      canUseAuthoritativeApi: canUseAuthoritativeSalesLiveApi,
      persistLocally: persistSaleLocally,
      refreshCharts: refreshChartsForCurrentTab,
      saveAuthoritatively: saveSaleAuthoritatively
    });
    if (provisionalSnapshotDeferred) {
      this.notify("Sale saved, but Whatnot history is incomplete. Change the sale price or date after history loads to refresh its net revenue estimate.", "warning");
    }
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

  async addWheelSaleToLot(lotId: number, sale: Sale): Promise<boolean> {
    const isCurrentScope = captureWorkspaceScopeGuard(this);
    try {
      if (canUseAuthoritativeSalesLiveApi()) {
        let savedSale: Sale;
        try {
          savedSale = await saveAuthoritativeSale(this, lotId, sale, 0);
        } catch (error) {
          if (!isCurrentScope()) return false;
          // A previous write may have succeeded while its response was lost.
          const latest = await fetchAuthoritativeSales(this, lotId).catch(() => null);
          if (!isCurrentScope()) return false;
          const existing = latest?.find(entry => entry.id === sale.id && entry.mutationId === `wheel-sale:${sale.id}`);
          if (!existing) throw error;
          savedSale = existing;
        }
        if (!isCurrentScope()) return false;
        const sales = upsertById(
          this.currentLotId === lotId ? this.sales : this.loadSalesForLotId(lotId), savedSale
        );
        replaceRootLotSales(this, lotId, sales);
        try {
          cacheAuthoritativeSales(this, lotId, sales);
        } catch {
          // The authoritative write succeeded; a cache failure must not cause another sale.
          this.notify("Wheel sale saved in the cloud, but its local cache could not be updated.", "warning");
        }
      } else {
        const sales = upsertById(
          this.currentLotId === lotId ? this.sales : this.loadSalesForLotId(lotId), sale
        );
        persistSalesCacheToStorage(this, lotId, sales);
        replaceRootLotSales(this, lotId, sales);
      }
      if (this.currentLotId === lotId) refreshChartsForCurrentTab(this);
      this.notify("Wheel sale recorded", "success");
      return true;
    } catch (error) {
      if (isCurrentScope()) this.notify("Failed to save wheel sale", "error");
      return false;
    }
  },

  loadWheelFromStorage(): void {
    this.wheelConfigs = [];
    this.activeWheelConfigId = null;

    const storageScope = getActiveStorageScope(this);
    const configsStorageKey = getScopedWheelConfigsStorageKey(storageScope);
    try {
      const raw = localStorage.getItem(configsStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as WheelConfig[];
        if (!Array.isArray(parsed)) {
          throw new Error("Stored wheel configuration must be an array.");
        }
        if (parsed.length > 0) {
          this.wheelConfigs = normalizeWheelConfigs(parsed, this.lots);
          this.activeWheelConfigId = restoreStoredWheelConfigSelection(localStorage, storageScope, this.wheelConfigs);
        }
      }
      clearStorageReadFailure(this, storageScope, configsStorageKey);
    } catch {
      if (markStorageReadFailure(this, storageScope, configsStorageKey)) {
        this.notify("Local wheel configuration is damaged. Cloud recovery will be attempted.", "warning");
      }
    }

  },

  saveWheelConfigsToStorage(): void {
    const storageScope = getActiveStorageScope(this);
    const storageKey = getScopedWheelConfigsStorageKey(storageScope);
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify(this.wheelConfigs)
      );
      clearStorageWriteFailure(this, storageScope, storageKey);
    } catch {
      if (markStorageWriteFailure(this, storageScope, storageKey)) {
        this.notify("Could not save wheel configuration. Storage may be full.", "error");
      }
    }
  }
} satisfies SalesMethodImplementation;
