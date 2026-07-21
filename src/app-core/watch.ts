import type {
  LivePricingHydrationContext,
  SalesFreshnessContext
} from "./context/commerce.ts";
import type { AppWatchObject, TabSalesFreshnessContext } from "./context/watch.ts";
import { isDevNoLoginRoute } from "./dev-nologin.ts";
import { hydrateAuthoritativeLivePricingForLot } from "./methods/config-live-pricing.ts";
import { refreshPersonalLotSalesIfStale } from "./methods/sales-freshness.ts";
import { cancelQueuedPortfolioSalesHydration } from "./methods/sales-portfolio-hydration.ts";
import { cancelQueuedTabChartRefresh, queueTabChartRefreshAfterSettle } from "./methods/sales-ui-helpers.ts";
import { resetWhatnotSignedOutState, resetWhatnotTransientUiState } from "./methods/ui/whatnot/whatnot.ts";
import { refreshWorkspaceRealtime, stopWorkspaceRealtime } from "./methods/ui/workspace/workspace-realtime.ts";
import { getScopedLastLotStorageKey, STORAGE_KEYS } from "./storageKeys.ts";
import { getActiveStorageScope } from "./workspace-scope.ts";

const TAB_SALES_FRESHNESS_DELAY_MS = 500;
const TAB_CHART_SETTLE_DELAY_MS = 250;
const pendingTabSalesFreshnessTimeouts = new WeakMap<object, number>();

function queueCurrentLotSalesFreshnessCheck(
  context: SalesFreshnessContext,
  lotIdOverride?: number | null
): void {
  const currentLotId = Number(lotIdOverride ?? context.currentLotId);
  if (!Number.isFinite(currentLotId) || currentLotId <= 0) return;
  void refreshPersonalLotSalesIfStale(context, currentLotId).catch((error) => {
    console.warn("Failed to refresh personal lot sales from watcher", error);
  });
}

function hydrateCurrentLotLivePricing(
  context: LivePricingHydrationContext,
  lotIdOverride?: number | null
): void {
  const currentLotId = Number(lotIdOverride ?? context.currentLotId);
  if (!Number.isFinite(currentLotId) || currentLotId <= 0) return;
  void hydrateAuthoritativeLivePricingForLot(context, currentLotId).catch((error) => {
    console.warn("Failed to hydrate live pricing from watcher", error);
  });
}

function cancelQueuedTabSalesFreshnessCheck(context: object): void {
  const timeoutId = pendingTabSalesFreshnessTimeouts.get(context);
  if (timeoutId == null) return;
  globalThis.clearTimeout(timeoutId);
  pendingTabSalesFreshnessTimeouts.delete(context);
}

function queueCurrentLotSalesFreshnessCheckAfterTabSettle(
  context: TabSalesFreshnessContext,
  targetTab: "sales" | "portfolio"
): void {
  const currentLotId = Number(context.currentLotId);
  if (!Number.isFinite(currentLotId) || currentLotId <= 0) {
    cancelQueuedTabSalesFreshnessCheck(context as object);
    return;
  }

  cancelQueuedTabSalesFreshnessCheck(context as object);
  const timeoutId = globalThis.setTimeout(() => {
    pendingTabSalesFreshnessTimeouts.delete(context as object);
    if (context.currentTab !== targetTab) return;
    if (Number(context.currentLotId) !== currentLotId) return;
    queueCurrentLotSalesFreshnessCheck(context, currentLotId);
  }, TAB_SALES_FRESHNESS_DELAY_MS) as unknown as number;
  pendingTabSalesFreshnessTimeouts.set(context as object, timeoutId);
}

