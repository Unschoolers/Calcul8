import { nextTick } from "vue";
import type { Lot, Sale, SkippedWheelDeduction, WheelConfig } from "../../types/app.ts";
import { buildSlotsFromConfig, createWheelSale, type WheelSlot } from "./wheelHelpers.ts";

export const wheelSessionMethods = {
  getChaseReplacementItems(this: Record<string, unknown>): Array<{ title: string; value: number; image?: string; cardNumber?: string }> {
    const tierId = (this as Record<string, unknown>).wheelChasePendingTierId as string;
    if (!tierId) return [];
    const configs = (this.wheelConfigs || []) as WheelConfig[];
    const activeId = this.activeWheelConfigId as number | null;
    const config = activeId != null ? configs.find((c) => c.id === activeId) : null;
    const tier = config?.tiers.find((t) => t.id === tierId);
    if (!tier?.boundLotId) return [];
    const lots = (this.lots || []) as Lot[];
    const lot = lots.find((l) => l.id === tier.boundLotId);
    if (!lot?.singlesPurchases?.length) return [];
    return lot.singlesPurchases.map((e) => ({ title: e.item, value: e.id, image: e.image, cardNumber: e.cardNumber }));
  },

  confirmChaseReplacement(this: Record<string, unknown>): void {
    const selectedId = (this as Record<string, unknown>).wheelChaseReplacementSinglesId as number | null;
    const tierId = (this as Record<string, unknown>).wheelChasePendingTierId as string;
    if (selectedId == null || !tierId) {
      (this as Record<string, unknown>).wheelChaseDialog = false;
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
      return;
    }

    const configs = (this.wheelConfigs || []) as WheelConfig[];
    const activeId = this.activeWheelConfigId as number | null;
    const config = activeId != null ? configs.find((c) => c.id === activeId) : null;
    if (!config) {
      (this as Record<string, unknown>).wheelChaseDialog = false;
      return;
    }

    const tier = config.tiers.find((t) => t.id === tierId);
    if (tier) {
      // Auto-record sale for the won chase item BEFORE changing tier label/cost
      (this as Record<string, unknown> & { recordChaseSale: (tierId: string) => void }).recordChaseSale(tierId);

      // Snapshot current chase label + count into tally history before replacing
      const oldSlotsPre = (this as Record<string, unknown>).activeWheelSlots as WheelSlot[];
      const oldCountsPre = (this.wheelSpinCounts || []) as number[];
      let tierSpinsPre = 0;
      for (let i = 0; i < oldSlotsPre.length; i++) {
        if (oldSlotsPre[i]?.tier === tierId) tierSpinsPre += (oldCountsPre[i] || 0);
      }
      const historyArr = (this as Record<string, unknown>).wheelChaseTallyHistory as Array<{ tierId: string; label: string; color: string; count: number }>;
      let prevHistorical = 0;
      for (const h of historyArr) {
        if (h.tierId === tierId) prevHistorical += h.count;
      }
      const currentLabelCount = tierSpinsPre - prevHistorical;
      if (currentLabelCount > 0) {
        historyArr.push({ tierId, label: tier.label, color: tier.color, count: currentLabelCount });
        (this as Record<string, unknown>).wheelChaseTallyHistory = [...historyArr];
      }

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

      tier.label = newLabel;
      tier.boundSinglesId = selectedId;
      if (entry) {
        tier.costPerTier = newCost;
      }
    }
    this.wheelConfigs = [...configs];

    // Also update the editing copy
    const editing = (this as Record<string, unknown>).editingWheelConfig as WheelConfig | null;
    if (editing) {
      const editTier = editing.tiers.find((t) => t.id === tierId);
      if (editTier) {
        editTier.label = newLabel;
        editTier.boundSinglesId = selectedId;
        if (entry) {
          editTier.costPerTier = entry.cost || entry.marketValue || 0;
        }
      }
    }

    // Rebuild slots preserving spin counts by tier
    const oldSlots = (this as Record<string, unknown>).activeWheelSlots as WheelSlot[];
    const oldCounts = (this.wheelSpinCounts || []) as number[];

    const countsByTier: Record<string, number[]> = {};
    for (let i = 0; i < oldSlots.length; i++) {
      const slot = oldSlots[i]!;
      if (!countsByTier[slot.tier]) countsByTier[slot.tier] = [];
      countsByTier[slot.tier]!.push(oldCounts[i] || 0);
    }

    const newSlots = buildSlotsFromConfig(config);
    (this as Record<string, unknown>).activeWheelSlots = newSlots;

    const tierCountIndex: Record<string, number> = {};
    const newCounts = new Array(newSlots.length).fill(0);
    for (let i = 0; i < newSlots.length; i++) {
      const slot = newSlots[i]!;
      const saved = countsByTier[slot.tier];
      if (saved) {
        const idx = tierCountIndex[slot.tier] ?? 0;
        newCounts[i] = saved[idx] ?? 0;
        tierCountIndex[slot.tier] = idx + 1;
      }
    }
    this.wheelSpinCounts = newCounts;

    (this as Record<string, unknown>).wheelChaseDialog = false;
    this.wheelLastResult = "⭐ Chase replaced — " + newLabel;
    (this as Record<string, unknown>).wheelLastResultColor = "#f0a500";
    (this as Record<string, unknown> & { saveWheelSession: () => void }).saveWheelSession();
    nextTick(() => (this as Record<string, unknown> & { drawWheel: (offset?: number) => void }).drawWheel(
      (this as Record<string, unknown>).wheelCurrentAngle as number || 0
    ));
  },

  keepChase(this: Record<string, unknown>): void {
    const tierId = (this as Record<string, unknown>).wheelChasePendingTierId as string;
    if (tierId) {
      (this as Record<string, unknown> & { recordChaseSale: (tierId: string) => void }).recordChaseSale(tierId);
    }
    (this as Record<string, unknown>).wheelChaseDialog = false;
  },

  recordChaseSale(this: Record<string, unknown>, tierId: string): void {
    const configs = (this.wheelConfigs || []) as WheelConfig[];
    const activeId = this.activeWheelConfigId as number | null;
    const config = activeId != null ? configs.find((c) => c.id === activeId) : null;
    if (!config) return;
    const tier = config.tiers.find((t) => t.id === tierId);
    if (!tier?.boundLotId) return;

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
    const config = activeId != null ? configs.find((c) => c.id === activeId) : null;
    const tier = config?.tiers.find((t) => t.id === tierId);
    if (!tier?.boundLotId || !tier.boundSinglesId) return false;
    const lots = (this.lots || []) as Lot[];
    const lot = lots.find((l) => l.id === tier.boundLotId);
    const entry = lot?.singlesPurchases?.find((e) => e.id === tier.boundSinglesId);
    return (entry?.quantity ?? 0) > 1;
  },

  resetWheelSession(this: Record<string, unknown>): void {
    const slots = (this as Record<string, unknown>).activeWheelSlots as WheelSlot[];
    this.wheelTotalSpins = 0;
    this.wheelSpinCounts = new Array(slots.length).fill(0);
    this.wheelLastResult = "";
    (this as Record<string, unknown>).wheelLastResultColor = "rgb(var(--v-theme-primary))";
    this.wheelSkippedDeductions = [];
    (this as Record<string, unknown>).wheelEndingSession = false;
    (this as Record<string, unknown>).wheelSpinHash = "";
    (this as Record<string, unknown>).wheelSpinSeed = "";
    (this as Record<string, unknown>).wheelShowSeed = false;
    (this as Record<string, unknown>).wheelChaseDialog = false;
    (this as Record<string, unknown>).wheelChaseReplacementSinglesId = null;
    (this as Record<string, unknown>).wheelChasePendingTierId = "";
    (this as Record<string, unknown>).wheelSessionCostAdjustment = 0;
    (this as Record<string, unknown>).wheelChaseTallyHistory = [];
    (this as Record<string, unknown> & { saveWheelSession: () => void }).saveWheelSession();
  },

  confirmWheelAction(this: Record<string, unknown>): void {
    const action = (this as Record<string, unknown>).wheelConfirmAction as string;
    (this as Record<string, unknown>).wheelConfirmDialog = false;
    (this as Record<string, unknown>).wheelConfirmAction = "";
    if (action === "reset") {
      (this as Record<string, unknown> & { resetWheelSession: () => void }).resetWheelSession();
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
  },

  cancelEndWheelSession(this: Record<string, unknown>): void {
    (this as Record<string, unknown>).wheelEndingSession = false;
  },

  saveWheelSession(this: Record<string, unknown>): void {
    const activeId = this.activeWheelConfigId as number | null;
    if (activeId == null) return;
    const session = {
      wheelSpinCounts: this.wheelSpinCounts,
      wheelTotalSpins: this.wheelTotalSpins,
      wheelSessionCostAdjustment: (this as Record<string, unknown>).wheelSessionCostAdjustment,
      wheelChaseTallyHistory: (this as Record<string, unknown>).wheelChaseTallyHistory,
      wheelSkippedDeductions: this.wheelSkippedDeductions,
      wheelCurrentAngle: this.wheelCurrentAngle,
      wheelLastResult: this.wheelLastResult,
      wheelLastResultColor: (this as Record<string, unknown>).wheelLastResultColor
    };
    try {
      localStorage.setItem(`wheelSession_${activeId}`, JSON.stringify(session));
    } catch { /* quota exceeded — non-critical */ }
  },

  loadWheelFromSession(this: Record<string, unknown>): boolean {
    const activeId = this.activeWheelConfigId as number | null;
    if (activeId == null) return false;
    const raw = localStorage.getItem(`wheelSession_${activeId}`);
    if (!raw) return false;
    try {
      const session = JSON.parse(raw);
      const slots = (this as Record<string, unknown>).activeWheelSlots as WheelSlot[];
      if (!Array.isArray(session.wheelSpinCounts) || session.wheelSpinCounts.length !== slots.length) return false;
      this.wheelSpinCounts = session.wheelSpinCounts;
      this.wheelTotalSpins = session.wheelTotalSpins || 0;
      (this as Record<string, unknown>).wheelSessionCostAdjustment = session.wheelSessionCostAdjustment || 0;
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
