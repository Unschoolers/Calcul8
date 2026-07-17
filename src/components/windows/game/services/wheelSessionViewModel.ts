import { translateAppMessage } from "../../../../app-core/i18n/index.ts";
import { getLotType } from "../../../../app-core/shared/lot-types.ts";
import { getTierChancePercent } from "../../../../app-core/shared/wheel-odds.ts";
import type { Lot, WheelConfig } from "../../../../types/app.ts";
import {
  calculateWheelSessionMarginPercent,
  getWheelDisplayChaseTallyHistory,
  getWheelDisplayConfig,
  getWheelDisplaySlots,
  getWheelDisplaySpinCounts,
  getWheelDisplayTotalSpins,
  getWheelSessionCost,
  getWheelSessionProfit,
  getWheelSessionRevenue
} from "../coordinator/gameComputedShared.ts";
import {
  getAvailableSinglesQuantityForWheelTier,
  getRemainingPacksForWheelLot
} from "./wheelSaleSupport.ts";

export type WheelTierTally = {
  tierId: string;
  label: string;
  color: string;
  count: number;
};

export type WheelSessionSourceGroup = {
  key: string;
  label: string;
  detail: string;
  remainingText: string;
  warning: boolean;
  tiers: Array<WheelTierTally & { warning: boolean }>;
};

export type WheelSessionViewModel = {
  config: WheelConfig | null;
  totalSpins: number;
  revenue: number;
  cost: number;
  profit: number;
  profitClass: string;
  profitDisplay: string;
  marginPercent: number | null;
  marginDisplay: string;
  marginColor: string;
  marginBarWidth: string;
  targetMarginBarLeft: string;
  marginHint: string;
  tallyByTier: WheelTierTally[];
  sourceGroups: WheelSessionSourceGroup[];
};

type SessionContext = Record<string, unknown>;

function getSessionConfig(context: SessionContext): WheelConfig | null {
  return (context.wheelDisplayConfig as WheelConfig | null | undefined)
    ?? getWheelDisplayConfig(context);
}

function getSessionSlots(context: SessionContext) {
  return Array.isArray(context.wheelDisplaySlots)
    ? context.wheelDisplaySlots
    : getWheelDisplaySlots(context);
}

function getSessionSpinCounts(context: SessionContext): number[] {
  return Array.isArray(context.wheelDisplaySpinCounts)
    ? context.wheelDisplaySpinCounts as number[]
    : getWheelDisplaySpinCounts(context);
}

function buildTallyByTier(context: SessionContext, config: WheelConfig | null): WheelTierTally[] {
  if (!config) return [];
  const slots = getSessionSlots(context);
  const counts = getSessionSpinCounts(context);
  const tierTotals: Record<string, number> = {};
  slots.forEach((slot, index) => {
    tierTotals[slot.tier] = (tierTotals[slot.tier] || 0) + (counts[index] || 0);
  });

  const history = getWheelDisplayChaseTallyHistory(context);
  const historicalByTier: Record<string, number> = {};
  for (const entry of history) {
    historicalByTier[entry.tierId] = (historicalByTier[entry.tierId] || 0) + entry.count;
  }

  const result: WheelTierTally[] = [];
  for (const tier of config.tiers) {
    if (getTierChancePercent(tier) <= 0) continue;
    result.push(...history.filter((entry) => entry.tierId === tier.id && entry.count > 0));
    const remaining = (tierTotals[tier.id] || 0) - (historicalByTier[tier.id] || 0);
    if (remaining > 0 || !historicalByTier[tier.id]) {
      result.push({
        tierId: tier.id,
        label: tier.label,
        color: tier.color,
        count: Math.max(remaining, 0)
      });
    }
  }
  return result;
}

