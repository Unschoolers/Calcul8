// app.js
const { createApp } = Vue;
const { createVuetify } = Vuetify;

// Vuetify theme configuration
const vuetify = createVuetify({
  theme: {
    defaultTheme: "unionArenaDark",
    themes: {
      unionArenaDark: {
        dark: true,
        colors: {
          primary: "#E63946",
          secondary: "#FFB800",
          error: "#FF3B30",
          success: "#34C759",
          background: "#121212",
          surface: "#1E1E1E"
        }
      },
      unionArenaLight: {
        dark: false,
        colors: {
          primary: "#E63946",
          secondary: "#FFB800",
          error: "#FF3B30",
          success: "#34C759",
          background: "#FFFFFF",
          surface: "#F5F5F7"
        }
      }
    }
  }
});

// Constants
const WHATNOT_FEES = {
  COMMISSION: 0.08, // 8% commission
  PROCESSING: 0.029, // 2.9% processing
  FIXED: 0.3 // $0.30 per transaction
};

const TAX_RATES = {
  SALES_TAX: 0.15, // 15% sales tax
  CUSTOMS: 0.05 // 5% customs (USD only)
};

const DEFAULT_VALUES = {
  BOX_PRICE: 70,
  BOXES_PURCHASED: 16,
  PACKS_PER_BOX: 16,
  SPOT_PRICE: 25,
  BOX_PRICE_SELL: 100,
  PACK_PRICE: 7,
  EXCHANGE_RATE: 1.4,
  PURCHASE_TAX_RATE_PERCENT: 15,
  SELLING_TAX_RATE_PERCENT: 15
};

const UNITS_PER_CASE = {
  SPOT: 80,
  BOX: 16
};

