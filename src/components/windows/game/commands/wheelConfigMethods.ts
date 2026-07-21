import { nextTick } from "vue";
import { broadcastWheelSession } from "../../../../app-core/methods/ui/spectator/wheel-broadcast.ts";
import {
    queueCloudConfigSyncPush,
    stopWorkspaceConfigSyncPush
} from "../../../../app-core/methods/ui/workspace/workspace-config-sync.ts";
import { normalizeWheelConfig } from "../../../../app-core/shared/normalize-wheel-config.ts";
import { isSinglesLot } from "../../../../app-core/shared/lot-types.ts";
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
import type { Lot, LuckGameType, WheelConfig, WheelTier } from "../../../../types/app.ts";
import { getWheelController, type GameWindowThis } from "../coordinator/gameControllerState.ts";
import { remapSpinCountsByTier } from "../services/wheelCountRemapping.ts";
import { cloneGameConfig, createTierPrizeGameConfigFromTemplate } from "../services/gameConfigTemplates.ts";
import {
  clearWheelProofState,
  resetLoadedTierPrizeGameState,
  type WheelSessionContext
} from "../services/wheelSessionState.ts";
import { createDefaultTier } from "../services/wheelDefaults.ts";
import { calculateWheelLotCostPerPack } from "../services/wheelPricing.ts";
import { buildSlotsFromConfig, createWheelGridLayoutSeed, type WheelSlot } from "../services/wheelSlots.ts";
import {
    getAvailableSinglesQuantityForWheelTier,
    getRemainingPacksForWheelLot,
    getWheelTierInventoryMeta
} from "../services/wheelSaleSupport.ts";

type GameConfigContext = Record<string, unknown> & Partial<GameWindowThis>;

function resetLoadedGame(context: GameConfigContext, clearSlots: boolean): void {
  resetLoadedTierPrizeGameState(
    context as unknown as WheelSessionContext,
    getWheelController(context),
    clearSlots
  );
}

function clearQueuedWheelConfigSync(context: GameConfigContext): void {
  const timeoutId = context._wheelDraftSaveTimeoutId;
  if (timeoutId != null) {
    globalThis.clearTimeout(timeoutId);
    context._wheelDraftSaveTimeoutId = undefined;
  }
}

function getWheelDraftStorageKey(context: GameConfigContext, wheelConfigId: number | null | undefined): string {
  return getScopedWheelConfigDraftStorageKey(getActiveStorageScope(context as {
    activeScopeType: "personal" | "workspace";
    activeWorkspaceId: string | null;
  }), wheelConfigId);
}

