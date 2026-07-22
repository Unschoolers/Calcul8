import { translateAppMessage } from "../../../../app-core/i18n/index.ts";
import type { GameSessionStateContext } from "../../../../app-core/context/game.ts";
import { getLotType, isSinglesLot } from "../../../../app-core/shared/lot-types.ts";
import { getTierChancePercent } from "../../../../app-core/shared/wheel-odds.ts";
import {
  getWheelTierSourceLotIds,
  isWheelTierMultiLot
} from "../../../../app-core/shared/wheel-tier-sources.ts";
import type { AppState, Lot, WheelConfig } from "../../../../types/app.ts";
import type { FeeProfileInput } from "../../../../domain/calculations.ts";
import { getWheelController } from "../services/gameSessionState.ts";
import {
  getWheelDisplayConfig,
  getWheelDisplaySlots,
  getWheelDisplaySpinCounts,
  getWheelDisplayTotalSpins
} from "../coordinator/gameComputedShared.ts";
import {
  calculateWheelLotCostPerPack,
  computeExpectedMargin,
  type WheelPackCostInput
} from "../services/wheelPricing.ts";
import type { WheelSlot } from "../services/wheelSlots.ts";
import {
  getAvailableSinglesQuantityForWheelTier,
  getRemainingPacksForWheelLot
} from "../services/wheelSaleSupport.ts";
import type { GameHostState } from "../services/gameHostState.ts";

type TierSourceItem = { title: string; value: number; lotType?: string; groupLabel?: string | null };
type InvalidLiveTier = { tierId: string; label: string; reason: string };
type WheelConfigComputedContext = FeeProfileInput
  & WheelPackCostInput
  & GameSessionStateContext
  & Pick<AppState, "lots" | "preferredLanguage" | "wheelConfigs" | "activeWheelConfigId">
  & Pick<GameHostState, "appliedWheelConfigSnapshot" | "editingWheelConfig" | "wheelMode">
  & {
    activeWheelConfig: WheelConfig | null;
    wheelInvalidLiveTiers: InvalidLiveTier[];
    tierSourceItems: TierSourceItem[];
  };

function getExpectedMargin(context: WheelConfigComputedContext): { config: WheelConfig | null; margin: number | null } {
  const config = context.editingWheelConfig ?? null;
  return {
    config,
    margin: config ? computeExpectedMargin(config, context, (context.lots || []) as Lot[]).margin : null
  };
}

function getNeededItemsReason(language: string, needed: number, remaining: number): string {
  return translateAppMessage(language, "wheelInvalidNeedsItems", {
    needed,
    neededSuffix: needed === 1 ? "" : "s",
    remaining: Math.max(0, remaining)
  });
}