createApp({
  data() {
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
    this.setupPwaUiHandlers();
    this.registerServiceWorker();
  },

  beforeUnmount() {
    if (this.onlineListener) window.removeEventListener("online", this.onlineListener);
    if (this.offlineListener) window.removeEventListener("offline", this.offlineListener);
    if (this.beforeInstallPromptListener) window.removeEventListener("beforeinstallprompt", this.beforeInstallPromptListener);
    if (this.appInstalledListener) window.removeEventListener("appinstalled", this.appInstalledListener);
  },

  watch: {
    currentTab(newTab) {
      this.speedDialOpen = false;
      this.speedDialOpenSales = false;

      if (newTab === "sales") {
        this.$nextTick(() => this.initSalesChart());
      }
    },
    currentPresetId(newVal) {
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


    chartView() {
      // Re-init chart only when needed
      if (this.currentTab === "sales") {
        this.$nextTick(() => this.initSalesChart());
      }
    },

    sales: {
      handler() {
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
    isDark() {
      return this.$vuetify.theme.global.name === "unionArenaDark";
    },
    hasPresetSelected() {
  return !!this.currentPresetId;
},


    // ===== Preset Management =====
    presetItems() {
      return [
        { title: "-- Select preset --", value: null },
        ...this.presets.map((p) => ({ title: p.name, value: p.id }))
      ];
    },

    // ===== Price Calculations =====
    totalPacks() {
      return (this.boxesPurchased || 0) * (this.packsPerBox || 16);
    },

    boxPriceCostCAD() {
      const price = this.boxPriceCost || 0;
      const rate = this.exchangeRate || DEFAULT_VALUES.EXCHANGE_RATE;
      return this.currency === "USD" ? price * rate : price;
    },
    purchaseCostInputLabel() {
      return this.costInputMode === "total" ? "Total Purchase (No Tax)" : "Price per Box (No Tax)";
    },
    purchaseCostInputValue: {
      get() {
        if (this.costInputMode === "total") {
          return (this.boxPriceCost || 0) * (this.boxesPurchased || 0);
        }
        return this.boxPriceCost || 0;
      },
      set(newValue) {
        const value = Number(newValue) || 0;
        if (this.costInputMode === "total") {
          const boxes = this.boxesPurchased || 0;
          this.boxPriceCost = boxes > 0 ? value / boxes : 0;
          return;
        }
        this.boxPriceCost = value;
      }
    },

    totalCaseCost() {
      const boxes = this.boxesPurchased || 0;
      const pricePerBox = this.boxPriceCostCAD;
      const taxRate = Math.max(0, Number(this.purchaseTaxPercent) || 0) / 100;

      const basePrice = pricePerBox * boxes;

      const withTax = this.includeTax
        ? basePrice * (1 + taxRate)
        : basePrice;

      const customs = this.currency === "USD" ? withTax * TAX_RATES.CUSTOMS : 0;

      return withTax + customs;
    },

    conversionInfo() {
      if (this.currency === "USD") {
        const totalInCAD = this.boxPriceCostCAD * (this.boxesPurchased || 0);
        return `≈ $${this.formatCurrency(totalInCAD)} CAD total`;
      }
      return "";
    },

    // ===== Sales Tracking =====
    soldPacksCount() {
      return this.sales.reduce((sum, sale) => sum + (sale.packsCount || 0), 0);
    },

    // NET revenue (after Whatnot fees)
    totalRevenue() {
      return this.sales.reduce((sum, sale) => {
        const grossRevenue = (sale.quantity || 0) * (sale.price || 0);
        const netRevenue = this.netFromGross(grossRevenue, sale.quantity || 0);
        return sum + netRevenue;
      }, 0);
    },

    salesProgress() {
      const total = this.totalPacks;
      if (total === 0) return 0;
      return (this.soldPacksCount / total) * 100;
    },

    salesStatus() {
      const profit = this.totalRevenue - this.totalCaseCost;
      const percentSold = this.salesProgress;

      if (percentSold === 0) {
        return { color: "grey", icon: "mdi-information", title: "No Sales Yet", profit: 0, revenue: 0 };
      } else if (profit < 0) {
        return { color: "error", icon: "mdi-alert-circle", title: "Below Break-Even", profit, revenue: this.totalRevenue };
      } else if (profit >= 0 && percentSold < 100) {
        return { color: "warning", icon: "mdi-alert", title: "Break-Even Reached", profit, revenue: this.totalRevenue };
      } else {
        return { color: "success", icon: "mdi-check-circle", title: "Case Complete & Profitable", profit, revenue: this.totalRevenue };
      }
    },

    sortedSales() {
      return [...this.sales].sort((a, b) => new Date(b.date) - new Date(a.date));
    },

    // Sparkline data - cumulative profit over time (normalized)
    sparklineData() {
      const sortedSales = [...this.sales].sort((a, b) => new Date(a.date) - new Date(b.date));

      let cumulativeProfit = -this.totalCaseCost;
      const data = [cumulativeProfit];

      sortedSales.forEach((sale) => {
        const grossRevenue = (sale.quantity || 0) * (sale.price || 0);
        const netRevenue = this.netFromGross(grossRevenue, sale.quantity || 0);
        cumulativeProfit += netRevenue;
        data.push(cumulativeProfit);
      });

      const minValue = Math.min(...data);
      return data.map((val) => val - minValue);
    },

    sparklineGradient() {
      const sortedSales = [...this.sales].sort((a, b) => new Date(a.date) - new Date(b.date));
      let cumulativeProfit = -this.totalCaseCost;

      sortedSales.forEach((sale) => {
        const grossRevenue = (sale.quantity || 0) * (sale.price || 0);
        const netRevenue = this.netFromGross(grossRevenue, sale.quantity || 0);
        cumulativeProfit += netRevenue;
      });

      const finalProfit = cumulativeProfit || -this.totalCaseCost;

      if (finalProfit < -100) return ["#FF3B30", "#FF6B6B"];
      if (finalProfit < 100) return ["#FFB800", "#FFA000"];
      return ["#34C759", "#4CD964"];
    }
  },

  methods: {
    // ===== Theme =====
    toggleTheme() {
      this.$vuetify.theme.global.name = this.isDark ? "unionArenaLight" : "unionArenaDark";
    },
    notify(message, color = "info") {
      this.snackbar.text = message;
      this.snackbar.color = color;
      this.snackbar.show = true;
    },
    askConfirmation({ title, text, color = "error" }, action) {
      this.confirmTitle = title;
      this.confirmText = text;
      this.confirmColor = color;
      this.confirmAction = action;
      this.confirmDialog = true;
    },
    runConfirmAction() {
      if (typeof this.confirmAction === "function") {
        this.confirmAction();
      }
      this.confirmDialog = false;
      this.confirmAction = null;
    },
    cancelConfirmAction() {
      this.confirmDialog = false;
      this.confirmAction = null;
    },
    getSalesStorageKey(presetId) {
  return `rtyh_sales_${presetId}`;
},

loadSalesForPresetId(presetId) {
  try {
    const stored = localStorage.getItem(this.getSalesStorageKey(presetId));
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
},


    // ===== Whatnot fee helper =====
    netFromGross(grossRevenue, units) {
      const gross = grossRevenue || 0;
      const qty = units || 0;
      const buyerTaxRate = Math.max(0, Number(this.sellingTaxPercent) || 0) / 100;
      const orderTotal = gross * (1 + buyerTaxRate);

      const commission = gross * WHATNOT_FEES.COMMISSION;
      const processingPct = orderTotal * WHATNOT_FEES.PROCESSING;
      const processingFixed = WHATNOT_FEES.FIXED * qty;

      return gross - commission - processingPct - processingFixed;
    },

    // ===== Exchange Rate =====
    async getExchangeRate() {
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
    loadPresetsFromStorage() {
      try {
        const stored = localStorage.getItem("rtyh_presets");
        if (stored) this.presets = JSON.parse(stored);
      } catch (error) {
        console.error("Failed to load presets:", error);
        this.presets = [];
      }
    },

    savePresetsToStorage() {
      try {
        localStorage.setItem("rtyh_presets", JSON.stringify(this.presets));
      } catch (error) {
        console.error("Failed to save presets:", error);
        this.notify("Could not save presets. Storage may be full.", "error");
      }
    },

    getCurrentSetup() {
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

    autoSaveSetup() {
      if (!this.currentPresetId) return;

      const preset = this.presets.find((p) => p.id === this.currentPresetId);
      if (preset) {
        Object.assign(preset, this.getCurrentSetup());
        this.savePresetsToStorage();
      }
    },
    syncLivePricesFromDefaults() {
      this.liveSpotPrice = this.spotPrice;
      this.liveBoxPriceSell = this.boxPriceSell;
      this.livePackPrice = this.packPrice;
    },
    resetLivePrices() {
      this.syncLivePricesFromDefaults();
      this.notify("Live prices reset to config defaults", "info");
    },

    createNewPreset() {
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

    loadPreset() {
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

    deleteCurrentPreset() {
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

exportPresets() {
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


    exportSales() {
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

    importPresets() {
      this.$refs.fileInput.click();
    },

handleFileImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target.result);

      // Support: ancien format = array de presets
      // Nouveau format = { version, presets:[{..., sales:[]}] }
      let presetsArr = [];
      let lastPresetId = null;

      if (Array.isArray(imported)) {
        presetsArr = imported;
      } else if (imported && Array.isArray(imported.presets)) {
        presetsArr = imported.presets;
        lastPresetId = imported.lastPresetId ?? null;
      } else {
        this.notify("Invalid file format. Please upload a valid JSON file.", "error");
        return;
      }

      if (presetsArr.length === 0) {
        this.notify("No valid presets found in file", "warning");
        return;
      }

      // Extract sales from each preset (if any), then save presets normally
      const cleanedPresets = presetsArr.map((p) => {
        const { sales, ...rest } = p;
        return rest;
      });

      this.presets = cleanedPresets;
      this.savePresetsToStorage();

      // Save sales per preset
      presetsArr.forEach((p) => {
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
    } catch (error) {
      console.error("Import error:", error);
      this.notify("Invalid file format. Please upload a valid JSON file.", "error");
    } finally {
      event.target.value = "";
    }
  };

  reader.onerror = () => {
    this.notify("Error reading file", "error");
    event.target.value = "";
  };

  reader.readAsText(file);
},


    // ===== Profit Calculation =====
    calculateProfit(units, pricePerUnit) {
      const safeUnits = units || 0;
      const safePrice = pricePerUnit || 0;

      const grossRevenue = safeUnits * safePrice;
      const netRevenue = this.netFromGross(grossRevenue, safeUnits);

      return netRevenue - this.totalCaseCost;
    },

    // ===== Formatting Helpers =====
    formatCurrency(value, decimals = 2) {
      if (value == null || isNaN(value)) return "0.00";
      return Number(value).toFixed(decimals);
    },

    safeFixed(value, decimals = 2) {
      return this.formatCurrency(value, decimals);
    },

    // ===== Auto-calculate Prices =====
    recalculateDefaultPrices({ closeModal = false } = {}) {
      const targetProfit = (this.totalCaseCost * this.targetProfitPercent) / 100;
      const requiredNetRevenue = this.totalCaseCost + targetProfit;

      this.spotPrice = this.calculatePriceForUnits(UNITS_PER_CASE.SPOT, requiredNetRevenue);
      this.boxPriceSell = this.calculatePriceForUnits(this.boxesPurchased, requiredNetRevenue);
      this.packPrice = this.calculatePriceForUnits(this.totalPacks, requiredNetRevenue);

      if (this.currentTab !== "live") {
        this.syncLivePricesFromDefaults();
      }
      this.autoSaveSetup();
      if (closeModal) this.showProfitCalculator = false;
    },
    calculateOptimalPrices() {
      this.recalculateDefaultPrices({ closeModal: true });
    },
    onPurchaseConfigChange() {
      if (this.purchaseTaxPercent === "" || this.purchaseTaxPercent == null || Number.isNaN(Number(this.purchaseTaxPercent))) {
        this.purchaseTaxPercent = DEFAULT_VALUES.PURCHASE_TAX_RATE_PERCENT;
      }
      if (Number(this.purchaseTaxPercent) < 0) {
        this.purchaseTaxPercent = 0;
      }
      if (this.sellingTaxPercent === "" || this.sellingTaxPercent == null || Number.isNaN(Number(this.sellingTaxPercent))) {
        this.sellingTaxPercent = DEFAULT_VALUES.SELLING_TAX_RATE_PERCENT;
      }
      if (Number(this.sellingTaxPercent) < 0) {
        this.sellingTaxPercent = 0;
      }
      this.recalculateDefaultPrices();
    },

    calculatePriceForUnits(units, targetNetRevenue) {
      const u = units || 1;
      const buyerTaxRate = Math.max(0, Number(this.sellingTaxPercent) || 0) / 100;

      const effectiveFeeRate = 1 - WHATNOT_FEES.COMMISSION - (WHATNOT_FEES.PROCESSING * (1 + buyerTaxRate));
      const fixedFees = WHATNOT_FEES.FIXED * u;
      if (effectiveFeeRate <= 0) return 0;

      const price = (targetNetRevenue + fixedFees) / (u * effectiveFeeRate);
      return Math.round(price);
    },

    // ===== Sales Storage =====
    loadSalesFromStorage() {
      if (!this.currentPresetId) return;

      try {
        const key = `rtyh_sales_${this.currentPresetId}`;
        const stored = localStorage.getItem(key);
        this.sales = stored ? JSON.parse(stored) : [];
      } catch (error) {
        console.error("Failed to load sales:", error);
        this.sales = [];
      }
    },

    saveSalesToStorage() {
      if (!this.currentPresetId) return;

      try {
        const key = `rtyh_sales_${this.currentPresetId}`;
        localStorage.setItem(key, JSON.stringify(this.sales));
      } catch (error) {
        console.error("Failed to save sales:", error);
      }
    },

    // ===== Sales CRUD =====
    saveSale() {
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

      let packsCount;
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

    editSale(sale) {
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

    deleteSale(id) {
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

    cancelSale() {
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
    initSalesChart() {
      // Sparkline mode doesn't use Chart.js
      if (this.chartView !== "pie") {
        if (this.salesChart) {
          this.salesChart.destroy();
          this.salesChart = null;
        }
        return;
      }

      if (!this.$refs.salesChart) return;

      if (this.salesChart) {
        this.salesChart.destroy();
        this.salesChart = null;
      }

      const ctx = this.$refs.salesChart.getContext("2d");

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
                label: function (context) {
                  return context.label;
                }
              }
            }
          }
        }
      });
    },

    toggleChartView() {
      this.chartView = this.chartView === "pie" ? "sparkline" : "pie";
    },

    // ===== UI helpers =====
    getSaleColor(type) {
      if (type === "pack") return "primary";
      if (type === "box") return "secondary";
      return "success";
    },

    getSaleIcon(type) {
      if (type === "pack") return "mdi-package";
      if (type === "box") return "mdi-cube-outline";
      return "mdi-cards-playing-outline";
    },

    formatDate(dateStr) {
      const date = new Date(dateStr);
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    },

    setupPwaUiHandlers() {
      this.onlineListener = () => {
        this.isOffline = false;
        this.notify("Back online", "success");
      };
      this.offlineListener = () => {
        this.isOffline = true;
      };
      this.beforeInstallPromptListener = (event) => {
        event.preventDefault();
        this.deferredInstallPrompt = event;
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

    async promptInstall() {
      if (!this.deferredInstallPrompt) return;

      this.deferredInstallPrompt.prompt();
      const result = await this.deferredInstallPrompt.userChoice;
      this.showInstallPrompt = false;
      this.deferredInstallPrompt = null;

      if (result?.outcome === "accepted") {
        this.notify("Install started", "success");
      }
    },

    registerServiceWorker() {
      if (!("serviceWorker" in navigator)) return;
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("./sw.js").catch((error) => {
          console.warn("Service worker registration failed:", error);
        });
      });
    }
  }
})
  .use(vuetify)
  .mount("#app");
