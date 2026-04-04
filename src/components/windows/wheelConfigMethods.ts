import { nextTick } from "vue";
import {
  queueCloudConfigSyncPush,
  stopWorkspaceConfigSyncPush
} from "../../app-core/methods/ui/workspace-config-sync.ts";
import { getScopedWheelConfigDraftStorageKey } from "../../app-core/storageKeys.ts";
import { getActiveStorageScope } from "../../app-core/workspace-scope.ts";
import { broadcastWheelSession } from "../../app-core/methods/ui/wheel-broadcast.ts";
import { calculateTotalCaseCost } from "../../domain/calculations-fees.ts";
import { normalizeWheelConfig } from "../../app-core/shared/normalize-wheel-config.ts";
import { assignWheelPendingInventoryIssues } from "../../app-core/shared/wheel-session-compat.ts";
import type { Lot, WheelConfig, WheelTier } from "../../types/app.ts";
import {
  buildSlotsFromConfig,
  createDefaultTier,
  createDefaultWheelConfig,
  generateTierId,
  remapSpinCountsByTier,
  type WheelSlot
} from "./wheelHelpers.ts";
import {
  getAvailableSinglesQuantityForWheelTier,
  getRemainingPacksForWheelLot,
  getWheelTierInventoryMeta
} from "./wheelSaleSupport.ts";

function clearQueuedWheelDraftSave(context: Record<string, unknown>): void {
  const timeoutId = context._wheelDraftSaveTimeoutId as number | undefined;
  if (timeoutId != null) {
    globalThis.clearTimeout(timeoutId);
    context._wheelDraftSaveTimeoutId = undefined;
  }
}

function resetLoadedWheelSessionState(context: Record<string, unknown>): void {
  context.wheelSpinCounts = [];
  context.wheelTotalSpins = 0;
  context.wheelLastResult = "";
  context.wheelInventoryWarning = "";
  context.wheelSessionCostAdjustment = 0;
  assignWheelPendingInventoryIssues(context, []);
  context.wheelEndingSession = false;
  context.wheelChaseDialog = false;
  context.wheelChaseReplacementSinglesId = null;
  context.wheelChasePendingTierId = "";
  context.wheelChaseTallyHistory = [];
  context.wheelPreviewSpinCounts = [];
  context.wheelPreviewTotalSpins = 0;
  context.wheelPreviewChaseTallyHistory = [];
}

function resetLoadedWheelState(context: Record<string, unknown>): void {
  context.activeWheelSlots = [];
  context.wheelPreviewSlots = [];
  resetLoadedWheelSessionState(context);
}

