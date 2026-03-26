import { nextTick } from "vue";
import { broadcastWheelSession } from "../../app-core/methods/ui/wheel-broadcast.ts";
import type { Lot, Sale, SkippedWheelDeduction, WheelConfig } from "../../types/app.ts";
import { getScopedWheelConfigSessionStorageKey } from "../../app-core/storageKeys.ts";
import { getActiveStorageScope } from "../../app-core/workspace-scope.ts";
import { buildSlotsFromConfig, createWheelSale, remapSpinCountsByTier, type WheelSlot } from "./wheelHelpers.ts";
import {
  getAvailableSinglesQuantityForWheelTier,
  hasAnyAvailableSinglesForWheelTier
} from "./wheelSaleSupport.ts";

type WheelTallyHistoryEntry = { tierId: string; label: string; color: string; count: number };
type WheelFairnessHistoryEntry = {
  spinNumber: number;
  label: string;
  color: string;
  hash: string;
  seed: string;
  timestamp: number;
};

function snapshotCurrentTierLabelToHistory(
  tierId: string,
  tierLabel: string,
  tierColor: string,
  slots: WheelSlot[],
  counts: number[],
  history: WheelTallyHistoryEntry[]
): WheelTallyHistoryEntry[] {
  let tierSpins = 0;
  for (let i = 0; i < slots.length; i++) {
    if (slots[i]?.tier === tierId) tierSpins += (counts[i] || 0);
  }
  let previousHistorical = 0;
  for (const entry of history) {
    if (entry.tierId === tierId) previousHistorical += entry.count;
  }
  const currentLabelCount = tierSpins - previousHistorical;
  if (currentLabelCount <= 0) return history;
  return [...history, { tierId, label: tierLabel, color: tierColor, count: currentLabelCount }];
}

function rebuildSlotsAndRemapCounts(config: WheelConfig, oldSlots: WheelSlot[], oldCounts: number[]): {
  slots: WheelSlot[];
  counts: number[];
} {
  const newSlots = buildSlotsFromConfig(config);
  const newCounts = remapSpinCountsByTier(oldSlots.map((slot) => slot.tier), oldCounts, newSlots);
  return { slots: newSlots, counts: newCounts };
}

function applyReplacementToTier(
  tier: WheelConfig["tiers"][number] | undefined,
  selectedId: number,
  newLabel: string,
  newCost: number
): void {
  if (!tier) return;
  tier.label = newLabel;
  tier.boundSinglesId = selectedId;
  tier.costPerTier = newCost;
}

