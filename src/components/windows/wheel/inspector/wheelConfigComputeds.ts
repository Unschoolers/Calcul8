import { translateAppMessage } from "../../../../app-core/i18n/index.ts";
import { calculateTotalCaseCost } from "../../../../domain/calculations-fees.ts";
import { getTierChancePercent } from "../../../../app-core/shared/wheel-odds.ts";
import type { Lot, WheelConfig } from "../../../../types/app.ts";
import { getWheelController } from "../coordinator/wheelControllerState.ts";
import {
  getWheelDisplayConfig,
  getWheelDisplaySlots,
  getWheelDisplaySpinCounts,
  getWheelDisplayTotalSpins
} from "../coordinator/wheelComputedShared.ts";
import { computeExpectedMargin, type WheelSlot } from "../services/wheelHelpers.ts";
import {
  getAvailableSinglesQuantityForWheelTier,
  getRemainingPacksForWheelLot
} from "../services/wheelSaleSupport.ts";

export const wheelConfigComputeds = {
  hasPendingWheelChanges(this: Record<string, unknown>): boolean {
    const editing = (this as Record<string, unknown>).editingWheelConfig as WheelConfig | null;
    const active = (this as Record<string, unknown>).activeWheelConfig as WheelConfig | null;
    if (!editing || !active) return false;
    return JSON.stringify(editing) !== JSON.stringify(active);
  },

  wheelDisplayConfig(this: Record<string, unknown>): WheelConfig | null {
    return getWheelDisplayConfig(this as Record<string, unknown>);
  },

  wheelDisplaySlots(this: Record<string, unknown>): WheelSlot[] {
    return getWheelDisplaySlots(this as Record<string, unknown>);
  },

  wheelDisplayInventoryWarning(this: Record<string, unknown>): string {
    return String(getWheelController(this as Record<string, unknown>).inventoryWarning || "");
  },

  wheelDisplaySpinCounts(this: Record<string, unknown>): number[] {
    return getWheelDisplaySpinCounts(this as Record<string, unknown>);
  },

  wheelDisplayTotalSpins(this: Record<string, unknown>): number {
    return getWheelDisplayTotalSpins(this as Record<string, unknown>);
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
    const activeTiers = config.tiers.filter((tier) => getTierChancePercent(tier) > 0);
    return activeTiers.length > 0 && activeTiers.every((tier) => tier.boundLotId != null);
  },

  wheelInvalidLiveTiers(this: Record<string, unknown>): Array<{ tierId: string; label: string; reason: string }> {
    const config = (this as Record<string, unknown>).activeWheelConfig as WheelConfig | null;
    const lots = (this.lots || []) as Lot[];
    const preferredLanguage = String((this as Record<string, unknown>).preferredLanguage ?? "");
    if (!config) return [];

    const invalid: Array<{ tierId: string; label: string; reason: string }> = [];
    for (const tier of config.tiers) {
      if (getTierChancePercent(tier) <= 0) continue;
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
