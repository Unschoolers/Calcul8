import { translateAppMessage } from "../../../../app-core/i18n/index.ts";
import { getLotType } from "../../../../app-core/shared/lot-types.ts";
import { getTierChancePercent } from "../../../../app-core/shared/wheel-odds.ts";
import type { Lot, WheelConfig } from "../../../../types/app.ts";
import {
  calculateWheelSessionMarginPercent,
  getWheelDisplayChaseTallyHistory,
  getWheelDisplaySpinCounts,
  getWheelDisplaySlots,
  getWheelDisplayTotalSpins,
  getWheelSessionCost,
  getWheelSessionProfit,
  getWheelSessionRevenue
} from "../coordinator/gameComputedShared.ts";
import {
  getAvailableSinglesQuantityForWheelTier,
  getRemainingPacksForWheelLot
} from "../services/wheelSaleSupport.ts";

export const wheelSessionComputeds = {
  wheelSessionRevenue(this: Record<string, unknown>): number {
    return getWheelSessionRevenue(this as Record<string, unknown>);
  },

  wheelSessionCost(this: Record<string, unknown>): number {
    return getWheelSessionCost(this as Record<string, unknown>);
  },

  wheelSessionProfit(this: Record<string, unknown>): number {
    return getWheelSessionProfit(this as Record<string, unknown>);
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
    const margin = calculateWheelSessionMarginPercent(this as Record<string, unknown>);
    if (margin === null) return "—";
    return margin.toFixed(1) + "%";
  },

  wheelSessionMarginColor(this: Record<string, unknown>): string {
    const config = (this as Record<string, unknown>).wheelDisplayConfig as WheelConfig | null;
    const margin = calculateWheelSessionMarginPercent(this as Record<string, unknown>);
    if (margin === null) return "";
    if (margin >= (config?.targetMargin || 0)) return "rgb(var(--v-theme-success))";
    if (margin >= 0) return "rgb(var(--v-theme-warning))";
    return "rgb(var(--v-theme-error))";
  },

  wheelSessionMarginBarWidth(this: Record<string, unknown>): string {
    const margin = calculateWheelSessionMarginPercent(this as Record<string, unknown>);
    if (margin === null) return "0%";
    return Math.min(Math.max(margin, 0), 100) + "%";
  },

  wheelTargetMarginBarLeft(this: Record<string, unknown>): string {
    const config = (this as Record<string, unknown>).wheelDisplayConfig as WheelConfig | null;
    return Math.min(config?.targetMargin || 40, 99) + "%";
  },

  wheelSessionMarginHint(this: Record<string, unknown>): string {
    const preferredLanguage = String((this as Record<string, unknown>).preferredLanguage ?? "");
    const margin = calculateWheelSessionMarginPercent(this as Record<string, unknown>);
    if (margin === null) return translateAppMessage(preferredLanguage, "wheelSessionNoSpinsHint");
    const config = (this as Record<string, unknown>).wheelDisplayConfig as WheelConfig | null;
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
    const slots = getWheelDisplaySlots(this as Record<string, unknown>);
    const counts = getWheelDisplaySpinCounts(this as Record<string, unknown>);
    const tierTotals: Record<string, number> = {};
    slots.forEach((slot, i) => {
      tierTotals[slot.tier] = (tierTotals[slot.tier] || 0) + (counts[i] || 0);
    });
    const history = getWheelDisplayChaseTallyHistory(this as Record<string, unknown>);
    const historicalByTier: Record<string, number> = {};
    for (const h of history) {
      historicalByTier[h.tierId] = (historicalByTier[h.tierId] || 0) + h.count;
    }
    const result: Array<{ tierId: string; label: string; color: string; count: number }> = [];
    for (const t of config.tiers) {
      if (getTierChancePercent(t) <= 0) continue;
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
      if (getTierChancePercent(tier) <= 0 || tier.boundLotId == null) continue;
      const lot = lots.find((entry) => entry.id === tier.boundLotId);
      if (!lot) continue;

      const rowKey = `${tier.boundLotId}:${getLotType(lot) === "singles" ? "singles" : "packs"}`;

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
  }
};