export const wheelConfigComputeds = {
  hasPendingWheelChanges(this: WheelConfigComputedContext): boolean {
    const editing = this.editingWheelConfig;
    const active = this.activeWheelConfig;
    if (!editing || !active) return false;
    return JSON.stringify(editing) !== JSON.stringify(active);
  },

  wheelDisplayConfig(this: WheelConfigComputedContext): WheelConfig | null {
    return getWheelDisplayConfig(this);
  },

  wheelDisplaySlots(this: WheelConfigComputedContext): WheelSlot[] {
    return getWheelDisplaySlots(this);
  },

  wheelDisplayInventoryWarning(this: WheelConfigComputedContext): string {
    return String(getWheelController(this).wheelInventoryWarning || "");
  },

  wheelDisplaySpinCounts(this: WheelConfigComputedContext): number[] {
    return getWheelDisplaySpinCounts(this);
  },

  wheelDisplayTotalSpins(this: WheelConfigComputedContext): number {
    return getWheelDisplayTotalSpins(this);
  },

  wheelConfigItems(this: WheelConfigComputedContext): Array<{ title: string; value: number }> {
    const configs = (this.wheelConfigs || []) as WheelConfig[];
    return configs.map((c) => ({ title: c.name, value: c.id }));
  },

  lotItems(this: WheelConfigComputedContext): Array<{ title: string; value: number; lotType?: string }> {
    const lots = (this.lots || []) as Array<{ id: number; name: string; lotType?: string }>;
    return lots.map((lot) => ({
      title: lot.name,
      value: lot.id,
      lotType: lot.lotType
    }));
  },

  activeWheelConfig(this: WheelConfigComputedContext): WheelConfig | null {
    const activeId = this.activeWheelConfigId as number | null;
    if (activeId == null) return null;
    const appliedSnapshot = this.appliedWheelConfigSnapshot;
    if (appliedSnapshot?.id === activeId) return appliedSnapshot;
    const configs = (this.wheelConfigs || []) as WheelConfig[];
    return configs.find((c) => c.id === activeId) || null;
  },

  canApplyWheelConfig(this: WheelConfigComputedContext): boolean {
    const config = this.editingWheelConfig;
    if (!config) return false;
    if (config.gameType === "bracket") return true;
    if (!config.tiers.length) return false;
    const activeTiers = config.tiers.filter((tier) => getTierChancePercent(tier) > 0);
    return activeTiers.length > 0 && activeTiers.every((tier) => getWheelTierSourceLotIds(tier).length > 0);
  },

  wheelInvalidLiveTiers(this: WheelConfigComputedContext): InvalidLiveTier[] {
    const config = this.activeWheelConfig;
    const lots = (this.lots || []) as Lot[];
    const preferredLanguage = this.preferredLanguage ?? "";
    if (!config) return [];

    const invalid: InvalidLiveTier[] = [];
    for (const tier of config.tiers) {
      if (getTierChancePercent(tier) <= 0) continue;
      const sourceLotIds = getWheelTierSourceLotIds(tier);
      if (!sourceLotIds.length) {
        invalid.push({ tierId: tier.id, label: tier.label, reason: translateAppMessage(preferredLanguage, "wheelInvalidNoSourceLot") });
        continue;
      }

      if (isWheelTierMultiLot(tier)) {
        const candidateLots = sourceLotIds
          .map((id) => lots.find((entry) => entry.id === id))
          .filter((entry): entry is Lot => entry != null && !isSinglesLot(entry));
        if (!candidateLots.length) {
          invalid.push({ tierId: tier.id, label: tier.label, reason: translateAppMessage(preferredLanguage, "wheelInvalidLotMissing") });
          continue;
        }
        const needed = Math.max(1, tier.packsCount || 1);
        const bestRemaining = Math.max(...candidateLots.map((lot) => getRemainingPacksForWheelLot(this, lot.id)));
        if (tier.deductionType !== "none" && bestRemaining < needed) {
          invalid.push({
            tierId: tier.id,
            label: tier.label,
            reason: getNeededItemsReason(preferredLanguage, needed, bestRemaining)
          });
        }
        continue;
      }

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
                : getNeededItemsReason(preferredLanguage, needed, remaining)
            });
          }
        }
      } else if (tier.deductionType === "packs") {
        const remainingPacks = getRemainingPacksForWheelLot(this, tier.boundLotId);
        if (remainingPacks < (tier.packsCount || 0)) {
          invalid.push({
            tierId: tier.id,
            label: tier.label,
            reason: getNeededItemsReason(preferredLanguage, tier.packsCount || 0, remainingPacks)
          });
        }
      }

      if (tier.isChase === true && (tier.deductionType !== "singles" || tier.boundSinglesId == null)) {
        invalid.push({ tierId: tier.id, label: tier.label, reason: translateAppMessage(preferredLanguage, "wheelInvalidChaseNeedsSinglesItem") });
      }
    }
    return invalid;
  },

  wheelSpinBlockedReason(this: WheelConfigComputedContext): string {
    if (this.wheelMode === "config") return "";
    const pendingIssues = this.wheelPendingInventoryIssues ?? [];
    if (pendingIssues.some((entry) => entry.requiresLotSelection === true)) {
      return translateAppMessage(this.preferredLanguage ?? "", "wheelResolvePendingLotSelectionBeforeSpin");
    }
    const invalid = this.wheelInvalidLiveTiers ?? [];
    if (!invalid.length) return "";
    const first = invalid[0];
    return translateAppMessage(this.preferredLanguage ?? "", "wheelRepairBeforeLive", {
      label: first?.label || translateAppMessage(this.preferredLanguage ?? "", "wheelStageTierFallbackLabel"),
      reason: first?.reason || translateAppMessage(this.preferredLanguage ?? "", "wheelInvalidInventoryFallback")
    });
  },

  expectedMarginDisplay(this: WheelConfigComputedContext): string {
    const { config, margin } = getExpectedMargin(this);
    if (!config) return "—";
    return margin !== null ? margin.toFixed(1) + "%" : "—";
  },

  expectedMarginColor(this: WheelConfigComputedContext): string {
    const { config, margin } = getExpectedMargin(this);
    if (!config) return "";
    if (margin === null) return "";
    return margin >= 0 ? "rgb(var(--v-theme-success))" : "rgb(var(--v-theme-error))";
  },

  expectedMarginHint(this: WheelConfigComputedContext): string {
    const preferredLanguage = this.preferredLanguage ?? "";
    const { config, margin } = getExpectedMargin(this);
    if (!config) return translateAppMessage(preferredLanguage, "wheelExpectedMarginNoTiers");
    if (margin === null) return translateAppMessage(preferredLanguage, "wheelExpectedMarginNoSlots");
    return margin >= 0
      ? translateAppMessage(preferredLanguage, "wheelExpectedMarginPositive")
      : translateAppMessage(preferredLanguage, "wheelExpectedMarginNegative");
  },

  currentLotCostPerPack(this: WheelConfigComputedContext): number {
    return calculateWheelLotCostPerPack(this);
  },

  tierSourceItems(this: WheelConfigComputedContext): TierSourceItem[] {
    const lots = (this.lots || []) as Lot[];
    const selectableLots = lots.filter((lot) => {
      if (isSinglesLot(lot)) {
        return (lot.singlesPurchases || []).some((entry) => (
          getAvailableSinglesQuantityForWheelTier(this, lot.id, entry.id) > 0
        ));
      }
      return getRemainingPacksForWheelLot(this, lot.id) > 0;
    });
    const bulkLots = selectableLots.filter((lot) => !isSinglesLot(lot));
    const singlesLots = selectableLots.filter((lot) => isSinglesLot(lot));
    const sorted = [...bulkLots, ...singlesLots];
    const items: TierSourceItem[] = [];
    let prevType: string | null = null;
    for (const lot of sorted) {
      const type = getLotType(lot);
      items.push({
        title: lot.name,
        value: lot.id,
        lotType: type,
        groupLabel: prevType !== type
          ? translateAppMessage(
            this.preferredLanguage || "",
            type === "singles" ? "lotOptionSinglesLotsLabel" : "lotOptionBulkLotsLabel"
          )
          : null
      });
      prevType = type;
    }
    return items;
  },

  bulkTierSourceItems(this: WheelConfigComputedContext): TierSourceItem[] {
    return (this.tierSourceItems ?? [])
      .filter((item) => !isSinglesLot(item))
      .map((item, index) => ({
        ...item,
        groupLabel: index === 0
          ? translateAppMessage(this.preferredLanguage || "", "lotOptionBulkLotsLabel")
          : null
      }));
  }
};