export const appWatch: AppWatchObject = {
  activeScopeType() {
    if (isDevNoLoginRoute()) return;
    void this.hydrateBuyerProfiles();
    refreshWorkspaceRealtime(this);
    resetWhatnotTransientUiState(this);
    if (this.isGoogleSignedIn) {
      void this.refreshWhatnotStatus();
    }
  },

  activeWorkspaceId() {
    if (isDevNoLoginRoute()) return;
    void this.hydrateBuyerProfiles();
    refreshWorkspaceRealtime(this);
    resetWhatnotTransientUiState(this);
    if (this.isGoogleSignedIn) {
      void this.refreshWhatnotStatus();
    }
  },

  preferredLanguage(newValue) {
    try {
      const normalized = String(newValue || "").trim();
      if (normalized) {
        localStorage.setItem(STORAGE_KEYS.LANGUAGE, normalized);
      } else {
        localStorage.removeItem(STORAGE_KEYS.LANGUAGE);
      }
    } catch {
      // Ignore storage errors (private mode/quota restrictions).
    }

    if (this.currentTab === "sales") {
      this.$nextTick(() => this.initSalesChart());
    } else if (this.currentTab === "portfolio") {
      this.$nextTick(() => this.initPortfolioChart());
    }

    if (!this.isGoogleSignedIn) {
      this.$nextTick(() => this.renderGoogleSignInButton());
    }
  },

  currentTab(newTab) {
    try {
      localStorage.setItem(STORAGE_KEYS.LAST_TAB, newTab);
    } catch {
      // Ignore storage errors (private mode/quota restrictions).
    }

    this.speedDialOpenSales = false;
    cancelQueuedTabSalesFreshnessCheck(this);
    cancelQueuedTabChartRefresh(this);
    cancelQueuedPortfolioSalesHydration(this);

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
      if (!isDevNoLoginRoute()) {
        refreshWorkspaceRealtime(this);
        queueCurrentLotSalesFreshnessCheckAfterTabSettle(this, "sales");
      }
      queueTabChartRefreshAfterSettle(this, "sales", TAB_CHART_SETTLE_DELAY_MS);
      return;
    }

    if (newTab === "portfolio") {
      if (!isDevNoLoginRoute()) {
        refreshWorkspaceRealtime(this);
        queueCurrentLotSalesFreshnessCheckAfterTabSettle(this, "portfolio");
      }
      queueTabChartRefreshAfterSettle(this, "portfolio", TAB_CHART_SETTLE_DELAY_MS);
      return;
    }

    if (!isDevNoLoginRoute()) {
      refreshWorkspaceRealtime(this);
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
      if (typeof this.stopGuidedOnboarding === "function") {
        this.stopGuidedOnboarding();
      }
      if (typeof this.syncGuidedOnboarding === "function") {
        this.syncGuidedOnboarding();
      }
      this.stopCloudSyncScheduler();
      stopWorkspaceRealtime(this);
      this.availableWorkspaces = [];
      this.workspaceMembers = [];
      this.workspacePresenceByUserId = {};
      this.buyerProfilesByKey = {};
      this.buyerProfilesScopeKey = "";
      this.buyerProfilesLoadStatus = "idle";
      this.buyerProfileSaveStates = {};
      this.showWorkspaceMembersModal = false;
      resetWhatnotSignedOutState(this);
      this.$nextTick(() => this.renderGoogleSignInButton());
      return;
    }

    if (this.isAuthSessionResolving) {
      return;
    }

    if (isDevNoLoginRoute()) {
      return;
    }
    this.startCloudSyncScheduler();
    void this.hydrateBuyerProfiles();
    void this.retryPendingBuyerProfiles();
    refreshWorkspaceRealtime(this);
    queueCurrentLotSalesFreshnessCheck(this);
    hydrateCurrentLotLivePricing(this);
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

    if (typeof this.syncGuidedOnboarding === "function") {
      this.syncGuidedOnboarding();
    }
  },

  currentLotId(newVal) {
    cancelQueuedTabSalesFreshnessCheck(this);
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
    queueCurrentLotSalesFreshnessCheck(this, newVal);
    hydrateCurrentLotLivePricing(this, newVal);
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

  portfolioDashboardPreset(newValue) {
    try {
      localStorage.setItem(STORAGE_KEYS.PORTFOLIO_DASHBOARD_PRESET, newValue);
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

  wheelPendingInventoryIssues: {
    handler() {
      this.saveWheelSessionToStorage();
    },
    deep: true
  }
};
