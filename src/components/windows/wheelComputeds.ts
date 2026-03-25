import { WHATNOT_FEES } from "../../constants.ts";
import { calculateTotalCaseCost } from "../../domain/calculations-fees.ts";
import type { Lot, WheelConfig } from "../../types/app.ts";
import { computeExpectedMargin, type WheelSlot } from "./wheelHelpers.ts";

export const wheelComputeds = {
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
    const configs = (this.wheelConfigs || []) as WheelConfig[];
    const activeId = this.activeWheelConfigId as number | null;
    if (activeId == null) return null;
    return configs.find((c) => c.id === activeId) || null;
  },

  canApplyWheelConfig(this: Record<string, unknown>): boolean {
    const config = (this as Record<string, unknown>).editingWheelConfig as WheelConfig | null;
    if (!config || !config.tiers.length) return false;
    return config.tiers.every((t) => t.boundLotId != null);
  },

  expectedMarginDisplay(this: Record<string, unknown>): string {
    const config = (this as Record<string, unknown>).editingWheelConfig as WheelConfig | null;
    if (!config) return "—";
    const { margin } = computeExpectedMargin(config);
    return margin !== null ? margin.toFixed(1) + "%" : "—";
  },

  expectedMarginColor(this: Record<string, unknown>): string {
    const config = (this as Record<string, unknown>).editingWheelConfig as WheelConfig | null;
    if (!config) return "";
    const { margin } = computeExpectedMargin(config);
    if (margin === null) return "";
    return margin >= config.targetMargin ? "rgb(var(--v-theme-success))" : "rgb(var(--v-theme-error))";
  },

  expectedMarginHint(this: Record<string, unknown>): string {
    const config = (this as Record<string, unknown>).editingWheelConfig as WheelConfig | null;
    if (!config) return "Add some tiers";
    const { margin } = computeExpectedMargin(config);
    if (margin === null) return "Add some slots";
    const diff = margin - config.targetMargin;
    return diff >= 0
      ? `+${diff.toFixed(1)}% above ${config.targetMargin}% target`
      : `${diff.toFixed(1)}% below ${config.targetMargin}% target`;
  },

  wheelSessionRevenue(this: Record<string, unknown>): number {
    const config = (this as Record<string, unknown>).activeWheelConfig as WheelConfig | null;
    const totalSpins = (this.wheelTotalSpins || 0) as number;
    return totalSpins * (config?.spinPrice || 0);
  },

  wheelSessionCost(this: Record<string, unknown>): number {
    const slots = (this as Record<string, unknown>).activeWheelSlots as WheelSlot[];
    const counts = (this.wheelSpinCounts || []) as number[];
    const base = counts.reduce((sum, count, i) => sum + count * (slots[i]?.cost || 0), 0);
    return base + ((this as Record<string, unknown>).wheelSessionCostAdjustment as number || 0);
  },

  wheelSessionProfit(this: Record<string, unknown>): number {
    const grossRevenue = this.wheelSessionRevenue as number;
    const totalSpins = (this.wheelTotalSpins || 0) as number;
    const commission = grossRevenue * WHATNOT_FEES.COMMISSION;
    const processing = grossRevenue * WHATNOT_FEES.PROCESSING;
    const fixed = WHATNOT_FEES.FIXED * totalSpins;
    const netRevenue = grossRevenue - commission - processing - fixed;
    return netRevenue - (this.wheelSessionCost as number);
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
    const config = (this as Record<string, unknown>).activeWheelConfig as WheelConfig | null;
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
    const config = (this as Record<string, unknown>).activeWheelConfig as WheelConfig | null;
    return Math.min(config?.targetMargin || 40, 99) + "%";
  },

  wheelSessionMarginHint(this: Record<string, unknown>): string {
    const revenue = this.wheelSessionRevenue as number;
    if (!revenue) return "No spins yet";
    const config = (this as Record<string, unknown>).activeWheelConfig as WheelConfig | null;
    const margin = ((this.wheelSessionProfit as number) / revenue) * 100;
    const diff = margin - (config?.targetMargin || 0);
    return diff >= 0
      ? `+${diff.toFixed(1)}% above ${config?.targetMargin || 0}% target`
      : `${diff.toFixed(1)}% below ${config?.targetMargin || 0}% target`;
  },

  wheelTallyByTier(this: Record<string, unknown>): Array<{ tierId: string; label: string; color: string; count: number }> {
    const config = (this as Record<string, unknown>).activeWheelConfig as WheelConfig | null;
    if (!config) return [];
    const slots = (this as Record<string, unknown>).activeWheelSlots as WheelSlot[];
    const counts = (this.wheelSpinCounts || []) as number[];
    const tierTotals: Record<string, number> = {};
    slots.forEach((slot, i) => {
      tierTotals[slot.tier] = (tierTotals[slot.tier] || 0) + (counts[i] || 0);
    });
    const history = (this as Record<string, unknown>).wheelChaseTallyHistory as Array<{ tierId: string; label: string; color: string; count: number }>;
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

  tierSourceItems(this: Record<string, unknown>): Array<{ title: string; value: number | null; lotType?: string; groupLabel?: string | null }> {
    const lots = (this.lots || []) as Lot[];
    const bulkLots = lots.filter((l) => l.lotType !== "singles");
    const singlesLots = lots.filter((l) => l.lotType === "singles");
    const sorted = [...bulkLots, ...singlesLots];
    const items: Array<{ title: string; value: number | null; lotType?: string; groupLabel?: string | null }> = [
      { title: "None (manual)", value: null, groupLabel: null }
    ];
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
