import { nextTick } from "vue";
import { broadcastWheelSession } from "../../../../app-core/methods/ui/spectator/wheel-broadcast.ts";
import { assignWheelPendingInventoryIssues } from "../../../../app-core/shared/wheel-session-compat.ts";
import { isSinglesLot } from "../../../../app-core/shared/lot-types.ts";
import { getScopedWheelConfigSessionStorageKey, getScopedWheelSessionStorageKey } from "../../../../app-core/storageKeys.ts";
import { getActiveStorageScope } from "../../../../app-core/workspace-scope.ts";
import type { GameBroadcastContext, GameCoordinatorContext } from "../../../../app-core/context/game.ts";
import type { Lot, PendingWheelChaseObligation, PendingWheelInventoryIssue, WheelConfig, WheelFairnessEntry } from "../../../../types/app.ts";
import type { GameHostState } from "../services/gameHostState.ts";
import { getWheelController } from "../services/gameSessionState.ts";
import {
  readGameSession,
  writeGameSession,
  type GameSessionCodec
} from "../services/gameSessionStore.ts";
import { remapSpinCountsByTier } from "../services/wheelCountRemapping.ts";
import { readGameSpectatorSessionStorageState } from "../services/gameSpectatorSessionStorage.ts";
import { captureGameOutcomeGuard, invalidateGameOutcomeSettlements, settleSessionGameOutcomeSale } from "../services/gameOutcomeSettlement.ts";
import { buildSlotsFromConfig, createWheelGridLayoutSeed, type WheelSlot } from "../services/wheelSlots.ts";
import {
  getAvailableSinglesQuantityForWheelTier,
  hasAnyAvailableSinglesForWheelTier
} from "../services/wheelSaleSupport.ts";
import {
  clearWheelChaseDialogState,
  createWheelSessionSnapshot,
  getWheelTargetConfig,
  getWheelTierLotContext,
  mergeWheelSessionRootFallback,
  recordWheelSessionFairness,
  runWheelSessionReset,
  setWheelResultState,
  type WheelSessionContext
} from "../services/wheelSessionState.ts";

type WheelTallyHistoryEntry = { tierId: string; label: string; color: string; count: number };
type WheelSessionSnapshot = ReturnType<typeof createWheelSessionSnapshot>;
type StoredGameSpectatorField = `gameSpectatorSession${"Id" | "Status" | "Url" | "QrUrl"}`;
type StoredWheelConfigSession = { [K in keyof WheelSessionSnapshot]?: unknown }
  & { wheelSpinCounts: number[]; wheelPreviewSpinCounts?: number[]; wheelSlotTiers?: string[]; wheelPreviewSlotTiers?: string[] }
  & Partial<Record<StoredGameSpectatorField, unknown>>;
type StoredWheelRootSession = StoredWheelConfigSession & { activeWheelConfigId: number };
type UnknownFields = { [key: string]: unknown };
const pendingSaleWrites = new WeakSet<object>();
const chaseSaleWrites = new WeakSet<object>();
const LEGACY_PENDING_ISSUES_KEY = ["wheel", "Skipped", "Deductions"].join("");

type WheelSessionCommandContext = WheelSessionContext
  & GameBroadcastContext
  & Pick<GameCoordinatorContext, "currentLotId" | "addWheelSaleToLot" | "whatnotFeeSummary">
  & Pick<GameHostState,
    | "wheelMode" | "wheelConfirmAction" | "wheelConfirmDialog" | "wheelPresentationMode"
  >
  & {
    activeWheelConfig: WheelConfig | null;
    appendWheelFairnessHistory(entry: WheelFairnessEntry, options?: { preview?: boolean }): void;
    confirmBatchSale(index: number): Promise<void>;
    deleteWheelConfig(): void;
    drawWheel(offset?: number): void;
    isWheelMobileViewport(): boolean;
    openWheelInspector(tab: "config" | "session" | "history"): void;
    publishGameSpectatorSessionSnapshot?(statusOverride?: "starting" | "live" | "ended"): Promise<void>;
    recordChaseSale(tierId: string): Promise<boolean>;
    resetPreviewSession(): void;
    resetWheelSession(): void;
    saveWheelSession(options?: { strict?: boolean }): void;
    startEndWheelSession(): void;
    stopWheelAutospin(): void;
    syncGameSpectatorLinks(): void;
  };

