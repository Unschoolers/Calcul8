import { translateAppMessage } from "../../../../app-core/i18n/index.ts";
import { getLotType } from "../../../../app-core/shared/lot-types.ts";
import { getTierChancePercent } from "../../../../app-core/shared/wheel-odds.ts";
import type { Lot, WheelConfig } from "../../../../types/app.ts";
import type { GameWindowThis } from "../coordinator/gameControllerState.ts";
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

type TierTally = { tierId: string; label: string; color: string; count: number };
type SessionSourceGroup = {
  key: string;
  label: string;
  detail: string;
  remainingText: string;
  warning: boolean;
  tiers: Array<TierTally & { warning: boolean }>;
};
type WheelSessionComputedContext = Record<string, unknown> & Partial<GameWindowThis> & {
  preferredLanguage?: string;
  wheelSessionProfit?: number;
  wheelTallyByTier?: TierTally[];
  wheelSessionSourceGroups?: SessionSourceGroup[];
};

export const wheelSessionComputeds = {
  wheelSessionRevenue(this: WheelSessionComputedContext): number {
    return getWheelSessionRevenue(this);
  },

  wheelSessionCost(this: WheelSessionComputedContext): number {
    return getWheelSessionCost(this);
  },

  wheelSessionProfit(this: WheelSessionComputedContext): number {
    return getWheelSessionProfit(this);
  },

  wheelSessionProfitClass(this: WheelSessionComputedContext): string {
    const profit = this.wheelSessionProfit ?? 0;
    return profit >= 0 ? "text-success" : "text-error";
  },

  wheelSessionProfitDisplay(this: WheelSessionComputedContext): string {
    const profit = this.wheelSessionProfit ?? 0;
    return `${profit >= 0 ? "$" : "-$"}${Math.abs(profit).toFixed(2)}`;
  },

  wheelSessionMarginDisplay(this: WheelSessionComputedContext): string {
    const margin = calculateWheelSessionMarginPercent(this);
    if (margin === null) return "—";
    return margin.toFixed(1) + "%";
  },

  wheelSessionMarginColor(this: WheelSessionComputedContext): string {
    const config = this.wheelDisplayConfig;
    const margin = calculateWheelSessionMarginPercent(this);
    if (margin === null) return "";
    if (margin >= (config?.targetMargin || 0)) return "rgb(var(--v-theme-success))";
    if (margin >= 0) return "rgb(var(--v-theme-warning))";
    return "rgb(var(--v-theme-error))";
  },

  wheelSessionMarginBarWidth(this: WheelSessionComputedContext): string {
    const margin = calculateWheelSessionMarginPercent(this);
    if (margin === null) return "0%";
    return Math.min(Math.max(margin, 0), 100) + "%";
  },

  wheelTargetMarginBarLeft(this: WheelSessionComputedContext): string {
    const config = this.wheelDisplayConfig;
    return Math.min(config?.targetMargin || 40, 99) + "%";
  },

  wheelSessionMarginHint(this: WheelSessionComputedContext): string {
    const preferredLanguage = this.preferredLanguage ?? "";
    const margin = calculateWheelSessionMarginPercent(this);
    if (margin === null) return translateAppMessage(preferredLanguage, "wheelSessionNoSpinsHint");
    const config = this.wheelDisplayConfig;
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

  wheelTallyByTier(this: WheelSessionComputedContext): TierTally[] {
    const config = this.wheelDisplayConfig;
    if (!config) return [];
    const slots = getWheelDisplaySlots(this);
    const counts = getWheelDisplaySpinCounts(this);
    const tierTotals: Record<string, number> = {};
    slots.forEach((slot, i) => {
      tierTotals[slot.tier] = (tierTotals[slot.tier] || 0) + (counts[i] || 0);
    });
    const history = getWheelDisplayChaseTallyHistory(this);
    const historicalByTier: Record<string, number> = {};
    for (const h of history) {
      historicalByTier[h.tierId] = (historicalByTier[h.tierId] || 0) + h.count;
    }
    const result: TierTally[] = [];
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

  wheelSessionSourceGroups(this: WheelSessionComputedContext): SessionSourceGroup[] {
    const config = this.wheelDisplayConfig;
    const lots = (this.lots || []) as Lot[];
    if (!config) return [];

    const tally = (this.wheelTallyByTier ?? []).reduce<Record<string, TierTally>>((acc, entry) => {
      acc[entry.tierId] = entry;
      return acc;
    }, {});

    const rows: SessionSourceGroup[] = [];

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
            detail: translateAppMessage(this.preferredLanguage ?? "", "wheelSourceDetailSingles"),
            remainingText: translateAppMessage(this.preferredLanguage ?? "", "wheelSourceItemsLeft", {
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
        existing.detail = `${existing.detail} • ${translateAppMessage(this.preferredLanguage ?? "", "wheelPerSpinSuffix", {
          count: tier.packsCount || 0
        })}`;
        existing.tiers.push(tierEntry);
      } else {
        rows.push({
          key: rowKey,
          label: lot.name,
          detail: translateAppMessage(this.preferredLanguage ?? "", "wheelSourceDetailItem", {
            count: tier.packsCount || 0
          }),
          remainingText: translateAppMessage(this.preferredLanguage ?? "", "wheelSourceItemsLeft", {
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

  wheelTrackerInventory(this: WheelSessionComputedContext): SessionSourceGroup[] {
    return this.wheelSessionSourceGroups ?? [];
  }
};

