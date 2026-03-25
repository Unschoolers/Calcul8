import { nextTick } from "vue";
import { queueWorkspaceConfigSyncPush } from "../../app-core/methods/ui/workspace-config-sync.ts";
import { broadcastWheelSession } from "../../app-core/methods/ui/wheel-broadcast.ts";
import { calculateTotalCaseCost } from "../../domain/calculations-fees.ts";
import type { Lot, WheelConfig, WheelTier } from "../../types/app.ts";
import { buildSlotsFromConfig, createDefaultTier, createDefaultWheelConfig, generateTierId, type WheelSlot } from "./wheelHelpers.ts";

export const wheelConfigMethods = {
  createNewWheelConfig(this: Record<string, unknown>): void {
    const configs = (this.wheelConfigs || []) as WheelConfig[];
    const activeId = this.activeWheelConfigId as number | null;
    const existing = activeId != null ? configs.find((c) => c.id === activeId) : null;
    let newConfig: WheelConfig;
    if (existing) {
      newConfig = JSON.parse(JSON.stringify(existing)) as WheelConfig;
      newConfig.id = Date.now();
      newConfig.name = existing.name + " (copy)";
      newConfig.createdAt = new Date().toISOString();
      for (const tier of newConfig.tiers) {
        tier.id = generateTierId();
      }
    } else {
      newConfig = createDefaultWheelConfig();
      const currentLotId = (this.currentLotId as number | null) ?? null;
      for (const tier of newConfig.tiers) {
        tier.boundLotId = currentLotId;
      }
    }
    configs.push(newConfig);
    this.wheelConfigs = [...configs];
    this.activeWheelConfigId = newConfig.id;
    (this as Record<string, unknown>).editingWheelConfig = JSON.parse(JSON.stringify(newConfig)) as WheelConfig;
  },

  loadWheelConfig(this: Record<string, unknown>): void {
    const configs = (this.wheelConfigs || []) as WheelConfig[];
    const activeId = this.activeWheelConfigId as number | null;
    const config = activeId != null ? configs.find((c) => c.id === activeId) : null;
    (this as Record<string, unknown>).editingWheelConfig = config ? JSON.parse(JSON.stringify(config)) as WheelConfig : null;
    if (config) {
      (this as Record<string, unknown>).activeWheelSlots = buildSlotsFromConfig(config);
      const restored = (this as Record<string, unknown> & { loadWheelFromSession: () => boolean }).loadWheelFromSession();
      if (!restored) {
        this.wheelSpinCounts = new Array(((this as Record<string, unknown>).activeWheelSlots as WheelSlot[]).length).fill(0);
        this.wheelTotalSpins = 0;
        this.wheelLastResult = "";
        (this as Record<string, unknown>).wheelSessionCostAdjustment = 0;
        this.wheelSkippedDeductions = [];
        (this as Record<string, unknown>).wheelEndingSession = false;
        (this as Record<string, unknown>).wheelChaseDialog = false;
        (this as Record<string, unknown>).wheelChaseReplacementSinglesId = null;
        (this as Record<string, unknown>).wheelChasePendingTierId = "";
        (this as Record<string, unknown>).wheelChaseTallyHistory = [];
      }
      nextTick(() => (this as Record<string, unknown> & { drawWheel: (offset?: number) => void }).drawWheel(
        (this as Record<string, unknown>).wheelCurrentAngle as number || 0
      ));
    }
  },

  deleteWheelConfig(this: Record<string, unknown>): void {
    const configs = (this.wheelConfigs || []) as WheelConfig[];
    const activeId = this.activeWheelConfigId as number | null;
    const idx = configs.findIndex((c) => c.id === activeId);
    if (idx < 0) return;
    configs.splice(idx, 1);
    this.wheelConfigs = [...configs];
    this.activeWheelConfigId = configs.length > 0 ? configs[0]!.id : null;
    queueWorkspaceConfigSyncPush(this as Parameters<typeof queueWorkspaceConfigSyncPush>[0]);
    void broadcastWheelSession(this as Parameters<typeof broadcastWheelSession>[0]);
  },

  applyWheelConfig(this: Record<string, unknown>): void {
    const editing = (this as Record<string, unknown>).editingWheelConfig as WheelConfig | null;
    if (!editing) return;
    const configs = (this.wheelConfigs || []) as WheelConfig[];
    const idx = configs.findIndex((c) => c.id === editing.id);
    const updated = { ...(JSON.parse(JSON.stringify(editing)) as WheelConfig), updatedAt: new Date().toISOString() };
    if (idx >= 0) {
      configs[idx] = updated;
    } else {
      configs.push(updated);
    }
    this.wheelConfigs = [...configs];
    this.activeWheelConfigId = updated.id;
    (this as Record<string, unknown>).activeWheelSlots = buildSlotsFromConfig(updated);
    this.wheelSpinCounts = new Array(((this as Record<string, unknown>).activeWheelSlots as WheelSlot[]).length).fill(0);
    this.wheelTotalSpins = 0;
    this.wheelCurrentAngle = 0;
    this.wheelLastResult = "Wheel rebuilt — ready to spin!";
    (this as Record<string, unknown>).wheelLastResultColor = "rgb(var(--v-theme-primary))";
    (this as Record<string, unknown>).wheelSessionCostAdjustment = 0;
    this.wheelSkippedDeductions = [];
    (this as Record<string, unknown>).wheelEndingSession = false;
    (this as Record<string, unknown>).wheelChaseDialog = false;
    (this as Record<string, unknown>).wheelChaseReplacementSinglesId = null;
    (this as Record<string, unknown>).wheelChasePendingTierId = "";
    (this as Record<string, unknown>).wheelChaseTallyHistory = [];
    (this as Record<string, unknown>).wheelSessionUpdatedAt = Date.now();
    queueWorkspaceConfigSyncPush(this as Parameters<typeof queueWorkspaceConfigSyncPush>[0]);
    void broadcastWheelSession(this as Parameters<typeof broadcastWheelSession>[0]);
    nextTick(() => (this as Record<string, unknown> & { drawWheel: (offset?: number) => void }).drawWheel(0));
  },

  addTier(this: Record<string, unknown>): void {
    const config = (this as Record<string, unknown>).editingWheelConfig as WheelConfig | null;
    if (!config) return;
    const costPerPack = (this as Record<string, unknown>).currentLotCostPerPack as number;
    const usedColors = config.tiers.map((t) => t.color);
    const tier = createDefaultTier(config.tiers.length, usedColors);
    tier.boundLotId = (this.currentLotId as number | null) ?? null;
    if (costPerPack > 0) {
      tier.costPerTier = Math.round(tier.packsCount * costPerPack * 1000) / 1000;
    }
    config.tiers.push(tier);
  },

  removeTier(this: Record<string, unknown>, index: number): void {
    const config = (this as Record<string, unknown>).editingWheelConfig as WheelConfig | null;
    if (!config) return;
    config.tiers.splice(index, 1);
  },

  onTierPacksChange(this: Record<string, unknown>, tier: WheelTier): void {
    if (!(this as Record<string, unknown>).wheelConfigReady) return;
    const costPerPack = (this as Record<string, unknown> & { getCostPerPackForTier: (t: WheelTier) => number }).getCostPerPackForTier(tier);
    if (costPerPack > 0) {
      tier.costPerTier = Math.round(tier.packsCount * costPerPack * 1000) / 1000;
    }
  },

  getCostPerPackForTier(this: Record<string, unknown>, tier: WheelTier): number {
    if (tier.boundLotId != null) {
      const lots = (this.lots || []) as Lot[];
      const lot = lots.find((l) => l.id === tier.boundLotId);
      if (lot) {
        const boxes = lot.boxesPurchased || 0;
        const packsPerBox = lot.packsPerBox || 16;
        const totalPacks = boxes * packsPerBox;
        if (totalPacks > 0) {
          const totalCost = calculateTotalCaseCost({
            boxesPurchased: boxes,
            pricePerBoxCad: lot.boxPriceCost || 0,
            purchaseShippingCad: lot.purchaseShippingCost || 0,
            purchaseTaxPercent: lot.purchaseTaxPercent || 0,
            includeTax: lot.includeTax ?? false,
            currency: lot.currency || "CAD"
          });
          return totalCost / totalPacks;
        }
      }
    }
    return (this as Record<string, unknown>).currentLotCostPerPack as number;
  },

  getSinglesItemsForTier(this: Record<string, unknown>, tier: WheelTier): Array<{ title: string; value: number | null; image?: string; cardNumber?: string }> {
    if (tier.boundLotId == null) return [];
    const lots = (this.lots || []) as Lot[];
    const lot = lots.find((l) => l.id === tier.boundLotId);
    if (!lot || lot.lotType !== "singles" || !lot.singlesPurchases?.length) return [];
    const items: Array<{ title: string; value: number | null; image?: string; cardNumber?: string }> = [
      { title: "All / manual", value: null }
    ];
    for (const entry of lot.singlesPurchases) {
      items.push({ title: entry.item, value: entry.id, image: entry.image, cardNumber: entry.cardNumber });
    }
    return items;
  },

  isBoundLotSingles(this: Record<string, unknown>, tier: WheelTier): boolean {
    if (tier.boundLotId == null) return false;
    const lots = (this.lots || []) as Lot[];
    const lot = lots.find((l) => l.id === tier.boundLotId);
    return lot?.lotType === "singles" && (lot.singlesPurchases?.length ?? 0) > 0;
  },

  onTierLotChange(this: Record<string, unknown>, tier: WheelTier, lotId: number | null): void {
    tier.boundLotId = lotId;
    tier.boundSinglesId = null;
    if (lotId == null) {
      tier.deductionType = "packs";
      const costPerPack = (this as Record<string, unknown>).currentLotCostPerPack as number;
      if (costPerPack > 0) {
        tier.costPerTier = Math.round(tier.packsCount * costPerPack * 1000) / 1000;
      }
      return;
    }
    const lots = (this.lots || []) as Lot[];
    const lot = lots.find((l) => l.id === lotId);
    if (lot?.lotType === "singles") {
      tier.deductionType = "singles";
    } else {
      tier.deductionType = "packs";
      const vm = this as Record<string, unknown> & { getCostPerPackForTier: (t: WheelTier) => number };
      const costPerPack = vm.getCostPerPackForTier(tier);
      if (costPerPack > 0) {
        tier.costPerTier = Math.round(tier.packsCount * costPerPack * 1000) / 1000;
      }
    }
  },

  onTierSinglesChange(this: Record<string, unknown>, tier: WheelTier, singlesId: number | null): void {
    tier.boundSinglesId = singlesId;
    if (singlesId != null && tier.boundLotId != null) {
      const lots = (this.lots || []) as Lot[];
      const lot = lots.find((l) => l.id === tier.boundLotId);
      const entry = lot?.singlesPurchases?.find((e) => e.id === singlesId);
      if (entry) {
        tier.costPerTier = entry.cost || entry.marketValue || 0;
        tier.label = entry.item;
      }
    }
  }
};