function decodeStoredWheelConfigSession(value: unknown): StoredWheelConfigSession | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rawFields = value as UnknownFields;
  const legacyPendingInventoryIssues = rawFields[LEGACY_PENDING_ISSUES_KEY];
  const {
    activeWheelConfigId: _rootOnly,
    wheelSpinCounts: rawSpinCounts,
    wheelPreviewSpinCounts: rawPreviewSpinCounts,
    wheelSlotTiers: rawSlotTiers,
    wheelPreviewSlotTiers: rawPreviewSlotTiers,
    ...legacyFields
  } = rawFields;
  delete legacyFields[LEGACY_PENDING_ISSUES_KEY];
  const normalizeCounts = (raw: unknown): number[] | null => {
    if (!Array.isArray(raw)) return null;
    const counts = raw.map((entry) => typeof entry === "number" || (typeof entry === "string" && entry.trim()) ? Number(entry) : NaN);
    return counts.every((count) => Number.isInteger(count) && count >= 0) ? counts : null;
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
    ...(normalizePendingWheelChase(legacyFields.wheelPendingChase)
      ? { wheelPendingChase: normalizePendingWheelChase(legacyFields.wheelPendingChase) }
      : {}),
    ...(!Array.isArray(legacyFields.wheelPendingInventoryIssues) && Array.isArray(legacyPendingInventoryIssues)
      ? { wheelPendingInventoryIssues: legacyPendingInventoryIssues }
      : {}),
    ...(previewSpinCounts ? { wheelPreviewSpinCounts: previewSpinCounts } : {}),
    ...(slotTiers ? { wheelSlotTiers: slotTiers } : {}),
    ...(previewSlotTiers ? { wheelPreviewSlotTiers: previewSlotTiers } : {})
  } as StoredWheelConfigSession;
}

function normalizePendingWheelChase(value: unknown): PendingWheelChaseObligation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as UnknownFields;
  const configId = Number(raw.configId);
  const spinNumber = Number(raw.spinNumber);
  const slotIndex = Number(raw.slotIndex);
  const originalConfig = raw.originalConfig as WheelConfig | undefined;
  const originalTier = raw.originalTier as WheelConfig["tiers"][number] | undefined;
  const prize = raw.originalPrize as PendingWheelChaseObligation["originalPrize"] | undefined;
  const tierId = typeof raw.tierId === "string" && raw.tierId ? raw.tierId : "__unresolved_chase_source__";
  const valid = raw.version === 1 && Number.isSafeInteger(configId) && Number.isSafeInteger(spinNumber) && spinNumber > 0
    && Number.isSafeInteger(slotIndex) && slotIndex >= 0 && tierId !== "__unresolved_chase_source__"
    && Boolean(originalConfig) && originalConfig?.id === configId && Array.isArray(originalConfig?.tiers)
    && Boolean(originalTier) && originalTier?.id === tierId && Boolean(prize) && typeof prize?.slotLabel === "string"
    && (prize?.singlesEntryId == null || (typeof prize.singlesSourceFingerprint === "string" && prize.singlesSourceFingerprint.length > 0))
    && (raw.saleDraft === null || Boolean(raw.saleDraft && typeof raw.saleDraft === "object"
      && Number.isSafeInteger(Number((raw.saleDraft as UnknownFields).id))));
  if (valid) return raw as unknown as PendingWheelChaseObligation;
  const safeConfigId = Number.isSafeInteger(configId) ? configId : -1;
  const safeSlotIndex = Number.isSafeInteger(slotIndex) && slotIndex >= 0 ? slotIndex : 0;
  const safeSaleDraft = raw.saleDraft && typeof raw.saleDraft === "object"
    && Number.isSafeInteger(Number((raw.saleDraft as UnknownFields).id)) ? raw.saleDraft as PendingWheelChaseObligation["saleDraft"] : null;
  return {
    version: 1,
    unresolvedSource: true,
    configId: safeConfigId,
    spinNumber: Number.isSafeInteger(spinNumber) && spinNumber > 0 ? spinNumber : 0,
    tierId,
    slotIndex: safeSlotIndex,
    originalConfig: originalConfig && Array.isArray(originalConfig.tiers)
      ? originalConfig
      : { id: safeConfigId, name: "Unresolved wheel source", spinPrice: 0, targetMargin: 0, tiers: [], createdAt: "" },
    originalSourceJson: typeof raw.originalSourceJson === "string" ? raw.originalSourceJson : "",
    originalTier: originalTier && originalTier.id === tierId
      ? originalTier
      : { id: tierId, label: "Unresolved chase", color: "", slots: 1, costPerTier: 0, packsCount: 0, deductionType: "none", sets: [] },
    originalPrize: prize && typeof prize.slotLabel === "string"
      ? { ...prize, ...(typeof prize.singlesSourceFingerprint === "string" ? {} : { singlesSourceFingerprint: "" }) }
      : { slotLabel: "Unresolved chase", slotColor: "", lotId: null, singlesEntryId: null, itemLabel: "Unresolved chase" },
    saleDraft: safeSaleDraft
  };
}

