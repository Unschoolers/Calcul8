import { nextTick } from "vue";
import { broadcastWheelSession } from "../../app-core/methods/ui/wheel-broadcast.ts";
import type { Lot, PendingWheelInventoryIssue, Sale, WheelConfig, WheelFairnessEntry } from "../../types/app.ts";
import { getScopedWheelConfigSessionStorageKey, getScopedWheelSessionStorageKey } from "../../app-core/storageKeys.ts";
import { assignWheelPendingInventoryIssues } from "../../app-core/shared/wheel-session-compat.ts";
import { getActiveStorageScope } from "../../app-core/workspace-scope.ts";
import { buildSlotsFromConfig, createWheelSale, remapSpinCountsByTier, type WheelSlot } from "./wheelHelpers.ts";
import {
  getAvailableSinglesQuantityForWheelTier,
  hasAnyAvailableSinglesForWheelTier
} from "./wheelSaleSupport.ts";

type WheelTallyHistoryEntry = { tierId: string; label: string; color: string; count: number };
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

function appendWheelSessionNetRevenue(context: Record<string, unknown>, sale: Pick<Sale, "netRevenue">): void {
  const netRevenue = Number(sale.netRevenue);
  if (!Number.isFinite(netRevenue)) return;
  const currentNetRevenue = Number((context.wheelSessionNetRevenue as number | null | undefined) ?? 0) || 0;
  context.wheelSessionNetRevenue = currentNetRevenue + Math.max(0, netRevenue);
}

