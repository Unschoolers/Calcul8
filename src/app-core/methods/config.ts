import { DEFAULT_VALUES } from "../../constants.ts";
import {
  calculateDefaultSellingPrices,
  calculateNetFromGross,
  calculatePriceForUnits as calculateUnitPrice,
  calculateProfitForListing
} from "../../domain/calculations.ts";
import type { Preset, PresetSetup, Sale } from "../../types/app.ts";
import type { AppContext, AppMethodState } from "../context.ts";

type ImportablePreset = Preset & { sales?: Sale[] };
type ExchangeRateCacheRecord = {
  cadRate: number;
  fetchedAt: number;
};

const EXCHANGE_RATE_CACHE_KEY = "whatfees_exchange_rate_usd_cad_v1";
const EXCHANGE_RATE_CACHE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}

function isValidDateOnly(value: unknown): value is string {
  return typeof value === "string" && DATE_ONLY_REGEX.test(value);
}

function toDateOnly(value: unknown): string | null {
  if (isValidDateOnly(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().split("T")[0];
}

function inferDateFromPresetId(presetId: number): string | null {
  const timestamp = Number(presetId);
  // Millisecond timestamp roughly between 2000 and 2100.
  if (!Number.isFinite(timestamp) || timestamp < 946684800000 || timestamp > 4102444800000) {
    return null;
  }
  return new Date(timestamp).toISOString().split("T")[0];
}

function isExchangeRateCacheRecord(value: unknown): value is ExchangeRateCacheRecord {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { cadRate?: unknown; fetchedAt?: unknown };
  const cadRate = Number(candidate.cadRate);
  const fetchedAt = Number(candidate.fetchedAt);
  return Number.isFinite(cadRate) && cadRate > 0 && Number.isFinite(fetchedAt) && fetchedAt > 0;
}

function readExchangeRateCache(): ExchangeRateCacheRecord | null {
  try {
    const raw = localStorage.getItem(EXCHANGE_RATE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isExchangeRateCacheRecord(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeExchangeRateCache(cadRate: number, fetchedAt: number): void {
  try {
    const payload: ExchangeRateCacheRecord = { cadRate, fetchedAt };
    localStorage.setItem(EXCHANGE_RATE_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore localStorage write errors (e.g. quota exceeded/private mode restrictions).
  }
}

function sanitizeTsvCell(value: string | number | null | undefined): string {
  if (value == null) return "";
  return String(value).replace(/[\t\r\n]+/g, " ").trim();
}

function fallbackCopyToClipboard(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  let success = false;
  try {
    success = document.execCommand("copy");
  } catch {
    success = false;
  } finally {
    document.body.removeChild(textarea);
  }
  return success;
}

function buildPortfolioReportTsv(context: AppContext): string {
  const exportedAt = new Date().toISOString();
  const totals = context.portfolioTotals;
  const lines: string[] = [
    `Report\t${sanitizeTsvCell("WhatFees Portfolio")}`,
    `Exported At\t${sanitizeTsvCell(exportedAt)}`,
    "",
    "Section\tPreset Count\tProfitable Presets\tSales Count\tTotal Revenue\tTotal Cost\tTotal Profit",
    `Totals\t${totals.presetCount}\t${totals.profitablePresetCount}\t${totals.totalSalesCount}\t${context.formatCurrency(totals.totalRevenue)}\t${context.formatCurrency(totals.totalCost)}\t${context.formatCurrency(totals.totalProfit)}`,
    "",
    "Preset\tSales\tSold Packs\tTotal Packs\tRevenue\tCost\tProfit\tMargin %\tLast Sale"
  ];

  for (const row of context.allPresetPerformance) {
    lines.push(
      [
        sanitizeTsvCell(row.presetName),
        row.salesCount,
        row.soldPacks,
        row.totalPacks,
        context.formatCurrency(row.totalRevenue),
        context.formatCurrency(row.totalCost),
        context.formatCurrency(row.totalProfit),
        row.marginPercent == null ? "" : context.formatCurrency(row.marginPercent, 2),
        row.lastSaleDate ? sanitizeTsvCell(context.formatDate(row.lastSaleDate)) : ""
      ].join("\t")
    );
  }

  return lines.join("\n");
}

export const configMethods: ThisType<AppContext> & Pick<
  AppMethodState,
  | "getSalesStorageKey"
  | "loadSalesForPresetId"
  | "netFromGross"
  | "getExchangeRate"
  | "loadPresetsFromStorage"
  | "savePresetsToStorage"
  | "getCurrentSetup"
  | "autoSaveSetup"
  | "syncLivePricesFromDefaults"
  | "resetLivePrices"
  | "applyLivePricesToDefaults"
  | "createNewPreset"
  | "loadPreset"
  | "deleteCurrentPreset"
  | "exportPresets"
  | "exportSales"
  | "exportPortfolioReport"
  | "openPortfolioReportModal"
  | "copyPortfolioReportTable"
  | "importPresets"
  | "handleFileImport"
  | "calculateProfit"
  | "recalculateDefaultPrices"
  | "calculateOptimalPrices"
  | "onPurchaseConfigChange"
  | "calculatePriceForUnits"
> = {
  getSalesStorageKey(presetId: number): string {
    return `rtyh_sales_${presetId}`;
  },

  loadSalesForPresetId(presetId: number): Sale[] {
    try {
      const stored = localStorage.getItem(this.getSalesStorageKey(presetId));
      if (!stored) return [];
      const parsed = JSON.parse(stored) as Array<Sale & { buyerShipping?: number }>;
      return parsed.map((sale) => ({
        ...sale,
        buyerShipping: Number(sale.buyerShipping) || 0
      }));
    } catch {
      return [];
    }
  },

  netFromGross(grossRevenue: number, buyerShippingPerOrder = 0, orderCount = 1): number {
    return calculateNetFromGross(grossRevenue, this.sellingTaxPercent, buyerShippingPerOrder, orderCount);
  },

  async getExchangeRate(): Promise<void> {
    const now = Date.now();
    const cachedRate = readExchangeRateCache();

    if (cachedRate && now - cachedRate.fetchedAt < EXCHANGE_RATE_CACHE_DURATION_MS) {
      this.exchangeRate = cachedRate.cadRate;
      this.lastFetchTime = cachedRate.fetchedAt;
      return;
    }

    if (this.exchangeRate && this.lastFetchTime && now - this.lastFetchTime < EXCHANGE_RATE_CACHE_DURATION_MS) {
      return;
    }

    try {
      const response = await fetch("https://open.er-api.com/v6/latest/USD");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as { rates?: { CAD?: number } };
      const nextRate = Number(data?.rates?.CAD);

      if (Number.isFinite(nextRate) && nextRate > 0) {
        this.exchangeRate = nextRate;
        this.lastFetchTime = now;
        writeExchangeRateCache(nextRate, now);
        return;
      }

      throw new Error("Missing CAD rate in response payload");
    } catch (error) {
      if (cachedRate) {
        console.warn("Failed to refresh exchange rate, using cached rate:", error);
        this.exchangeRate = cachedRate.cadRate;
        this.lastFetchTime = cachedRate.fetchedAt;
        return;
      }
      console.warn("Failed to fetch exchange rate, using default:", error);
      this.exchangeRate = DEFAULT_VALUES.EXCHANGE_RATE;
    }
  },

  loadPresetsFromStorage(): void {
    try {
      const stored = localStorage.getItem("rtyh_presets");
      if (stored) {
        const parsed = JSON.parse(stored) as Preset[];
        const todayDate = getTodayDate();
        this.presets = parsed.map((preset) => ({
          ...preset,
          purchaseDate:
            toDateOnly(preset.purchaseDate) ??
            toDateOnly(preset.createdAt) ??
            inferDateFromPresetId(preset.id) ??
            todayDate,
          createdAt:
            toDateOnly(preset.createdAt) ??
            toDateOnly(preset.purchaseDate) ??
            inferDateFromPresetId(preset.id) ??
            todayDate
        }));
      }
    } catch (error) {
      console.error("Failed to load presets:", error);
      this.presets = [];
    }
  },

  savePresetsToStorage(): void {
    try {
      localStorage.setItem("rtyh_presets", JSON.stringify(this.presets));
    } catch (error) {
      console.error("Failed to save presets:", error);
      this.notify("Could not save presets. Storage may be full.", "error");
    }
  },

  getCurrentSetup(): PresetSetup {
    return {
      boxPriceCost: this.boxPriceCost,
      boxesPurchased: this.boxesPurchased,
      packsPerBox: this.packsPerBox,
      costInputMode: this.costInputMode,
      currency: this.currency,
      sellingCurrency: this.sellingCurrency,
      exchangeRate: this.exchangeRate,
      purchaseDate: this.purchaseDate,
      purchaseShippingCost: this.purchaseShippingCost,
      purchaseTaxPercent: this.purchaseTaxPercent,
      sellingTaxPercent: this.sellingTaxPercent,
      sellingShippingPerOrder: this.sellingShippingPerOrder,
      includeTax: this.includeTax,
      spotPrice: this.spotPrice,
      boxPriceSell: this.boxPriceSell,
      packPrice: this.packPrice,
      targetProfitPercent: this.targetProfitPercent
    };
  },

  autoSaveSetup(): void {
    if (!this.currentPresetId) return;
    const preset = this.presets.find((p) => p.id === this.currentPresetId);
    if (!preset) return;

    Object.assign(preset, this.getCurrentSetup());
    this.savePresetsToStorage();
  },

  syncLivePricesFromDefaults(): void {
    this.liveSpotPrice = this.spotPrice;
    this.liveBoxPriceSell = this.boxPriceSell;
    this.livePackPrice = this.packPrice;
  },

  resetLivePrices(): void {
    this.syncLivePricesFromDefaults();
    this.notify("Live prices reset to config defaults", "info");
  },

  applyLivePricesToDefaults(): void {
    if (!this.currentPresetId) {
      this.notify("Select a preset first", "warning");
      return;
    }

    this.spotPrice = Number(this.liveSpotPrice) || 0;
    this.boxPriceSell = Number(this.liveBoxPriceSell) || 0;
    this.packPrice = Number(this.livePackPrice) || 0;
    this.autoSaveSetup();
    this.notify("Live prices saved to config", "success");
  },

  createNewPreset(): void {
    const name = (this.newPresetName || "").trim();
    if (!name) return this.notify("Please enter a preset name", "warning");
    if (this.presets.some((p) => p.name === name)) return this.notify("A preset with this name already exists", "warning");

    const todayDate = getTodayDate();
    const newPreset = {
      id: Date.now(),
      name,
      createdAt: todayDate,
      ...this.getCurrentSetup()
    };
    this.presets.push(newPreset);
    this.savePresetsToStorage();

    this.currentPresetId = newPreset.id;
    this.loadPreset();
    this.newPresetName = "";
    this.showNewPresetModal = false;
    this.notify("Preset created", "success");
  },

  loadPreset(): void {
    if (!this.currentPresetId) return;

    const preset = this.presets.find((p) => p.id === this.currentPresetId);
    if (!preset) return;
    const todayDate = getTodayDate();

    this.boxPriceCost = preset.boxPriceCost ?? DEFAULT_VALUES.BOX_PRICE;
    this.boxesPurchased = preset.boxesPurchased ?? DEFAULT_VALUES.BOXES_PURCHASED;
    this.packsPerBox = preset.packsPerBox ?? DEFAULT_VALUES.PACKS_PER_BOX;
    this.costInputMode = preset.costInputMode ?? "perBox";
    this.currency = preset.currency ?? "CAD";
    this.sellingCurrency = preset.sellingCurrency ?? "CAD";
    this.exchangeRate = preset.exchangeRate ?? DEFAULT_VALUES.EXCHANGE_RATE;
    this.purchaseDate =
      toDateOnly(preset.purchaseDate) ??
      toDateOnly(preset.createdAt) ??
      inferDateFromPresetId(preset.id) ??
      todayDate;
    this.purchaseShippingCost = preset.purchaseShippingCost ?? DEFAULT_VALUES.PURCHASE_SHIPPING_COST;

    const legacyTax = preset.taxRatePercent;
    this.purchaseTaxPercent =
      preset.purchaseTaxPercent ??
      legacyTax ??
      DEFAULT_VALUES.PURCHASE_TAX_RATE_PERCENT;
    this.sellingTaxPercent =
      preset.sellingTaxPercent ??
      legacyTax ??
      DEFAULT_VALUES.SELLING_TAX_RATE_PERCENT;
    this.sellingShippingPerOrder = preset.sellingShippingPerOrder ?? DEFAULT_VALUES.SELLING_SHIPPING_PER_ORDER;
    this.includeTax = preset.includeTax ?? true;
    this.spotPrice = preset.spotPrice ?? DEFAULT_VALUES.SPOT_PRICE;
    this.boxPriceSell = preset.boxPriceSell ?? DEFAULT_VALUES.BOX_PRICE_SELL;
    this.packPrice = preset.packPrice ?? DEFAULT_VALUES.PACK_PRICE;
    const parsedTargetProfit = Number(preset.targetProfitPercent);
    if (!this.hasProAccess) {
      this.targetProfitPercent = 0;
    } else if (Number.isFinite(parsedTargetProfit) && parsedTargetProfit >= 0) {
      this.targetProfitPercent = parsedTargetProfit;
    } else {
      this.targetProfitPercent = 15;
    }

    this.syncLivePricesFromDefaults();
    this.loadSalesFromStorage();
    void this.$nextTick(() => {
      if (this.currentTab === "sales") {
        this.initSalesChart();
        return;
      }
      if (this.currentTab === "portfolio") {
        this.initPortfolioChart();
      }
    });
  },

  deleteCurrentPreset(): void {
    if (!this.currentPresetId) return;
    const preset = this.presets.find((p) => p.id === this.currentPresetId);
    if (!preset) return;
    const presetIdToDelete = preset.id;
    const linkedSalesCount = this.loadSalesForPresetId(presetIdToDelete).length;

    this.askConfirmation(
      {
        title: "Delete Preset?",
        text: linkedSalesCount > 0
          ? `Delete "${preset.name}" and ${linkedSalesCount} linked sale${linkedSalesCount === 1 ? "" : "s"} permanently?`
          : `Delete "${preset.name}" permanently?`,
        color: "error"
      },
      () => {
        this.presets = this.presets.filter((p) => p.id !== presetIdToDelete);
        try {
          localStorage.removeItem(this.getSalesStorageKey(presetIdToDelete));
          if (Number(localStorage.getItem("rtyh_last_preset_id")) === presetIdToDelete) {
            localStorage.removeItem("rtyh_last_preset_id");
          }
        } catch {
          // Ignore localStorage cleanup failures.
        }
        this.savePresetsToStorage();
        this.currentPresetId = null;
        this.notify("Preset deleted", "info");
      }
    );
  },

  exportPresets(): void {
    if (this.presets.length === 0) {
      this.notify("No presets to export", "warning");
      return;
    }

    const bundle = {
      version: 2,
      exportedAt: new Date().toISOString(),
      lastPresetId: this.currentPresetId ?? null,
      presets: this.presets.map((p) => ({
        ...p,
        sales: this.loadSalesForPresetId(p.id)
      }))
    };

    const dataStr = JSON.stringify(bundle, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `rtyh-bundle-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    this.notify("Presets exported", "success");
  },

  exportSales(): void {
    if (this.sales.length === 0) return this.notify("No sales to export", "warning");

    const dataStr = JSON.stringify(this.sales, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `rtyh-sales-${this.currentPresetId}-${Date.now()}.json`;
    link.click();

    URL.revokeObjectURL(url);
    this.notify("Sales exported", "success");
  },

  exportPortfolioReport(): void {
    this.openPortfolioReportModal();
  },

  openPortfolioReportModal(): void {
    if (!this.hasPortfolioData) {
      this.notify("No portfolio data yet", "warning");
      return;
    }
    this.showPortfolioReportModal = true;
  },

  async copyPortfolioReportTable(): Promise<void> {
    if (!this.hasPortfolioData) {
      this.notify("No portfolio data yet", "warning");
      return;
    }

    const tsv = buildPortfolioReportTsv(this);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(tsv);
      } else {
        const copied = fallbackCopyToClipboard(tsv);
        if (!copied) throw new Error("Clipboard copy fallback failed");
      }
      this.notify("Portfolio table copied. Paste into Sheets or Excel.", "success");
    } catch (error) {
      console.warn("Failed to copy portfolio table:", error);
      this.notify("Could not copy table. Please try again.", "error");
    }
  },

  importPresets(): void {
    this.$refs.fileInput?.click();
  },

  handleFileImport(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    const file = target?.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e: ProgressEvent<FileReader>) => {
      try {
        const raw = e.target?.result;
        if (typeof raw !== "string") {
          this.notify("Invalid file format. Please upload a valid JSON file.", "error");
          return;
        }
        const imported = JSON.parse(raw) as unknown;

        let presetsArr: ImportablePreset[] = [];
        let lastPresetId: number | null = null;

        if (Array.isArray(imported)) {
          presetsArr = imported as ImportablePreset[];
        } else if (imported && typeof imported === "object" && Array.isArray((imported as { presets?: unknown[] }).presets)) {
          const payload = imported as { presets: ImportablePreset[]; lastPresetId?: number | null };
          presetsArr = payload.presets;
          lastPresetId = payload.lastPresetId ?? null;
        } else {
          this.notify("Invalid file format. Please upload a valid JSON file.", "error");
          return;
        }

        if (presetsArr.length === 0) {
          this.notify("No valid presets found in file", "warning");
          return;
        }

        const todayDate = getTodayDate();
        const cleanedPresets: Preset[] = presetsArr.map((p) => {
          const { sales, ...rest } = p;
          return {
            ...rest,
            purchaseDate:
              toDateOnly((rest as Preset).purchaseDate) ??
              toDateOnly((rest as Preset).createdAt) ??
              inferDateFromPresetId((rest as Preset).id) ??
              todayDate,
            createdAt:
              toDateOnly((rest as Preset).createdAt) ??
              toDateOnly((rest as Preset).purchaseDate) ??
              inferDateFromPresetId((rest as Preset).id) ??
              todayDate
          };
        });

        this.presets = cleanedPresets;
        this.savePresetsToStorage();

        presetsArr.forEach((p) => {
          if (p && p.id != null && Array.isArray(p.sales)) {
            localStorage.setItem(this.getSalesStorageKey(p.id), JSON.stringify(p.sales));
          }
        });

        const candidateId =
          (lastPresetId && this.presets.some((p) => p.id === lastPresetId))
            ? lastPresetId
            : this.presets[0].id;

        this.currentPresetId = candidateId;
        this.loadPreset();
        this.notify(`Imported ${this.presets.length} preset(s)`, "success");
      } catch (error) {
        console.error("Import error:", error);
        this.notify("Invalid file format. Please upload a valid JSON file.", "error");
      } finally {
        if (target) target.value = "";
      }
    };

    reader.onerror = () => {
      this.notify("Error reading file", "error");
      if (target) target.value = "";
    };

    reader.readAsText(file);
  },

  calculateProfit(units: number, pricePerUnit: number): number {
    return calculateProfitForListing(
      units,
      pricePerUnit,
      this.totalCaseCost,
      this.sellingTaxPercent,
      this.sellingShippingPerOrder
    );
  },

  recalculateDefaultPrices({ closeModal = false }: { closeModal?: boolean } = {}): void {
    const nextPrices = calculateDefaultSellingPrices({
      totalCaseCost: this.totalCaseCost,
      targetProfitPercent: this.targetProfitPercent,
      boxesPurchased: this.boxesPurchased,
      totalPacks: this.totalPacks,
      sellingTaxPercent: this.sellingTaxPercent,
      sellingShippingPerOrder: this.sellingShippingPerOrder
    });
    this.spotPrice = nextPrices.spotPrice;
    this.boxPriceSell = nextPrices.boxPriceSell;
    this.packPrice = nextPrices.packPrice;

    this.syncLivePricesFromDefaults();
    this.autoSaveSetup();
    if (closeModal) this.showProfitCalculator = false;
  },

  calculateOptimalPrices(): void {
    if (!this.canUsePaidActions) {
      this.notify("Pro access required to apply auto-calculated prices", "warning");
      return;
    }
    this.recalculateDefaultPrices({ closeModal: true });
  },

  onPurchaseConfigChange(): void {
    this.purchaseDate = toDateOnly(this.purchaseDate) ?? getTodayDate();
    if (this.purchaseShippingCost == null || Number.isNaN(Number(this.purchaseShippingCost))) {
      this.purchaseShippingCost = DEFAULT_VALUES.PURCHASE_SHIPPING_COST;
    }
    if (Number(this.purchaseShippingCost) < 0) {
      this.purchaseShippingCost = 0;
    }
    if (this.purchaseTaxPercent == null || Number.isNaN(Number(this.purchaseTaxPercent))) {
      this.purchaseTaxPercent = DEFAULT_VALUES.PURCHASE_TAX_RATE_PERCENT;
    }
    if (Number(this.purchaseTaxPercent) < 0) {
      this.purchaseTaxPercent = 0;
    }
    if (this.sellingTaxPercent == null || Number.isNaN(Number(this.sellingTaxPercent))) {
      this.sellingTaxPercent = DEFAULT_VALUES.SELLING_TAX_RATE_PERCENT;
    }
    if (Number(this.sellingTaxPercent) < 0) {
      this.sellingTaxPercent = 0;
    }
    if (this.sellingShippingPerOrder == null || Number.isNaN(Number(this.sellingShippingPerOrder))) {
      this.sellingShippingPerOrder = DEFAULT_VALUES.SELLING_SHIPPING_PER_ORDER;
    }
    if (Number(this.sellingShippingPerOrder) < 0) {
      this.sellingShippingPerOrder = 0;
    }
    this.recalculateDefaultPrices();
  },

  calculatePriceForUnits(units: number, targetNetRevenue: number): number {
    return calculateUnitPrice(units, targetNetRevenue, this.sellingTaxPercent, this.sellingShippingPerOrder);
  }
};
