import { nextTick } from "vue";
import { broadcastWheelSession } from "../../../../app-core/methods/ui/spectator/wheel-broadcast.ts";
import { assignWheelPendingInventoryIssues } from "../../../../app-core/shared/wheel-session-compat.ts";
import { isSinglesLot } from "../../../../app-core/shared/lot-types.ts";
import { getScopedWheelConfigSessionStorageKey, getScopedWheelSessionStorageKey } from "../../../../app-core/storageKeys.ts";
import { getActiveStorageScope } from "../../../../app-core/workspace-scope.ts";
import type { Lot, PendingWheelInventoryIssue, Sale, WheelConfig, WheelFairnessEntry } from "../../../../types/app.ts";
import type { GameWindowThis } from "../coordinator/gameControllerState.ts";
import { getWheelController } from "../coordinator/gameControllerState.ts";
import {
  readGameSession,
  writeGameSession,
  type GameSessionCodec
} from "../services/gameSessionStore.ts";
import { remapSpinCountsByTier } from "../services/wheelCountRemapping.ts";
import { readGameSpectatorSessionStorageState } from "../services/gameSpectatorSessionStorage.ts";
import { createWheelSale } from "../services/wheelSales.ts";
import { buildSlotsFromConfig, createWheelGridLayoutSeed, type WheelSlot } from "../services/wheelSlots.ts";
import {
  getAvailableSinglesQuantityForWheelTier,
  hasAnyAvailableSinglesForWheelTier
} from "../services/wheelSaleSupport.ts";
import {
  applyWheelLiveReset,
  applyWheelPreviewReset,
  clearWheelChaseDialogState,
  createWheelSessionSnapshot,
  getWheelTargetConfig,
  getWheelTierLotContext,
  mergeWheelSessionRootFallback,
  setWheelResultState
} from "../services/wheelSessionState.ts";
import {
  dispatchGameSessionCommand,
  executeGameSessionEffects
} from "../services/gameSessionAggregateAdapter.ts";

type WheelTallyHistoryEntry = { tierId: string; label: string; color: string; count: number };
type WheelSessionSnapshot = ReturnType<typeof createWheelSessionSnapshot>;
type StoredWheelSpectatorField = `gameSpectatorSession${"Id" | "Status" | "Url" | "QrUrl"}`
  | `wheelSpectatorSession${"Id" | "Status" | "Url" | "QrUrl"}`;
type StoredWheelConfigSession = Partial<WheelSessionSnapshot>
  & Pick<WheelSessionSnapshot, "wheelSpinCounts"> & Partial<Record<StoredWheelSpectatorField, unknown>>;
type StoredWheelRootSession = StoredWheelConfigSession & { activeWheelConfigId: number };
type UnknownFields = { [key: string]: unknown };

function decodeStoredWheelConfigSession(value: unknown): StoredWheelConfigSession | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const {
    activeWheelConfigId: _rootOnly,
    wheelSpinCounts: rawSpinCounts,
    wheelPreviewSpinCounts: rawPreviewSpinCounts,
    wheelSlotTiers: rawSlotTiers,
    wheelPreviewSlotTiers: rawPreviewSlotTiers,
    ...legacyFields
  } = value as UnknownFields;
  const normalizeCounts = (raw: unknown): number[] | null => {
    if (!Array.isArray(raw)) return null;
    const counts = raw.map((entry) => typeof entry === "number" || (typeof entry === "string" && entry.trim()) ? Number(entry) : NaN);
    return counts.every(Number.isFinite) ? counts : null;
  };
  const spinCounts = normalizeCounts(rawSpinCounts);
  if (!spinCounts) return null;
  const previewSpinCounts = normalizeCounts(rawPreviewSpinCounts);
  const normalizeTiers = (raw: unknown): string[] | null => Array.isArray(raw) && raw.every((entry) => typeof entry === "string")
    ? raw
    : null;
  const slotTiers = normalizeTiers(rawSlotTiers);
  const previewSlotTiers = normalizeTiers(rawPreviewSlotTiers);
  return {
    ...legacyFields,
    wheelSpinCounts: spinCounts,
    ...(previewSpinCounts ? { wheelPreviewSpinCounts: previewSpinCounts } : {}),
    ...(slotTiers ? { wheelSlotTiers: slotTiers } : {}),
    ...(previewSlotTiers ? { wheelPreviewSlotTiers: previewSlotTiers } : {})
  } as StoredWheelConfigSession;
}