export const wheelSessionMethods = {
  appendWheelFairnessHistory(
    this: Record<string, unknown>,
    entry: WheelFairnessHistoryEntry,
    options: { preview?: boolean } = {}
  ): void {
    const historyKey = options.preview === true ? "wheelPreviewFairnessHistory" : "wheelFairnessHistory";
    const currentHistory = (((this as Record<string, unknown>)[historyKey] || []) as WheelFairnessHistoryEntry[]);
    const nextHistory = [...currentHistory, entry].slice(-20);
    (this as Record<string, unknown>)[historyKey] = nextHistory;
  },

  resetPreviewSession(this: Record<string, unknown>): void {
    const previewSlots = (((this as Record<string, unknown>).wheelPreviewSlots
      || (this as Record<string, unknown>).activeWheelSlots) as WheelSlot[]);
    (this as Record<string, unknown>).wheelPreviewSpinCounts = new Array(previewSlots.length).fill(0);
    (this as Record<string, unknown>).wheelPreviewTotalSpins = 0;
    (this as Record<string, unknown>).wheelPreviewFairnessHistory = [];
    this.wheelLastResult = "";
    (this as Record<string, unknown>).wheelInventoryWarning = "";
    (this as Record<string, unknown>).wheelLastResultColor = "rgb(var(--v-theme-primary))";
    (this as Record<string, unknown>).wheelSpinHash = "";
    (this as Record<string, unknown>).wheelSpinSeed = "";
    (this as Record<string, unknown>).wheelShowSeed = false;
    (this as Record<string, unknown>).wheelChaseDialog = false;
    (this as Record<string, unknown>).wheelChasePreviewMode = false;
    (this as Record<string, unknown>).wheelChaseReplacementSinglesId = null;
    (this as Record<string, unknown>).wheelChasePendingTierId = "";
    (this as Record<string, unknown>).wheelPreviewChaseTallyHistory = [];
    (this as Record<string, unknown>).wheelFairnessHistoryOpen = false;
  },

  getChaseReplacementItems(this: Record<string, unknown>): Array<{ title: string; value: number; image?: string; cardNumber?: string; stockLabel?: string }> {
    const tierId = (this as Record<string, unknown>).wheelChasePendingTierId as string;
    if (!tierId) return [];
    const isPreview = ((this as Record<string, unknown>).wheelChasePreviewMode as boolean) === true;
    const configs = (this.wheelConfigs || []) as WheelConfig[];
    const activeId = this.activeWheelConfigId as number | null;
    const config = isPreview
      ? (((this as Record<string, unknown>).editingWheelConfig as WheelConfig | null)
        || (activeId != null ? configs.find((c) => c.id === activeId) : null))
      : (activeId != null ? configs.find((c) => c.id === activeId) : null);
    const tier = config?.tiers.find((t) => t.id === tierId);
    if (!tier?.boundLotId) return [];
    const lots = (this.lots || []) as Lot[];
    const lot = lots.find((l) => l.id === tier.boundLotId);
    if (!lot?.singlesPurchases?.length) return [];
    return lot.singlesPurchases
      .filter((entry) => getAvailableSinglesQuantityForWheelTier(this, tier.boundLotId as number, entry.id) > 0)
      .map((e) => ({
        title: e.item,
        value: e.id,
        image: e.image,
        cardNumber: e.cardNumber,
        stockLabel: `${getAvailableSinglesQuantityForWheelTier(this, tier.boundLotId as number, e.id)} left`
      }));
  },

  confirmChaseReplacement(this: Record<string, unknown>): void {
    const selectedId = (this as Record<string, unknown>).wheelChaseReplacementSinglesId as number | null;
    const tierId = (this as Record<string, unknown>).wheelChasePendingTierId as string;
    const isPreview = ((this as Record<string, unknown>).wheelChasePreviewMode as boolean) === true;
    if (selectedId == null || !tierId) {
      (this as Record<string, unknown>).wheelChaseDialog = false;
      (this as Record<string, unknown>).wheelChasePreviewMode = false;
      return;
    }

    // Look up the item name from the lot
    const configs2 = (this.wheelConfigs || []) as WheelConfig[];
    const activeId2 = this.activeWheelConfigId as number | null;
    const config2 = activeId2 != null ? configs2.find((c) => c.id === activeId2) : null;
    const tier2 = config2?.tiers.find((t) => t.id === tierId);
    const lots = (this.lots || []) as Lot[];
    const lot = tier2?.boundLotId != null ? lots.find((l) => l.id === tier2.boundLotId) : null;
    const entry = lot?.singlesPurchases?.find((e) => e.id === selectedId);
    const newLabel = entry?.item || "";
    if (!newLabel) {
      (this as Record<string, unknown>).wheelChaseDialog = false;
      (this as Record<string, unknown>).wheelChasePreviewMode = false;
      return;
    }

    if (isPreview) {
      const editing = (this as Record<string, unknown>).editingWheelConfig as WheelConfig | null;
      if (!editing) {
        (this as Record<string, unknown>).wheelChaseDialog = false;
        (this as Record<string, unknown>).wheelChasePreviewMode = false;
        return;
      }

      const tier = editing.tiers.find((t) => t.id === tierId);
      const oldSlots = (this as Record<string, unknown>).wheelPreviewSlots as WheelSlot[];
      const oldCounts = ((this as Record<string, unknown>).wheelPreviewSpinCounts || []) as number[];
      const historyArr = (this as Record<string, unknown>).wheelPreviewChaseTallyHistory as WheelTallyHistoryEntry[];
      (this as Record<string, unknown>).wheelPreviewChaseTallyHistory = snapshotCurrentTierLabelToHistory(
        tierId,
        tier?.label || "",
        tier?.color || "",
        oldSlots,
        oldCounts,
        historyArr
      );
      applyReplacementToTier(tier, selectedId, newLabel, entry ? (entry.cost || entry.marketValue || 0) : 0);
      const rebuilt = rebuildSlotsAndRemapCounts(editing, oldSlots, oldCounts);
      (this as Record<string, unknown>).wheelPreviewSlots = rebuilt.slots;
      (this as Record<string, unknown>).wheelPreviewSpinCounts = rebuilt.counts;
      (this as Record<string, unknown>).wheelChaseDialog = false;
      (this as Record<string, unknown>).wheelChasePreviewMode = false;
      this.wheelLastResult = "⭐ Preview chase replaced — " + newLabel;
      (this as Record<string, unknown>).wheelLastResultColor = "#f0a500";
      nextTick(() => (this as Record<string, unknown> & { drawWheel: (offset?: number) => void }).drawWheel(
        (this as Record<string, unknown>).wheelCurrentAngle as number || 0
      ));
      return;
    }

    const configs = (this.wheelConfigs || []) as WheelConfig[];
    const activeId = this.activeWheelConfigId as number | null;
    const config = activeId != null ? configs.find((c) => c.id === activeId) : null;
    if (!config) {
      (this as Record<string, unknown>).wheelChaseDialog = false;
      (this as Record<string, unknown>).wheelChasePreviewMode = false;
      return;
    }

    const tier = config.tiers.find((t) => t.id === tierId);
    if (tier) {
      // Auto-record sale for the won chase item BEFORE changing tier label/cost
      (this as Record<string, unknown> & { recordChaseSale: (tierId: string) => void }).recordChaseSale(tierId);

      // Preserve session cost for already-counted spins at the old cost
      const oldCost = tier.costPerTier;
      const newCost = entry ? (entry.cost || entry.marketValue || 0) : oldCost;
      if (oldCost !== newCost) {
        const oldSlots = (this as Record<string, unknown>).activeWheelSlots as WheelSlot[];
        const oldCounts = (this.wheelSpinCounts || []) as number[];
        let tierSpins = 0;
        for (let i = 0; i < oldSlots.length; i++) {
          if (oldSlots[i]?.tier === tierId) tierSpins += (oldCounts[i] || 0);
        }
        (this as Record<string, unknown>).wheelSessionCostAdjustment =
          ((this as Record<string, unknown>).wheelSessionCostAdjustment as number || 0) + tierSpins * (oldCost - newCost);
      }

      const oldSlotsPre = (this as Record<string, unknown>).activeWheelSlots as WheelSlot[];
      const oldCountsPre = (this.wheelSpinCounts || []) as number[];
      const historyArr = (this as Record<string, unknown>).wheelChaseTallyHistory as WheelTallyHistoryEntry[];
      (this as Record<string, unknown>).wheelChaseTallyHistory = snapshotCurrentTierLabelToHistory(
        tierId,
        tier.label,
        tier.color,
        oldSlotsPre,
        oldCountsPre,
        historyArr
      );
      applyReplacementToTier(tier, selectedId, newLabel, newCost);
    }
    this.wheelConfigs = [...configs];

    // Also update the editing copy
    const editing = (this as Record<string, unknown>).editingWheelConfig as WheelConfig | null;
    if (editing) {
      const editTier = editing.tiers.find((t) => t.id === tierId);
      if (editTier) {
        applyReplacementToTier(editTier, selectedId, newLabel, entry ? (entry.cost || entry.marketValue || 0) : editTier.costPerTier);
      }
    }

    // Rebuild slots preserving spin counts by tier
    const oldSlots = (this as Record<string, unknown>).activeWheelSlots as WheelSlot[];
    const oldCounts = (this.wheelSpinCounts || []) as number[];
    const rebuilt = rebuildSlotsAndRemapCounts(config, oldSlots, oldCounts);
    (this as Record<string, unknown>).activeWheelSlots = rebuilt.slots;
    this.wheelSpinCounts = rebuilt.counts;

    (this as Record<string, unknown>).wheelChaseDialog = false;
    (this as Record<string, unknown>).wheelChasePreviewMode = false;
    this.wheelLastResult = "⭐ Chase replaced — " + newLabel;
    (this as Record<string, unknown>).wheelLastResultColor = "#f0a500";
    (this as Record<string, unknown>).wheelSessionUpdatedAt = Date.now();
    (this as Record<string, unknown> & { saveWheelSession: () => void }).saveWheelSession();
    void broadcastWheelSession(this as Parameters<typeof broadcastWheelSession>[0]);
    nextTick(() => (this as Record<string, unknown> & { drawWheel: (offset?: number) => void }).drawWheel(
      (this as Record<string, unknown>).wheelCurrentAngle as number || 0
    ));
  },

  keepChase(this: Record<string, unknown>): void {
    const tierId = (this as Record<string, unknown>).wheelChasePendingTierId as string;
    if (((this as Record<string, unknown>).wheelChasePreviewMode as boolean) === true) {
      (this as Record<string, unknown>).wheelChaseDialog = false;
      (this as Record<string, unknown>).wheelChasePreviewMode = false;
      this.wheelLastResult = "⭐ Preview keeps chase item";
      (this as Record<string, unknown>).wheelLastResultColor = "#f0a500";
      return;
    }
    if (tierId) {
      (this as Record<string, unknown> & { recordChaseSale: (tierId: string) => void }).recordChaseSale(tierId);
    }
    (this as Record<string, unknown>).wheelChaseDialog = false;
    (this as Record<string, unknown>).wheelChasePreviewMode = false;
  },

  recordChaseSale(this: Record<string, unknown>, tierId: string): void {
    const configs = (this.wheelConfigs || []) as WheelConfig[];
    const activeId = this.activeWheelConfigId as number | null;
    const config = activeId != null ? configs.find((c) => c.id === activeId) : null;
    if (!config) return;
    const tier = config.tiers.find((t) => t.id === tierId);
    if (!tier?.boundLotId) return;
    if (tier.deductionType === "none" || (tier.packsCount || 0) <= 0) return;
    if (tier.deductionType === "singles") {
      if (tier.boundSinglesId) {
        if (getAvailableSinglesQuantityForWheelTier(this, tier.boundLotId, tier.boundSinglesId) <= 0) {
          return;
        }
      } else if (!hasAnyAvailableSinglesForWheelTier(this, tier)) {
        return;
      }
    }

    const lots = (this.lots || []) as Lot[];
    const sale = createWheelSale({
      config, tier: tier.id, cost: tier.costPerTier,
      packsCount: tier.packsCount, deductionType: tier.deductionType,
      label: tier.label, lotId: tier.boundLotId, lots,
      singlesEntryId: tier.boundSinglesId
    });
    const addWheelSale = (this as Record<string, unknown>).addWheelSaleToLot as
      ((lotId: number, sale: Sale) => void) | undefined;
    if (typeof addWheelSale === "function") {
      addWheelSale(tier.boundLotId, sale);
    }
  },

  canKeepChase(this: Record<string, unknown>): boolean {
    const tierId = (this as Record<string, unknown>).wheelChasePendingTierId as string;
    if (!tierId) return false;
    const configs = (this.wheelConfigs || []) as WheelConfig[];
    const activeId = this.activeWheelConfigId as number | null;
    const config = ((this as Record<string, unknown>).wheelChasePreviewMode as boolean) === true
      ? (((this as Record<string, unknown>).editingWheelConfig as WheelConfig | null)
        || (activeId != null ? configs.find((c) => c.id === activeId) : null))
      : (activeId != null ? configs.find((c) => c.id === activeId) : null);
    const tier = config?.tiers.find((t) => t.id === tierId);
    if (!tier?.boundLotId || !tier.boundSinglesId || (tier.packsCount || 0) <= 0) return false;
    return getAvailableSinglesQuantityForWheelTier(this, tier.boundLotId, tier.boundSinglesId) > 1;
  },

  resetWheelSession(this: Record<string, unknown>): void {
    const slots = (this as Record<string, unknown>).activeWheelSlots as WheelSlot[];
    this.wheelTotalSpins = 0;
    this.wheelSpinCounts = new Array(slots.length).fill(0);
    (this as Record<string, unknown>).wheelPreviewSlots = [...slots];
    (this as Record<string, unknown>).wheelPreviewSpinCounts = new Array(slots.length).fill(0);
    (this as Record<string, unknown>).wheelPreviewTotalSpins = 0;
    (this as Record<string, unknown>).wheelPreviewChaseTallyHistory = [];
    this.wheelLastResult = "";
    (this as Record<string, unknown>).wheelInventoryWarning = "";
    (this as Record<string, unknown>).wheelLastResultColor = "rgb(var(--v-theme-primary))";
    this.wheelSkippedDeductions = [];
    (this as Record<string, unknown>).wheelEndingSession = false;
    (this as Record<string, unknown>).wheelSpinHash = "";
    (this as Record<string, unknown>).wheelSpinSeed = "";
    (this as Record<string, unknown>).wheelShowSeed = false;
    (this as Record<string, unknown>).wheelChaseDialog = false;
    (this as Record<string, unknown>).wheelChasePreviewMode = false;
    (this as Record<string, unknown>).wheelChaseReplacementSinglesId = null;
    (this as Record<string, unknown>).wheelChasePendingTierId = "";
    (this as Record<string, unknown>).wheelSessionCostAdjustment = 0;
    (this as Record<string, unknown>).wheelFairnessHistory = [];
    (this as Record<string, unknown>).wheelChaseTallyHistory = [];
    (this as Record<string, unknown>).wheelFairnessHistoryOpen = false;
    (this as Record<string, unknown>).wheelSessionUpdatedAt = Date.now();
    (this as Record<string, unknown> & { saveWheelSession: () => void }).saveWheelSession();
    void broadcastWheelSession(this as Parameters<typeof broadcastWheelSession>[0]);
  },

  confirmWheelAction(this: Record<string, unknown>): void {
    const action = (this as Record<string, unknown>).wheelConfirmAction as string;
    (this as Record<string, unknown>).wheelConfirmDialog = false;
    (this as Record<string, unknown>).wheelConfirmAction = "";
    if (action === "reset") {
      if (((this as Record<string, unknown>).wheelMode as string) === "config") {
        (this as Record<string, unknown> & { resetPreviewSession: () => void }).resetPreviewSession();
      } else {
        (this as Record<string, unknown> & { resetWheelSession: () => void }).resetWheelSession();
      }
    } else if (action === "apply") {
      (this as Record<string, unknown> & { applyWheelConfig: () => void }).applyWheelConfig();
    } else if (action === "delete") {
      (this as Record<string, unknown> & { deleteWheelConfig: () => void }).deleteWheelConfig();
    }
  },

  startEndWheelSession(this: Record<string, unknown>): void {
    const vm = this as Record<string, unknown> & { resetWheelSession: () => void };
    const skipped = (this.wheelSkippedDeductions || []) as SkippedWheelDeduction[];
    if (!skipped.length) {
      vm.resetWheelSession();
      return;
    }
    const config = (this as Record<string, unknown>).activeWheelConfig as WheelConfig | null;
    const currentLotId = (this.currentLotId as number | null) ?? null;
    for (const entry of skipped) {
      if (!entry.selectedLotId) {
        const tier = config?.tiers.find((t) => t.id === entry.slotTier);
        entry.selectedLotId = (tier?.boundLotId) ?? currentLotId;
      }
    }
    this.wheelSkippedDeductions = [...skipped];
    (this as Record<string, unknown>).wheelEndingSession = true;
  },

  confirmBatchSale(this: Record<string, unknown>, index: number): void {
    const skipped = (this.wheelSkippedDeductions || []) as SkippedWheelDeduction[];
    const entry = skipped[index];
    if (!entry?.selectedLotId) return;

    const config = (this as Record<string, unknown>).activeWheelConfig as WheelConfig | null;
    if (!config) return;

    const lots = (this.lots || []) as Lot[];
    const sale = createWheelSale({
      config, tier: entry.slotTier, cost: entry.slotCost,
      packsCount: entry.slotPacksCount, deductionType: entry.slotDeductionType,
      label: entry.slotName, lotId: entry.selectedLotId, lots,
      singlesEntryId: entry.slotSinglesId,
      spinNumber: entry.spinNumber
    });
    const addWheelSale = (this as Record<string, unknown>).addWheelSaleToLot as
      ((lotId: number, sale: Sale) => void) | undefined;
    if (typeof addWheelSale === "function") {
      addWheelSale(entry.selectedLotId, sale);
    }

    skipped.splice(index, 1);
    this.wheelSkippedDeductions = [...skipped];

    if (!skipped.length) {
      (this as Record<string, unknown>).wheelEndingSession = false;
    }
    (this as Record<string, unknown>).wheelSessionUpdatedAt = Date.now();
    void broadcastWheelSession(this as Parameters<typeof broadcastWheelSession>[0]);
  },

  confirmAllBatchSales(this: Record<string, unknown>): void {
    const vm = this as Record<string, unknown> & { confirmBatchSale: (i: number) => void };
    const skipped = (this.wheelSkippedDeductions || []) as SkippedWheelDeduction[];
    for (let i = skipped.length - 1; i >= 0; i--) {
      if (skipped[i]!.selectedLotId) {
        vm.confirmBatchSale(i);
      }
    }
  },

  dismissBatchSale(this: Record<string, unknown>, index: number): void {
    const skipped = (this.wheelSkippedDeductions || []) as SkippedWheelDeduction[];
    skipped.splice(index, 1);
    this.wheelSkippedDeductions = [...skipped];
    if (!skipped.length) {
      (this as Record<string, unknown>).wheelEndingSession = false;
    }
    (this as Record<string, unknown>).wheelSessionUpdatedAt = Date.now();
    void broadcastWheelSession(this as Parameters<typeof broadcastWheelSession>[0]);
  },

  cancelEndWheelSession(this: Record<string, unknown>): void {
    (this as Record<string, unknown>).wheelEndingSession = false;
  },

  saveWheelSession(this: Record<string, unknown>): void {
    const activeId = this.activeWheelConfigId as number | null;
    if (activeId == null) return;
    const slots = (((this as Record<string, unknown>).activeWheelSlots || []) as WheelSlot[]);
    const session = {
      wheelSpinCounts: this.wheelSpinCounts,
      wheelSlotTiers: slots.map((slot) => slot.tier),
      wheelTotalSpins: this.wheelTotalSpins,
      wheelSessionUpdatedAt: this.wheelSessionUpdatedAt,
      wheelSessionCostAdjustment: (this as Record<string, unknown>).wheelSessionCostAdjustment,
      wheelFairnessHistory: (this as Record<string, unknown>).wheelFairnessHistory,
      wheelChaseTallyHistory: (this as Record<string, unknown>).wheelChaseTallyHistory,
      wheelSkippedDeductions: this.wheelSkippedDeductions,
      wheelCurrentAngle: this.wheelCurrentAngle,
      wheelLastResult: this.wheelLastResult,
      wheelLastResultColor: (this as Record<string, unknown>).wheelLastResultColor
    };
    try {
      localStorage.setItem(
        getScopedWheelConfigSessionStorageKey(getActiveStorageScope(this as {
          activeScopeType: "personal" | "workspace";
          activeWorkspaceId: string | null;
        }), activeId),
        JSON.stringify(session)
      );
    } catch { /* quota exceeded — non-critical */ }
  },

  loadWheelFromSession(this: Record<string, unknown>): boolean {
    const activeId = this.activeWheelConfigId as number | null;
    if (activeId == null) return false;
    const raw = localStorage.getItem(
      getScopedWheelConfigSessionStorageKey(getActiveStorageScope(this as {
        activeScopeType: "personal" | "workspace";
        activeWorkspaceId: string | null;
      }), activeId)
    );
    if (!raw) return false;
    try {
      const session = JSON.parse(raw);
      const slots = (this as Record<string, unknown>).activeWheelSlots as WheelSlot[];
      if (!Array.isArray(session.wheelSpinCounts)) return false;
      if (session.wheelSpinCounts.length === slots.length) {
        this.wheelSpinCounts = session.wheelSpinCounts;
      } else if (Array.isArray(session.wheelSlotTiers)) {
        this.wheelSpinCounts = remapSpinCountsByTier(session.wheelSlotTiers, session.wheelSpinCounts, slots);
      } else {
        return false;
      }
      this.wheelTotalSpins = (this.wheelSpinCounts as number[]).reduce((sum, count) => sum + count, 0);
      this.wheelSessionUpdatedAt = session.wheelSessionUpdatedAt || 0;
      (this as Record<string, unknown>).wheelSessionCostAdjustment = session.wheelSessionCostAdjustment || 0;
      (this as Record<string, unknown>).wheelFairnessHistory = Array.isArray(session.wheelFairnessHistory)
        ? session.wheelFairnessHistory.slice(-20)
        : [];
      (this as Record<string, unknown>).wheelChaseTallyHistory = session.wheelChaseTallyHistory || [];
      this.wheelSkippedDeductions = session.wheelSkippedDeductions || [];
      this.wheelCurrentAngle = session.wheelCurrentAngle || 0;
      this.wheelLastResult = session.wheelLastResult || "";
      (this as Record<string, unknown>).wheelLastResultColor = session.wheelLastResultColor || "rgb(var(--v-theme-primary))";
      return true;
    } catch {
      return false;
    }
  }
};
