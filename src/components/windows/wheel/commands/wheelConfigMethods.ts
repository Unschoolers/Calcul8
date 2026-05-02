import { nextTick } from "vue";
import { broadcastWheelSession } from "../../../../app-core/methods/ui/wheel-broadcast.ts";
import {
    queueCloudConfigSyncPush,
    stopWorkspaceConfigSyncPush
} from "../../../../app-core/methods/ui/workspace-config-sync.ts";
import { normalizeWheelConfig } from "../../../../app-core/shared/normalize-wheel-config.ts";
import { assignWheelPendingInventoryIssues } from "../../../../app-core/shared/wheel-session-compat.ts";
import {
    getScopedActiveWheelConfigStorageKey,
    getScopedWheelConfigDraftStorageKey
} from "../../../../app-core/storageKeys.ts";
import {
    getWheelTierSourceLotIds,
    isWheelTierMultiLot,
    normalizeWheelTierSources
} from "../../../../app-core/shared/wheel-tier-sources.ts";
import { getActiveStorageScope } from "../../../../app-core/workspace-scope.ts";
import { calculateTotalCaseCost } from "../../../../domain/calculations-fees.ts";
import type { Lot, LuckGameType, WheelConfig, WheelTier } from "../../../../types/app.ts";
import { getWheelController } from "../coordinator/wheelControllerState.ts";
import { remapSpinCountsByTier } from "../services/wheelCountRemapping.ts";
import { createDefaultTier, createDefaultWheelConfig, generateTierId } from "../services/wheelDefaults.ts";
import { buildSlotsFromConfig, type WheelSlot } from "../services/wheelSlots.ts";
import {
    getAvailableSinglesQuantityForWheelTier,
    getRemainingPacksForWheelLot,
    getWheelTierInventoryMeta
} from "../services/wheelSaleSupport.ts";

function clearQueuedWheelConfigSync(context: Record<string, unknown>): void {
  const timeoutId = context._wheelDraftSaveTimeoutId as number | undefined;
  if (timeoutId != null) {
    globalThis.clearTimeout(timeoutId);
    context._wheelDraftSaveTimeoutId = undefined;
  }
}

function resetLoadedWheelSessionState(context: Record<string, unknown>): void {
  const controller = getWheelController(context);
  context.wheelSpinCounts = [];
  context.wheelTotalSpins = 0;
  context.wheelLastResult = "";
  controller.inventoryWarning = "";
  controller.lastResultColor = "rgb(var(--v-theme-primary))";
  controller.sessionCostAdjustment = 0;
  controller.sessionNetRevenue = null;
  assignWheelPendingInventoryIssues(context, []);
  context.wheelEndingSession = false;
  context.wheelChaseDialog = false;
  context.wheelChaseReplacementSinglesId = null;
  context.wheelChasePendingTierId = "";
  context.wheelChasePreviewMode = false;
  controller.chaseTallyHistory = [];
  controller.gridReveals = [];
  controller.fairnessHistory = [];
  controller.previewSpinCounts = [];
  controller.previewTotalSpins = 0;
  controller.previewFairnessHistory = [];
  controller.previewChaseTallyHistory = [];
  controller.previewGridReveals = [];
  controller.spinHash = "";
  controller.spinSeed = "";
  controller.spinClientSeed = "";
  controller.spinVerificationUrl = "";
  controller.spinAlgorithm = "";
  controller.showSeed = false;
  controller.fairnessHistoryOpen = false;
  controller.highlightedSlotIndex = -1;
  context.wheelSpectatorDialog = false;
  context.wheelSpectatorSessionId = "";
  context.wheelSpectatorSessionStatus = "inactive";
  context.wheelSpectatorSessionUrl = "";
  context.wheelSpectatorSessionQrUrl = "";
  context.wheelSpectatorPublishPending = false;
}

function resetLoadedWheelState(context: Record<string, unknown>): void {
  const controller = getWheelController(context);
  controller.activeSlots = [];
  controller.previewSlots = [];
  resetLoadedWheelSessionState(context);
}