function isPendingChaseSourceCurrent(context: WheelSessionCommandContext, obligation: PendingWheelChaseObligation): boolean {
  if (obligation.unresolvedSource === true) return false;
  const config = (context.wheelConfigs || []).find((entry) => entry.id === obligation.configId);
  if (!config || context.activeWheelConfigId !== obligation.configId) return false;
  try {
    const capturedConfig = obligation.originalSourceJson
      ? JSON.parse(obligation.originalSourceJson) as WheelConfig
      : obligation.originalConfig;
    if (stableJson(config) !== stableJson(capturedConfig)) return false;
    const { lotId, singlesEntryId, singlesSourceFingerprint } = obligation.originalPrize;
    if (lotId == null) return singlesEntryId == null;
    const lot = (context.lots || []).find((entry) => entry.id === lotId);
    if (!lot) return false;
    const expectedLotType = obligation.originalPrize.lotType
      ?? (singlesEntryId != null || obligation.originalTier.deductionType === "singles" ? "singles" : "bulk");
    const currentLotType = lot.lotType ?? (isSinglesLot(lot) ? "singles" : "bulk");
    if (currentLotType !== expectedLotType) return false;
    if (singlesEntryId == null) return true;
    if (!singlesSourceFingerprint) return false;
    const entry = lot.singlesPurchases?.find((candidate) => candidate.id === singlesEntryId);
    if (!entry) return false;
    const currentFingerprint = JSON.stringify({
      item: entry.item,
      cardNumber: entry.cardNumber ?? null,
      externalSku: entry.externalSku ?? null,
      image: entry.image ?? null,
      condition: entry.condition ?? null,
      language: entry.language ?? null
    });
    return currentFingerprint === singlesSourceFingerprint;
  } catch {
    return false;
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((entry) => entry === undefined ? "null" : stableJson(entry)).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function isPendingChaseInventoryIssue(context: WheelSessionCommandContext, entry: PendingWheelInventoryIssue): boolean {
  const obligation = context.wheelPendingChase as PendingWheelChaseObligation | null;
  if (!obligation) return false;
  if (obligation.saleDraft?.id != null) return entry.pendingSale?.id === obligation.saleDraft.id;
  return entry.slotTier === obligation.tierId && entry.spinNumber === obligation.spinNumber
    && (entry.pendingSale?.linkedWheelId === obligation.configId
      || (entry.pendingSale == null && entry.pendingSaleLotId === (obligation.originalPrize.lotId ?? undefined)));
}

function reopenPendingChaseDecision(context: WheelSessionCommandContext): void {
  const obligation = context.wheelPendingChase as PendingWheelChaseObligation | null;
  if (!obligation) return;
  context.wheelChaseDialog = true;
  context.wheelChasePreviewMode = false;
  context.wheelChasePendingTierId = obligation.tierId;
  getWheelController(context).wheelInventoryWarning = isPendingChaseSourceCurrent(context, obligation)
    ? "Resolve this chase with Keep or Replace before recording it as a batch sale."
    : "This chase is still unresolved because its original wheel or prize source changed. Restore that source to continue.";
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

export const wheelSessionMethods = {
  reopenPendingChaseDecision(this: WheelSessionCommandContext): void {
    reopenPendingChaseDecision(this);
  },
  isPendingChaseSourceCurrent(this: WheelSessionCommandContext): boolean {
    const obligation = this.wheelPendingChase as PendingWheelChaseObligation | null;
    return !obligation || isPendingChaseSourceCurrent(this, obligation);
  },

  appendWheelFairnessHistory(
    this: WheelSessionCommandContext,
    entry: WheelFairnessEntry,
    options: { preview?: boolean } = {}
  ): void {
    const controller = getWheelController(this);
    recordWheelSessionFairness(this, controller, options.preview === true ? "preview" : "live", entry);
  },

  resetPreviewSession(this: WheelSessionCommandContext): void {
    this.stopWheelAutospin?.();
    const controller = getWheelController(this);
    const previewSlots = ((controller.wheelPreviewSlots || controller.activeWheelSlots) as WheelSlot[]);
    void runWheelSessionReset(this, controller, "preview", previewSlots, {
      persist: () => this.saveWheelSession?.(),
      publish: () => this.publishGameSpectatorSessionSnapshot?.()
    });
  },

  getChaseReplacementItems(this: WheelSessionCommandContext): Array<{ title: string; value: number; image?: string; cardNumber?: string; stockLabel?: string }> {
    const tierId = this.wheelChasePendingTierId as string;
    if (!tierId) return [];
    const obligation = this.wheelPendingChase as PendingWheelChaseObligation | null;
    if (obligation && !isPendingChaseSourceCurrent(this, obligation)) return [];
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

  async confirmChaseReplacement(this: WheelSessionCommandContext): Promise<void> {
    const isCurrent = captureGameOutcomeGuard(this);
    const selectedId = this.wheelChaseReplacementSinglesId as number | null;
    const tierId = this.wheelChasePendingTierId as string;
    const isPreview = (this.wheelChasePreviewMode as boolean) === true;
    if (selectedId == null || !tierId) {
      if (!isPreview && this.wheelPendingChase) {
        this.wheelChaseDialog = true;
        getWheelController(this).wheelInventoryWarning = "This chase still needs a keep or replacement decision.";
        this.saveWheelSession?.();
        return;
      }
      clearWheelChaseDialogState(this);
      return;
    }
    const obligation = this.wheelPendingChase as PendingWheelChaseObligation | null;
    if (!isPreview && obligation && !isPendingChaseSourceCurrent(this, obligation)) {
      getWheelController(this).wheelInventoryWarning = "This chase is still unresolved because its original wheel source changed. Restore that source to continue.";
      this.saveWheelSession?.();
      return;
    }

    // Look up the item name from the lot
    const { lot } = getWheelTierLotContext(this, tierId);
    const entry = lot?.singlesPurchases?.find((e) => e.id === selectedId);
    const newLabel = entry?.item || "";
    if (!newLabel) {
      if (!isPreview && obligation) {
        this.wheelChaseDialog = true;
        getWheelController(this).wheelInventoryWarning = "The selected replacement is no longer available. This chase remains unresolved.";
        this.saveWheelSession?.();
        return;
      }
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
      const oldSlots = previewController.wheelPreviewSlots as WheelSlot[];
      const oldCounts = (previewController.wheelPreviewSpinCounts || []) as number[];
      const historyArr = previewController.wheelPreviewChaseTallyHistory as WheelTallyHistoryEntry[];
      previewController.wheelPreviewChaseTallyHistory = snapshotCurrentTierLabelToHistory(
        tierId,
        tier?.label || "",
        tier?.color || "",
        oldSlots,
        oldCounts,
        historyArr
      );
      applyReplacementToTier(tier, selectedId, newLabel, entry ? (entry.cost || entry.marketValue || 0) : 0);
      const rebuilt = rebuildSlotsAndRemapCounts(editing, oldSlots, oldCounts);
      previewController.wheelPreviewSlots = rebuilt.slots;
      previewController.wheelPreviewSpinCounts = rebuilt.counts;
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
      if (obligation) {
        this.wheelChaseDialog = true;
        getWheelController(this).wheelInventoryWarning = "This chase is still unresolved because its original wheel source is unavailable.";
        this.saveWheelSession?.();
        return;
      }
      clearWheelChaseDialogState(this);
      return;
    }

    const liveController = getWheelController(this);
    const tier = config.tiers.find((t) => t.id === tierId);
    if (tier) {
      // Auto-record sale for the won chase item BEFORE changing tier label/cost
      if (await this.recordChaseSale(tierId) === false || !isCurrent()) return;

      // Preserve session cost for already-counted spins at the old cost
      const oldCost = tier.costPerTier;
      const newCost = entry ? (entry.cost || entry.marketValue || 0) : oldCost;
      if (oldCost !== newCost) {
        const oldSlots = liveController.activeWheelSlots as WheelSlot[];
        const oldCounts = (this.wheelSpinCounts || []) as number[];
        let tierSpins = 0;
        for (let i = 0; i < oldSlots.length; i++) {
          if (oldSlots[i]?.tier === tierId) tierSpins += (oldCounts[i] || 0);
        }
        liveController.wheelSessionCostAdjustment =
          (liveController.wheelSessionCostAdjustment as number || 0) + tierSpins * (oldCost - newCost);
      }

      const oldSlotsPre = liveController.activeWheelSlots as WheelSlot[];
      const oldCountsPre = (this.wheelSpinCounts || []) as number[];
      const historyArr = liveController.wheelChaseTallyHistory as WheelTallyHistoryEntry[];
      liveController.wheelChaseTallyHistory = snapshotCurrentTierLabelToHistory(
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
    const oldSlots = liveController.activeWheelSlots as WheelSlot[];
    const oldCounts = (this.wheelSpinCounts || []) as number[];
    const rebuilt = rebuildSlotsAndRemapCounts(config, oldSlots, oldCounts);
    liveController.activeWheelSlots = rebuilt.slots;
    this.wheelSpinCounts = rebuilt.counts;

    clearWheelChaseDialogState(this);
    this.wheelPendingChase = null;
    setWheelResultState(this, liveController, "⭐ Chase replaced — " + newLabel, "#f0a500");
    this.wheelSessionUpdatedAt = Date.now();
    this.saveWheelSession();
    void broadcastWheelSession(this);
    nextTick(() => this.drawWheel(
      this.wheelCurrentAngle as number || 0
    ));
  },

  async keepChase(this: WheelSessionCommandContext): Promise<void> {
    const isCurrent = captureGameOutcomeGuard(this);
    const tierId = this.wheelChasePendingTierId as string;
    if (!tierId && this.wheelPendingChase) {
      this.wheelChaseDialog = true;
      getWheelController(this).wheelInventoryWarning = "This chase still needs a keep or replacement decision.";
      this.saveWheelSession?.();
      return;
    }
    if ((this.wheelChasePreviewMode as boolean) === true) {
      const controller = getWheelController(this);
      clearWheelChaseDialogState(this);
      setWheelResultState(this, controller, "⭐ Preview keeps chase item", "#f0a500");
      this.saveWheelSession?.();
      return;
    }
    if (tierId) {
      if (await this.recordChaseSale(tierId) === false || !isCurrent()) return;
      this.wheelSessionUpdatedAt = Date.now();
      this.wheelPendingChase = null;
      this.saveWheelSession();
      void broadcastWheelSession(this);
    }
    clearWheelChaseDialogState(this);
  },

  async recordChaseSale(this: WheelSessionCommandContext, tierId: string): Promise<boolean> {
    const isCurrent = captureGameOutcomeGuard(this);
    const obligation = this.wheelPendingChase as PendingWheelChaseObligation | null;
    if (obligation && (obligation.tierId !== tierId || !isPendingChaseSourceCurrent(this, obligation))) {
      getWheelController(this).wheelInventoryWarning = "This chase is still unresolved because its original wheel source changed. Restore that source to continue.";
      return false;
    }
    const configs = (this.wheelConfigs || []) as WheelConfig[];
    const activeId = this.activeWheelConfigId as number | null;
    const config = activeId != null ? configs.find((c) => c.id === activeId) : null;
    if (!config) return false;
    const tier = config.tiers.find((t) => t.id === tierId);
    if (!tier?.boundLotId || tier.deductionType === "none" || (tier.packsCount || 0) <= 0) return true;
    let pendingIssue = this.wheelPendingInventoryIssues.find(entry => obligation?.saleDraft
      ? entry.pendingSale?.id === obligation.saleDraft.id
      : entry.pendingSale?.linkedWheelId === config.id && entry.slotTier === tierId && entry.spinNumber === this.wheelTotalSpins);
    if (!pendingIssue && obligation?.saleDraft) {
      pendingIssue = {
        pendingSale: obligation.saleDraft,
        pendingSaleLotId: obligation.originalPrize.lotId ?? undefined,
        slotName: obligation.originalPrize.slotLabel,
        slotColor: obligation.originalPrize.slotColor,
        slotCost: obligation.originalTier.costPerTier,
        slotTier: obligation.tierId,
        slotPacksCount: obligation.originalTier.packsCount,
        slotDeductionType: obligation.originalTier.deductionType,
        slotIndex: obligation.slotIndex,
        selectedLotId: obligation.originalPrize.lotId,
        spinNumber: obligation.spinNumber,
        slotSinglesId: obligation.originalPrize.singlesEntryId,
        writeAttempted: obligation.saleAttempted === true
      };
      assignWheelPendingInventoryIssues(this, [...this.wheelPendingInventoryIssues, pendingIssue]);
      try {
        this.saveWheelSession({ strict: true });
      } catch {
        return false;
      }
    }
    const pendingRetry = obligation?.saleAttempted === true || pendingIssue?.writeAttempted === true;
    if (!pendingRetry && tier.deductionType === "singles") {
      if (tier.boundSinglesId
        ? getAvailableSinglesQuantityForWheelTier(this, tier.boundLotId, tier.boundSinglesId) <= 0
        : !hasAnyAvailableSinglesForWheelTier(this, tier)) {
        return false;
      }
    }

    if (chaseSaleWrites.has(this)) return false;
    chaseSaleWrites.add(this);
    try {
      if (obligation?.saleDraft && pendingIssue) {
        obligation.saleAttempted = true;
        pendingIssue.writeAttempted = true;
        try {
          this.saveWheelSession({ strict: true });
        } catch {
          obligation.saleAttempted = false;
          pendingIssue.writeAttempted = false;
          return false;
        }
      }
      const sale = await settleSessionGameOutcomeSale({
        config, tierId: tier.id, cost: tier.costPerTier,
        packsCount: tier.packsCount, deductionType: tier.deductionType,
        label: tier.label, lotId: tier.boundLotId, lots: (this.lots || []) as Lot[],
        singlesEntryId: tier.boundSinglesId,
        whatnotFeeSummary: this.whatnotFeeSummary,
        spinNumber: obligation?.spinNumber ?? this.wheelTotalSpins
      }, this, getWheelController(this), isCurrent);
      return sale != null;
    } finally {
      chaseSaleWrites.delete(this);
    }
  },

  canKeepChase(this: WheelSessionCommandContext): boolean {
    const tierId = this.wheelChasePendingTierId as string;
    if (!tierId) return false;
    const obligation = this.wheelPendingChase as PendingWheelChaseObligation | null;
    if (obligation && !isPendingChaseSourceCurrent(this, obligation)) return false;
    const config = getWheelTargetConfig(this, {
      preview: (this.wheelChasePreviewMode as boolean) === true
    });
    const tier = config?.tiers.find((t) => t.id === tierId);
    if (!tier?.boundLotId || !tier.boundSinglesId || (tier.packsCount || 0) <= 0) return false;
    return getAvailableSinglesQuantityForWheelTier(this, tier.boundLotId, tier.boundSinglesId) > 1;
  },

  resetWheelSession(this: WheelSessionCommandContext): void {
    invalidateGameOutcomeSettlements(this);
    const resetController = getWheelController(this);
    const slots = resetController.activeWheelSlots as WheelSlot[];
    this.wheelSessionUpdatedAt = Date.now();
    void runWheelSessionReset(this, resetController, "live", slots, {
      persist: () => this.saveWheelSession(),
      publish: async () => {
        await Promise.all([
          broadcastWheelSession(this),
          this.publishGameSpectatorSessionSnapshot?.() ?? Promise.resolve()
        ]);
      }
    });
  },

  requestWheelReset(this: WheelSessionCommandContext): void {
    this.stopWheelAutospin?.();
    this.wheelConfirmAction = "reset";
    this.wheelConfirmDialog = true;
  },

  confirmWheelAction(this: WheelSessionCommandContext): void {
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

  requestWheelSessionEnd(this: WheelSessionCommandContext): void {
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

  startEndWheelSession(this: WheelSessionCommandContext): void {
    this.wheelEndSessionReviewActive = false;
    const pendingIssues = (this.wheelPendingInventoryIssues || []) as PendingWheelInventoryIssue[];
    if (pendingIssues.some((entry) => isPendingChaseInventoryIssue(this, entry))) reopenPendingChaseDecision(this);
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

  async confirmBatchSale(this: WheelSessionCommandContext, index: number): Promise<void> {
    const pendingIssues = (this.wheelPendingInventoryIssues || []) as PendingWheelInventoryIssue[];
    const entry = pendingIssues[index];
    if (entry && isPendingChaseInventoryIssue(this, entry)) {
      reopenPendingChaseDecision(this);
      return;
    }
    const isCurrent = captureGameOutcomeGuard(this);
    if (!entry?.selectedLotId) return;

    const config = this.activeWheelConfig as WheelConfig | null;
    if (!config) return;

    if (pendingSaleWrites.has(entry)) return;
    pendingSaleWrites.add(entry);
    try {
      const sale = await settleSessionGameOutcomeSale({
        config, tierId: entry.slotTier, cost: entry.slotCost,
        packsCount: entry.slotPacksCount, deductionType: entry.slotDeductionType,
        label: entry.slotName, lotId: entry.selectedLotId, lots: (this.lots || []) as Lot[],
        singlesEntryId: entry.slotSinglesId,
        spinNumber: entry.spinNumber, pendingIssue: entry,
        whatnotFeeSummary: this.whatnotFeeSummary
      }, this, getWheelController(this), isCurrent);
      if (!sale || !isCurrent()) return;

      const remaining = this.wheelPendingInventoryIssues.filter(issue => issue.pendingSale?.id !== sale.id);
      assignWheelPendingInventoryIssues(this, remaining);
      const pendingChase = this.wheelPendingChase as PendingWheelChaseObligation | null;
      if (pendingChase?.saleDraft?.id === sale.id) this.wheelPendingChase = null;
      if (!pendingChase && entry.slotTier === this.wheelChasePendingTierId && entry.spinNumber === this.wheelTotalSpins) {
        clearWheelChaseDialogState(this);
      }

      if (!remaining.length) {
        this.wheelEndingSession = false;
      }
      this.wheelSessionUpdatedAt = Date.now();
      this.saveWheelSession();
      void broadcastWheelSession(this);
    } finally {
      pendingSaleWrites.delete(entry);
    }
  },

  getPendingWheelIssueLotItems(this: WheelSessionCommandContext, entry: PendingWheelInventoryIssue): Array<{ title: string; value: number; lotType?: string }> {
    if (entry.pendingSaleLotId) {
      const lot = this.lots.find(lot => lot.id === entry.pendingSaleLotId);
      return lot ? [{ title: lot.name, value: lot.id, lotType: lot.lotType }] : [];
    }
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

  async confirmAllBatchSales(this: WheelSessionCommandContext): Promise<void> {
    const pendingIssues = (this.wheelPendingInventoryIssues || []) as PendingWheelInventoryIssue[];
    reopenPendingChaseDecision(this);
    const eligibleIndexes = pendingIssues
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => !isPendingChaseInventoryIssue(this, entry) && Boolean(entry.selectedLotId))
      .map(({ index }) => index);
    for (const index of eligibleIndexes.reverse()) {
      await this.confirmBatchSale(index);
    }
  },

  isPendingChaseInventoryIssue(this: WheelSessionCommandContext, entry: PendingWheelInventoryIssue): boolean {
    return isPendingChaseInventoryIssue(this, entry);
  },

  dismissBatchSale(this: WheelSessionCommandContext, index: number): void {
    const pendingIssues = (this.wheelPendingInventoryIssues || []) as PendingWheelInventoryIssue[];
    if (pendingIssues[index] && isPendingChaseInventoryIssue(this, pendingIssues[index]!)) {
      reopenPendingChaseDecision(this);
      return;
    }
    if (pendingIssues[index]?.requiresLotSelection === true) return;
    pendingIssues.splice(index, 1);
    assignWheelPendingInventoryIssues(this, pendingIssues);
    if (!pendingIssues.length) {
      this.wheelEndingSession = false;
    }
    this.wheelSessionUpdatedAt = Date.now();
    void broadcastWheelSession(this);
  },

  cancelEndWheelSession(this: WheelSessionCommandContext): void {
    this.wheelEndingSession = false;
    this.wheelEndSessionReviewActive = false;
  },

  saveWheelSession(this: WheelSessionCommandContext, options: { strict?: boolean } = {}): void {
    const activeId = this.activeWheelConfigId as number | null;
    if (activeId == null) {
      if (options.strict) throw new Error("Select a wheel before recording a sale.");
      return;
    }
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
      wheelConfigSessionCodec, options
    );
    writeGameSession<StoredWheelRootSession>(
      localStorage,
      getScopedWheelSessionStorageKey(storageScope),
      { activeWheelConfigId: activeId, ...session },
      wheelRootSessionCodec, options
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

  loadWheelFromSession(this: WheelSessionCommandContext): boolean {
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
      const restoredPendingChase = normalizePendingWheelChase(session.wheelPendingChase)
        || (this.wheelPendingChase as PendingWheelChaseObligation | null);
      if (restoredPendingChase) {
        this.wheelPendingChase = restoredPendingChase;
        this.wheelChasePendingTierId = restoredPendingChase.tierId;
        this.wheelChasePreviewMode = false;
        this.wheelChaseReplacementSinglesId = null;
        this.wheelChaseDialog = true;
        if (!isPendingChaseSourceCurrent(this, restoredPendingChase)) {
          getWheelController(this).wheelInventoryWarning = "This chase is still unresolved because its original wheel source changed. Restore that source to continue.";
        }
      }
      const controller = getWheelController(this);
      const activeConfig = getWheelTargetConfig(this);
      if (activeConfig?.gameType === "grid") {
        const savedLiveLayoutSeed = String(session.wheelGridLayoutSeed ?? "").trim();
        const savedLiveGridReveals = Array.isArray(session.wheelGridReveals) ? session.wheelGridReveals : [];
        const savedLiveSpinCounts = Array.isArray(session.wheelSpinCounts) ? session.wheelSpinCounts : [];
        const hasLegacyLiveGridSession = !savedLiveLayoutSeed
          && (savedLiveGridReveals.length > 0 || savedLiveSpinCounts.some((count) => Number(count) > 0));
        const liveLayoutSeed = savedLiveLayoutSeed
          || (hasLegacyLiveGridSession ? "" : (controller.wheelGridLayoutSeed || createWheelGridLayoutSeed()));
        const previewConfig = getWheelTargetConfig(this, { preview: true }) || activeConfig;
        const savedPreviewLayoutSeed = String(session.wheelPreviewGridLayoutSeed ?? "").trim();
        const savedPreviewGridReveals = Array.isArray(session.wheelPreviewGridReveals) ? session.wheelPreviewGridReveals : [];
        const savedPreviewSpinCounts = Array.isArray(session.wheelPreviewSpinCounts) ? session.wheelPreviewSpinCounts : [];
        const hasLegacyPreviewGridSession = !savedPreviewLayoutSeed
          && (savedPreviewGridReveals.length > 0 || savedPreviewSpinCounts.some((count) => Number(count) > 0));
        const previewLayoutSeed = savedPreviewLayoutSeed
          || (hasLegacyPreviewGridSession ? "" : (controller.wheelPreviewGridLayoutSeed || liveLayoutSeed));
        controller.wheelGridLayoutSeed = liveLayoutSeed;
        controller.wheelPreviewGridLayoutSeed = previewLayoutSeed;
        controller.activeWheelSlots = buildSlotsFromConfig(activeConfig, { layoutSeed: liveLayoutSeed });
        controller.wheelPreviewSlots = buildSlotsFromConfig(previewConfig, { layoutSeed: previewLayoutSeed });
      } else {
        controller.wheelGridLayoutSeed = "";
        controller.wheelPreviewGridLayoutSeed = "";
      }
      const slots = ((controller.activeWheelSlots || []) as WheelSlot[]);
      const previewSlots = (((controller.wheelPreviewSlots || slots)) as WheelSlot[]);
      if (!Array.isArray(session.wheelSpinCounts)) return false;
      if (session.wheelSpinCounts.length === slots.length) {
        this.wheelSpinCounts = session.wheelSpinCounts;
      } else if (Array.isArray(session.wheelSlotTiers)) {
        this.wheelSpinCounts = remapSpinCountsByTier(session.wheelSlotTiers, session.wheelSpinCounts, slots);
      } else {
        return false;
      }
      this.wheelTotalSpins = (this.wheelSpinCounts as number[]).reduce((sum, count) => sum + count, 0);
      const sessionUpdatedAt = Number(session.wheelSessionUpdatedAt);
      this.wheelSessionUpdatedAt = Number.isFinite(sessionUpdatedAt) ? sessionUpdatedAt : 0;
      controller.wheelSessionNetRevenue =
        Number.isFinite(Number(session.wheelSessionNetRevenue))
          ? (Number(session.wheelSessionNetRevenue) || 0)
          : null;
      controller.wheelSessionCostAdjustment = Number(session.wheelSessionCostAdjustment || 0) || 0;
      controller.wheelFairnessHistory = Array.isArray(session.wheelFairnessHistory)
        ? (session.wheelFairnessHistory.slice(-20) as WheelFairnessEntry[])
        : [];
      controller.wheelChaseTallyHistory = Array.isArray(session.wheelChaseTallyHistory)
        ? (session.wheelChaseTallyHistory as WheelTallyHistoryEntry[])
        : [];
      controller.wheelGridReveals = Array.isArray(session.wheelGridReveals)
        ? (session.wheelGridReveals as typeof controller.wheelGridReveals)
        : [];
      if (Array.isArray(session.wheelPreviewSpinCounts)) {
        if (session.wheelPreviewSpinCounts.length === previewSlots.length) {
          controller.wheelPreviewSpinCounts = session.wheelPreviewSpinCounts;
        } else if (Array.isArray(session.wheelPreviewSlotTiers)) {
          controller.wheelPreviewSpinCounts = remapSpinCountsByTier(
            session.wheelPreviewSlotTiers,
            session.wheelPreviewSpinCounts,
            previewSlots
          );
        } else {
          controller.wheelPreviewSpinCounts = new Array(previewSlots.length).fill(0);
        }
      } else {
        controller.wheelPreviewSpinCounts = new Array(previewSlots.length).fill(0);
      }
      controller.wheelPreviewTotalSpins = ((controller.wheelPreviewSpinCounts || []) as number[])
        .reduce((sum, count) => sum + count, 0);
      controller.wheelPreviewFairnessHistory = Array.isArray(session.wheelPreviewFairnessHistory)
        ? (session.wheelPreviewFairnessHistory.slice(-20) as WheelFairnessEntry[])
        : [];
      controller.wheelPreviewChaseTallyHistory = Array.isArray(session.wheelPreviewChaseTallyHistory)
        ? (session.wheelPreviewChaseTallyHistory as WheelTallyHistoryEntry[])
        : [];
      controller.wheelPreviewGridReveals = Array.isArray(session.wheelPreviewGridReveals)
        ? (session.wheelPreviewGridReveals as typeof controller.wheelPreviewGridReveals)
        : [];
      assignWheelPendingInventoryIssues(this, session.wheelPendingInventoryIssues || []);
      const currentAngle = Number(session.wheelCurrentAngle);
      this.wheelCurrentAngle = Number.isFinite(currentAngle) ? currentAngle : 0;
      this.wheelLastResult = typeof session.wheelLastResult === "string" ? session.wheelLastResult : "";
      controller.wheelLastResultColor = String(session.wheelLastResultColor || "rgb(var(--v-theme-primary))");
      controller.wheelSpinHash = String(session.wheelSpinHash ?? "");
      controller.wheelSpinSeed = String(session.wheelSpinSeed ?? "");
      controller.wheelSpinClientSeed = String(session.wheelSpinClientSeed ?? "");
      controller.wheelSpinVerificationUrl = String(session.wheelSpinVerificationUrl ?? "");
      controller.wheelSpinAlgorithm = String(session.wheelSpinAlgorithm ?? "");
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
