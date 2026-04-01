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

export const wheelComputeds = {
  wheelStageTitle(this: Record<string, unknown>): string {
    const displayConfig = (this as Record<string, unknown>).wheelDisplayConfig as WheelConfig | null;
    return displayConfig?.name || "Wheel Stage";
  },

  wheelStageModeLabel(this: Record<string, unknown>): string {
    return (this as Record<string, unknown>).wheelMode === "config" ? "config mode" : "live mode";
  },

  wheelStageSlotsLabel(this: Record<string, unknown>): string {
    const slots = (((this as Record<string, unknown>).wheelDisplaySlots || []) as WheelSlot[]).length;
    return `${slots} slots`;
  },

  wheelStageSpinPriceLabel(this: Record<string, unknown>): string {
    const displayConfig = (this as Record<string, unknown>).wheelDisplayConfig as WheelConfig | null;
    return `$${Number(displayConfig?.spinPrice || 0).toFixed(2)}/spin`;
  },

  wheelPresentationToggleTitle(this: Record<string, unknown>): string {
    return (this as Record<string, unknown>).wheelPresentationMode ? "Show config & tracker" : "Presentation mode";
  },

  wheelSpinButtonIcon(this: Record<string, unknown>): string {
    return (this as Record<string, unknown>).wheelMode === "config" ? "mdi-flask-outline" : "mdi-lightning-bolt";
  },

  wheelSpinButtonLabel(this: Record<string, unknown>): string {
    return (this as Record<string, unknown>).wheelMode === "config" ? "Test Spin" : "Spin";
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
      ? "Preview the wheel without recording sales, session counts, or realtime updates."
      : "Run the live wheel and record session totals, sales, and workspace updates.";
  },

  wheelCelebrationKicker(this: Record<string, unknown>): string {
    return (this as Record<string, unknown>).wheelCelebrationPreview ? "Preview Chase Hit" : "Chase Hit";
  },

  wheelFairnessIcon(this: Record<string, unknown>): string {
    return (this as Record<string, unknown>).wheelSpinning ? "mdi-lock" : "mdi-shield-check";
  },

  wheelFairnessIconColor(this: Record<string, unknown>): string {
    return (this as Record<string, unknown>).wheelSpinning ? "warning" : "success";
  },

  wheelFairnessTitle(this: Record<string, unknown>): string {
    return (this as Record<string, unknown>).wheelSpinning ? "Result Locked" : "Verified Fair";
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
    if (!count) return "No spins yet";
    return `${count} recent spin${count === 1 ? "" : "s"}`;
  },

  wheelConfirmTitle(this: Record<string, unknown>): string {
    const action = (this as Record<string, unknown>).wheelConfirmAction as "reset" | "delete" | "apply" | "";
    if (action === "reset") return "Reset Session?";
    if (action === "delete") return "Delete Wheel?";
    return "Rebuild Wheel?";
  },

  wheelConfirmBody(this: Record<string, unknown>): string {
    const action = (this as Record<string, unknown>).wheelConfirmAction as "reset" | "delete" | "apply" | "";
    const wheelMode = (this as Record<string, unknown>).wheelMode as "config" | "live";
    if (action === "reset") {
      return wheelMode === "config"
        ? "This will clear the preview test session for this wheel."
        : "This will clear all spin counts, revenue tracking, and skipped deductions for this live session. This cannot be undone.";
    }
    if (action === "delete") {
      return "This will permanently delete this wheel configuration. This cannot be undone.";
    }
    return "This will rebuild the wheel with your config changes. Matching live session progress will be preserved where possible.";
  },

  wheelConfirmButtonColor(this: Record<string, unknown>): string {
    const action = (this as Record<string, unknown>).wheelConfirmAction as "reset" | "delete" | "apply" | "";
    return action === "reset" || action === "delete" ? "error" : "primary";
  },

  wheelConfirmButtonLabel(this: Record<string, unknown>): string {
    const action = (this as Record<string, unknown>).wheelConfirmAction as "reset" | "delete" | "apply" | "";
    if (action === "reset") return "Reset";
    if (action === "delete") return "Delete";
    return "Rebuild";
  },

  wheelLiveConfirmSummaryName(this: Record<string, unknown>): string {
    const activeConfig = (this as Record<string, unknown>).activeWheelConfig as WheelConfig | null;
    return activeConfig?.name || "Current wheel";
  },

  wheelLiveConfirmSummarySlots(this: Record<string, unknown>): number {
    return (((this as Record<string, unknown>).activeWheelSlots || []) as WheelSlot[]).length;
  },

  wheelLiveConfirmSummarySpinPrice(this: Record<string, unknown>): string {
    const activeConfig = (this as Record<string, unknown>).activeWheelConfig as WheelConfig | null;
    return Number(activeConfig?.spinPrice || 0).toFixed(2);
  },

  wheelSkippedDeductionsTitle(this: Record<string, unknown>): string {
    const skippedCount = (((this as Record<string, unknown>).wheelSkippedDeductions || []) as unknown[]).length;
    return `Record ${skippedCount} skipped spin${skippedCount === 1 ? "" : "s"}`;
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
    if (!config) return [];

    const invalid: Array<{ tierId: string; label: string; reason: string }> = [];
    for (const tier of config.tiers) {
      if ((tier.slots || 0) <= 0) continue;
      if (tier.boundLotId == null) {
        invalid.push({ tierId: tier.id, label: tier.label, reason: "No source lot selected." });
        continue;
      }

      const lot = lots.find((entry) => entry.id === tier.boundLotId);
      if (!lot) {
        invalid.push({ tierId: tier.id, label: tier.label, reason: "Selected lot no longer exists." });
        continue;
      }

      if (tier.deductionType === "singles") {
        if (tier.boundSinglesId != null) {
          const remaining = getAvailableSinglesQuantityForWheelTier(this, tier.boundLotId, tier.boundSinglesId);
          if (remaining <= 0) {
            invalid.push({ tierId: tier.id, label: tier.label, reason: "Selected singles item is out of stock." });
          }
        }
      } else if (tier.deductionType === "packs") {
        const remainingPacks = getRemainingPacksForWheelLot(this, tier.boundLotId);
        if (remainingPacks < (tier.packsCount || 0)) {
          invalid.push({
            tierId: tier.id,
            label: tier.label,
            reason: `Needs ${tier.packsCount || 0} pack${(tier.packsCount || 0) === 1 ? "" : "s"}, but only ${remainingPacks} remain.`
          });
        }
      }

      if (tier.isChase === true && (tier.deductionType !== "singles" || tier.boundSinglesId == null)) {
        invalid.push({ tierId: tier.id, label: tier.label, reason: "Chase tiers must be tied to a specific singles item." });
      }
    }
    return invalid;
  },

  wheelSpinBlockedReason(this: Record<string, unknown>): string {
    if ((this as Record<string, unknown>).wheelMode === "config") return "";
    const invalid = ((this as Record<string, unknown>).wheelInvalidLiveTiers || []) as Array<{ label: string; reason: string }>;
    if (!invalid.length) return "";
    const first = invalid[0];
    return `Repair the wheel before going live: ${first?.label || "Tier"}: ${first?.reason || "Invalid inventory."}`;
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
    const config = (this as Record<string, unknown>).editingWheelConfig as WheelConfig | null;
    if (!config) return "Add some tiers";
    const { margin } = computeExpectedMargin(config, this as Record<string, unknown>, ((this as Record<string, unknown>).lots || []) as Lot[]);
    if (margin === null) return "Add some slots";
    const diff = margin - config.targetMargin;
    return diff >= 0
      ? `+${diff.toFixed(1)}% above ${config.targetMargin}% target`
      : `${diff.toFixed(1)}% below ${config.targetMargin}% target`;
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
    const revenue = this.wheelSessionRevenue as number;
    if (!revenue) return "No spins yet";
    const config = (this as Record<string, unknown>).wheelDisplayConfig as WheelConfig | null;
    const margin = ((this.wheelSessionProfit as number) / revenue) * 100;
    const diff = margin - (config?.targetMargin || 0);
    return diff >= 0
      ? `+${diff.toFixed(1)}% above ${config?.targetMargin || 0}% target`
      : `${diff.toFixed(1)}% below ${config?.targetMargin || 0}% target`;
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
            detail: "Singles source",
            remainingText: `${remainingForLot} card${remainingForLot === 1 ? "" : "s"} left`,
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
        existing.detail = `${existing.detail} • ${tier.packsCount || 0}/spin`;
        existing.tiers.push(tierEntry);
      } else {
        rows.push({
          key: rowKey,
          label: lot.name,
          detail: `Pack source • needs ${tier.packsCount || 0}/spin`,
          remainingText: `${remainingPacks} pack${remainingPacks === 1 ? "" : "s"} left`,
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
        groupLabel: prevType !== type ? (type === "singles" ? "Singles lots" : "Bulk lots") : null
      });
      prevType = type;
    }
    return items;
  }
};
