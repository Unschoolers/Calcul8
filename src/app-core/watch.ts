import type { AppWatchObject } from "./context.ts";
import { STORAGE_KEYS } from "./storageKeys.ts";

export const appWatch: AppWatchObject = {
  currentTab(newTab) {
    if (newTab === "live" && this.currentLotType === "singles") {
      this.currentTab = "config";
      this.notify("Live tab is disabled for Singles lots", "info");
      return;
    }

    try {
      localStorage.setItem(STORAGE_KEYS.LAST_TAB, newTab);
    } catch {
      // Ignore storage errors (private mode/quota restrictions).
    }

    this.speedDialOpenSales = false;

    if (newTab !== "portfolio" && this.portfolioChart) {
      const maybeDestroy = (this.portfolioChart as { destroy?: () => void }).destroy;
      if (typeof maybeDestroy === "function") {
        maybeDestroy.call(this.portfolioChart);
      }
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

  currentLotId(newVal) {
    if (newVal) localStorage.setItem(STORAGE_KEYS.LAST_LOT_ID, String(newVal));

    if (!newVal) {
      this.currentTab = "config";
      this.sales = [];
      if (this.salesChart) {
        const maybeDestroy = (this.salesChart as { destroy?: () => void }).destroy;
        if (typeof maybeDestroy === "function") {
          maybeDestroy.call(this.salesChart);
        }
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

  portfolioLotFilterIds: {
    handler() {
      try {
        localStorage.setItem(
          STORAGE_KEYS.PORTFOLIO_FILTER_IDS,
          JSON.stringify(this.portfolioLotFilterIds)
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