const wheelConfigSessionCodec: GameSessionCodec<StoredWheelConfigSession> = {
  decode: decodeStoredWheelConfigSession,
  encode: (value) => value
};

const wheelRootSessionCodec: GameSessionCodec<StoredWheelRootSession> = {
  decode: (value) => {
    const session = decodeStoredWheelConfigSession(value);
    const activeWheelConfigId = Number((value as UnknownFields | null)?.activeWheelConfigId);
    return session && Number.isFinite(activeWheelConfigId) ? { ...session, activeWheelConfigId } : null;
  },
  encode: (value) => value
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

function appendWheelSessionNetRevenue(context: object, sale: Pick<Sale, "netRevenue">): void {
  const netRevenue = Number(sale.netRevenue);
  if (!Number.isFinite(netRevenue)) return;
  const controller = getWheelController(context);
  const currentNetRevenue = Number((controller.sessionNetRevenue as number | null | undefined) ?? 0) || 0;
  controller.sessionNetRevenue = currentNetRevenue + Math.max(0, netRevenue);
}

export const wheelSessionMethods = {
  appendWheelFairnessHistory(
    this: GameWindowThis,
    entry: WheelFairnessEntry,
    options: { preview?: boolean } = {}
  ): void {
    const controller = getWheelController(this);
    dispatchGameSessionCommand(this, controller, {
      type: "fairness-recorded",
      execution: options.preview === true ? "preview" : "live",
      entry
    });
  },

  resetPreviewSession(this: GameWindowThis): void {
    this.stopWheelAutospin?.();
    const controller = getWheelController(this);
    const previewSlots = ((controller.previewSlots || controller.activeSlots) as WheelSlot[]);
    const effects = applyWheelPreviewReset(this, controller, previewSlots);
    void executeGameSessionEffects(effects, {
      persist: () => this.saveWheelSession?.(),
      publish: () => this.publishGameSpectatorSessionSnapshot?.()
    });
  },

  getChaseReplacementItems(this: GameWindowThis): Array<{ title: string; value: number; image?: string; cardNumber?: string; stockLabel?: string }> {
    const tierId = this.wheelChasePendingTierId as string;
    if (!tierId) return [];
    const isPreview = (this.wheelChasePreviewMode as boolean) === true;
    const { tier, lot } = getWheelTierLotContext(this, tierId, { preview: isPreview });
    if (!tier?.boundLotId) return [];
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

  confirmChaseReplacement(this: GameWindowThis): void {
    const selectedId = this.wheelChaseReplacementSinglesId as number | null;
    const tierId = this.wheelChasePendingTierId as string;
    const isPreview = (this.wheelChasePreviewMode as boolean) === true;
    if (selectedId == null || !tierId) {
      clearWheelChaseDialogState(this);
      return;
    }

    // Look up the item name from the lot
    const { lot } = getWheelTierLotContext(this, tierId);
    const entry = lot?.singlesPurchases?.find((e) => e.id === selectedId);
    const newLabel = entry?.item || "";
    if (!newLabel) {
      clearWheelChaseDialogState(this);
      return;
    }

    if (isPreview) {
      const editing = getWheelTargetConfig(this, { preview: true });
      if (!editing) {
        clearWheelChaseDialogState(this);
        return;
      }

      const previewController = getWheelController(this);
      const tier = editing.tiers.find((t) => t.id === tierId);
      const oldSlots = previewController.previewSlots as WheelSlot[];
      const oldCounts = (previewController.previewSpinCounts || []) as number[];
      const historyArr = previewController.previewChaseTallyHistory as WheelTallyHistoryEntry[];
      previewController.previewChaseTallyHistory = snapshotCurrentTierLabelToHistory(
        tierId,
        tier?.label || "",
        tier?.color || "",
        oldSlots,
        oldCounts,
        historyArr
      );
      applyReplacementToTier(tier, selectedId, newLabel, entry ? (entry.cost || entry.marketValue || 0) : 0);
      const rebuilt = rebuildSlotsAndRemapCounts(editing, oldSlots, oldCounts);
      previewController.previewSlots = rebuilt.slots;
      previewController.previewSpinCounts = rebuilt.counts;
      clearWheelChaseDialogState(this);
      setWheelResultState(this, previewController, "⭐ Preview chase replaced — " + newLabel, "#f0a500");
      this.saveWheelSession?.();
      nextTick(() => this.drawWheel(
        this.wheelCurrentAngle as number || 0
      ));
      return;
    }

    const configs = (this.wheelConfigs || []) as WheelConfig[];
    const config = getWheelTargetConfig(this);
    if (!config) {
      clearWheelChaseDialogState(this);
      return;
    }

    const liveController = getWheelController(this);
    const tier = config.tiers.find((t) => t.id === tierId);
    if (tier) {
      // Auto-record sale for the won chase item BEFORE changing tier label/cost
      this.recordChaseSale(tierId);

      // Preserve session cost for already-counted spins at the old cost
      const oldCost = tier.costPerTier;
      const newCost = entry ? (entry.cost || entry.marketValue || 0) : oldCost;
      if (oldCost !== newCost) {
        const oldSlots = liveController.activeSlots as WheelSlot[];
        const oldCounts = (this.wheelSpinCounts || []) as number[];
        let tierSpins = 0;
        for (let i = 0; i < oldSlots.length; i++) {
          if (oldSlots[i]?.tier === tierId) tierSpins += (oldCounts[i] || 0);
        }
        liveController.sessionCostAdjustment =
          (liveController.sessionCostAdjustment as number || 0) + tierSpins * (oldCost - newCost);
      }

      const oldSlotsPre = liveController.activeSlots as WheelSlot[];
      const oldCountsPre = (this.wheelSpinCounts || []) as number[];
      const historyArr = liveController.chaseTallyHistory as WheelTallyHistoryEntry[];
      liveController.chaseTallyHistory = snapshotCurrentTierLabelToHistory(
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
    const editing = getWheelTargetConfig(this, { preview: true });
    if (editing) {
      const editTier = editing.tiers.find((t) => t.id === tierId);
      if (editTier) {
        applyReplacementToTier(editTier, selectedId, newLabel, entry ? (entry.cost || entry.marketValue || 0) : editTier.costPerTier);
      }
    }

    // Rebuild slots preserving spin counts by tier
    const oldSlots = liveController.activeSlots as WheelSlot[];
    const oldCounts = (this.wheelSpinCounts || []) as number[];
    const rebuilt = rebuildSlotsAndRemapCounts(config, oldSlots, oldCounts);
    liveController.activeSlots = rebuilt.slots;
    this.wheelSpinCounts = rebuilt.counts;

    clearWheelChaseDialogState(this);
    setWheelResultState(this, liveController, "⭐ Chase replaced — " + newLabel, "#f0a500");
    this.wheelSessionUpdatedAt = Date.now();
    this.saveWheelSession();
    void broadcastWheelSession(this);
    nextTick(() => this.drawWheel(
      this.wheelCurrentAngle as number || 0
    ));
  },

  keepChase(this: GameWindowThis): void {
    const tierId = this.wheelChasePendingTierId as string;
    if ((this.wheelChasePreviewMode as boolean) === true) {
      const controller = getWheelController(this);
      clearWheelChaseDialogState(this);
      setWheelResultState(this, controller, "⭐ Preview keeps chase item", "#f0a500");
      this.saveWheelSession?.();
      return;
    }
    if (tierId) {
      this.recordChaseSale(tierId);
      this.wheelSessionUpdatedAt = Date.now();
      this.saveWheelSession();
      void broadcastWheelSession(this);
    }
    clearWheelChaseDialogState(this);
  },

  recordChaseSale(this: GameWindowThis, tierId: string): void {
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
    const addWheelSale = this.addWheelSaleToLot as
      ((lotId: number, sale: Sale) => void) | undefined;
    if (typeof addWheelSale === "function") {
      addWheelSale(tier.boundLotId, sale);
    }
    appendWheelSessionNetRevenue(this, sale);
  },

  canKeepChase(this: GameWindowThis): boolean {
    const tierId = this.wheelChasePendingTierId as string;
    if (!tierId) return false;
    const config = getWheelTargetConfig(this, {
      preview: (this.wheelChasePreviewMode as boolean) === true
    });
    const tier = config?.tiers.find((t) => t.id === tierId);
    if (!tier?.boundLotId || !tier.boundSinglesId || (tier.packsCount || 0) <= 0) return false;
    return getAvailableSinglesQuantityForWheelTier(this, tier.boundLotId, tier.boundSinglesId) > 1;
  },

  resetWheelSession(this: GameWindowThis): void {
    const resetController = getWheelController(this);
    const slots = resetController.activeSlots as WheelSlot[];
    const effects = applyWheelLiveReset(this, resetController, slots);
    assignWheelPendingInventoryIssues(this, []);
    this.wheelSessionUpdatedAt = Date.now();
    void executeGameSessionEffects(effects, {
      persist: () => this.saveWheelSession(),
      publish: async () => {
        await Promise.all([
          broadcastWheelSession(this),
          this.publishGameSpectatorSessionSnapshot?.() ?? Promise.resolve()
        ]);
      }
    });
  },

  requestWheelReset(this: GameWindowThis): void {
    this.stopWheelAutospin?.();
    this.wheelConfirmAction = "reset";
    this.wheelConfirmDialog = true;
  },

  confirmWheelAction(this: GameWindowThis): void {
    const action = this.wheelConfirmAction as string;
    this.wheelConfirmDialog = false;
    this.wheelConfirmAction = "";
    if (action === "reset") {
      if ((this.wheelMode as string) === "config") {
        this.resetPreviewSession();
      } else {
        this.resetWheelSession();
      }
    } else if (action === "end") {
      this.wheelEndSessionReviewActive = false;
      this.startEndWheelSession();
    } else if (action === "delete") {
      this.deleteWheelConfig();
    }
  },

  requestWheelSessionEnd(this: GameWindowThis): void {
    const isCompact = Boolean(this.isWheelMobileViewport?.());
    const isPresentationMode = Boolean(this.wheelPresentationMode);

    if (isCompact && !isPresentationMode) {
      this.wheelEndSessionReviewActive = true;
      this.openWheelInspector("session");
      return;
    }

    this.wheelEndSessionReviewActive = false;
    this.wheelConfirmAction = "end";
    this.wheelConfirmDialog = true;
  },

  startEndWheelSession(this: GameWindowThis): void {
    this.wheelEndSessionReviewActive = false;
    const pendingIssues = (this.wheelPendingInventoryIssues || []) as PendingWheelInventoryIssue[];
    if (!pendingIssues.length) {
      this.resetWheelSession();
      return;
    }
    const config = this.activeWheelConfig as WheelConfig | null;
    const currentLotId = (this.currentLotId as number | null) ?? null;
    for (const entry of pendingIssues) {
      if (!entry.selectedLotId) {
        const tier = config?.tiers.find((t) => t.id === entry.slotTier);
        entry.selectedLotId = (tier?.boundLotId) ?? currentLotId;
      }
    }
    assignWheelPendingInventoryIssues(this, pendingIssues);
    this.wheelEndingSession = true;
  },

  confirmBatchSale(this: GameWindowThis, index: number): void {
    const pendingIssues = (this.wheelPendingInventoryIssues || []) as PendingWheelInventoryIssue[];
    const entry = pendingIssues[index];
    if (!entry?.selectedLotId) return;

    const config = this.activeWheelConfig as WheelConfig | null;
    if (!config) return;

    const lots = (this.lots || []) as Lot[];
    const sale = createWheelSale({
      config, tier: entry.slotTier, cost: entry.slotCost,
      packsCount: entry.slotPacksCount, deductionType: entry.slotDeductionType,
      label: entry.slotName, lotId: entry.selectedLotId, lots,
      singlesEntryId: entry.slotSinglesId,
      spinNumber: entry.spinNumber
    });
    const addWheelSale = this.addWheelSaleToLot as
      ((lotId: number, sale: Sale) => void) | undefined;
    if (typeof addWheelSale === "function") {
      addWheelSale(entry.selectedLotId, sale);
    }
    appendWheelSessionNetRevenue(this, sale);

    pendingIssues.splice(index, 1);
    assignWheelPendingInventoryIssues(this, pendingIssues);

    if (!pendingIssues.length) {
      this.wheelEndingSession = false;
    }
    this.wheelSessionUpdatedAt = Date.now();
    this.saveWheelSession();
    void broadcastWheelSession(this);
  },

  getPendingWheelIssueLotItems(this: GameWindowThis, entry: PendingWheelInventoryIssue): Array<{ title: string; value: number; lotType?: string }> {
    const candidateIds = Array.isArray(entry.candidateLotIds) ? new Set(entry.candidateLotIds) : null;
    const lots = (this.lots || []) as Lot[];
    return lots
      .filter((lot) => entry.slotDeductionType === "singles" ? isSinglesLot(lot) : !isSinglesLot(lot))
      .filter((lot) => !candidateIds || candidateIds.has(lot.id))
      .map((lot) => ({
        title: lot.name,
        value: lot.id,
        lotType: lot.lotType
      }));
  },

  confirmAllBatchSales(this: GameWindowThis): void {
    const pendingIssues = (this.wheelPendingInventoryIssues || []) as PendingWheelInventoryIssue[];
    for (let i = pendingIssues.length - 1; i >= 0; i--) {
      if (pendingIssues[i]!.selectedLotId) {
        this.confirmBatchSale(i);
      }
    }
  },

  dismissBatchSale(this: GameWindowThis, index: number): void {
    const pendingIssues = (this.wheelPendingInventoryIssues || []) as PendingWheelInventoryIssue[];
    if (pendingIssues[index]?.requiresLotSelection === true) return;
    pendingIssues.splice(index, 1);
    assignWheelPendingInventoryIssues(this, pendingIssues);
    if (!pendingIssues.length) {
      this.wheelEndingSession = false;
    }
    this.wheelSessionUpdatedAt = Date.now();
    void broadcastWheelSession(this);
  },

  cancelEndWheelSession(this: GameWindowThis): void {
    this.wheelEndingSession = false;
    this.wheelEndSessionReviewActive = false;
  },

  saveWheelSession(this: GameWindowThis): void {
    const activeId = this.activeWheelConfigId as number | null;
    if (activeId == null) return;
    const controller = getWheelController(this);
    const session = createWheelSessionSnapshot(this, controller);
    const storageScope = getActiveStorageScope(this as {
      activeScopeType: "personal" | "workspace";
      activeWorkspaceId: string | null;
    });
    writeGameSession<StoredWheelConfigSession>(
      localStorage,
      getScopedWheelConfigSessionStorageKey(storageScope, activeId),
      session,
      wheelConfigSessionCodec
    );
    writeGameSession<StoredWheelRootSession>(
      localStorage,
      getScopedWheelSessionStorageKey(storageScope),
      { activeWheelConfigId: activeId, ...session },
      wheelRootSessionCodec
    );
    if (
      String(this.gameSpectatorSessionId || "").trim()
      && this.gameSpectatorSessionStatus !== "ended"
      && this.wheelMode !== "config"
    ) {
      // Spectator mode is live-only. Config-mode preview/test spins stay local
      // so draft games are not broadcast to public viewers.
      void (this.publishGameSpectatorSessionSnapshot?.() ?? Promise.resolve());
    }
  },

  loadWheelFromSession(this: GameWindowThis): boolean {
    const activeId = this.activeWheelConfigId as number | null;
    if (activeId == null) return false;
    const storageScope = getActiveStorageScope(this as {
      activeScopeType: "personal" | "workspace";
      activeWorkspaceId: string | null;
    });
    const configSession = readGameSession(
      localStorage,
      getScopedWheelConfigSessionStorageKey(storageScope, activeId),
      wheelConfigSessionCodec
    );
    const rootSession = readGameSession(
      localStorage,
      getScopedWheelSessionStorageKey(storageScope),
      wheelRootSessionCodec
    );
    const rootForActiveConfig = rootSession?.activeWheelConfigId === activeId ? rootSession : null;
    if (!configSession && !rootForActiveConfig) return false;
    try {
      const session: StoredWheelConfigSession = configSession
        ? { ...(rootForActiveConfig ?? {}), ...configSession }
        : { ...rootForActiveConfig! };
      mergeWheelSessionRootFallback(session, rootForActiveConfig);
      const controller = getWheelController(this);
      const activeConfig = getWheelTargetConfig(this);
      if (activeConfig?.gameType === "grid") {
        const savedLiveLayoutSeed = String(session.wheelGridLayoutSeed ?? "").trim();
        const savedLiveGridReveals = Array.isArray(session.wheelGridReveals) ? session.wheelGridReveals : [];
        const savedLiveSpinCounts = Array.isArray(session.wheelSpinCounts) ? session.wheelSpinCounts : [];
        const hasLegacyLiveGridSession = !savedLiveLayoutSeed
          && (savedLiveGridReveals.length > 0 || savedLiveSpinCounts.some((count) => Number(count) > 0));
        const liveLayoutSeed = savedLiveLayoutSeed
          || (hasLegacyLiveGridSession ? "" : (controller.gridLayoutSeed || createWheelGridLayoutSeed()));
        const previewConfig = getWheelTargetConfig(this, { preview: true }) || activeConfig;
        const savedPreviewLayoutSeed = String(session.wheelPreviewGridLayoutSeed ?? "").trim();
        const savedPreviewGridReveals = Array.isArray(session.wheelPreviewGridReveals) ? session.wheelPreviewGridReveals : [];
        const savedPreviewSpinCounts = Array.isArray(session.wheelPreviewSpinCounts) ? session.wheelPreviewSpinCounts : [];
        const hasLegacyPreviewGridSession = !savedPreviewLayoutSeed
          && (savedPreviewGridReveals.length > 0 || savedPreviewSpinCounts.some((count) => Number(count) > 0));
        const previewLayoutSeed = savedPreviewLayoutSeed
          || (hasLegacyPreviewGridSession ? "" : (controller.previewGridLayoutSeed || liveLayoutSeed));
        controller.gridLayoutSeed = liveLayoutSeed;
        controller.previewGridLayoutSeed = previewLayoutSeed;
        controller.activeSlots = buildSlotsFromConfig(activeConfig, { layoutSeed: liveLayoutSeed });
        controller.previewSlots = buildSlotsFromConfig(previewConfig, { layoutSeed: previewLayoutSeed });
      } else {
        controller.gridLayoutSeed = "";
        controller.previewGridLayoutSeed = "";
      }
      const slots = ((controller.activeSlots || []) as WheelSlot[]);
      const previewSlots = (((controller.previewSlots || slots)) as WheelSlot[]);
      if (!Array.isArray(session.wheelSpinCounts)) return false;
      if (session.wheelSpinCounts.length === slots.length) {
        this.wheelSpinCounts = session.wheelSpinCounts;
      } else if (Array.isArray(session.wheelSlotTiers)) {
        this.wheelSpinCounts = remapSpinCountsByTier(session.wheelSlotTiers, session.wheelSpinCounts, slots);
      } else {
        return false;
      }
      this.wheelTotalSpins = (this.wheelSpinCounts as number[]).reduce((sum, count) => sum + count, 0);
      this.wheelSessionUpdatedAt = (session.wheelSessionUpdatedAt as number) || 0;
      controller.sessionNetRevenue =
        Number.isFinite(Number(session.wheelSessionNetRevenue))
          ? (Number(session.wheelSessionNetRevenue) || 0)
          : null;
      controller.sessionCostAdjustment = Number(session.wheelSessionCostAdjustment || 0) || 0;
      controller.fairnessHistory = Array.isArray(session.wheelFairnessHistory)
        ? (session.wheelFairnessHistory.slice(-20) as WheelFairnessEntry[])
        : [];
      controller.chaseTallyHistory = Array.isArray(session.wheelChaseTallyHistory)
        ? (session.wheelChaseTallyHistory as WheelTallyHistoryEntry[])
        : [];
      controller.gridReveals = Array.isArray(session.wheelGridReveals)
        ? (session.wheelGridReveals as typeof controller.gridReveals)
        : [];
      if (Array.isArray(session.wheelPreviewSpinCounts)) {
        if (session.wheelPreviewSpinCounts.length === previewSlots.length) {
          controller.previewSpinCounts = session.wheelPreviewSpinCounts;
        } else if (Array.isArray(session.wheelPreviewSlotTiers)) {
          controller.previewSpinCounts = remapSpinCountsByTier(
            session.wheelPreviewSlotTiers,
            session.wheelPreviewSpinCounts,
            previewSlots
          );
        } else {
          controller.previewSpinCounts = new Array(previewSlots.length).fill(0);
        }
      } else {
        controller.previewSpinCounts = new Array(previewSlots.length).fill(0);
      }
      controller.previewTotalSpins = ((controller.previewSpinCounts || []) as number[])
        .reduce((sum, count) => sum + count, 0);
      controller.previewFairnessHistory = Array.isArray(session.wheelPreviewFairnessHistory)
        ? (session.wheelPreviewFairnessHistory.slice(-20) as WheelFairnessEntry[])
        : [];
      controller.previewChaseTallyHistory = Array.isArray(session.wheelPreviewChaseTallyHistory)
        ? (session.wheelPreviewChaseTallyHistory as WheelTallyHistoryEntry[])
        : [];
      controller.previewGridReveals = Array.isArray(session.wheelPreviewGridReveals)
        ? (session.wheelPreviewGridReveals as typeof controller.previewGridReveals)
        : [];
      assignWheelPendingInventoryIssues(this, session.wheelPendingInventoryIssues || session.wheelSkippedDeductions || []);
      this.wheelCurrentAngle = (session.wheelCurrentAngle as number) || 0;
      this.wheelLastResult = (session.wheelLastResult as string) || "";
      controller.lastResultColor = String(session.wheelLastResultColor || "rgb(var(--v-theme-primary))");
      controller.spinHash = String(session.wheelSpinHash ?? "");
      controller.spinSeed = String(session.wheelSpinSeed ?? "");
      controller.spinClientSeed = String(session.wheelSpinClientSeed ?? "");
      controller.spinVerificationUrl = String(session.wheelSpinVerificationUrl ?? "");
      controller.spinAlgorithm = String(session.wheelSpinAlgorithm ?? "");
      const spectatorState = readGameSpectatorSessionStorageState(session);
      this.gameSpectatorSessionId = spectatorState.publicSessionId;
      this.gameSpectatorSessionStatus = spectatorState.status;
      this.gameSpectatorSessionUrl = spectatorState.url;
      this.gameSpectatorSessionQrUrl = spectatorState.qrUrl;
      this.gameSpectatorPublishPending = false;
      this.syncGameSpectatorLinks?.();
      return true;
    } catch {
      return false;
    }
  }
};


