import type { AppWatchObject } from "./context.ts";
import { STORAGE_KEYS } from "./storageKeys.ts";

export const appWatch: AppWatchObject = {
  currentTab(newTab) {
    try {
      localStorage.setItem(STORAGE_KEYS.LAST_TAB, newTab);
    } catch {
      // Ignore storage errors (private mode/quota restrictions).
    }

    this.speedDialOpen = false;
    this.speedDialOpenSales = false;

    if (newTab !== "portfolio" && this.portfolioChart) {
      this.portfolioChart.destroy();
      this.portfolioChart = null;
    }

    if (newTab === "sales") {
      this.$nextTick(() => this.initSalesChart());
      return;
    }

    if (newTab === "portfolio") {
      this.$nextTick(() => this.initPortfolioChart());
    }
  },

  purchaseUiMode(newMode) {
    try {
      localStorage.setItem(STORAGE_KEYS.PURCHASE_UI_MODE, newMode);
    } catch {
      // Ignore storage errors (private mode/quota restrictions).
    }

    if (newMode === "simple" && this.costInputMode !== "total") {
      this.costInputMode = "total";
      this.onPurchaseConfigChange();
    }
  },

  currentPresetId(newVal) {
    if (newVal) localStorage.setItem(STORAGE_KEYS.LAST_LOT_ID, String(newVal));

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
    if (this.currentTab === "sales") {
      this.$nextTick(() => this.initSalesChart());
    }
  },

  portfolioChartView() {
    if (this.currentTab === "portfolio") {
      this.$nextTick(() => this.initPortfolioChart());
    }
  },

  portfolioPresetFilterIds: {
    handler() {
      try {
        localStorage.setItem(
          STORAGE_KEYS.PORTFOLIO_FILTER_IDS,
          JSON.stringify(this.portfolioPresetFilterIds)
        );
      } catch {
        // Ignore storage errors (private mode/quota restrictions).
      }

      if (this.currentTab === "portfolio") {
        this.$nextTick(() => this.initPortfolioChart());
      }
    },
    deep: true
  },

  sales: {
    handler() {
      this.saveSalesToStorage();
      if (this.currentTab === "sales") {
        this.$nextTick(() => this.initSalesChart());
      } else if (this.currentTab === "portfolio") {
        this.$nextTick(() => this.initPortfolioChart());
      }
    },
    deep: true
  }
};