function getWheelDraftStorageKey(context: Record<string, unknown>, wheelConfigId: number | null | undefined): string {
  return getScopedWheelConfigDraftStorageKey(getActiveStorageScope(context as {
    activeScopeType: "personal" | "workspace";
    activeWorkspaceId: string | null;
  }), wheelConfigId);
}

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
    queueCloudConfigSyncPush(this as Parameters<typeof queueCloudConfigSyncPush>[0]);
  },

  loadWheelConfig(this: Record<string, unknown>, options: { preserveLiveWheelState?: boolean } = {}): void {
    const configs = (this.wheelConfigs || []) as WheelConfig[];
    const activeId = this.activeWheelConfigId as number | null;
    const config = activeId != null ? configs.find((c) => c.id === activeId) : null;
    const sanitizedConfig = config ? normalizeWheelConfig(config, (this.lots || []) as Lot[]) : null;
    if (config && sanitizedConfig && JSON.stringify(config) !== JSON.stringify(sanitizedConfig)) {
      const nextConfigs = configs.map((entry) => entry.id === sanitizedConfig.id ? sanitizedConfig : entry);
      this.wheelConfigs = [...nextConfigs];
    }
    let draftConfig: WheelConfig | null = null;
    if (sanitizedConfig) {
      try {
        const rawDraft = localStorage.getItem(getWheelDraftStorageKey(this, sanitizedConfig.id));
        if (rawDraft) {
          draftConfig = normalizeWheelConfig(JSON.parse(rawDraft) as WheelConfig, (this.lots || []) as Lot[]);
        }
      } catch {
        draftConfig = null;
      }
    }
    (this as Record<string, unknown>).editingWheelConfig = draftConfig
      ? JSON.parse(JSON.stringify(draftConfig)) as WheelConfig
      : (sanitizedConfig ? JSON.parse(JSON.stringify(sanitizedConfig)) as WheelConfig : null);
    if (!sanitizedConfig) {
      (this as Record<string, unknown>).appliedWheelConfigSnapshot = null;
      resetLoadedWheelState(this as Record<string, unknown>);
      nextTick(() => (this as Record<string, unknown> & { drawWheel: (offset?: number) => void }).drawWheel(
        (this.wheelCurrentAngle as number) || 0
      ));
      return;
    }
    if (options.preserveLiveWheelState === true) {
      return;
    }
    (this as Record<string, unknown>).appliedWheelConfigSnapshot =
      JSON.parse(JSON.stringify(sanitizedConfig)) as WheelConfig;
    (this as Record<string, unknown>).activeWheelSlots = buildSlotsFromConfig(sanitizedConfig);
    (this as Record<string, unknown>).wheelPreviewSlots =
      [...((this as Record<string, unknown>).activeWheelSlots as WheelSlot[])];
    const restored = (this as Record<string, unknown> & { loadWheelFromSession: () => boolean }).loadWheelFromSession();
    if (!restored) {
      resetLoadedWheelSessionState(this as Record<string, unknown>);
      this.wheelSpinCounts = new Array(((this as Record<string, unknown>).activeWheelSlots as WheelSlot[]).length).fill(0);
    }
    (this as Record<string, unknown>).wheelPreviewSpinCounts =
      new Array(((this as Record<string, unknown>).activeWheelSlots as WheelSlot[]).length).fill(0);
    (this as Record<string, unknown>).wheelPreviewTotalSpins = 0;
    (this as Record<string, unknown>).wheelPreviewChaseTallyHistory = [];
    nextTick(() => (this as Record<string, unknown> & { drawWheel: (offset?: number) => void }).drawWheel(
      (this as Record<string, unknown>).wheelCurrentAngle as number || 0
    ));
  },

  deleteWheelConfig(this: Record<string, unknown>): void {
    const configs = (this.wheelConfigs || []) as WheelConfig[];
    const activeId = this.activeWheelConfigId as number | null;
    const idx = configs.findIndex((c) => c.id === activeId);
    if (idx < 0) return;
    configs.splice(idx, 1);
    try {
      localStorage.removeItem(getWheelDraftStorageKey(this, activeId));
    } catch { /* ignore */ }
    this.wheelConfigs = [...configs];
    this.activeWheelConfigId = configs.length > 0 ? configs[0]!.id : null;
    queueCloudConfigSyncPush(this as Parameters<typeof queueCloudConfigSyncPush>[0]);
    void broadcastWheelSession(this as Parameters<typeof broadcastWheelSession>[0]);
  },

  applyWheelConfig(this: Record<string, unknown>): void {
    const editing = (this as Record<string, unknown>).editingWheelConfig as WheelConfig | null;
    if (!editing) return;
    clearQueuedWheelDraftSave(this);
    stopWorkspaceConfigSyncPush(this as object);
    const configs = (this.wheelConfigs || []) as WheelConfig[];
    const idx = configs.findIndex((c) => c.id === editing.id);
    const previousConfig = idx >= 0 ? configs[idx] : null;
    const updated = { ...(JSON.parse(JSON.stringify(editing)) as WheelConfig), updatedAt: new Date().toISOString() };
    const sanitizedUpdated = normalizeWheelConfig(updated, (this.lots || []) as Lot[]) ?? updated;
    if (idx >= 0) {
      configs[idx] = sanitizedUpdated;
    } else {
      configs.push(sanitizedUpdated);
    }
    const oldSlots = (((this as Record<string, unknown>).activeWheelSlots || []) as WheelSlot[]);
    const oldCounts = ((this.wheelSpinCounts || []) as number[]);
    const oldTierIds = oldSlots.map((slot) => slot.tier);
    const newSlots = buildSlotsFromConfig(updated);
    const newTierIds = new Set(updated.tiers.map((tier) => tier.id));
    const hadTierShapeChange = oldTierIds.some((tierId) => !newTierIds.has(tierId))
      || updated.tiers.some((tier) => !oldTierIds.includes(tier.id));
    const previousTierTotals = oldSlots.reduce<Record<string, number>>((acc, slot, index) => {
      acc[slot.tier] = (acc[slot.tier] || 0) + (oldCounts[index] || 0);
      return acc;
    }, {});
    const previousTierCosts = new Map((previousConfig?.tiers || []).map((tier) => [tier.id, tier.costPerTier]));

    (this as Record<string, unknown>)._wheelSkipConfigReload = true;
    this.wheelConfigs = [...configs];
    try {
      localStorage.removeItem(getWheelDraftStorageKey(this, updated.id));
    } catch { /* ignore */ }
    this.activeWheelConfigId = updated.id;
    (this as Record<string, unknown>).editingWheelConfig = JSON.parse(JSON.stringify(updated)) as WheelConfig;
    (this as Record<string, unknown>).appliedWheelConfigSnapshot = JSON.parse(JSON.stringify(updated)) as WheelConfig;
    (this as Record<string, unknown>).activeWheelSlots = newSlots;
    (this as Record<string, unknown>).wheelPreviewSlots = [...newSlots];
    this.wheelSpinCounts = remapSpinCountsByTier(oldTierIds, oldCounts, newSlots);
    this.wheelTotalSpins = (this.wheelSpinCounts as number[]).reduce((sum, count) => sum + count, 0);
    this.wheelLastResult = "";
    (this as Record<string, unknown>).wheelInventoryWarning = "";
    (this as Record<string, unknown>).wheelPreviewSpinCounts = new Array(newSlots.length).fill(0);
    (this as Record<string, unknown>).wheelPreviewTotalSpins = 0;
    (this as Record<string, unknown>).wheelPreviewChaseTallyHistory = [];
    (this as Record<string, unknown>).wheelLastResultColor = "rgb(var(--v-theme-primary))";
    if (hadTierShapeChange) {
      (this as Record<string, unknown>).wheelSessionCostAdjustment = 0;
      (this as Record<string, unknown>).wheelChaseTallyHistory = [];
    } else {
      let costAdjustment = ((this as Record<string, unknown>).wheelSessionCostAdjustment as number) || 0;
      for (const tier of updated.tiers) {
        const previousCost = previousTierCosts.get(tier.id);
        if (previousCost == null || previousCost === tier.costPerTier) continue;
        const priorSpins = previousTierTotals[tier.id] || 0;
        if (priorSpins > 0) {
          costAdjustment += priorSpins * (previousCost - tier.costPerTier);
        }
      }
      (this as Record<string, unknown>).wheelSessionCostAdjustment = costAdjustment;
    }
    assignWheelPendingInventoryIssues(
      this,
      ((this.wheelPendingInventoryIssues || []) as Array<{ slotTier: string }>).filter(
        (entry) => newTierIds.has(entry.slotTier)
      ) as typeof this.wheelPendingInventoryIssues
    );
    (this as Record<string, unknown>).wheelEndingSession = false;
    (this as Record<string, unknown>).wheelChaseDialog = false;
    (this as Record<string, unknown>).wheelChaseReplacementSinglesId = null;
    (this as Record<string, unknown>).wheelChasePendingTierId = "";
    (this as Record<string, unknown>).wheelSessionUpdatedAt = Date.now();
    (this as Record<string, unknown> & { saveWheelSession: () => void }).saveWheelSession();
    queueCloudConfigSyncPush(this as Parameters<typeof queueCloudConfigSyncPush>[0]);
    void broadcastWheelSession(this as Parameters<typeof broadcastWheelSession>[0]);
    nextTick(() => (this as Record<string, unknown> & { drawWheel: (offset?: number) => void }).drawWheel(
      (this.wheelCurrentAngle as number) || 0
    ));
  },

  queueWheelDraftAutosave(this: Record<string, unknown>): void {
    const editing = (this as Record<string, unknown>).editingWheelConfig as WheelConfig | null;
    const hasPendingChanges = ((this as Record<string, unknown>).hasPendingWheelChanges as boolean) === true;
    clearQueuedWheelDraftSave(this);
    if (!editing) return;
    if (!hasPendingChanges) {
      (this as Record<string, unknown> & { clearWheelDraft: (wheelConfigId?: number | null) => void }).clearWheelDraft(editing.id);
      return;
    }
    (this as Record<string, unknown>)._wheelDraftSaveTimeoutId = globalThis.setTimeout(() => {
      (this as Record<string, unknown>)._wheelDraftSaveTimeoutId = undefined;
      (this as Record<string, unknown> & { saveWheelDraft: () => void }).saveWheelDraft();
    }, 1200);
  },

  saveWheelDraft(this: Record<string, unknown>): void {
    const editing = (this as Record<string, unknown>).editingWheelConfig as WheelConfig | null;
    if (!editing?.id) return;
    const configs = (this.wheelConfigs || []) as WheelConfig[];
    const idx = configs.findIndex((entry) => entry.id === editing.id);
    const persisted = normalizeWheelConfig({
      ...(JSON.parse(JSON.stringify(editing)) as WheelConfig),
      updatedAt: new Date().toISOString()
    }, (this.lots || []) as Lot[]);
    if (!persisted) return;
    if (idx >= 0) {
      configs[idx] = persisted;
    } else {
      configs.push(persisted);
    }
    (this as Record<string, unknown>)._wheelSkipConfigReload = true;
    this.wheelConfigs = [...configs];
    try {
      localStorage.removeItem(getWheelDraftStorageKey(this, editing.id));
    } catch { /* ignore */ }
  },

  clearWheelDraft(this: Record<string, unknown>, wheelConfigId?: number | null): void {
    const targetId = wheelConfigId ?? (((this as Record<string, unknown>).editingWheelConfig as WheelConfig | null)?.id ?? null);
    if (targetId == null) return;
    try {
      localStorage.removeItem(getWheelDraftStorageKey(this, targetId));
    } catch { /* ignore */ }
  },

  addTier(this: Record<string, unknown>): void {
    const config = (this as Record<string, unknown>).editingWheelConfig as WheelConfig | null;
    if (!config) return;
    const costPerPack = (this as Record<string, unknown>).currentLotCostPerPack as number;
    const usedColors = config.tiers.map((t) => t.color);
    const tier = createDefaultTier(config.tiers.length, usedColors);
    const currentLotId = (this.currentLotId as number | null) ?? null;
    const lots = (this.lots || []) as Lot[];
    const currentLot = currentLotId != null ? lots.find((lot) => lot.id === currentLotId) : null;
    const canAutoBindCurrentLot = currentLot != null && (
      currentLot.lotType === "singles"
        ? (currentLot.singlesPurchases || []).some((entry) => (
          getAvailableSinglesQuantityForWheelTier(this, currentLot.id, entry.id) > 0
        ))
        : getRemainingPacksForWheelLot(this, currentLot.id) > 0
    );
    tier.boundLotId = canAutoBindCurrentLot ? currentLotId : null;
    if (canAutoBindCurrentLot && costPerPack > 0) {
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

  getSinglesItemsForTier(this: Record<string, unknown>, tier: WheelTier): Array<{ title: string; value: number | null; image?: string; cardNumber?: string; stockLabel?: string }> {
    if (tier.boundLotId == null) return [];
    const lots = (this.lots || []) as Lot[];
    const lot = lots.find((l) => l.id === tier.boundLotId);
    if (!lot || lot.lotType !== "singles" || !lot.singlesPurchases?.length) return [];
    const items: Array<{ title: string; value: number | null; image?: string; cardNumber?: string; stockLabel?: string }> = [
      { title: "Untracked sale", value: null }
    ];
    for (const entry of lot.singlesPurchases) {
      const remaining = getAvailableSinglesQuantityForWheelTier(this, tier.boundLotId, entry.id);
      if (remaining <= 0) continue;
      items.push({
        title: entry.item,
        value: entry.id,
        image: entry.image,
        cardNumber: entry.cardNumber,
        stockLabel: `${remaining} left`
      });
    }
    return items;
  },

  getTierInventoryMeta(this: Record<string, unknown>, tier: WheelTier): { text: string; warning: boolean } | null {
    return getWheelTierInventoryMeta(this, tier);
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
    tier.isChase = false;
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
      tier.packsCount = 1;
      tier.costPerTier = 0;
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
    if (tier.deductionType === "singles") {
      tier.packsCount = 1;
    }
    if (singlesId == null) {
      tier.isChase = false;
      tier.costPerTier = 0;
    }
    if (singlesId != null && tier.boundLotId != null) {
      const lots = (this.lots || []) as Lot[];
      const lot = lots.find((l) => l.id === tier.boundLotId);
      const entry = lot?.singlesPurchases?.find((e) => e.id === singlesId);
      if (entry) {
        tier.costPerTier = entry.cost || entry.marketValue || 0;
        tier.label = entry.item;
      }
    }
  },

  canTierBeChase(this: Record<string, unknown>, tier: WheelTier): boolean {
    return tier.deductionType === "singles" && tier.boundLotId != null && tier.boundSinglesId != null;
  },

  toggleTierChase(this: Record<string, unknown>, tier: WheelTier): void {
    const vm = this as Record<string, unknown> & { canTierBeChase: (tier: WheelTier) => boolean };
    if (!vm.canTierBeChase(tier)) {
      tier.isChase = false;
      return;
    }
    tier.isChase = !tier.isChase;
  }
};
