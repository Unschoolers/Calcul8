import type { AppWatchObject } from "./context.ts";
import { resetWhatnotSignedOutState, resetWhatnotTransientUiState } from "./methods/ui/whatnot.ts";
import { refreshWorkspaceRealtime, stopWorkspaceRealtime } from "./methods/ui/workspace-realtime.ts";
import { getScopedLastLotStorageKey, STORAGE_KEYS } from "./storageKeys.ts";
import { getActiveStorageScope } from "./workspace-scope.ts";

export const appWatch: AppWatchObject = {
  activeScopeType() {
    refreshWorkspaceRealtime(this);
    resetWhatnotTransientUiState(this);
    if (this.isGoogleSignedIn) {
      void this.refreshWhatnotStatus();
    }
  },

  activeWorkspaceId() {
    refreshWorkspaceRealtime(this);
    resetWhatnotTransientUiState(this);
    if (this.isGoogleSignedIn) {
      void this.refreshWhatnotStatus();
    }
  },

  currentTab(newTab) {
    try {
      localStorage.setItem(STORAGE_KEYS.LAST_TAB, newTab);
    } catch {
      // Ignore storage errors (private mode/quota restrictions).
    }

    this.speedDialOpenSales = false;

    if (newTab !== "portfolio") {
      if (this.portfolioChart) {
        const maybeDestroy = (this.portfolioChart as { destroy?: () => void }).destroy;
        if (typeof maybeDestroy === "function") {
          maybeDestroy.call(this.portfolioChart);
        }
        this.portfolioChart = null;
      }
      if (this.portfolioSalesByUserChart) {
        const maybeDestroy = (this.portfolioSalesByUserChart as { destroy?: () => void }).destroy;
        if (typeof maybeDestroy === "function") {
          maybeDestroy.call(this.portfolioSalesByUserChart);
        }
        this.portfolioSalesByUserChart = null;
      }
    }

    if (newTab === "sales") {
      refreshWorkspaceRealtime(this);
      this.$nextTick(() => this.initSalesChart());
      return;
    }

    if (newTab === "portfolio") {
      refreshWorkspaceRealtime(this);
      this.$nextTick(() => this.initPortfolioChart());
      return;
    }

    refreshWorkspaceRealtime(this);
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

  boxesPurchased(newValue, oldValue) {
    if (this.isHydratingLotConfig) return;

    const isTotalPurchaseMode = this.purchaseUiMode === "simple" || this.costInputMode === "total";
    if (!isTotalPurchaseMode) return;

    const previousBoxes = Math.max(0, Number(oldValue) || 0);
    const nextBoxes = Math.max(0, Number(newValue) || 0);
    if (previousBoxes <= 0 || nextBoxes <= 0) return;

    const currentPerBoxCost = Number(this.boxPriceCost) || 0;
    const anchoredTotalPurchase = currentPerBoxCost * previousBoxes;
    this.boxPriceCost = anchoredTotalPurchase / nextBoxes;
  },

  googleAuthEpoch() {
    if (!this.isGoogleSignedIn) {
      this.stopCloudSyncScheduler();
      stopWorkspaceRealtime(this);
      this.availableWorkspaces = [];
      this.workspaceMembers = [];
      this.workspacePresenceByUserId = {};
      this.showWorkspaceMembersModal = false;
      resetWhatnotSignedOutState(this);
      return;
    }

    this.startCloudSyncScheduler();
    refreshWorkspaceRealtime(this);
    void this.refreshWorkspaces();
    void this.refreshWhatnotStatus().then(() => {
      if (!this.whatnotCallbackStatus) return;
      const message = this.whatnotCallbackMessage
        || (this.whatnotCallbackStatus === "connected"
          ? "Whatnot connected."
          : "Whatnot connection failed.");
      this.notify(message, this.whatnotCallbackStatus === "connected" ? "success" : "error");
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete("whatnot");
        url.searchParams.delete("whatnotScope");
        url.searchParams.delete("whatnotMessage");
        window.history.replaceState({}, document.title, url.toString());
      } catch {
        // Ignore URL cleanup failures.
      }
      this.whatnotCallbackStatus = null;
      this.whatnotCallbackMessage = "";
    });

    if (this.pendingWorkspaceInviteToken) {
      void this.previewPendingWorkspaceInvite();
    }
  },

  currentLotId(newVal) {
    this.clearLiveSinglesSelection();
    if (newVal) {
      localStorage.setItem(
        getScopedLastLotStorageKey(getActiveStorageScope(this)),
        String(newVal)
      );
    }

    if (!newVal) {
      stopWorkspaceRealtime(this);
      this.currentTab = "config";
      this.sales = [];
      if (this.salesChart) {
        const maybeDestroy = (this.salesChart as { destroy?: () => void }).destroy;
        if (typeof maybeDestroy === "function") {
          maybeDestroy.call(this.salesChart);
        }
        this.salesChart = null;
      }
      return;
    }

    refreshWorkspaceRealtime(this);
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

  portfolioSalesByUserMetric() {
    if (this.currentTab === "portfolio") {
      this.$nextTick(() => this.initPortfolioChart());
    }
  },

  portfolioLotTypeFilter(newValue) {
    try {
      localStorage.setItem(STORAGE_KEYS.PORTFOLIO_FILTER_TYPE, newValue);
    } catch {
      // Ignore storage errors (private mode/quota restrictions).
    }

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
  },

  wheelConfigs: {
    handler() {
      this.saveWheelConfigsToStorage();
    },
    deep: true
  },

  wheelTotalSpins() {
    this.saveWheelSessionToStorage();
  },

  wheelSpinCounts: {
    handler() {
      this.saveWheelSessionToStorage();
    },
    deep: true
  },

  activeWheelConfigId() {
    this.saveWheelSessionToStorage();
  },

  wheelSkippedDeductions: {
    handler() {
      this.saveWheelSessionToStorage();
    },
    deep: true
  }
};
