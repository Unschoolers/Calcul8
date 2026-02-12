import type { AppWatchObject } from "./context.ts";

export const appWatch: AppWatchObject = {
  currentTab(newTab) {
    this.speedDialOpen = false;
    this.speedDialOpenSales = false;

    if (newTab === "sales") {
      this.$nextTick(() => this.initSalesChart());
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

  sales: {
    handler() {
      this.saveSalesToStorage();
      if (this.currentTab === "sales" && this.chartView === "pie") {
        this.$nextTick(() => this.initSalesChart());
      }
    },
    deep: true
  }
};