export const wheelSessionMethods = {
  appendWheelFairnessHistory(
    this: Record<string, unknown>,
    entry: WheelFairnessEntry,
    options: { preview?: boolean } = {}
  ): void {
    const historyKey = options.preview === true ? "wheelPreviewFairnessHistory" : "wheelFairnessHistory";
    const currentHistory = (((this as Record<string, unknown>)[historyKey] || []) as WheelFairnessEntry[]);
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
    (this as Record<string, unknown>).wheelSpinClientSeed = "";
    (this as Record<string, unknown>).wheelSpinVerificationUrl = "";
    (this as Record<string, unknown>).wheelSpinAlgorithm = "";
    (this as Record<string, unknown>).wheelShowSeed = false;
    (this as Record<string, unknown>).wheelChaseDialog = false;
    (this as Record<string, unknown>).wheelChasePreviewMode = false;
    (this as Record<string, unknown>).wheelChaseReplacementSinglesId = null;
    (this as Record<string, unknown>).wheelChasePendingTierId = "";
    (this as Record<string, unknown>).wheelPreviewChaseTallyHistory = [];
    (this as Record<string, unknown>).wheelFairnessHistoryOpen = false;
    (this as Record<string, unknown> & { saveWheelSession?: () => void }).saveWheelSession?.();
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
      (this as Record<string, unknown> & { saveWheelSession?: () => void }).saveWheelSession?.();
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
      (this as Record<string, unknown> & { saveWheelSession?: () => void }).saveWheelSession?.();
      return;
    }
    if (tierId) {
      (this as Record<string, unknown> & { recordChaseSale: (tierId: string) => void }).recordChaseSale(tierId);
      (this as Record<string, unknown>).wheelSessionUpdatedAt = Date.now();
      (this as Record<string, unknown> & { saveWheelSession: () => void }).saveWheelSession();
      void broadcastWheelSession(this as Parameters<typeof broadcastWheelSession>[0]);
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
    appendWheelSessionNetRevenue(this, sale);
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
    assignWheelPendingInventoryIssues(this, []);
    (this as Record<string, unknown>).wheelEndingSession = false;
    (this as Record<string, unknown>).wheelEndSessionReviewActive = false;
    (this as Record<string, unknown>).wheelSpinHash = "";
    (this as Record<string, unknown>).wheelSpinSeed = "";
    (this as Record<string, unknown>).wheelSpinClientSeed = "";
    (this as Record<string, unknown>).wheelSpinVerificationUrl = "";
    (this as Record<string, unknown>).wheelSpinAlgorithm = "";
    (this as Record<string, unknown>).wheelShowSeed = false;
    (this as Record<string, unknown>).wheelChaseDialog = false;
    (this as Record<string, unknown>).wheelChasePreviewMode = false;
    (this as Record<string, unknown>).wheelChaseReplacementSinglesId = null;
    (this as Record<string, unknown>).wheelChasePendingTierId = "";
    (this as Record<string, unknown>).wheelSessionNetRevenue = 0;
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
    } else if (action === "end") {
      (this as Record<string, unknown>).wheelEndSessionReviewActive = false;
      (this as Record<string, unknown> & { startEndWheelSession: () => void }).startEndWheelSession();
    } else if (action === "apply") {
      (this as Record<string, unknown> & { applyWheelConfig: () => void }).applyWheelConfig();
    } else if (action === "delete") {
      (this as Record<string, unknown> & { deleteWheelConfig: () => void }).deleteWheelConfig();
    }
  },

  requestWheelSessionEnd(this: Record<string, unknown>): void {
    const isCompact = Boolean((this as Record<string, unknown> & { isWheelMobileViewport?: () => boolean }).isWheelMobileViewport?.());
    const isPresentationMode = Boolean((this as Record<string, unknown>).wheelPresentationMode);

    if (isCompact && !isPresentationMode) {
      (this as Record<string, unknown>).wheelEndSessionReviewActive = true;
      (this as Record<string, unknown> & {
        openWheelInspector: (tab: "config" | "session" | "history") => void;
      }).openWheelInspector("session");
      return;
    }

    (this as Record<string, unknown>).wheelEndSessionReviewActive = false;
    (this as Record<string, unknown>).wheelConfirmAction = "end";
    (this as Record<string, unknown>).wheelConfirmDialog = true;
  },

  startEndWheelSession(this: Record<string, unknown>): void {
    const vm = this as Record<string, unknown> & { resetWheelSession: () => void };
    (this as Record<string, unknown>).wheelEndSessionReviewActive = false;
    const pendingIssues = (this.wheelPendingInventoryIssues || []) as PendingWheelInventoryIssue[];
    if (!pendingIssues.length) {
      vm.resetWheelSession();
      return;
    }
    const config = (this as Record<string, unknown>).activeWheelConfig as WheelConfig | null;
    const currentLotId = (this.currentLotId as number | null) ?? null;
    for (const entry of pendingIssues) {
      if (!entry.selectedLotId) {
        const tier = config?.tiers.find((t) => t.id === entry.slotTier);
        entry.selectedLotId = (tier?.boundLotId) ?? currentLotId;
      }
    }
    assignWheelPendingInventoryIssues(this, pendingIssues);
    (this as Record<string, unknown>).wheelEndingSession = true;
  },

  confirmBatchSale(this: Record<string, unknown>, index: number): void {
    const pendingIssues = (this.wheelPendingInventoryIssues || []) as PendingWheelInventoryIssue[];
    const entry = pendingIssues[index];
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
    appendWheelSessionNetRevenue(this, sale);

    pendingIssues.splice(index, 1);
    assignWheelPendingInventoryIssues(this, pendingIssues);

    if (!pendingIssues.length) {
      (this as Record<string, unknown>).wheelEndingSession = false;
    }
    (this as Record<string, unknown>).wheelSessionUpdatedAt = Date.now();
    (this as Record<string, unknown> & { saveWheelSession: () => void }).saveWheelSession();
    void broadcastWheelSession(this as Parameters<typeof broadcastWheelSession>[0]);
  },

  confirmAllBatchSales(this: Record<string, unknown>): void {
    const vm = this as Record<string, unknown> & { confirmBatchSale: (i: number) => void };
    const pendingIssues = (this.wheelPendingInventoryIssues || []) as PendingWheelInventoryIssue[];
    for (let i = pendingIssues.length - 1; i >= 0; i--) {
      if (pendingIssues[i]!.selectedLotId) {
        vm.confirmBatchSale(i);
      }
    }
  },

  dismissBatchSale(this: Record<string, unknown>, index: number): void {
    const pendingIssues = (this.wheelPendingInventoryIssues || []) as PendingWheelInventoryIssue[];
    pendingIssues.splice(index, 1);
    assignWheelPendingInventoryIssues(this, pendingIssues);
    if (!pendingIssues.length) {
      (this as Record<string, unknown>).wheelEndingSession = false;
    }
    (this as Record<string, unknown>).wheelSessionUpdatedAt = Date.now();
    void broadcastWheelSession(this as Parameters<typeof broadcastWheelSession>[0]);
  },

  cancelEndWheelSession(this: Record<string, unknown>): void {
    (this as Record<string, unknown>).wheelEndingSession = false;
    (this as Record<string, unknown>).wheelEndSessionReviewActive = false;
  },

  saveWheelSession(this: Record<string, unknown>): void {
    const activeId = this.activeWheelConfigId as number | null;
    if (activeId == null) return;
    const slots = (((this as Record<string, unknown>).activeWheelSlots || []) as WheelSlot[]);
    const session = {
      wheelSpinCounts: this.wheelSpinCounts,
      wheelSlotTiers: slots.map((slot) => slot.tier),
      wheelTotalSpins: this.wheelTotalSpins,
      wheelPreviewSpinCounts: (this as Record<string, unknown>).wheelPreviewSpinCounts,
      wheelPreviewSlotTiers: (((this as Record<string, unknown>).wheelPreviewSlots || []) as WheelSlot[]).map((slot) => slot.tier),
      wheelPreviewTotalSpins: (this as Record<string, unknown>).wheelPreviewTotalSpins,
      wheelPreviewFairnessHistory: (this as Record<string, unknown>).wheelPreviewFairnessHistory,
      wheelPreviewChaseTallyHistory: (this as Record<string, unknown>).wheelPreviewChaseTallyHistory,
      wheelSessionUpdatedAt: this.wheelSessionUpdatedAt,
      wheelSessionNetRevenue: (this as Record<string, unknown>).wheelSessionNetRevenue,
      wheelSessionCostAdjustment: (this as Record<string, unknown>).wheelSessionCostAdjustment,
      wheelFairnessHistory: (this as Record<string, unknown>).wheelFairnessHistory,
      wheelChaseTallyHistory: (this as Record<string, unknown>).wheelChaseTallyHistory,
      wheelPendingInventoryIssues: this.wheelPendingInventoryIssues,
      wheelSkippedDeductions: this.wheelPendingInventoryIssues,
      wheelCurrentAngle: this.wheelCurrentAngle,
      wheelLastResult: this.wheelLastResult,
      wheelLastResultColor: (this as Record<string, unknown>).wheelLastResultColor,
      wheelSpinHash: (this as Record<string, unknown>).wheelSpinHash,
      wheelSpinSeed: (this as Record<string, unknown>).wheelSpinSeed,
      wheelSpinClientSeed: (this as Record<string, unknown>).wheelSpinClientSeed,
      wheelSpinVerificationUrl: (this as Record<string, unknown>).wheelSpinVerificationUrl,
      wheelSpinAlgorithm: (this as Record<string, unknown>).wheelSpinAlgorithm
    };
    try {
      const storageScope = getActiveStorageScope(this as {
        activeScopeType: "personal" | "workspace";
        activeWorkspaceId: string | null;
      });
      localStorage.setItem(
        getScopedWheelConfigSessionStorageKey(storageScope, activeId),
        JSON.stringify(session)
      );
      localStorage.setItem(
        getScopedWheelSessionStorageKey(storageScope),
        JSON.stringify({
          activeWheelConfigId: activeId,
          ...session
        })
      );
    } catch { /* quota exceeded — non-critical */ }
  },

  loadWheelFromSession(this: Record<string, unknown>): boolean {
    const activeId = this.activeWheelConfigId as number | null;
    if (activeId == null) return false;
    const storageScope = getActiveStorageScope(this as {
      activeScopeType: "personal" | "workspace";
      activeWorkspaceId: string | null;
    });
    const configRaw = localStorage.getItem(
      getScopedWheelConfigSessionStorageKey(storageScope, activeId)
    );
    const rootRaw = localStorage.getItem(getScopedWheelSessionStorageKey(storageScope));
    if (!configRaw && !rootRaw) return false;
    try {
      const configSession = configRaw ? JSON.parse(configRaw) as Record<string, unknown> : null;
      const rootSession = rootRaw ? JSON.parse(rootRaw) as Record<string, unknown> : null;
      if (
        rootSession?.activeWheelConfigId != null
        && Number(rootSession.activeWheelConfigId) !== activeId
      ) {
        // Ignore unrelated root snapshot when a different wheel config is active.
      }
      const session = {
        ...(rootSession && Number(rootSession.activeWheelConfigId) === activeId ? rootSession : {}),
        ...(configSession || {})
      } as Record<string, unknown>;
      const useRootValue = <T>(currentValue: T, fallbackValue: T): T => {
        if (Array.isArray(currentValue)) {
          return (currentValue.length > 0 ? currentValue : fallbackValue) as T;
        }
        if (typeof currentValue === "string") {
          return ((currentValue.trim() ? currentValue : fallbackValue) as T);
        }
        if (typeof currentValue === "number") {
          return (((currentValue !== 0 && Number.isFinite(currentValue)) ? currentValue : fallbackValue) as T);
        }
        if (currentValue == null) {
          return fallbackValue;
        }
        return currentValue;
      };
      const rootForActiveConfig = rootSession && Number(rootSession.activeWheelConfigId) === activeId ? rootSession : null;
      if (rootForActiveConfig) {
        session.wheelPreviewSpinCounts = useRootValue(session.wheelPreviewSpinCounts as number[] | undefined, rootForActiveConfig.wheelPreviewSpinCounts as number[] | undefined);
        session.wheelPreviewTotalSpins = useRootValue(session.wheelPreviewTotalSpins as number | undefined, rootForActiveConfig.wheelPreviewTotalSpins as number | undefined);
        session.wheelPreviewFairnessHistory = useRootValue(session.wheelPreviewFairnessHistory as WheelFairnessEntry[] | undefined, rootForActiveConfig.wheelPreviewFairnessHistory as WheelFairnessEntry[] | undefined);
        session.wheelPreviewChaseTallyHistory = useRootValue(session.wheelPreviewChaseTallyHistory as WheelTallyHistoryEntry[] | undefined, rootForActiveConfig.wheelPreviewChaseTallyHistory as WheelTallyHistoryEntry[] | undefined);
        session.wheelSpinHash = useRootValue(session.wheelSpinHash as string | undefined, rootForActiveConfig.wheelSpinHash as string | undefined);
        session.wheelSpinSeed = useRootValue(session.wheelSpinSeed as string | undefined, rootForActiveConfig.wheelSpinSeed as string | undefined);
        session.wheelSpinClientSeed = useRootValue(session.wheelSpinClientSeed as string | undefined, rootForActiveConfig.wheelSpinClientSeed as string | undefined);
        session.wheelSpinVerificationUrl = useRootValue(session.wheelSpinVerificationUrl as string | undefined, rootForActiveConfig.wheelSpinVerificationUrl as string | undefined);
        session.wheelSpinAlgorithm = useRootValue(session.wheelSpinAlgorithm as string | undefined, rootForActiveConfig.wheelSpinAlgorithm as string | undefined);
        session.wheelLastResult = useRootValue(session.wheelLastResult as string | undefined, rootForActiveConfig.wheelLastResult as string | undefined);
        session.wheelLastResultColor = useRootValue(session.wheelLastResultColor as string | undefined, rootForActiveConfig.wheelLastResultColor as string | undefined);
        session.wheelCurrentAngle = useRootValue(session.wheelCurrentAngle as number | undefined, rootForActiveConfig.wheelCurrentAngle as number | undefined);
      }
      if (session.activeWheelConfigId != null && Number(session.activeWheelConfigId) !== activeId) {
        return false;
      }
      const slots = (((this as Record<string, unknown>).activeWheelSlots || []) as WheelSlot[]);
      const previewSlots = ((((this as Record<string, unknown>).wheelPreviewSlots || slots)) as WheelSlot[]);
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
      (this as Record<string, unknown>).wheelSessionNetRevenue =
        Number.isFinite(Number(session.wheelSessionNetRevenue))
          ? (Number(session.wheelSessionNetRevenue) || 0)
          : null;
      (this as Record<string, unknown>).wheelSessionCostAdjustment = session.wheelSessionCostAdjustment || 0;
      (this as Record<string, unknown>).wheelFairnessHistory = Array.isArray(session.wheelFairnessHistory)
        ? session.wheelFairnessHistory.slice(-20)
        : [];
      (this as Record<string, unknown>).wheelChaseTallyHistory = session.wheelChaseTallyHistory || [];
      if (Array.isArray(session.wheelPreviewSpinCounts)) {
        if (session.wheelPreviewSpinCounts.length === previewSlots.length) {
          (this as Record<string, unknown>).wheelPreviewSpinCounts = session.wheelPreviewSpinCounts;
        } else if (Array.isArray(session.wheelPreviewSlotTiers)) {
          (this as Record<string, unknown>).wheelPreviewSpinCounts = remapSpinCountsByTier(
            session.wheelPreviewSlotTiers,
            session.wheelPreviewSpinCounts,
            previewSlots
          );
        } else {
          (this as Record<string, unknown>).wheelPreviewSpinCounts = new Array(previewSlots.length).fill(0);
        }
      } else {
        (this as Record<string, unknown>).wheelPreviewSpinCounts = new Array(previewSlots.length).fill(0);
      }
      (this as Record<string, unknown>).wheelPreviewTotalSpins = (((this as Record<string, unknown>).wheelPreviewSpinCounts || []) as number[])
        .reduce((sum, count) => sum + count, 0);
      (this as Record<string, unknown>).wheelPreviewFairnessHistory = Array.isArray(session.wheelPreviewFairnessHistory)
        ? session.wheelPreviewFairnessHistory.slice(-20)
        : [];
      (this as Record<string, unknown>).wheelPreviewChaseTallyHistory = Array.isArray(session.wheelPreviewChaseTallyHistory)
        ? session.wheelPreviewChaseTallyHistory
        : [];
      assignWheelPendingInventoryIssues(this, session.wheelPendingInventoryIssues || session.wheelSkippedDeductions || []);
      this.wheelCurrentAngle = session.wheelCurrentAngle || 0;
      this.wheelLastResult = session.wheelLastResult || "";
      (this as Record<string, unknown>).wheelLastResultColor = session.wheelLastResultColor || "rgb(var(--v-theme-primary))";
      (this as Record<string, unknown>).wheelSpinHash = String(session.wheelSpinHash ?? "");
      (this as Record<string, unknown>).wheelSpinSeed = String(session.wheelSpinSeed ?? "");
      (this as Record<string, unknown>).wheelSpinClientSeed = String(session.wheelSpinClientSeed ?? "");
      (this as Record<string, unknown>).wheelSpinVerificationUrl = String(session.wheelSpinVerificationUrl ?? "");
      (this as Record<string, unknown>).wheelSpinAlgorithm = String(session.wheelSpinAlgorithm ?? "");
      return true;
    } catch {
      return false;
    }
  }
};