function getActiveWheelConfigStorageKey(context: GameConfigContext): string {
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

export const wheelConfigMethods = {
  persistLastWheelConfigSelection(this: GameConfigContext): void {
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

  restoreLastWheelConfigSelection(this: GameConfigContext): void {
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

  openWheelCreateDialog(this: GameConfigContext): void {
    this.wheelCreateDialog = true;
  },

  closeWheelCreateDialog(this: GameConfigContext): void {
    this.wheelCreateDialog = false;
  },

  createNewGameConfig(this: GameConfigContext, gameType: LuckGameType): void {
    const configs = (this.wheelConfigs || []) as WheelConfig[];
    const activeId = this.activeWheelConfigId as number | null;
    const existing = activeId != null ? configs.find((c) => c.id === activeId) : null;
    const shouldCopyExisting = existing?.gameType === gameType;
    const newConfig = createTierPrizeGameConfigFromTemplate(this, gameType, shouldCopyExisting ? existing : null);
    configs.push(newConfig);
    this.wheelConfigs = [...configs];
    this.activeWheelConfigId = newConfig.id;
    this.persistLastWheelConfigSelection?.();
    this.editingWheelConfig = cloneGameConfig(newConfig);
    this.wheelCreateDialog = false;
    queueCloudConfigSyncPush(this as Parameters<typeof queueCloudConfigSyncPush>[0]);
  },

  createNewWheelConfig(this: GameConfigContext): void {
    this.wheelCreateDialog = true;
  },

  loadWheelConfig(this: GameConfigContext, options: { preserveLiveWheelState?: boolean } = {}): void {
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
    this.editingWheelConfig = draftConfig
      ? cloneGameConfig(draftConfig)
      : (sanitizedConfig ? cloneGameConfig(sanitizedConfig) : null);
    if (!sanitizedConfig) {
      this.appliedWheelConfigSnapshot = null;
      resetLoadedGame(this, true);
      nextTick(() => this.drawWheel?.(this.wheelCurrentAngle || 0));
      return;
    }
    if (options.preserveLiveWheelState === true) {
      return;
    }
    this.appliedWheelConfigSnapshot = cloneGameConfig(sanitizedConfig);
    const loadController = getWheelController(this as Record<string, unknown>);
    if (sanitizedConfig.gameType === "bracket") {
      resetLoadedGame(this, true);
      nextTick(() => this.drawWheel?.(this.wheelCurrentAngle || 0));
      return;
    }
    if (sanitizedConfig.gameType === "grid") {
      loadController.gridLayoutSeed = createWheelGridLayoutSeed();
      loadController.previewGridLayoutSeed = loadController.gridLayoutSeed;
    }
    const builtSlots = buildSlotsFromConfig(sanitizedConfig, {
      layoutSeed: sanitizedConfig.gameType === "grid" ? loadController.gridLayoutSeed : undefined
    });
    loadController.activeSlots = builtSlots;
    loadController.previewSlots = [...builtSlots];
    const restored = this.loadWheelFromSession?.() ?? false;
    if (!restored) {
      resetLoadedGame(this, false);
      this.wheelSpinCounts = new Array(builtSlots.length).fill(0);
      loadController.previewSpinCounts = new Array(builtSlots.length).fill(0);
      loadController.previewTotalSpins = 0;
      loadController.previewChaseTallyHistory = [];
      loadController.previewFairnessHistory = [];
    }
    nextTick(() => this.drawWheel?.(this.wheelCurrentAngle || 0));
  },

  deleteWheelConfig(this: GameConfigContext): void {
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
    this.persistLastWheelConfigSelection?.();
    queueCloudConfigSyncPush(this as Parameters<typeof queueCloudConfigSyncPush>[0]);
    void broadcastWheelSession(this as Parameters<typeof broadcastWheelSession>[0]);
  },

  applyWheelConfig(this: GameConfigContext): void {
    const editing = this.editingWheelConfig;
    if (!editing) {
      this.wheelConfigSyncPending = false;
      return;
    }
    clearQueuedWheelConfigSync(this);
    this.wheelConfigSyncPending = true;
    stopWorkspaceConfigSyncPush(this as object);
    try {
      const configs = (this.wheelConfigs || []) as WheelConfig[];
      const idx = configs.findIndex((c) => c.id === editing.id);
      const previousConfig = idx >= 0 ? configs[idx] : null;
      const updated = { ...cloneGameConfig(editing), updatedAt: new Date().toISOString() };
      const sanitizedUpdated = normalizeWheelConfig(updated, (this.lots || []) as Lot[]) ?? updated;
      if (idx >= 0) {
        configs[idx] = sanitizedUpdated;
      } else {
        configs.push(sanitizedUpdated);
      }
      const applyController = getWheelController(this as Record<string, unknown>);
      if (sanitizedUpdated.gameType === "bracket") {
        this._wheelSkipConfigReload = true;
        this.wheelConfigs = [...configs];
        try {
          localStorage.removeItem(getWheelDraftStorageKey(this, updated.id));
        } catch { /* ignore */ }
        this.activeWheelConfigId = sanitizedUpdated.id;
        this.persistLastWheelConfigSelection?.();
        this.editingWheelConfig = cloneGameConfig(sanitizedUpdated);
        this.appliedWheelConfigSnapshot = cloneGameConfig(sanitizedUpdated);
        resetLoadedGame(this, true);
        queueCloudConfigSyncPush(this as Parameters<typeof queueCloudConfigSyncPush>[0]);
        this.showWheelConfigSaved?.();
        return;
      }
      const oldSlots = ((applyController.activeSlots || []) as WheelSlot[]);
      const oldCounts = ((this.wheelSpinCounts || []) as number[]);
      const oldTierIds = oldSlots.map((slot) => slot.tier);
      if (sanitizedUpdated.gameType === "grid" && !applyController.gridLayoutSeed) {
        applyController.gridLayoutSeed = createWheelGridLayoutSeed();
        applyController.previewGridLayoutSeed = applyController.gridLayoutSeed;
      }
      const newSlots = buildSlotsFromConfig(sanitizedUpdated, {
        layoutSeed: sanitizedUpdated.gameType === "grid" ? applyController.gridLayoutSeed : undefined
      });
      const newTierIds = new Set(sanitizedUpdated.tiers.map((tier) => tier.id));
      const hadTierShapeChange = oldTierIds.some((tierId) => !newTierIds.has(tierId))
        || sanitizedUpdated.tiers.some((tier) => !oldTierIds.includes(tier.id));
      const previousTierTotals = oldSlots.reduce<Record<string, number>>((acc, slot, index) => {
        acc[slot.tier] = (acc[slot.tier] || 0) + (oldCounts[index] || 0);
        return acc;
      }, {});
      const previousTierCosts = new Map((previousConfig?.tiers || []).map((tier) => [tier.id, tier.costPerTier]));

      this._wheelSkipConfigReload = true;
      this.wheelConfigs = [...configs];
      try {
        localStorage.removeItem(getWheelDraftStorageKey(this, updated.id));
      } catch { /* ignore */ }
      this.activeWheelConfigId = sanitizedUpdated.id;
      this.persistLastWheelConfigSelection?.();
      this.editingWheelConfig = cloneGameConfig(sanitizedUpdated);
      this.appliedWheelConfigSnapshot = cloneGameConfig(sanitizedUpdated);
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
      clearWheelProofState(applyController);
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
      this.wheelEndingSession = false;
      this.wheelChaseDialog = false;
      this.wheelChaseReplacementSinglesId = null;
      this.wheelChasePendingTierId = "";
      this.wheelSessionUpdatedAt = Date.now();
      this.saveWheelSession?.();
      queueCloudConfigSyncPush(this as Parameters<typeof queueCloudConfigSyncPush>[0]);
      void broadcastWheelSession(this as Parameters<typeof broadcastWheelSession>[0]);
      nextTick(() => this.drawWheel?.(this.wheelCurrentAngle || 0));
      // Show the saved snackbar
      this.showWheelConfigSaved?.();
    } finally {
      this.wheelConfigSyncPending = false;
    }
  },

  queueWheelConfigSync(this: GameConfigContext): void {
    const editing = this.editingWheelConfig;
    const hasPendingChanges = this.hasPendingWheelChanges === true;
    clearQueuedWheelConfigSync(this);
    if (!editing) {
      this.wheelConfigSyncPending = false;
      return;
    }
    if (!hasPendingChanges) {
      this.wheelConfigSyncPending = false;
      this.clearWheelDraft?.(editing.id);
      return;
    }
    this.wheelConfigSyncPending = true;
    this._wheelDraftSaveTimeoutId = globalThis.setTimeout(() => {
      this._wheelDraftSaveTimeoutId = undefined;
      try {
        if (this.canApplyWheelConfig === true) {
          this.applyWheelConfig?.();
          return;
        }
        this.saveWheelDraft?.();
      } finally {
        this.wheelConfigSyncPending = false;
      }
    }, 900);
  },

  saveWheelDraft(this: GameConfigContext): void {
    const editing = this.editingWheelConfig;
    if (!editing?.id) {
      this.wheelConfigSyncPending = false;
      return;
    }
    const configs = (this.wheelConfigs || []) as WheelConfig[];
    const idx = configs.findIndex((entry) => entry.id === editing.id);
    const persisted = normalizeWheelConfig({
      ...cloneGameConfig(editing),
      updatedAt: new Date().toISOString()
    }, (this.lots || []) as Lot[]);
    if (!persisted) {
      this.wheelConfigSyncPending = false;
      return;
    }
    if (idx >= 0) {
      configs[idx] = persisted;
    } else {
      configs.push(persisted);
    }
    this._wheelSkipConfigReload = true;
    this.wheelConfigs = [...configs];
    try {
      localStorage.removeItem(getWheelDraftStorageKey(this, editing.id));
    } catch { /* ignore */ }
    this.wheelConfigSyncPending = false;
  },

  clearWheelDraft(this: GameConfigContext, wheelConfigId?: number | null): void {
    const targetId = wheelConfigId ?? (this.editingWheelConfig?.id ?? null);
    if (targetId == null) return;
    try {
      localStorage.removeItem(getWheelDraftStorageKey(this, targetId));
    } catch { /* ignore */ }
  },

  addTier(this: GameConfigContext): void {
    const config = this.editingWheelConfig;
    if (!config) return;
    const costPerPack = this.currentLotCostPerPack ?? 0;
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
      isSinglesLot(currentLot)
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

  removeTier(this: GameConfigContext, index: number): void {
    const config = this.editingWheelConfig;
    if (!config) return;
    config.tiers.splice(index, 1);
  },

  onTierPacksChange(this: GameConfigContext, tier: WheelTier): void {
    if (!this.wheelConfigReady) return;
    const costPerPack = this.getCostPerPackForTier?.(tier) ?? 0;
    if (costPerPack > 0) {
      tier.costPerTier = Math.round(tier.packsCount * costPerPack * 1000) / 1000;
    }
  },

  getCostPerPackForTier(this: GameConfigContext, tier: WheelTier): number {
    const lots = (this.lots || []) as Lot[];
    if (isWheelTierMultiLot(tier)) {
      const costs = getWheelTierSourceLotIds(tier)
        .map((id) => lots.find((l) => l.id === id))
        .filter((lot): lot is Lot => lot != null && !isSinglesLot(lot))
        .map(calculateWheelLotCostPerPack)
        .filter((cost) => cost > 0);
      if (costs.length > 0) {
        return costs.reduce((sum, cost) => sum + cost, 0) / costs.length;
      }
    }
    if (tier.boundLotId != null) {
      const costPerPack = calculateWheelLotCostPerPack(lots.find((lot) => lot.id === tier.boundLotId) ?? {});
      if (costPerPack > 0) return costPerPack;
    }
    return this.currentLotCostPerPack ?? 0;
  },

  getSinglesItemsForTier(this: GameConfigContext, tier: WheelTier): Array<{ title: string; value: number | null; image?: string; cardNumber?: string; stockLabel?: string }> {
    if (tier.boundLotId == null) return [];
    const lots = (this.lots || []) as Lot[];
    const lot = lots.find((l) => l.id === tier.boundLotId);
    if (!isSinglesLot(lot) || !lot.singlesPurchases?.length) return [];
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

  getTierInventoryMeta(this: GameConfigContext, tier: WheelTier): { text: string; warning: boolean } | null {
    return getWheelTierInventoryMeta(this, tier);
  },

  isBoundLotSingles(this: GameConfigContext, tier: WheelTier): boolean {
    if (isWheelTierMultiLot(tier)) return false;
    if (tier.boundLotId == null) return false;
    const lots = (this.lots || []) as Lot[];
    const lot = lots.find((l) => l.id === tier.boundLotId);
    return isSinglesLot(lot) && (lot.singlesPurchases?.length ?? 0) > 0;
  },

  onTierLotChange(this: GameConfigContext, tier: WheelTier, lotId: unknown): void {
    const normalizedLotId = normalizeOptionalNumericId(lotId);
    tier.boundLotId = normalizedLotId;
    tier.boundLotIds = normalizedLotId == null ? [] : [normalizedLotId];
    tier.boundSinglesId = null;
    tier.isChase = false;
    if (normalizedLotId == null) {
      tier.deductionType = "packs";
      const costPerPack = this.currentLotCostPerPack ?? 0;
      if (costPerPack > 0) {
        tier.costPerTier = Math.round(tier.packsCount * costPerPack * 1000) / 1000;
      }
      return;
    }
    const lots = (this.lots || []) as Lot[];
    const lot = lots.find((l) => l.id === normalizedLotId);
    if (isSinglesLot(lot)) {
      tier.deductionType = "singles";
      tier.packsCount = 1;
      tier.costPerTier = 0;
    } else {
      tier.deductionType = "packs";
      const costPerPack = this.getCostPerPackForTier?.(tier) ?? 0;
      if (costPerPack > 0) {
        tier.costPerTier = Math.round(tier.packsCount * costPerPack * 1000) / 1000;
      }
    }
  },

  onTierMultiLotChange(this: GameConfigContext, tier: WheelTier, lotIds: unknown): void {
    tier.boundLotIds = Array.isArray(lotIds)
      ? lotIds
        .map((id) => normalizeOptionalNumericId(id))
        .filter((id): id is number => id != null)
      : [];
    normalizeWheelTierSources(tier, (this.lots || []) as Lot[]);
    const costPerPack = this.getCostPerPackForTier?.(tier) ?? 0;
    if (costPerPack > 0) {
      tier.costPerTier = Math.round(tier.packsCount * costPerPack * 1000) / 1000;
    }
  },

  onTierSinglesChange(this: GameConfigContext, tier: WheelTier, singlesId: unknown): void {
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

  canTierBeChase(this: GameConfigContext, tier: WheelTier): boolean {
    return tier.deductionType === "singles" && tier.boundLotId != null && tier.boundSinglesId != null;
  },

  toggleTierChase(this: GameConfigContext, tier: WheelTier): void {
    if (this.canTierBeChase?.(tier) !== true) {
      tier.isChase = false;
      return;
    }
    tier.isChase = !tier.isChase;
  }
};