function getWheelDraftStorageKey(context: Record<string, unknown>, wheelConfigId: number | null | undefined): string {
  return getScopedWheelConfigDraftStorageKey(getActiveStorageScope(context as {
    activeScopeType: "personal" | "workspace";
    activeWorkspaceId: string | null;
  }), wheelConfigId);
}

function getActiveWheelConfigStorageKey(context: Record<string, unknown>): string {
  return getScopedActiveWheelConfigStorageKey(getActiveStorageScope(context as {
    activeScopeType: "personal" | "workspace";
    activeWorkspaceId: string | null;
  }));
}

function normalizeStoredWheelConfigId(value: unknown): number | null {
  const id = Number(value);
  if (!Number.isFinite(id) || id <= 0) return null;
  return Math.floor(id);
}

function configIdExists(configs: WheelConfig[], id: number | null): id is number {
  return id != null && configs.some((config) => config.id === id);
}

function normalizeOptionalNumericId(value: unknown): number | null {
  if (value == null || value === "") return null;
  const id = Number(value);
  if (!Number.isFinite(id)) return null;
  return Math.floor(id);
}

function bindDefaultTierSources(context: Record<string, unknown>, config: WheelConfig): void {
  const currentLotId = (context.currentLotId as number | null) ?? null;
  for (const tier of config.tiers) {
    tier.boundLotId = currentLotId;
    tier.boundLotIds = currentLotId == null ? [] : [currentLotId];
  }
}

function createGameConfigFromTemplate(
  context: Record<string, unknown>,
  gameType: LuckGameType,
  template?: WheelConfig | null
): WheelConfig {
  const existing = template ?? null;
  const newConfig = existing
    ? JSON.parse(JSON.stringify(existing)) as WheelConfig
    : createDefaultWheelConfig();
  newConfig.id = Date.now();
  newConfig.gameType = gameType;
  newConfig.name = existing
    ? `${existing.name} (copy)`
    : (gameType === "grid" ? "New Mystery Grid" : "New Wheel");
  newConfig.createdAt = new Date().toISOString();
  if (gameType === "grid") {
    newConfig.outcomeCount = newConfig.outcomeCount || 100;
    newConfig.gridCellCount = newConfig.outcomeCount;
  }
  for (const tier of newConfig.tiers) {
    tier.id = generateTierId();
  }
  if (!existing) {
    bindDefaultTierSources(context, newConfig);
  }
  return newConfig;
}

