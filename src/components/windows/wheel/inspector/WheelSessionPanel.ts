import { type PropType } from "vue";
import { translateAppMessage } from "../../../../app-core/i18n/index.ts";
import { getTierChancePercent } from "../../../../app-core/shared/wheel-odds.ts";
import type { Lot, WheelConfig } from "../../../../types/app.ts";
import {
  getWheelDisplayConfig,
  getWheelDisplayChaseTallyHistory,
  getWheelDisplaySlots,
  getWheelDisplaySpinCounts,
  getWheelDisplayTotalSpins,
  getWheelSessionCost,
  getWheelSessionProfit,
  getWheelSessionRevenue
} from "../coordinator/wheelComputedShared.ts";
import {
  getAvailableSinglesQuantityForWheelTier,
  getRemainingPacksForWheelLot
} from "../services/wheelSaleSupport.ts";
import type { WheelSlot } from "../services/wheelHelpers.ts";

function getWheelSessionPanelSource(vm: Record<string, unknown>): Record<string, unknown> {
  const explicitCtx = vm.ctx;
  if (explicitCtx && typeof explicitCtx === "object") {
    return explicitCtx as Record<string, unknown>;
  }
  return vm;
}

export const WheelSessionPanel = {
  name: "WheelSessionPanel",
  props: {
    ctx: {
      type: Object as PropType<Record<string, unknown>>,
      required: true
    }
  },
  methods: {
    t(this: Record<string, unknown>, key: string, params?: Record<string, string | number | null | undefined>): string {
      const source = getWheelSessionPanelSource(this as Record<string, unknown>);
      const translator = source.t;
      if (typeof translator === "function") {
        return (translator as (translationKey: string, translationParams?: Record<string, string | number | null | undefined>) => string)(key, params);
      }
      return translateAppMessage(String(source.preferredLanguage ?? ""), key, params);
    },
    openWheelResetDialog(this: Record<string, unknown>): void {
      const source = getWheelSessionPanelSource(this as Record<string, unknown>);
      source.wheelConfirmAction = "reset";
      source.wheelConfirmDialog = true;
    },
    requestWheelSessionEnd(this: Record<string, unknown>): void {
      const source = getWheelSessionPanelSource(this as Record<string, unknown>);
      const handler = source.requestWheelSessionEnd;
      if (typeof handler === "function") {
        (handler as () => void).call(source);
      }
    }
  },
  computed: {
    wheelSessionPanelDisplayConfig(this: Record<string, unknown>): WheelConfig | null {
      return getWheelDisplayConfig(getWheelSessionPanelSource(this as Record<string, unknown>));
    },
    wheelSessionPanelDisplaySlots(this: Record<string, unknown>) {
      return getWheelDisplaySlots(getWheelSessionPanelSource(this as Record<string, unknown>));
    },
    wheelSessionPanelDisplaySpinCounts(this: Record<string, unknown>) {
      return getWheelDisplaySpinCounts(getWheelSessionPanelSource(this as Record<string, unknown>));
    },
    wheelSessionPanelDisplayTotalSpins(this: Record<string, unknown>): number {
      return getWheelDisplayTotalSpins(getWheelSessionPanelSource(this as Record<string, unknown>));
    },
    wheelSessionPanelMode(this: Record<string, unknown>): string {
      const source = getWheelSessionPanelSource(this as Record<string, unknown>);
      return String(source.wheelMode || "config");
    },
    wheelSessionPanelEndingSession(this: Record<string, unknown>): boolean {
      const source = getWheelSessionPanelSource(this as Record<string, unknown>);
      return Boolean(source.wheelEndingSession);
    },
    wheelSessionPanelPendingIssueCount(this: Record<string, unknown>): number {
      const source = getWheelSessionPanelSource(this as Record<string, unknown>);
      const pendingIssues = source.wheelPendingInventoryIssues;
      return Array.isArray(pendingIssues) ? pendingIssues.length : 0;
    },
    wheelSessionPanelRevenue(this: Record<string, unknown>): number {
      return getWheelSessionRevenue(getWheelSessionPanelSource(this as Record<string, unknown>));
    },
    wheelSessionPanelCost(this: Record<string, unknown>): number {
      return getWheelSessionCost(getWheelSessionPanelSource(this as Record<string, unknown>));
    },
    wheelSessionPanelProfit(this: Record<string, unknown>): number {
      return getWheelSessionProfit(getWheelSessionPanelSource(this as Record<string, unknown>));
    },
    wheelSessionPanelProfitDisplay(this: Record<string, unknown>): string {
      const profit = Number((this as Record<string, unknown>).wheelSessionPanelProfit || 0);
      return `${profit >= 0 ? "$" : "-$"}${Math.abs(profit).toFixed(2)}`;
    },
    wheelSessionPanelProfitClass(this: Record<string, unknown>): string {
      return Number((this as Record<string, unknown>).wheelSessionPanelProfit || 0) >= 0 ? "text-success" : "text-error";
    },
    wheelSessionPanelMarginPercent(this: Record<string, unknown>): number | null {
      const cost = Number((this as Record<string, unknown>).wheelSessionPanelCost || 0);
      if (!cost) return null;
      return (Number((this as Record<string, unknown>).wheelSessionPanelProfit || 0) / cost) * 100;
    },
    wheelSessionPanelMarginDisplay(this: Record<string, unknown>): string {
      const margin = (this as Record<string, unknown>).wheelSessionPanelMarginPercent as number | null;
      return margin == null ? "—" : `${margin.toFixed(1)}%`;
    },
    wheelSessionPanelMarginColor(this: Record<string, unknown>): string {
      const config = (this as Record<string, unknown>).wheelSessionPanelDisplayConfig as WheelConfig | null;
      const margin = (this as Record<string, unknown>).wheelSessionPanelMarginPercent as number | null;
      if (margin == null) return "";
      if (margin >= Number(config?.targetMargin || 0)) return "rgb(var(--v-theme-success))";
      if (margin >= 0) return "rgb(var(--v-theme-warning))";
      return "rgb(var(--v-theme-error))";
    },
    wheelSessionPanelMarginBarWidth(this: Record<string, unknown>): string {
      const margin = (this as Record<string, unknown>).wheelSessionPanelMarginPercent as number | null;
      if (margin == null) return "0%";
      return `${Math.min(Math.max(margin, 0), 100)}%`;
    },
    wheelSessionPanelTargetMarginBarLeft(this: Record<string, unknown>): string {
      const config = (this as Record<string, unknown>).wheelSessionPanelDisplayConfig as WheelConfig | null;
      return `${Math.min(Number(config?.targetMargin || 40), 99)}%`;
    },
    wheelSessionPanelMarginHint(this: Record<string, unknown>): string {
      const source = getWheelSessionPanelSource(this as Record<string, unknown>);
      const preferredLanguage = String(source.preferredLanguage ?? "");
      const margin = (this as Record<string, unknown>).wheelSessionPanelMarginPercent as number | null;
      if (margin == null) {
        return translateAppMessage(preferredLanguage, "wheelSessionNoSpinsHint");
      }
      const config = (this as Record<string, unknown>).wheelSessionPanelDisplayConfig as WheelConfig | null;
      const target = Number(config?.targetMargin || 0);
      const diff = margin - target;
      return diff >= 0
        ? translateAppMessage(preferredLanguage, "wheelSessionAboveTarget", {
          diff: diff.toFixed(1),
          target
        })
        : translateAppMessage(preferredLanguage, "wheelSessionBelowTarget", {
          diff: diff.toFixed(1),
          target
        });
    },
    wheelSessionPanelSourceGroups(this: Record<string, unknown>): Array<{
      key: string;
      label: string;
      detail: string;
      remainingText: string;
      warning: boolean;
      tiers: Array<{ tierId: string; label: string; color: string; count: number; warning: boolean }>;
    }> {
      const source = getWheelSessionPanelSource(this as Record<string, unknown>);
      const preferredLanguage = String(source.preferredLanguage ?? "");
      const config = (this as Record<string, unknown>).wheelSessionPanelDisplayConfig as WheelConfig | null;
      const lots = ((source.lots || []) as Lot[]);
      if (!config) return [];

      const slots = ((this as Record<string, unknown>).wheelSessionPanelDisplaySlots || []) as WheelSlot[];
      const counts = ((this as Record<string, unknown>).wheelSessionPanelDisplaySpinCounts || []) as number[];
      const tierTotals = slots.reduce<Record<string, number>>((acc, slot, index) => {
        acc[slot.tier] = (acc[slot.tier] || 0) + (Number(counts[index]) || 0);
        return acc;
      }, {});

      const history = (getWheelDisplayChaseTallyHistory(source) || []) as Array<{
        tierId: string;
        label: string;
        color: string;
        count: number;
      }>;
      const historicalByTier = history.reduce<Record<string, number>>((acc, entry) => {
        acc[entry.tierId] = (acc[entry.tierId] || 0) + Number(entry.count || 0);
        return acc;
      }, {});

      const tallyByTier = new Map<string, { tierId: string; label: string; color: string; count: number }>();
      for (const tier of config.tiers) {
        if (getTierChancePercent(tier) <= 0) continue;
        for (const historicalEntry of history) {
          if (historicalEntry.tierId === tier.id && historicalEntry.count > 0) {
            tallyByTier.set(`${tier.id}:${historicalEntry.label}:${historicalEntry.count}`, historicalEntry);
          }
        }
        const remaining = (tierTotals[tier.id] || 0) - (historicalByTier[tier.id] || 0);
        if (remaining > 0 || !historicalByTier[tier.id]) {
          tallyByTier.set(tier.id, {
            tierId: tier.id,
            label: tier.label,
            color: tier.color,
            count: Math.max(remaining, 0)
          });
        }
      }

      const rows = new Map<string, {
        key: string;
        label: string;
        detail: string;
        remainingText: string;
        warning: boolean;
        tiers: Array<{ tierId: string; label: string; color: string; count: number; warning: boolean }>;
      }>();

      for (const tier of config.tiers) {
        if (getTierChancePercent(tier) <= 0 || tier.boundLotId == null) continue;
        const lot = lots.find((entry) => entry.id === tier.boundLotId);
        if (!lot) continue;
        const rowKey = `${tier.boundLotId}:${lot.lotType === "singles" ? "singles" : "packs"}`;
        const existing = rows.get(rowKey);

        if (tier.deductionType === "singles") {
          const purchase = tier.boundSinglesId != null
            ? lot.singlesPurchases?.find((entry) => entry.id === tier.boundSinglesId)
            : null;
          const tierDisplayLabel = purchase?.cardNumber ? `${tier.label} #${purchase.cardNumber}` : tier.label;
          const remainingForTier = tier.boundSinglesId != null
            ? getAvailableSinglesQuantityForWheelTier(source, tier.boundLotId, tier.boundSinglesId)
            : ((lot.singlesPurchases || []).reduce((sum, entry) => sum + Math.max(0, getAvailableSinglesQuantityForWheelTier(source, tier.boundLotId as number, entry.id)), 0));
          const remainingForLot = (lot.singlesPurchases || []).reduce((sum, entry) => (
            sum + Math.max(0, getAvailableSinglesQuantityForWheelTier(source, tier.boundLotId as number, entry.id))
          ), 0);
          const tally = Array.from(tallyByTier.values()).find((entry) => entry.tierId === tier.id && (entry.label === tierDisplayLabel || entry.label === tier.label));
          const tierEntry = {
            tierId: tier.id,
            label: tierDisplayLabel,
            color: tier.color,
            count: Number(tally?.count || 0),
            warning: remainingForTier <= Math.max(1, Number(tier.packsCount || 1))
          };
          if (existing) {
            existing.tiers.push(tierEntry);
          } else {
            rows.set(rowKey, {
              key: rowKey,
              label: lot.name,
              detail: translateAppMessage(preferredLanguage, "wheelSourceDetailSingles"),
              remainingText: translateAppMessage(preferredLanguage, "wheelSourceItemsLeft", {
                count: remainingForLot,
                suffix: remainingForLot === 1 ? "" : "s"
              }),
              warning: false,
              tiers: [tierEntry]
            });
          }
          continue;
        }

        const remainingPacks = getRemainingPacksForWheelLot(source, tier.boundLotId);
        const tally = Array.from(tallyByTier.values()).find((entry) => entry.tierId === tier.id);
        const tierEntry = {
          tierId: tier.id,
          label: tier.label,
          color: tier.color,
          count: Number(tally?.count || 0),
          warning: remainingPacks <= Math.max(1, Number(tier.packsCount || 1))
        };
        if (existing) {
          existing.detail = `${existing.detail} • ${translateAppMessage(preferredLanguage, "wheelPerSpinSuffix", {
            count: Number(tier.packsCount || 0)
          })}`;
          existing.tiers.push(tierEntry);
        } else {
          rows.set(rowKey, {
            key: rowKey,
            label: lot.name,
            detail: translateAppMessage(preferredLanguage, "wheelSourceDetailItem", {
              count: Number(tier.packsCount || 0)
            }),
            remainingText: translateAppMessage(preferredLanguage, "wheelSourceItemsLeft", {
              count: remainingPacks,
              suffix: remainingPacks === 1 ? "" : "s"
            }),
            warning: false,
            tiers: [tierEntry]
          });
        }
      }

      return Array.from(rows.values());
    }
  }
};