export function buildWheelSessionSourceGroups(
  context: SessionContext,
  config: WheelConfig | null,
  tally: WheelTierTally[]
): WheelSessionSourceGroup[] {
  if (!config) return [];
  const lots = (context.lots || []) as Lot[];
  const language = String(context.preferredLanguage ?? "");
  const tallyByTier = new Map(tally.map((entry) => [entry.tierId, entry]));
  const rows = new Map<string, WheelSessionSourceGroup>();

  for (const tier of config.tiers) {
    if (getTierChancePercent(tier) <= 0 || tier.boundLotId == null) continue;
    const lot = lots.find((entry) => entry.id === tier.boundLotId);
    if (!lot) continue;
    const singles = getLotType(lot) === "singles";
    const key = `${tier.boundLotId}:${singles ? "singles" : "packs"}`;
    const existing = rows.get(key);

    if (tier.deductionType === "singles") {
      const purchase = tier.boundSinglesId == null
        ? null
        : lot.singlesPurchases?.find((entry) => entry.id === tier.boundSinglesId);
      const label = purchase?.cardNumber ? `${tier.label} #${purchase.cardNumber}` : tier.label;
      const remainingForTier = tier.boundSinglesId == null
        ? (lot.singlesPurchases || []).reduce((sum, entry) => (
          sum + getAvailableSinglesQuantityForWheelTier(context, tier.boundLotId as number, entry.id)
        ), 0)
        : getAvailableSinglesQuantityForWheelTier(context, tier.boundLotId, tier.boundSinglesId);
      const remainingForLot = (lot.singlesPurchases || []).reduce((sum, entry) => (
        sum + getAvailableSinglesQuantityForWheelTier(context, tier.boundLotId as number, entry.id)
      ), 0);
      const tierEntry = {
        ...(tallyByTier.get(tier.id) || { tierId: tier.id, label, color: tier.color, count: 0 }),
        label,
        warning: remainingForTier <= Math.max(1, tier.packsCount || 1)
      };
      if (existing) {
        existing.tiers.push(tierEntry);
      } else {
        rows.set(key, {
          key,
          label: lot.name,
          detail: translateAppMessage(language, "wheelSourceDetailSingles"),
          remainingText: translateAppMessage(language, "wheelSourceItemsLeft", {
            count: remainingForLot,
            suffix: remainingForLot === 1 ? "" : "s"
          }),
          warning: false,
          tiers: [tierEntry]
        });
      }
      continue;
    }

    const remaining = getRemainingPacksForWheelLot(context, tier.boundLotId);
    const tierEntry = {
      ...(tallyByTier.get(tier.id) || { tierId: tier.id, label: tier.label, color: tier.color, count: 0 }),
      warning: remaining <= Math.max(1, tier.packsCount || 1)
    };
    if (existing) {
      existing.detail += ` • ${translateAppMessage(language, "wheelPerSpinSuffix", { count: tier.packsCount || 0 })}`;
      existing.tiers.push(tierEntry);
    } else {
      rows.set(key, {
        key,
        label: lot.name,
        detail: translateAppMessage(language, "wheelSourceDetailItem", { count: tier.packsCount || 0 }),
        remainingText: translateAppMessage(language, "wheelSourceItemsLeft", {
          count: remaining,
          suffix: remaining === 1 ? "" : "s"
        }),
        warning: false,
        tiers: [tierEntry]
      });
    }
  }
  return [...rows.values()];
}

export function buildWheelSessionViewModel(context: SessionContext): WheelSessionViewModel {
  const config = getSessionConfig(context);
  const profit = getWheelSessionProfit(context);
  const marginPercent = calculateWheelSessionMarginPercent(context);
  const targetMargin = Number(config?.targetMargin || 0);
  const language = String(context.preferredLanguage ?? "");
  const tallyByTier = buildTallyByTier(context, config);
  const marginDiff = marginPercent == null ? null : marginPercent - targetMargin;

  return {
    config,
    totalSpins: getWheelDisplayTotalSpins(context),
    revenue: getWheelSessionRevenue(context),
    cost: getWheelSessionCost(context),
    profit,
    profitClass: profit >= 0 ? "text-success" : "text-error",
    profitDisplay: `${profit >= 0 ? "$" : "-$"}${Math.abs(profit).toFixed(2)}`,
    marginPercent,
    marginDisplay: marginPercent == null ? "—" : `${marginPercent.toFixed(1)}%`,
    marginColor: marginPercent == null
      ? ""
      : marginPercent >= targetMargin
        ? "rgb(var(--v-theme-success))"
        : marginPercent >= 0
          ? "rgb(var(--v-theme-warning))"
          : "rgb(var(--v-theme-error))",
    marginBarWidth: marginPercent == null ? "0%" : `${Math.min(Math.max(marginPercent, 0), 100)}%`,
    targetMarginBarLeft: `${Math.min(Number(config?.targetMargin || 40), 99)}%`,
    marginHint: marginDiff == null
      ? translateAppMessage(language, "wheelSessionNoSpinsHint")
      : translateAppMessage(language, marginDiff >= 0 ? "wheelSessionAboveTarget" : "wheelSessionBelowTarget", {
        diff: marginDiff.toFixed(1),
        target: targetMargin
      }),
    tallyByTier,
    sourceGroups: buildWheelSessionSourceGroups(context, config, tallyByTier)
  };
}
