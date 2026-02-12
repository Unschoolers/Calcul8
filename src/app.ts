import { defineComponent } from "vue";
import Chart from "chart.js/auto";
import {
  APP_VERSION,
  DEFAULT_VALUES
} from "./constants.ts";
import {
  calculateBoxPriceCostCad,
  calculateDefaultSellingPrices,
  calculateNetFromGross,
  calculatePriceForUnits as calculateUnitPrice,
  calculateProfitForListing,
  calculateSalesProgress,
  calculateSalesStatus,
  calculateSoldPacksCount,
  calculateSparklineData,
  calculateSparklineGradient,
  calculateTotalCaseCost,
  calculateTotalPacks,
  calculateTotalRevenue
} from "./domain/calculations.ts";
import type {
  AppState,
  AppTab,
  BeforeInstallPromptEvent,
  Preset,
  PresetSetup,
  Sale,
  SaleType,
  UiColor
} from "./types/app.ts";
import { LivePriceCard } from "./components/LivePriceCard.ts";

export const appOptions = defineComponent({
  components: {
    LivePriceCard
  },
  data(): AppState {
    return {
      // UI State
      currentTab: "config",
      showNewPresetModal: false,
      speedDialOpen: false,
      speedDialOpenSales: false,
      snackbar: {
        show: false,
        text: "",
        color: "info"
      },
      isOffline: !navigator.onLine,
      deferredInstallPrompt: null,
      showInstallPrompt: false,
      onlineListener: null,
      offlineListener: null,
      beforeInstallPromptListener: null,
      appInstalledListener: null,
      confirmDialog: false,
      confirmTitle: "",
      confirmText: "",
      confirmColor: "error",
      confirmAction: null,

      // Pricing Configuration
      boxPriceCost: DEFAULT_VALUES.BOX_PRICE,
      boxesPurchased: DEFAULT_VALUES.BOXES_PURCHASED,
      packsPerBox: DEFAULT_VALUES.PACKS_PER_BOX,
      costInputMode: "perBox", // 'perBox' or 'total'
      currency: "CAD",
      exchangeRate: DEFAULT_VALUES.EXCHANGE_RATE,
      purchaseTaxPercent: DEFAULT_VALUES.PURCHASE_TAX_RATE_PERCENT,
      sellingTaxPercent: DEFAULT_VALUES.SELLING_TAX_RATE_PERCENT,
      includeTax: true,

      // Default Selling Prices
      spotPrice: DEFAULT_VALUES.SPOT_PRICE,
      boxPriceSell: DEFAULT_VALUES.BOX_PRICE_SELL,
      packPrice: DEFAULT_VALUES.PACK_PRICE,
      liveSpotPrice: DEFAULT_VALUES.SPOT_PRICE,
      liveBoxPriceSell: DEFAULT_VALUES.BOX_PRICE_SELL,
      livePackPrice: DEFAULT_VALUES.PACK_PRICE,

      // Auto-calculate profit
      targetProfitPercent: 15,
      showProfitCalculator: false,

      // Sales tracking
      sales: [],
      showAddSaleModal: false,
      editingSale: null,
      newSale: {
        type: "pack",
        quantity: 1,
        packsCount: null,
        price: 0,
        date: new Date().toISOString().split("T")[0]
      },

      salesChart: null,
      chartView: "pie", // 'pie' or 'sparkline'

      // Presets
      presets: [],
      currentPresetId: null,
      newPresetName: "",

      // Exchange Rate Cache
      lastFetchTime: null
    };
  },

  mounted() {
    this.loadPresetsFromStorage();
    // Restore last preset if possible
const last = Number(localStorage.getItem("rtyh_last_preset_id"));
if (last && this.presets.some((p) => p.id === last)) {
  this.currentPresetId = last;
  this.loadPreset();
}
else if (this.presets.length > 0) {
  this.currentPresetId = this.presets[0].id;
  this.loadPreset();
}
    this.getExchangeRate();
    this.loadSalesFromStorage();
    this.syncLivePricesFromDefaults();
    if (import.meta.env.DEV) {
      void this.unregisterServiceWorkersForDev();
    } else {
      this.setupPwaUiHandlers();
      this.registerServiceWorker();
    }
  },

  beforeUnmount() {
    if (this.onlineListener) window.removeEventListener("online", this.onlineListener);
    if (this.offlineListener) window.removeEventListener("offline", this.offlineListener);
    if (this.beforeInstallPromptListener) window.removeEventListener("beforeinstallprompt", this.beforeInstallPromptListener);
    if (this.appInstalledListener) window.removeEventListener("appinstalled", this.appInstalledListener);
  },

  watch: {
    currentTab(newTab: AppTab) {
      this.speedDialOpen = false;
      this.speedDialOpenSales = false;

      if (newTab === "sales") {
        this.$nextTick(() => this.initSalesChart());
      }
    },
    currentPresetId(newVal: number | null) {
  // Save last used preset
  if (newVal) localStorage.setItem("rtyh_last_preset_id", String(newVal));

  if (!newVal) {
    this.currentTab = "config";
    this.sales = [];
    if (this.salesChart) {
      this.salesChart.destroy();
      this.salesChart = null;
    }
  }
},


    chartView(): void {
      // Re-init chart only when needed
      if (this.currentTab === "sales") {
        this.$nextTick(() => this.initSalesChart());
      }
    },

    sales: {
      handler(): void {
        this.saveSalesToStorage();
        if (this.currentTab === "sales" && this.chartView === "pie") {
          this.$nextTick(() => this.initSalesChart());
        }
      },
      deep: true
    }
  },

  computed: {
    // ===== Theme =====
    isDark(): boolean {
      return this.$vuetify.theme.global.name === "unionArenaDark";
    },
    hasPresetSelected(): boolean {
  return !!this.currentPresetId;
},


    // ===== Preset Management =====
    presetItems(): Array<{ title: string; value: number | null }> {
      return [
        { title: "-- Select preset --", value: null },
        ...this.presets.map((p) => ({ title: p.name, value: p.id }))
      ];
    },

    // ===== Price Calculations =====
    totalPacks(): number {
      return calculateTotalPacks(this.boxesPurchased, this.packsPerBox, DEFAULT_VALUES.PACKS_PER_BOX);
    },

    boxPriceCostCAD(): number {
      return calculateBoxPriceCostCad(
        this.boxPriceCost,
        this.currency,
        this.exchangeRate,
        DEFAULT_VALUES.EXCHANGE_RATE
      );
    },
    purchaseCostInputLabel(): string {
      return this.costInputMode === "total" ? "Total Purchase (No Tax)" : "Price per Box (No Tax)";
    },
    purchaseCostInputValue: {
      get(): number {
        if (this.costInputMode === "total") {
          return (this.boxPriceCost || 0) * (this.boxesPurchased || 0);
        }
        return this.boxPriceCost || 0;
      },
      set(newValue: number | string): void {
        const value = Number(newValue) || 0;
        if (this.costInputMode === "total") {
          const boxes = this.boxesPurchased || 0;
          this.boxPriceCost = boxes > 0 ? value / boxes : 0;
          return;
        }
        this.boxPriceCost = value;
      }
    },

    totalCaseCost(): number {
      return calculateTotalCaseCost({
        boxesPurchased: this.boxesPurchased,
        pricePerBoxCad: this.boxPriceCostCAD,
        purchaseTaxPercent: this.purchaseTaxPercent,
        includeTax: this.includeTax,
        currency: this.currency
      });
    },

    conversionInfo(): string {
      if (this.currency === "USD") {
        const totalInCAD = this.boxPriceCostCAD * (this.boxesPurchased || 0);
        return `≈ $${this.formatCurrency(totalInCAD)} CAD total`;
      }
      return "";
    },

    // ===== Sales Tracking =====
    soldPacksCount(): number {
      return calculateSoldPacksCount(this.sales);
    },

    // NET revenue (after Whatnot fees)
    totalRevenue(): number {
      return calculateTotalRevenue(this.sales, this.sellingTaxPercent);
    },

    salesProgress(): number {
      return calculateSalesProgress(this.soldPacksCount, this.totalPacks);
    },

    salesStatus() {
      return calculateSalesStatus(this.totalRevenue, this.totalCaseCost, this.salesProgress);
    },

    sortedSales(): Sale[] {
      return [...this.sales].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    },

    // Sparkline data - cumulative profit over time (normalized)
    sparklineData(): number[] {
      return calculateSparklineData(this.sales, this.totalCaseCost, this.sellingTaxPercent);
    },

    sparklineGradient(): string[] {
      return calculateSparklineGradient(this.sales, this.totalCaseCost, this.sellingTaxPercent);
    }
  },

  methods: {
    // ===== Theme =====
    toggleTheme(): void {
      const themeGlobal = this.$vuetify.theme.global as unknown as { name: string };
      themeGlobal.name = this.isDark ? "unionArenaLight" : "unionArenaDark";
    },
    notify(message: string, color: UiColor = "info"): void {
      this.snackbar.text = message;
      this.snackbar.color = color;
      this.snackbar.show = true;
    },
    askConfirmation(
      { title, text, color = "error" }: { title: string; text: string; color?: UiColor },
      action: () => void
    ): void {
      this.confirmTitle = title;
      this.confirmText = text;
      this.confirmColor = color;
      this.confirmAction = action;
      this.confirmDialog = true;
    },
    runConfirmAction(): void {
      if (typeof this.confirmAction === "function") {
        this.confirmAction();
      }
      this.confirmDialog = false;
      this.confirmAction = null;
    },
    cancelConfirmAction(): void {
      this.confirmDialog = false;
      this.confirmAction = null;
    },
    getSalesStorageKey(presetId: number): string {
  return `rtyh_sales_${presetId}`;
},

loadSalesForPresetId(presetId: number): Sale[] {
  try {
    const stored = localStorage.getItem(this.getSalesStorageKey(presetId));
    return stored ? (JSON.parse(stored) as Sale[]) : [];
  } catch {
    return [];
  }
},


    // ===== Whatnot fee helper =====
    netFromGross(grossRevenue: number, units: number): number {
      return calculateNetFromGross(grossRevenue, units, this.sellingTaxPercent);
    },

    // ===== Exchange Rate =====
    async getExchangeRate(): Promise<void> {
      const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

      if (this.exchangeRate && this.lastFetchTime && Date.now() - this.lastFetchTime < CACHE_DURATION) {
        return;
      }

      try {
        const response = await fetch("https://open.er-api.com/v6/latest/USD");
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (data?.rates?.CAD) {
          this.exchangeRate = data.rates.CAD;
          this.lastFetchTime = Date.now();
        }
      } catch (error) {
        console.warn("Failed to fetch exchange rate, using default:", error);
        this.exchangeRate = DEFAULT_VALUES.EXCHANGE_RATE;
      }
    },

    // ===== Preset Management =====
    loadPresetsFromStorage(): void {
      try {
        const stored = localStorage.getItem("rtyh_presets");
        if (stored) this.presets = JSON.parse(stored) as Preset[];
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
        exchangeRate: this.exchangeRate,
        purchaseTaxPercent: this.purchaseTaxPercent,
        sellingTaxPercent: this.sellingTaxPercent,
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
      if (preset) {
        Object.assign(preset, this.getCurrentSetup());
        this.savePresetsToStorage();
      }
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

    createNewPreset(): void {
      const name = (this.newPresetName || "").trim();
      if (!name) return this.notify("Please enter a preset name", "warning");
      if (this.presets.some((p) => p.name === name)) return this.notify("A preset with this name already exists", "warning");

      const newPreset = { id: Date.now(), name, ...this.getCurrentSetup() };
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

      this.boxPriceCost = preset.boxPriceCost ?? DEFAULT_VALUES.BOX_PRICE;
      this.boxesPurchased = preset.boxesPurchased ?? DEFAULT_VALUES.BOXES_PURCHASED;
      this.packsPerBox = preset.packsPerBox ?? DEFAULT_VALUES.PACKS_PER_BOX;
      this.costInputMode = preset.costInputMode ?? "perBox";
      this.currency = preset.currency ?? "CAD";
      this.exchangeRate = preset.exchangeRate ?? DEFAULT_VALUES.EXCHANGE_RATE;
      // Backward compatibility: older presets had a single taxRatePercent.
      const legacyTax = preset.taxRatePercent;
      this.purchaseTaxPercent =
        preset.purchaseTaxPercent ??
        legacyTax ??
        DEFAULT_VALUES.PURCHASE_TAX_RATE_PERCENT;
      this.sellingTaxPercent =
        preset.sellingTaxPercent ??
        legacyTax ??
        DEFAULT_VALUES.SELLING_TAX_RATE_PERCENT;
      this.includeTax = preset.includeTax ?? true;
      this.spotPrice = preset.spotPrice ?? DEFAULT_VALUES.SPOT_PRICE;
      this.boxPriceSell = preset.boxPriceSell ?? DEFAULT_VALUES.BOX_PRICE_SELL;
      this.packPrice = preset.packPrice ?? DEFAULT_VALUES.PACK_PRICE;
      this.targetProfitPercent = preset.targetProfitPercent ?? 15;
      this.syncLivePricesFromDefaults();

      this.loadSalesFromStorage();
    },

    deleteCurrentPreset(): void {
      if (!this.currentPresetId) return;

      const preset = this.presets.find((p) => p.id === this.currentPresetId);
      if (!preset) return;

      this.askConfirmation(
        {
          title: "Delete Preset?",
          text: `Delete "${preset.name}" permanently?`,
          color: "error"
        },
        () => {
        this.presets = this.presets.filter((p) => p.id !== this.currentPresetId);
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

    importPresets(): void {
      const fileInput = this.$refs.fileInput as HTMLInputElement | undefined;
      fileInput?.click();
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
      const imported: unknown = JSON.parse(raw);

      // Support: ancien format = array de presets
      // Nouveau format = { version, presets:[{..., sales:[]}] }
      let presetsArr: Array<Preset & { sales?: Sale[] }> = [];
      let lastPresetId: number | null = null;

      if (Array.isArray(imported)) {
        presetsArr = imported as Array<Preset & { sales?: Sale[] }>;
      } else if (imported && typeof imported === "object" && Array.isArray((imported as { presets?: unknown[] }).presets)) {
        const payload = imported as { presets: Array<Preset & { sales?: Sale[] }>; lastPresetId?: number | null };
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

      // Extract sales from each preset (if any), then save presets normally
      const cleanedPresets: Preset[] = presetsArr.map((p) => {
        const { sales, ...rest } = p;
        return rest;
      });

      this.presets = cleanedPresets;
      this.savePresetsToStorage();

      // Save sales per preset
      presetsArr.forEach((p: Preset & { sales?: Sale[] }) => {
        if (p && p.id != null && Array.isArray(p.sales)) {
          localStorage.setItem(this.getSalesStorageKey(p.id), JSON.stringify(p.sales));
        }
      });

      // Restore last preset if possible, else select first
      const candidateId =
        (lastPresetId && this.presets.some((p) => p.id === lastPresetId))
          ? lastPresetId
          : this.presets[0].id;

      this.currentPresetId = candidateId;
      this.loadPreset();

      this.notify(`Imported ${this.presets.length} preset(s)`, "success");
    } catch (error: unknown) {
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


    // ===== Profit Calculation =====
    calculateProfit(units: number, pricePerUnit: number): number {
      return calculateProfitForListing(
        units,
        pricePerUnit,
        this.totalCaseCost,
        this.sellingTaxPercent
      );
    },

    // ===== Formatting Helpers =====
    formatCurrency(value: number | null | undefined, decimals = 2): string {
      if (value == null || isNaN(value)) return "0.00";
      return Number(value).toFixed(decimals);
    },

    safeFixed(value: number, decimals = 2): string {
      return this.formatCurrency(value, decimals);
    },

    // ===== Auto-calculate Prices =====
    recalculateDefaultPrices({ closeModal = false }: { closeModal?: boolean } = {}): void {
      const nextPrices = calculateDefaultSellingPrices({
        totalCaseCost: this.totalCaseCost,
        targetProfitPercent: this.targetProfitPercent,
        boxesPurchased: this.boxesPurchased,
        totalPacks: this.totalPacks,
        sellingTaxPercent: this.sellingTaxPercent
      });
      this.spotPrice = nextPrices.spotPrice;
      this.boxPriceSell = nextPrices.boxPriceSell;
      this.packPrice = nextPrices.packPrice;

      if (this.currentTab !== "live") {
        this.syncLivePricesFromDefaults();
      }
      this.autoSaveSetup();
      if (closeModal) this.showProfitCalculator = false;
    },
    calculateOptimalPrices(): void {
      this.recalculateDefaultPrices({ closeModal: true });
    },
    onPurchaseConfigChange(): void {
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
      this.recalculateDefaultPrices();
    },

    calculatePriceForUnits(units: number, targetNetRevenue: number): number {
      return calculateUnitPrice(units, targetNetRevenue, this.sellingTaxPercent);
    },

    // ===== Sales Storage =====
    loadSalesFromStorage(): void {
      if (!this.currentPresetId) return;

      try {
        const key = `rtyh_sales_${this.currentPresetId}`;
        const stored = localStorage.getItem(key);
        this.sales = stored ? (JSON.parse(stored) as Sale[]) : [];
      } catch (error) {
        console.error("Failed to load sales:", error);
        this.sales = [];
      }
    },

    saveSalesToStorage(): void {
      if (!this.currentPresetId) return;

      try {
        const key = `rtyh_sales_${this.currentPresetId}`;
        localStorage.setItem(key, JSON.stringify(this.sales));
      } catch (error) {
        console.error("Failed to save sales:", error);
      }
    },

    // ===== Sales CRUD =====
    saveSale(): void {
      const quantity = Number(this.newSale.quantity);
      const price = Number(this.newSale.price);
      const rtyhPacks = Number(this.newSale.packsCount);

      if (!Number.isFinite(quantity) || quantity <= 0) {
        this.notify("Please enter a valid quantity greater than 0", "warning");
        return;
      }

      if (!Number.isFinite(price) || price < 0) {
        this.notify("Please enter a valid price (0 or greater)", "warning");
        return;
      }

      if (this.newSale.type === "rtyh" && (!Number.isFinite(rtyhPacks) || rtyhPacks <= 0)) {
        this.notify("Please enter the number of packs sold for RTYH", "warning");
        return;
      }

      let packsCount: number;
      if (this.newSale.type === "pack") {
        packsCount = quantity;
      } else if (this.newSale.type === "box") {
        packsCount = quantity * this.packsPerBox;
      } else {
        packsCount = rtyhPacks;
      }

      const sale = {
        id: this.editingSale ? this.editingSale.id : Date.now(),
        type: this.newSale.type,
        quantity,
        packsCount: packsCount || 0,
        price,
        date: this.newSale.date
      };

      if (this.editingSale) {
        const index = this.sales.findIndex((s) => s.id === this.editingSale.id);
        if (index === -1) {
          this.notify("Could not find the sale to update. Please try again.", "error");
          return;
        }
        this.sales.splice(index, 1, sale);
        this.sales = [...this.sales];
      } else {
        this.sales = [...this.sales, sale];
      }

      this.cancelSale();

      // Chart update will happen via watcher on sales
    },

    editSale(sale: Sale): void {
      this.editingSale = sale;
      this.newSale = {
        type: sale.type,
        quantity: sale.quantity,
        packsCount: sale.type === "rtyh" ? sale.packsCount : null,
        price: sale.price,
        date: sale.date
      };
      this.showAddSaleModal = true;
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
        // Chart update via watcher
        this.notify("Sale deleted", "info");
        }
      );
    },

    cancelSale(): void {
      this.showAddSaleModal = false;
      this.editingSale = null;
      this.newSale = {
        type: "pack",
        quantity: 1,
        packsCount: null,
        price: 0,
        date: new Date().toISOString().split("T")[0]
      };
    },

    // ===== Chart =====
    initSalesChart(): void {
      // Sparkline mode doesn't use Chart.js
      if (this.chartView !== "pie") {
        if (this.salesChart) {
          this.salesChart.destroy();
          this.salesChart = null;
        }
        return;
      }

      const chartCanvas = this.$refs.salesChart as HTMLCanvasElement | undefined;
      if (!chartCanvas) return;

      if (this.salesChart) {
        this.salesChart.destroy();
        this.salesChart = null;
      }

      const ctx = chartCanvas.getContext("2d");
      if (!ctx) return;

      const soldPacks = this.soldPacksCount;
      const totalPacks = this.totalPacks;
      const unsoldPacks = Math.max(0, totalPacks - soldPacks);

      // SOLD: already net
      const soldNet = this.totalRevenue;

      // UNSOLD: estimate net value if sold at current packPrice (apply fees)
      const grossUnsold = unsoldPacks * (this.packPrice || 0);
      const unsoldNet = this.netFromGross(grossUnsold, unsoldPacks);

      this.salesChart = new Chart(ctx, {
        type: "doughnut",
        data: {
          labels: [
            `Sold (Net): $${this.formatCurrency(soldNet)} | ${soldPacks} packs`,
            `Unsold (Net est.): $${this.formatCurrency(unsoldNet)} | ${unsoldPacks} packs`
          ],
          datasets: [
            {
              data: [Math.max(0, soldNet), Math.max(0, unsoldNet)],
              backgroundColor: ["#34C759", "#FF3B30"],
              borderWidth: 0
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
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
                label: function (context: { label?: string }) {
                  return context.label;
                }
              }
            }
          }
        }
      });
    },

    toggleChartView(): void {
      this.chartView = this.chartView === "pie" ? "sparkline" : "pie";
    },

    // ===== UI helpers =====
    getSaleColor(type: SaleType): string {
      if (type === "pack") return "primary";
      if (type === "box") return "secondary";
      return "success";
    },

    getSaleIcon(type: SaleType): string {
      if (type === "pack") return "mdi-package";
      if (type === "box") return "mdi-cube-outline";
      return "mdi-cards-playing-outline";
    },

    formatDate(dateStr: string): string {
      const date = new Date(dateStr);
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    },

    setupPwaUiHandlers(): void {
      this.onlineListener = () => {
        this.isOffline = false;
        this.notify("Back online", "success");
      };
      this.offlineListener = () => {
        this.isOffline = true;
      };
      this.beforeInstallPromptListener = (event: Event) => {
        const promptEvent = event as BeforeInstallPromptEvent;
        promptEvent.preventDefault();
        this.deferredInstallPrompt = promptEvent;
        this.showInstallPrompt = true;
      };
      this.appInstalledListener = () => {
        this.showInstallPrompt = false;
        this.deferredInstallPrompt = null;
      };

      window.addEventListener("online", this.onlineListener);
      window.addEventListener("offline", this.offlineListener);
      window.addEventListener("beforeinstallprompt", this.beforeInstallPromptListener);
      window.addEventListener("appinstalled", this.appInstalledListener);
    },

    async promptInstall(): Promise<void> {
      if (!this.deferredInstallPrompt) return;

      this.deferredInstallPrompt.prompt();
      const result = await this.deferredInstallPrompt.userChoice;
      this.showInstallPrompt = false;
      this.deferredInstallPrompt = null;

      if (result?.outcome === "accepted") {
        this.notify("Install started", "success");
      }
    },

    async unregisterServiceWorkersForDev(): Promise<void> {
      if (!("serviceWorker" in navigator)) return;
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((key) => caches.delete(key)));
        }
      } catch (error) {
        console.warn("Failed to clean service workers in dev:", error);
      }
    },

    registerServiceWorker(): void {
      if (!("serviceWorker" in navigator)) return;
      window.addEventListener("load", async () => {
        let refreshing = false;

        try {
          const swUrl = `./sw.js?v=${encodeURIComponent(APP_VERSION)}`;
          const registration = await navigator.serviceWorker.register(swUrl, {
            updateViaCache: "none"
          });

          const activateWaitingWorker = () => {
            if (registration.waiting) {
              registration.waiting.postMessage("SKIP_WAITING");
            }
          };

          if (registration.waiting && navigator.serviceWorker.controller) {
            activateWaitingWorker();
          }

          registration.addEventListener("updatefound", () => {
            const newWorker = registration.installing;
            if (!newWorker) return;

            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                activateWaitingWorker();
              }
            });
          });

          navigator.serviceWorker.addEventListener("controllerchange", () => {
            if (refreshing) return;
            refreshing = true;
            window.location.reload();
          });

          await registration.update();
          window.setInterval(() => {
            registration.update().catch(() => {});
          }, 60 * 1000);
        } catch (error) {
          console.warn("Service worker registration failed:", error);
        }
      });
    }
  }
});