export const wheelConfigMethods = {
  persistLastWheelConfigSelection(this: Record<string, unknown>): void {
    const activeId = normalizeStoredWheelConfigId(this.activeWheelConfigId);
    const storageKey = getActiveWheelConfigStorageKey(this);
    try {
      if (activeId == null) {
        localStorage.removeItem(storageKey);
        return;
      }
      localStorage.setItem(storageKey, String(activeId));
    } catch {
      // Ignore unavailable storage.
    }
  },

  restoreLastWheelConfigSelection(this: Record<string, unknown>): void {
    const configs = (this.wheelConfigs || []) as WheelConfig[];
    const firstConfigId = configs[0]?.id ?? null;
    const storageKey = getActiveWheelConfigStorageKey(this);
    let storedId: number | null = null;

    try {
      storedId = normalizeStoredWheelConfigId(localStorage.getItem(storageKey));
    } catch {
      storedId = null;
    }

    if (configIdExists(configs, storedId)) {
      this.activeWheelConfigId = storedId;
      return;
    }

    const currentId = normalizeStoredWheelConfigId(this.activeWheelConfigId);
    this.activeWheelConfigId = configIdExists(configs, currentId) ? currentId : firstConfigId;

    try {
      if (this.activeWheelConfigId == null) {
        localStorage.removeItem(storageKey);
      } else {
        localStorage.setItem(storageKey, String(this.activeWheelConfigId));
      }
    } catch {
      // Ignore unavailable storage.
    }
  },

  openWheelCreateDialog(this: Record<string, unknown>): void {
    this.wheelCreateDialog = true;
  },

  closeWheelCreateDialog(this: Record<string, unknown>): void {
    this.wheelCreateDialog = false;
  },

  createNewGameConfig(this: Record<string, unknown>, gameType: LuckGameType): void {
    const configs = (this.wheelConfigs || []) as WheelConfig[];
    const activeId = this.activeWheelConfigId as number | null;
    const existing = activeId != null ? configs.find((c) => c.id === activeId) : null;
    const shouldCopyExisting = existing?.gameType === gameType;
    const newConfig = createGameConfigFromTemplate(this, gameType, shouldCopyExisting ? existing : null);
    configs.push(newConfig);
    this.wheelConfigs = [...configs];
    this.activeWheelConfigId = newConfig.id;
    (this as Record<string, unknown> & { persistLastWheelConfigSelection?: () => void }).persistLastWheelConfigSelection?.();
    this.editingWheelConfig = JSON.parse(JSON.stringify(newConfig)) as WheelConfig;
    this.wheelCreateDialog = false;
    queueCloudConfigSyncPush(this as Parameters<typeof queueCloudConfigSyncPush>[0]);
  },

  createNewWheelConfig(this: Record<string, unknown>): void {
    this.wheelCreateDialog = true;
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
    const loadController = getWheelController(this as Record<string, unknown>);
    const builtSlots = buildSlotsFromConfig(sanitizedConfig);
    loadController.activeSlots = builtSlots;
    loadController.previewSlots = [...builtSlots];
    const restored = (this as Record<string, unknown> & { loadWheelFromSession: () => boolean }).loadWheelFromSession();
    if (!restored) {
      resetLoadedWheelSessionState(this as Record<string, unknown>);
      this.wheelSpinCounts = new Array(builtSlots.length).fill(0);
      loadController.previewSpinCounts = new Array(builtSlots.length).fill(0);
      loadController.previewTotalSpins = 0;
      loadController.previewChaseTallyHistory = [];
      loadController.previewFairnessHistory = [];
    }
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
    (this as Record<string, unknown> & { persistLastWheelConfigSelection?: () => void }).persistLastWheelConfigSelection?.();
    queueCloudConfigSyncPush(this as Parameters<typeof queueCloudConfigSyncPush>[0]);
    void broadcastWheelSession(this as Parameters<typeof broadcastWheelSession>[0]);
  },

  applyWheelConfig(this: Record<string, unknown>): void {
    const editing = (this as Record<string, unknown>).editingWheelConfig as WheelConfig | null;
    if (!editing) {
      (this as Record<string, unknown>).wheelConfigSyncPending = false;
      return;
    }
    clearQueuedWheelConfigSync(this);
    (this as Record<string, unknown>).wheelConfigSyncPending = true;
    stopWorkspaceConfigSyncPush(this as object);
    try {
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
      const applyController = getWheelController(this as Record<string, unknown>);
      const oldSlots = ((applyController.activeSlots || []) as WheelSlot[]);
      const oldCounts = ((this.wheelSpinCounts || []) as number[]);
      const oldTierIds = oldSlots.map((slot) => slot.tier);
      const newSlots = buildSlotsFromConfig(sanitizedUpdated);
      const newTierIds = new Set(sanitizedUpdated.tiers.map((tier) => tier.id));
      const hadTierShapeChange = oldTierIds.some((tierId) => !newTierIds.has(tierId))
        || sanitizedUpdated.tiers.some((tier) => !oldTierIds.includes(tier.id));
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
      this.activeWheelConfigId = sanitizedUpdated.id;
      (this as Record<string, unknown> & { persistLastWheelConfigSelection?: () => void }).persistLastWheelConfigSelection?.();
      (this as Record<string, unknown>).editingWheelConfig = JSON.parse(JSON.stringify(sanitizedUpdated)) as WheelConfig;
      (this as Record<string, unknown>).appliedWheelConfigSnapshot = JSON.parse(JSON.stringify(sanitizedUpdated)) as WheelConfig;
      applyController.activeSlots = newSlots;
      applyController.previewSlots = [...newSlots];
      this.wheelSpinCounts = remapSpinCountsByTier(oldTierIds, oldCounts, newSlots);
      this.wheelTotalSpins = (this.wheelSpinCounts as number[]).reduce((sum, count) => sum + count, 0);
      this.wheelLastResult = "";
      applyController.inventoryWarning = "";
      applyController.previewSpinCounts = new Array(newSlots.length).fill(0);
      applyController.previewTotalSpins = 0;
      applyController.previewFairnessHistory = [];
      applyController.previewChaseTallyHistory = [];
      applyController.previewGridReveals = [];
      applyController.lastResultColor = "rgb(var(--v-theme-primary))";
      applyController.spinHash = "";
      applyController.spinSeed = "";
      applyController.spinClientSeed = "";
      applyController.spinVerificationUrl = "";
      applyController.spinAlgorithm = "";
      applyController.showSeed = false;
      applyController.fairnessHistoryOpen = false;
      applyController.highlightedSlotIndex = -1;
      if (hadTierShapeChange) {
        applyController.sessionCostAdjustment = 0;
        applyController.chaseTallyHistory = [];
        applyController.gridReveals = [];
      } else {
        let costAdjustment = (applyController.sessionCostAdjustment as number) || 0;
        for (const tier of sanitizedUpdated.tiers) {
          const previousCost = previousTierCosts.get(tier.id);
          if (previousCost == null || previousCost === tier.costPerTier) continue;
          const priorSpins = previousTierTotals[tier.id] || 0;
          if (priorSpins > 0) {
            costAdjustment += priorSpins * (previousCost - tier.costPerTier);
          }
        }
        applyController.sessionCostAdjustment = costAdjustment;
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
      // Show the saved snackbar
      const showWheelConfigSaved = (this as Record<string, unknown> & {
        showWheelConfigSaved?: () => void;
      }).showWheelConfigSaved;
      if (typeof showWheelConfigSaved === "function") {
        showWheelConfigSaved();
      }
    } finally {
      (this as Record<string, unknown>).wheelConfigSyncPending = false;
    }
  },

  queueWheelConfigSync(this: Record<string, unknown>): void {
    const editing = (this as Record<string, unknown>).editingWheelConfig as WheelConfig | null;
    const hasPendingChanges = ((this as Record<string, unknown>).hasPendingWheelChanges as boolean) === true;
    clearQueuedWheelConfigSync(this);
    if (!editing) {
      (this as Record<string, unknown>).wheelConfigSyncPending = false;
      return;
    }
    if (!hasPendingChanges) {
      (this as Record<string, unknown>).wheelConfigSyncPending = false;
      (this as Record<string, unknown> & { clearWheelDraft: (wheelConfigId?: number | null) => void }).clearWheelDraft(editing.id);
      return;
    }
    (this as Record<string, unknown>).wheelConfigSyncPending = true;
    (this as Record<string, unknown>)._wheelDraftSaveTimeoutId = globalThis.setTimeout(() => {
      (this as Record<string, unknown>)._wheelDraftSaveTimeoutId = undefined;
      try {
        if (((this as Record<string, unknown>).canApplyWheelConfig as boolean) === true) {
          (this as Record<string, unknown> & { applyWheelConfig: () => void }).applyWheelConfig();
          return;
        }
        (this as Record<string, unknown> & { saveWheelDraft: () => void }).saveWheelDraft();
      } finally {
        (this as Record<string, unknown>).wheelConfigSyncPending = false;
      }
    }, 900);
  },

  saveWheelDraft(this: Record<string, unknown>): void {
    const editing = (this as Record<string, unknown>).editingWheelConfig as WheelConfig | null;
    if (!editing?.id) {
      (this as Record<string, unknown>).wheelConfigSyncPending = false;
      return;
    }
    const configs = (this.wheelConfigs || []) as WheelConfig[];
    const idx = configs.findIndex((entry) => entry.id === editing.id);
    const persisted = normalizeWheelConfig({
      ...(JSON.parse(JSON.stringify(editing)) as WheelConfig),
      updatedAt: new Date().toISOString()
    }, (this.lots || []) as Lot[]);
    if (!persisted) {
      (this as Record<string, unknown>).wheelConfigSyncPending = false;
      return;
    }
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
    (this as Record<string, unknown>).wheelConfigSyncPending = false;
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
    if (config.tiers.length === 0) {
      tier.chancePercent = 100;
      tier.slots = 100;
    }
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
    tier.boundLotIds = canAutoBindCurrentLot && currentLotId != null ? [currentLotId] : [];
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
    if (isWheelTierMultiLot(tier)) {
      const lots = (this.lots || []) as Lot[];
      const costs = getWheelTierSourceLotIds(tier)
        .map((id) => lots.find((l) => l.id === id))
        .filter((lot): lot is Lot => lot != null && lot.lotType !== "singles")
        .map((lot) => {
          const boxes = lot.boxesPurchased || 0;
          const packsPerBox = lot.packsPerBox || 16;
          const totalPacks = boxes * packsPerBox;
          if (totalPacks <= 0) return 0;
          const totalCost = calculateTotalCaseCost({
            boxesPurchased: boxes,
            pricePerBoxCad: lot.boxPriceCost || 0,
            purchaseShippingCad: lot.purchaseShippingCost || 0,
            purchaseTaxPercent: lot.purchaseTaxPercent || 0,
            includeTax: lot.includeTax ?? false,
            currency: lot.currency || "CAD"
          });
          return totalCost / totalPacks;
        })
        .filter((cost) => cost > 0);
      if (costs.length > 0) {
        return costs.reduce((sum, cost) => sum + cost, 0) / costs.length;
      }
    }
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
    if (isWheelTierMultiLot(tier)) return false;
    if (tier.boundLotId == null) return false;
    const lots = (this.lots || []) as Lot[];
    const lot = lots.find((l) => l.id === tier.boundLotId);
    return lot?.lotType === "singles" && (lot.singlesPurchases?.length ?? 0) > 0;
  },

  onTierLotChange(this: Record<string, unknown>, tier: WheelTier, lotId: unknown): void {
    const normalizedLotId = normalizeOptionalNumericId(lotId);
    tier.boundLotId = normalizedLotId;
    tier.boundLotIds = normalizedLotId == null ? [] : [normalizedLotId];
    tier.boundSinglesId = null;
    tier.isChase = false;
    if (normalizedLotId == null) {
      tier.deductionType = "packs";
      const costPerPack = (this as Record<string, unknown>).currentLotCostPerPack as number;
      if (costPerPack > 0) {
        tier.costPerTier = Math.round(tier.packsCount * costPerPack * 1000) / 1000;
      }
      return;
    }
    const lots = (this.lots || []) as Lot[];
    const lot = lots.find((l) => l.id === normalizedLotId);
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

  onTierMultiLotChange(this: Record<string, unknown>, tier: WheelTier, lotIds: unknown): void {
    tier.boundLotIds = Array.isArray(lotIds)
      ? lotIds
        .map((id) => normalizeOptionalNumericId(id))
        .filter((id): id is number => id != null)
      : [];
    normalizeWheelTierSources(tier, (this.lots || []) as Lot[]);
    const costPerPack = (this as Record<string, unknown> & { getCostPerPackForTier: (t: WheelTier) => number }).getCostPerPackForTier(tier);
    if (costPerPack > 0) {
      tier.costPerTier = Math.round(tier.packsCount * costPerPack * 1000) / 1000;
    }
  },

  onTierSinglesChange(this: Record<string, unknown>, tier: WheelTier, singlesId: unknown): void {
    const normalizedSinglesId = normalizeOptionalNumericId(singlesId);
    tier.boundSinglesId = normalizedSinglesId;
    if (tier.deductionType === "singles") {
      tier.packsCount = 1;
    }
    if (normalizedSinglesId == null) {
      tier.isChase = false;
      tier.costPerTier = 0;
    }
    if (normalizedSinglesId != null && tier.boundLotId != null) {
      const lots = (this.lots || []) as Lot[];
      const lot = lots.find((l) => l.id === tier.boundLotId);
      const entry = lot?.singlesPurchases?.find((e) => e.id === normalizedSinglesId);
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
