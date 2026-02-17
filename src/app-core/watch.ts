import type { AppWatchObject } from "./context.ts";

const LAST_TAB_STORAGE_KEY = "whatfees_last_tab";
const PORTFOLIO_FILTER_STORAGE_KEY = "whatfees_portfolio_filter_ids";

export const appWatch: AppWatchObject = {
  currentTab(newTab) {
    try {
      localStorage.setItem(LAST_TAB_STORAGE_KEY, newTab);
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

  currentPresetId(newVal) {
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
          PORTFOLIO_FILTER_STORAGE_KEY,
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
