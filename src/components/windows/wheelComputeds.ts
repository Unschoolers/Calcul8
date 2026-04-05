import { calculateTotalCaseCost } from "../../domain/calculations-fees.ts";
import type { Lot, WheelConfig } from "../../types/app.ts";
import {
  calculateAverageWheelSellingTaxPercent,
  calculateWheelBuyerShippingTotal,
  calculateWheelNetFromGross,
  computeExpectedMargin,
  type WheelSlot
} from "./wheelHelpers.ts";
import {
  getAvailableSinglesQuantityForWheelTier,
  getRemainingPacksForWheelLot
} from "./wheelSaleSupport.ts";
import { translateAppMessage } from "../../app-core/i18n/index.ts";

export const wheelComputeds = {
  wheelInspectorPanelMeta(this: Record<string, unknown>): { icon: string; title: string; subtitle: string } {
    const preferredLanguage = String((this as Record<string, unknown>).preferredLanguage ?? "");
    const tab = String((this as Record<string, unknown>).wheelInspectorTab || "config");
    if (tab === "session") {
      return {
        icon: "mdi-chart-box-outline",
        title: translateAppMessage(preferredLanguage, "wheelInspectorSessionTitle"),
        subtitle: translateAppMessage(preferredLanguage, "wheelInspectorSessionSubtitle")
      };
    }
    if (tab === "history") {
      return {
        icon: "mdi-history",
        title: translateAppMessage(preferredLanguage, "wheelInspectorHistoryTitle"),
        subtitle: translateAppMessage(preferredLanguage, "wheelInspectorHistorySubtitle")
      };
    }
    return {
      icon: "mdi-cog-outline",
      title: translateAppMessage(preferredLanguage, "wheelInspectorConfigTitle"),
      subtitle: translateAppMessage(preferredLanguage, "wheelInspectorConfigSubtitle")
    };
  },

  wheelInspectorTabItems(this: Record<string, unknown>): Array<{ id: "config" | "session" | "history"; icon: string; label: string }> {
    const preferredLanguage = String((this as Record<string, unknown>).preferredLanguage ?? "");
    const mode = String((this as Record<string, unknown>).wheelMode || "config");
    const items: Array<{ id: "config" | "session" | "history"; icon: string; label: string }> = [];
    if (mode === "config") {
      items.push({
        id: "config",
        icon: "mdi-tune",
        label: translateAppMessage(preferredLanguage, "wheelInspectorBuilderTabLabel")
      });
    }
    items.push({
      id: "session",
      icon: "mdi-chart-box-outline",
      label: translateAppMessage(preferredLanguage, "wheelInspectorSessionTabLabel")
    });
    items.push({
      id: "history",
      icon: "mdi-history",
      label: translateAppMessage(preferredLanguage, "wheelInspectorHistoryTabLabel")
    });
    return items;
  },

  wheelCompactFabActions(this: Record<string, unknown>): Array<{
    id: "history" | "session" | "builder" | "end";
    icon: string;
    color: string;
    title: string;
    actionType: "inspector" | "end";
    targetTab?: "config" | "session" | "history";
    disabled: boolean;
  }> {
    const preferredLanguage = String((this as Record<string, unknown>).preferredLanguage ?? "");
    const mode = String((this as Record<string, unknown>).wheelMode || "config");
    const hasLotSelected = Boolean((this as Record<string, unknown>).hasLotSelected);
    const actions: Array<{
      id: "history" | "session" | "builder" | "end";
      icon: string;
      color: string;
      title: string;
      actionType: "inspector" | "end";
      targetTab?: "config" | "session" | "history";
      disabled: boolean;
    }> = [
      {
        id: "history",
        icon: "mdi-history",
        color: "surface",
        title: translateAppMessage(preferredLanguage, "wheelInspectorHistoryTabLabel"),
        actionType: "inspector",
        targetTab: "history",
        disabled: !hasLotSelected
      },
      {
        id: "session",
        icon: "mdi-chart-box-outline",
        color: "secondary",
        title: translateAppMessage(preferredLanguage, "wheelInspectorSessionTabLabel"),
        actionType: "inspector",
        targetTab: "session",
        disabled: !hasLotSelected
      }
    ];
    if (mode === "config") {
      actions.push({
        id: "builder",
        icon: "mdi-tune",
        color: "secondary",
        title: translateAppMessage(preferredLanguage, "wheelInspectorBuilderTabLabel"),
        actionType: "inspector",
        targetTab: "config",
        disabled: !hasLotSelected
      });
    } else {
      actions.push({
        id: "end",
        icon: "mdi-flag-checkered",
        color: "error",
        title: translateAppMessage(preferredLanguage, "wheelEndSessionAction"),
        actionType: "end",
        disabled: !hasLotSelected || Boolean((this as Record<string, unknown>).wheelEndingSession)
      });
    }
    return actions;
  },

  wheelStageTitle(this: Record<string, unknown>): string {
    const displayConfig = (this as Record<string, unknown>).wheelDisplayConfig as WheelConfig | null;
    return displayConfig?.name || translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelStageTitleFallback");
  },

  wheelStageModeLabel(this: Record<string, unknown>): string {
    return (this as Record<string, unknown>).wheelMode === "config"
      ? translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelStageModeConfigLabel")
      : translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelStageModeLiveLabel");
  },

  wheelStageSlotsLabel(this: Record<string, unknown>): string {
    const slots = (((this as Record<string, unknown>).wheelDisplaySlots || []) as WheelSlot[]).length;
    return translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelStageSlotsValue", { count: slots });
  },

  wheelStageSpinPriceLabel(this: Record<string, unknown>): string {
    const displayConfig = (this as Record<string, unknown>).wheelDisplayConfig as WheelConfig | null;
    return translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelStageSpinPriceValue", {
      amount: Number(displayConfig?.spinPrice || 0).toFixed(2)
    });
  },

  wheelPresentationToggleTitle(this: Record<string, unknown>): string {
    return (this as Record<string, unknown>).wheelPresentationMode
      ? translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelPresentationToggleLabel")
      : translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelPresentationModeLabel");
  },

  wheelSpinButtonIcon(this: Record<string, unknown>): string {
    return (this as Record<string, unknown>).wheelMode === "config" ? "mdi-flask-outline" : "mdi-lightning-bolt";
  },

  wheelSpinButtonLabel(this: Record<string, unknown>): string {
    return (this as Record<string, unknown>).wheelMode === "config"
      ? translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelSpinTestButtonLabel")
      : translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelSpinButtonLabel");
  },

  wheelPrimarySpinDisabled(this: Record<string, unknown>): boolean {
    const isConfigMode = (this as Record<string, unknown>).wheelMode === "config";
    return Boolean(
      (this as Record<string, unknown>).wheelSpinning
      || !(((this as Record<string, unknown>).wheelDisplaySlots || []) as WheelSlot[]).length
      || (this as Record<string, unknown>).wheelEndingSession
      || (this as Record<string, unknown>).wheelChaseDialog
      || (!isConfigMode && (this as Record<string, unknown>).wheelSpinBlockedReason)
      || (!isConfigMode && (this as Record<string, unknown>).isWorkspaceScopeActive && !(this as Record<string, unknown>).isCurrentWorkspaceOwner)
    );
  },

  wheelStageCaption(this: Record<string, unknown>): string {
    return (this as Record<string, unknown>).wheelMode === "config"
      ? translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelStageCaptionConfig")
      : translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelStageCaptionLive");
  },

  wheelCelebrationKicker(this: Record<string, unknown>): string {
    return (this as Record<string, unknown>).wheelCelebrationPreview
      ? translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelCelebrationPreviewKicker")
      : translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelCelebrationLiveKicker");
  },

  wheelFairnessIcon(this: Record<string, unknown>): string {
    return (this as Record<string, unknown>).wheelSpinning ? "mdi-lock" : "mdi-shield-check";
  },

  wheelFairnessIconColor(this: Record<string, unknown>): string {
    return (this as Record<string, unknown>).wheelSpinning ? "warning" : "success";
  },

  wheelFairnessTitle(this: Record<string, unknown>): string {
    return (this as Record<string, unknown>).wheelSpinning
      ? translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelFairnessResultLockedTitle")
      : translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelFairnessVerifiedTitle");
  },

  wheelFairnessChevron(this: Record<string, unknown>): string {
    return (this as Record<string, unknown>).wheelShowSeed ? "mdi-chevron-up" : "mdi-chevron-down";
  },

  wheelDisplayFairnessHistory(this: Record<string, unknown>): Array<{
    spinNumber: number;
    label: string;
    color: string;
    hash: string;
    seed: string;
    timestamp: number;
  }> {
    const history = (((this as Record<string, unknown>).wheelMode === "config"
      ? (this as Record<string, unknown>).wheelPreviewFairnessHistory
      : (this as Record<string, unknown>).wheelFairnessHistory) || []) as Array<{
        spinNumber: number;
        label: string;
        color: string;
        hash: string;
        seed: string;
        timestamp: number;
      }>;
    return [...history].reverse();
  },

  wheelFairnessHistorySummary(this: Record<string, unknown>): string {
    const count = (((this as Record<string, unknown>).wheelDisplayFairnessHistory || []) as unknown[]).length;
    if (!count) return translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelNoSpinsYetLabel");
    return translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelFairnessRecentSpins", {
      count,
      suffix: count === 1 ? "" : "s"
    });
  },

  wheelLatestFairnessEntry(this: Record<string, unknown>): {
    spinNumber: number;
    label: string;
    color: string;
    hash: string;
    seed: string;
    timestamp: number;
  } | null {
    const preferredLanguage = String((this as Record<string, unknown>).preferredLanguage ?? "");
    const history = (((this as Record<string, unknown>).wheelDisplayFairnessHistory || []) as Array<{
      spinNumber: number;
      label: string;
      color: string;
      hash: string;
      seed: string;
      timestamp: number;
    }>);
    const latestHistory = history[0] || null;
    const currentHash = String((this as Record<string, unknown>).wheelSpinHash || "");
    const currentSeed = String((this as Record<string, unknown>).wheelSpinSeed || "");

    if (!currentHash) {
      return latestHistory;
    }

    const currentLabel = String((this as Record<string, unknown>).wheelLastResult || "")
      .replace(/^🎉\s*/, "")
      .trim();
    const spinNumber = Number((this as Record<string, unknown>).wheelDisplayTotalSpins || latestHistory?.spinNumber || 0);

    return {
      spinNumber: spinNumber > 0 ? spinNumber : (latestHistory?.spinNumber || 1),
      label: currentLabel || latestHistory?.label || translateAppMessage(preferredLanguage, "wheelFairnessLatestSpinLabel"),
      color: String((this as Record<string, unknown>).wheelLastResultColor || latestHistory?.color || "rgb(var(--v-theme-primary))"),
      hash: currentHash,
      seed: currentSeed || (latestHistory?.hash === currentHash ? latestHistory.seed : ""),
      timestamp: latestHistory?.timestamp || Date.now()
    };
  },

  wheelConfirmTitle(this: Record<string, unknown>): string {
    const action = (this as Record<string, unknown>).wheelConfirmAction as "reset" | "delete" | "apply" | "end" | "";
    if (action === "reset") return translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelConfirmResetTitle");
    if (action === "end") return translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelConfirmEndTitle");
    if (action === "delete") return translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelConfirmDeleteTitle");
    return translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelConfirmRebuildTitle");
  },

  wheelConfirmBody(this: Record<string, unknown>): string {
    const action = (this as Record<string, unknown>).wheelConfirmAction as "reset" | "delete" | "apply" | "end" | "";
    const wheelMode = (this as Record<string, unknown>).wheelMode as "config" | "live";
    if (action === "reset") {
      return wheelMode === "config"
        ? translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelConfirmResetConfigBody")
        : translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelConfirmResetLiveBody");
    }
    if (action === "end") {
      return translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelConfirmEndBody");
    }
    if (action === "delete") {
      return translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelConfirmDeleteBody");
    }
    return translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelConfirmRebuildBody");
  },

  wheelConfirmButtonColor(this: Record<string, unknown>): string {
    const action = (this as Record<string, unknown>).wheelConfirmAction as "reset" | "delete" | "apply" | "end" | "";
    return action === "reset" || action === "delete" || action === "end" ? "error" : "primary";
  },

  wheelConfirmButtonLabel(this: Record<string, unknown>): string {
    const action = (this as Record<string, unknown>).wheelConfirmAction as "reset" | "delete" | "apply" | "end" | "";
    if (action === "reset") return translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "commonReset");
    if (action === "end") return translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelEndSessionAction");
    if (action === "delete") return translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "commonDelete");
    return translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelRebuildAction");
  },

  wheelLiveConfirmSummaryName(this: Record<string, unknown>): string {
    const activeConfig = (this as Record<string, unknown>).activeWheelConfig as WheelConfig | null;
    return activeConfig?.name || translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelStageTitleFallback");
  },

  wheelLiveConfirmSummarySlots(this: Record<string, unknown>): number {
    return (((this as Record<string, unknown>).activeWheelSlots || []) as WheelSlot[]).length;
  },

  wheelLiveConfirmSummarySpinPrice(this: Record<string, unknown>): string {
    const activeConfig = (this as Record<string, unknown>).activeWheelConfig as WheelConfig | null;
    return Number(activeConfig?.spinPrice || 0).toFixed(2);
  },

  wheelPendingInventoryIssuesTitle(this: Record<string, unknown>): string {
    const issueCount = (((this as Record<string, unknown>).wheelPendingInventoryIssues || []) as unknown[]).length;
    return translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelPendingInventoryIssuesTitle", {
      count: issueCount,
      suffix: issueCount === 1 ? "" : "s"
    });
  },

  hasPendingWheelChanges(this: Record<string, unknown>): boolean {
    const editing = (this as Record<string, unknown>).editingWheelConfig as WheelConfig | null;
    const active = (this as Record<string, unknown>).activeWheelConfig as WheelConfig | null;
    if (!editing || !active) return false;
    return JSON.stringify(editing) !== JSON.stringify(active);
  },

  wheelDisplayConfig(this: Record<string, unknown>): WheelConfig | null {
    if ((this as Record<string, unknown>).wheelMode === "config") {
      return ((this as Record<string, unknown>).editingWheelConfig as WheelConfig | null)
        || ((this as Record<string, unknown>).activeWheelConfig as WheelConfig | null)
        || null;
    }
    return ((this as Record<string, unknown>).activeWheelConfig as WheelConfig | null) || null;
  },

  wheelDisplaySlots(this: Record<string, unknown>): WheelSlot[] {
    return (((this as Record<string, unknown>).wheelMode === "config"
      ? (this as Record<string, unknown>).wheelPreviewSlots
      : (this as Record<string, unknown>).activeWheelSlots) || []) as WheelSlot[];
  },

  wheelDisplaySpinCounts(this: Record<string, unknown>): number[] {
    return ((this as Record<string, unknown>).wheelMode === "config"
      ? (this as Record<string, unknown>).wheelPreviewSpinCounts
      : this.wheelSpinCounts || []) as number[];
  },

  wheelDisplayTotalSpins(this: Record<string, unknown>): number {
    return (((this as Record<string, unknown>).wheelMode === "config"
      ? (this as Record<string, unknown>).wheelPreviewTotalSpins
      : this.wheelTotalSpins) || 0) as number;
  },

  wheelConfigItems(this: Record<string, unknown>): Array<{ title: string; value: number }> {
    const configs = (this.wheelConfigs || []) as WheelConfig[];
    return configs.map((c) => ({ title: c.name, value: c.id }));
  },

  lotItems(this: Record<string, unknown>): Array<{ title: string; value: number; lotType?: string }> {
    const lots = (this.lots || []) as Array<{ id: number; name: string; lotType?: string }>;
    return lots.map((lot) => ({
      title: lot.name,
      value: lot.id,
      lotType: lot.lotType
    }));
  },

  activeWheelConfig(this: Record<string, unknown>): WheelConfig | null {
    const activeId = this.activeWheelConfigId as number | null;
    if (activeId == null) return null;
    const appliedSnapshot = ((this as Record<string, unknown>).appliedWheelConfigSnapshot as WheelConfig | null);
    if (appliedSnapshot?.id === activeId) return appliedSnapshot;
    const configs = (this.wheelConfigs || []) as WheelConfig[];
    return configs.find((c) => c.id === activeId) || null;
  },

  canApplyWheelConfig(this: Record<string, unknown>): boolean {
    const config = (this as Record<string, unknown>).editingWheelConfig as WheelConfig | null;
    if (!config || !config.tiers.length) return false;
    return config.tiers.every((t) => t.boundLotId != null);
  },

  wheelInvalidLiveTiers(this: Record<string, unknown>): Array<{ tierId: string; label: string; reason: string }> {
    const config = (this as Record<string, unknown>).activeWheelConfig as WheelConfig | null;
    const lots = (this.lots || []) as Lot[];
    const preferredLanguage = String((this as Record<string, unknown>).preferredLanguage ?? "");
    if (!config) return [];

    const invalid: Array<{ tierId: string; label: string; reason: string }> = [];
    for (const tier of config.tiers) {
      if ((tier.slots || 0) <= 0) continue;
      if (tier.boundLotId == null) {
        invalid.push({ tierId: tier.id, label: tier.label, reason: translateAppMessage(preferredLanguage, "wheelInvalidNoSourceLot") });
        continue;
      }

      const lot = lots.find((entry) => entry.id === tier.boundLotId);
      if (!lot) {
        invalid.push({ tierId: tier.id, label: tier.label, reason: translateAppMessage(preferredLanguage, "wheelInvalidLotMissing") });
        continue;
      }

      if (tier.deductionType === "singles") {
        if (tier.boundSinglesId != null) {
          const remaining = getAvailableSinglesQuantityForWheelTier(this, tier.boundLotId, tier.boundSinglesId);
          const needed = Math.max(1, tier.packsCount || 1);
          if (remaining < needed) {
            invalid.push({
              tierId: tier.id,
              label: tier.label,
              reason: remaining <= 0
                ? translateAppMessage(preferredLanguage, "wheelInvalidSinglesOutOfStock")
                : translateAppMessage(preferredLanguage, "wheelInvalidNeedsItems", {
                  needed,
                  neededSuffix: needed === 1 ? "" : "s",
                  remaining
                })
            });
          }
        }
      } else if (tier.deductionType === "packs") {
        const remainingPacks = getRemainingPacksForWheelLot(this, tier.boundLotId);
        if (remainingPacks < (tier.packsCount || 0)) {
          invalid.push({
            tierId: tier.id,
            label: tier.label,
            reason: translateAppMessage(preferredLanguage, "wheelInvalidNeedsItems", {
              needed: tier.packsCount || 0,
              neededSuffix: (tier.packsCount || 0) === 1 ? "" : "s",
              remaining: remainingPacks
            })
          });
        }
      }

      if (tier.isChase === true && (tier.deductionType !== "singles" || tier.boundSinglesId == null)) {
        invalid.push({ tierId: tier.id, label: tier.label, reason: translateAppMessage(preferredLanguage, "wheelInvalidChaseNeedsSinglesItem") });
      }
    }
    return invalid;
  },

  wheelSpinBlockedReason(this: Record<string, unknown>): string {
    if ((this as Record<string, unknown>).wheelMode === "config") return "";
    const invalid = ((this as Record<string, unknown>).wheelInvalidLiveTiers || []) as Array<{ label: string; reason: string }>;
    if (!invalid.length) return "";
    const first = invalid[0];
    return translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelRepairBeforeLive", {
      label: first?.label || translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelStageTierFallbackLabel"),
      reason: first?.reason || translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelInvalidInventoryFallback")
    });
  },

  expectedMarginDisplay(this: Record<string, unknown>): string {
    const config = (this as Record<string, unknown>).editingWheelConfig as WheelConfig | null;
    if (!config) return "—";
    const { margin } = computeExpectedMargin(config, this as Record<string, unknown>, ((this as Record<string, unknown>).lots || []) as Lot[]);
    return margin !== null ? margin.toFixed(1) + "%" : "—";
  },

  expectedMarginColor(this: Record<string, unknown>): string {
    const config = (this as Record<string, unknown>).editingWheelConfig as WheelConfig | null;
    if (!config) return "";
    const { margin } = computeExpectedMargin(config, this as Record<string, unknown>, ((this as Record<string, unknown>).lots || []) as Lot[]);
    if (margin === null) return "";
    return margin >= config.targetMargin ? "rgb(var(--v-theme-success))" : "rgb(var(--v-theme-error))";
  },

  expectedMarginHint(this: Record<string, unknown>): string {
    const preferredLanguage = String((this as Record<string, unknown>).preferredLanguage ?? "");
    const config = (this as Record<string, unknown>).editingWheelConfig as WheelConfig | null;
    if (!config) return translateAppMessage(preferredLanguage, "wheelExpectedMarginNoTiers");
    const { margin } = computeExpectedMargin(config, this as Record<string, unknown>, ((this as Record<string, unknown>).lots || []) as Lot[]);
    if (margin === null) return translateAppMessage(preferredLanguage, "wheelExpectedMarginNoSlots");
    const diff = margin - config.targetMargin;
    return diff >= 0
      ? translateAppMessage(preferredLanguage, "wheelExpectedMarginAboveTarget", {
        diff: diff.toFixed(1),
        target: config.targetMargin
      })
      : translateAppMessage(preferredLanguage, "wheelExpectedMarginBelowTarget", {
        diff: diff.toFixed(1),
        target: config.targetMargin
      });
  },

  wheelSessionRevenue(this: Record<string, unknown>): number {
    const config = (((this as Record<string, unknown>).wheelDisplayConfig
      || (this as Record<string, unknown>).activeWheelConfig)) as WheelConfig | null;
    const totalSpins = (((this as Record<string, unknown>).wheelDisplayTotalSpins
      ?? (this as Record<string, unknown>).wheelTotalSpins
      ?? 0)) as number;
    return totalSpins * (config?.spinPrice || 0);
  },

  wheelSessionCost(this: Record<string, unknown>): number {
    const slots = (((this as Record<string, unknown>).wheelDisplaySlots
      || (this as Record<string, unknown>).activeWheelSlots
      || []) as WheelSlot[]);
    const counts = ((((this as Record<string, unknown>).wheelDisplaySpinCounts
      || (this as Record<string, unknown>).wheelSpinCounts
      || [])) as number[]);
    const base = counts.reduce((sum, count, i) => sum + count * (slots[i]?.cost || 0), 0);
    const adjustment = ((this as Record<string, unknown>).wheelMode === "config"
      ? 0
      : ((this as Record<string, unknown>).wheelSessionCostAdjustment as number || 0));
    return base + adjustment;
  },

  wheelSessionProfit(this: Record<string, unknown>): number {
    if ((this as Record<string, unknown>).wheelMode !== "config") {
      const storedNetRevenue = (this as Record<string, unknown>).wheelSessionNetRevenue as number | null | undefined;
      if (storedNetRevenue != null && Number.isFinite(Number(storedNetRevenue))) {
        return Number(storedNetRevenue) - (this.wheelSessionCost as number);
      }
    }

    const config = (((this as Record<string, unknown>).wheelDisplayConfig
      || (this as Record<string, unknown>).activeWheelConfig)) as WheelConfig | null;
    const slots = (((this as Record<string, unknown>).wheelDisplaySlots
      || (this as Record<string, unknown>).activeWheelSlots
      || []) as WheelSlot[]);
    const spinCounts = ((((this as Record<string, unknown>).wheelDisplaySpinCounts
      || (this as Record<string, unknown>).wheelSpinCounts
      || [])) as number[]);
    const lots = (((this as Record<string, unknown>).lots || []) as Lot[]);
    const grossRevenue = this.wheelSessionRevenue as number;
    const totalSpins = (this.wheelDisplayTotalSpins || 0) as number;
    const shippingTotal = calculateWheelBuyerShippingTotal(config, slots, spinCounts, lots);
    const buyerShippingPerOrder = totalSpins > 0 ? (shippingTotal / totalSpins) : 0;
    const sellingTaxPercent = config ? calculateAverageWheelSellingTaxPercent(config, lots) : 0;
    const netRevenue = calculateWheelNetFromGross(
      grossRevenue,
      this as Record<string, unknown>,
      totalSpins,
      buyerShippingPerOrder,
      sellingTaxPercent
    );
    return netRevenue - (this.wheelSessionCost as number);
  },

  wheelSessionProfitClass(this: Record<string, unknown>): string {
    const profit = (this as Record<string, unknown>).wheelSessionProfit as number;
    return profit >= 0 ? "text-success" : "text-error";
  },

  wheelSessionProfitDisplay(this: Record<string, unknown>): string {
    const profit = (this as Record<string, unknown>).wheelSessionProfit as number;
    return `${profit >= 0 ? "$" : "-$"}${Math.abs(profit).toFixed(2)}`;
  },

  wheelSessionMarginDisplay(this: Record<string, unknown>): string {
    const revenue = this.wheelSessionRevenue as number;
    if (!revenue) return "—";
    const margin = ((this.wheelSessionProfit as number) / revenue) * 100;
    return margin.toFixed(1) + "%";
  },

  wheelSessionMarginColor(this: Record<string, unknown>): string {
    const revenue = this.wheelSessionRevenue as number;
    if (!revenue) return "";
    const config = (this as Record<string, unknown>).wheelDisplayConfig as WheelConfig | null;
    const margin = ((this.wheelSessionProfit as number) / revenue) * 100;
    if (margin >= (config?.targetMargin || 0)) return "rgb(var(--v-theme-success))";
    if (margin >= 0) return "rgb(var(--v-theme-warning))";
    return "rgb(var(--v-theme-error))";
  },

  wheelSessionMarginBarWidth(this: Record<string, unknown>): string {
    const revenue = this.wheelSessionRevenue as number;
    if (!revenue) return "0%";
    const margin = ((this.wheelSessionProfit as number) / revenue) * 100;
    return Math.min(Math.max(margin, 0), 100) + "%";
  },

  wheelTargetMarginBarLeft(this: Record<string, unknown>): string {
    const config = (this as Record<string, unknown>).wheelDisplayConfig as WheelConfig | null;
    return Math.min(config?.targetMargin || 40, 99) + "%";
  },

  wheelSessionMarginHint(this: Record<string, unknown>): string {
    const preferredLanguage = String((this as Record<string, unknown>).preferredLanguage ?? "");
    const revenue = this.wheelSessionRevenue as number;
    if (!revenue) return translateAppMessage(preferredLanguage, "wheelSessionNoSpinsHint");
    const config = (this as Record<string, unknown>).wheelDisplayConfig as WheelConfig | null;
    const margin = ((this.wheelSessionProfit as number) / revenue) * 100;
    const diff = margin - (config?.targetMargin || 0);
    return diff >= 0
      ? translateAppMessage(preferredLanguage, "wheelSessionAboveTarget", {
        diff: diff.toFixed(1),
        target: config?.targetMargin || 0
      })
      : translateAppMessage(preferredLanguage, "wheelSessionBelowTarget", {
        diff: diff.toFixed(1),
        target: config?.targetMargin || 0
      });
  },

  wheelTallyByTier(this: Record<string, unknown>): Array<{ tierId: string; label: string; color: string; count: number }> {
    const config = (this as Record<string, unknown>).wheelDisplayConfig as WheelConfig | null;
    if (!config) return [];
    const slots = (this as Record<string, unknown>).wheelDisplaySlots as WheelSlot[];
    const counts = (this.wheelDisplaySpinCounts || []) as number[];
    const tierTotals: Record<string, number> = {};
    slots.forEach((slot, i) => {
      tierTotals[slot.tier] = (tierTotals[slot.tier] || 0) + (counts[i] || 0);
    });
    const history = ((this as Record<string, unknown>).wheelMode === "config"
      ? (this as Record<string, unknown>).wheelPreviewChaseTallyHistory
      : (this as Record<string, unknown>).wheelChaseTallyHistory) as Array<{ tierId: string; label: string; color: string; count: number }>;
    const historicalByTier: Record<string, number> = {};
    for (const h of history) {
      historicalByTier[h.tierId] = (historicalByTier[h.tierId] || 0) + h.count;
    }
    const result: Array<{ tierId: string; label: string; color: string; count: number }> = [];
    for (const t of config.tiers) {
      if (t.slots <= 0) continue;
      for (const h of history) {
        if (h.tierId === t.id && h.count > 0) result.push(h);
      }
      const remaining = (tierTotals[t.id] || 0) - (historicalByTier[t.id] || 0);
      if (remaining > 0 || !historicalByTier[t.id]) {
        result.push({ tierId: t.id, label: t.label, color: t.color, count: Math.max(remaining, 0) });
      }
    }
    return result;
  },

  wheelSessionSourceGroups(this: Record<string, unknown>): Array<{
    key: string;
    label: string;
    detail: string;
    remainingText: string;
    warning: boolean;
    tiers: Array<{ tierId: string; label: string; color: string; count: number; warning: boolean }>;
  }> {
    const config = (this as Record<string, unknown>).wheelDisplayConfig as WheelConfig | null;
    const lots = (this.lots || []) as Lot[];
    if (!config) return [];

    const tally = (((this as Record<string, unknown>).wheelTallyByTier || []) as Array<{
      tierId: string;
      label: string;
      color: string;
      count: number;
    }>).reduce<Record<string, { tierId: string; label: string; color: string; count: number }>>((acc, entry) => {
      acc[entry.tierId] = entry;
      return acc;
    }, {});

    const rows: Array<{
      key: string;
      label: string;
      detail: string;
      remainingText: string;
      warning: boolean;
      tiers: Array<{ tierId: string; label: string; color: string; count: number; warning: boolean }>;
    }> = [];

    for (const tier of config.tiers) {
      if ((tier.slots || 0) <= 0 || tier.boundLotId == null) continue;
      const lot = lots.find((entry) => entry.id === tier.boundLotId);
      if (!lot) continue;

      const rowKey = `${tier.boundLotId}:${lot.lotType === "singles" ? "singles" : "packs"}`;

      if (tier.deductionType === "singles") {
        const purchase = tier.boundSinglesId != null
          ? lot.singlesPurchases?.find((entry) => entry.id === tier.boundSinglesId)
          : null;
        const tierDisplayLabel = purchase?.cardNumber
          ? `${tier.label} #${purchase.cardNumber}`
          : tier.label;
        const remainingForTier = tier.boundSinglesId != null
          ? getAvailableSinglesQuantityForWheelTier(this, tier.boundLotId, tier.boundSinglesId)
          : ((lot.singlesPurchases || []).reduce((sum, entry) => (
            sum + Math.max(0, getAvailableSinglesQuantityForWheelTier(this, tier.boundLotId as number, entry.id))
          ), 0));
        const remainingForLot = (lot.singlesPurchases || []).reduce((sum, entry) => (
          sum + Math.max(0, getAvailableSinglesQuantityForWheelTier(this, tier.boundLotId as number, entry.id))
        ), 0);
        const existing = rows.find((entry) => entry.key === rowKey);
        const tierEntry = {
          ...(tally[tier.id] || { tierId: tier.id, label: tierDisplayLabel, color: tier.color, count: 0 }),
          label: tierDisplayLabel,
          warning: remainingForTier <= Math.max(1, tier.packsCount || 1)
        };
        if (existing) {
          existing.tiers.push(tierEntry);
        } else {
          rows.push({
            key: rowKey,
            label: lot.name,
            detail: translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelSourceDetailSingles"),
            remainingText: translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelSourceItemsLeft", {
              count: remainingForLot,
              suffix: remainingForLot === 1 ? "" : "s"
            }),
            warning: false,
            tiers: [tierEntry]
          });
        }
        continue;
      }

      const remainingPacks = getRemainingPacksForWheelLot(this, tier.boundLotId);
      const existing = rows.find((entry) => entry.key === rowKey);
      const tierEntry = {
        ...(tally[tier.id] || { tierId: tier.id, label: tier.label, color: tier.color, count: 0 }),
        warning: remainingPacks <= Math.max(1, tier.packsCount || 1)
      };
      if (existing) {
        existing.detail = `${existing.detail} • ${translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelPerSpinSuffix", {
          count: tier.packsCount || 0
        })}`;
        existing.tiers.push(tierEntry);
      } else {
        rows.push({
          key: rowKey,
          label: lot.name,
          detail: translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelSourceDetailItem", {
            count: tier.packsCount || 0
          }),
          remainingText: translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelSourceItemsLeft", {
            count: remainingPacks,
            suffix: remainingPacks === 1 ? "" : "s"
          }),
          warning: false,
          tiers: [tierEntry]
        });
      }
    }

    return rows;
  },

  wheelTrackerInventory(this: Record<string, unknown>) {
    return (this as Record<string, unknown>).wheelSessionSourceGroups;
  },

  wheelStageSummaryCards(this: Record<string, unknown>): Array<{
    id: string;
    label: string;
    value: string | number;
    meta: string;
    valueClass?: string;
    valueStyle?: string;
  }> {
    const preferredLanguage = String((this as Record<string, unknown>).preferredLanguage ?? "");
    const mode = String((this as Record<string, unknown>).wheelMode || "config");
    if (mode === "live") {
      return [
        {
          id: "spins",
          label: translateAppMessage(preferredLanguage, "wheelSpinsLabel"),
          value: Number((this as Record<string, unknown>).wheelTotalSpins || 0),
          meta: translateAppMessage(preferredLanguage, "wheelLiveRevenueMeta", {
            amount: Number((this as Record<string, unknown>).wheelSessionRevenue || 0).toFixed(2)
          })
        },
        {
          id: "profit",
          label: translateAppMessage(preferredLanguage, "wheelGrossProfitLabel"),
          value: String((this as Record<string, unknown>).wheelSessionProfitDisplay || ""),
          meta: translateAppMessage(preferredLanguage, "wheelLivePrizeCostMeta", {
            amount: Number((this as Record<string, unknown>).wheelSessionCost || 0).toFixed(2)
          }),
          valueClass: String((this as Record<string, unknown>).wheelSessionProfitClass || "")
        },
        {
          id: "margin",
          label: translateAppMessage(preferredLanguage, "wheelSessionMarginLabel"),
          value: String((this as Record<string, unknown>).wheelSessionMarginDisplay || "—"),
          meta: String((this as Record<string, unknown>).wheelSessionMarginHint || ""),
          valueStyle: String((this as Record<string, unknown>).wheelSessionMarginColor || "")
        }
      ];
    }

    return [
      {
        id: "expected-margin",
        label: translateAppMessage(preferredLanguage, "wheelStageExpectedMarginLabel"),
        value: String((this as Record<string, unknown>).expectedMarginDisplay || "—"),
        meta: String((this as Record<string, unknown>).expectedMarginHint || ""),
        valueStyle: String((this as Record<string, unknown>).expectedMarginColor || "")
      },
      {
        id: "target-margin",
        label: translateAppMessage(preferredLanguage, "wheelStageTargetMarginLabel"),
        value: `${Number(((this as Record<string, unknown>).wheelDisplayConfig as WheelConfig | null)?.targetMargin || 0)}%`,
        meta: translateAppMessage(preferredLanguage, "wheelConfiguredSlotsMeta", {
          count: (((this as Record<string, unknown>).wheelDisplaySlots || []) as WheelSlot[]).length
        })
      },
      {
        id: "builder-status",
        label: translateAppMessage(preferredLanguage, "wheelBuilderLabel"),
        value: Boolean((this as Record<string, unknown>).hasPendingWheelChanges)
          ? translateAppMessage(preferredLanguage, "wheelBuilderPendingLabel")
          : translateAppMessage(preferredLanguage, "wheelBuilderReadyLabel"),
        meta: Boolean((this as Record<string, unknown>).hasPendingWheelChanges)
          ? translateAppMessage(preferredLanguage, "wheelBuilderPendingHelp")
          : translateAppMessage(preferredLanguage, "wheelBuilderReadyHelp")
      }
    ];
  },

  currentLotCostPerPack(this: Record<string, unknown>): number {
    const boxes = Number(this.boxesPurchased) || 0;
    const packsPerBox = Number(this.packsPerBox) || 16;
    const totalPacks = boxes * packsPerBox;
    if (totalPacks <= 0) return 0;
    const totalCost = calculateTotalCaseCost({
      boxesPurchased: boxes,
      pricePerBoxCad: Number(this.boxPriceCost) || 0,
      purchaseShippingCad: Number(this.purchaseShippingCost) || 0,
      purchaseTaxPercent: Number(this.purchaseTaxPercent) || 0,
      includeTax: (this.includeTax as boolean) ?? false,
      currency: (this.currency as "CAD" | "USD") || "CAD"
    });
    return totalCost / totalPacks;
  },

  tierSourceItems(this: Record<string, unknown>): Array<{ title: string; value: number; lotType?: string; groupLabel?: string | null }> {
    const lots = (this.lots || []) as Lot[];
    const selectableLots = lots.filter((lot) => {
      if (lot.lotType === "singles") {
        return (lot.singlesPurchases || []).some((entry) => (
          getAvailableSinglesQuantityForWheelTier(this, lot.id, entry.id) > 0
        ));
      }
      return getRemainingPacksForWheelLot(this, lot.id) > 0;
    });
    const bulkLots = selectableLots.filter((l) => l.lotType !== "singles");
    const singlesLots = selectableLots.filter((l) => l.lotType === "singles");
    const sorted = [...bulkLots, ...singlesLots];
    const items: Array<{ title: string; value: number; lotType?: string; groupLabel?: string | null }> = [];
    let prevType: string | null = null;
    for (const lot of sorted) {
      const type = lot.lotType === "singles" ? "singles" : "bulk";
      items.push({
        title: lot.name,
        value: lot.id,
        lotType: type,
        groupLabel: prevType !== type
          ? translateAppMessage(
            String((this as Record<string, unknown>).preferredLanguage || ""),
            type === "singles" ? "lotOptionSinglesLotsLabel" : "lotOptionBulkLotsLabel"
          )
          : null
      });
      prevType = type;
    }
    return items;
  }
};
