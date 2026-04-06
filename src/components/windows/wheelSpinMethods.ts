import { broadcastWheelSession } from "../../app-core/methods/ui/wheel-broadcast.ts";
import { createWheelFairnessCommit, revealWheelFairnessResult } from "../../app-core/methods/wheel-fairness-api.ts";
import { assignWheelPendingInventoryIssues } from "../../app-core/shared/wheel-session-compat.ts";
import type { Lot, PendingWheelInventoryIssue, Sale, WheelConfig, WheelFairnessEntry } from "../../types/app.ts";
import { getWheelController } from "./wheelControllerState.ts";
import {
  createWheelSale,
  easeOutQuart,
  generateCryptoSeed,
  hashSeed,
  seedToIndex,
  type WheelSlot
} from "./wheelHelpers.ts";
import {
  getAvailableSinglesQuantityForWheelTier,
  getRemainingPacksForWheelLot
} from "./wheelSaleSupport.ts";

type WheelRenderCache = {
  canvas: HTMLCanvasElement;
  slotsRef: WheelSlot[];
  size: number;
  dpr: number;
};

function getWheelCanvasDpr(): number {
  return Math.max(
    1,
    Math.min(
      3,
      Math.floor((((globalThis as { devicePixelRatio?: number }).devicePixelRatio || 1) * 100)) / 100
    )
  );
}

function ensureWheelCanvasSize(canvasEl: HTMLCanvasElement, size: number, dpr: number): void {
  const backingSize = Math.max(20, Math.round(size * dpr));
  if (canvasEl.width !== backingSize || canvasEl.height !== backingSize) {
    canvasEl.width = backingSize;
    canvasEl.height = backingSize;
    canvasEl.style.width = `${size}px`;
    canvasEl.style.height = `${size}px`;
  }
}

function renderWheelSurface(
  ctx: CanvasRenderingContext2D,
  slots: WheelSlot[],
  size: number,
  offset = 0,
  highlightedSlotIndex = -1
): void {
  const cx = Math.round(size / 2);
  const cy = Math.round(size / 2);
  const r = Math.round(size / 2 - 10);
  const sliceAngle = (2 * Math.PI) / slots.length;
  const strokeColor = "#0a0c10";
  const strokeWidth = 2.25;

  slots.forEach((slot, i) => {
    const startAngle = offset + i * sliceAngle;
    const endAngle = startAngle + sliceAngle;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = slot.color;
    ctx.fill();

    if (i === highlightedSlotIndex) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = "rgba(255, 245, 200, 0.18)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 228, 133, 0.92)";
      ctx.lineWidth = 4;
      ctx.shadowColor = "rgba(255, 210, 88, 0.7)";
      ctx.shadowBlur = 22;
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(startAngle + sliceAngle / 2);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    const baseFontSize = slots.length > 16 ? 0.022 : slots.length > 10 ? 0.025 : 0.028;
    const fontSize = Math.max(8, Math.round(size * baseFontSize));
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.shadowColor = "#000";
    ctx.shadowBlur = 4;
    const maxChars = Math.max(10, Math.floor(size / 18));
    const label = slot.isChase ? "⭐ " + slot.name : slot.name;
    const txt = label.length > maxChars ? label.substring(0, maxChars - 2) + "…" : label;
    ctx.fillText(txt, r - 12, 3);
    ctx.restore();
  });

  ctx.save();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = strokeWidth;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.stroke();

  for (let i = 0; i < slots.length; i++) {
    const angle = offset + i * sliceAngle;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(
      cx + Math.cos(angle) * r,
      cy + Math.sin(angle) * r
    );
    ctx.stroke();
  }
  ctx.restore();
}

function createWheelCacheCanvas(sourceCanvas: HTMLCanvasElement): HTMLCanvasElement | null {
  const documentLike = sourceCanvas.ownerDocument ?? (globalThis as { document?: Document }).document;
  if (!documentLike?.createElement) return null;
  return documentLike.createElement("canvas");
}

function getStaticWheelRender(
  context: Record<string, unknown>,
  sourceCanvas: HTMLCanvasElement,
  slots: WheelSlot[],
  size: number,
  dpr: number
): HTMLCanvasElement | null {
  const existingCache = context._wheelStaticRenderCache as WheelRenderCache | undefined;
  if (
    existingCache
    && existingCache.slotsRef === slots
    && existingCache.size === size
    && existingCache.dpr === dpr
  ) {
    return existingCache.canvas;
  }

  const cacheCanvas = createWheelCacheCanvas(sourceCanvas);
  if (!cacheCanvas) return null;

  ensureWheelCanvasSize(cacheCanvas, size, dpr);
  const cacheCtx = cacheCanvas.getContext("2d");
  if (!cacheCtx) return null;

  cacheCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cacheCtx.clearRect(0, 0, size, size);
  cacheCtx.imageSmoothingEnabled = true;
  renderWheelSurface(cacheCtx, slots, size);

  context._wheelStaticRenderCache = {
    canvas: cacheCanvas,
    slotsRef: slots,
    size,
    dpr
  } satisfies WheelRenderCache;

  return cacheCanvas;
}

function queuePendingInventoryIssue(
  context: Record<string, unknown>,
  params: {
    slot: WheelSlot;
    slotIndex: number;
    boundLotId: number;
    boundSinglesId?: number | null;
    warningText?: string;
  }
): void {
  const pendingIssues = (context.wheelPendingInventoryIssues || []) as PendingWheelInventoryIssue[];
  pendingIssues.push({
    slotName: params.slot.name,
    slotColor: params.slot.color,
    slotCost: params.slot.cost,
    slotTier: params.slot.tier,
    slotPacksCount: params.slot.packsCount,
    slotDeductionType: params.slot.deductionType,
    slotIndex: params.slotIndex,
    selectedLotId: params.boundLotId,
    spinNumber: (context.wheelTotalSpins as number) || 0,
    slotSinglesId: params.boundSinglesId ?? null
  });
  assignWheelPendingInventoryIssues(context, pendingIssues);
  const issueController = getWheelController(context);
  issueController.inventoryWarning = params.warningText || "";
  (context as Record<string, unknown> & { saveWheelSession: () => void }).saveWheelSession();
}

function appendWheelSessionNetRevenue(context: Record<string, unknown>, sale: Pick<Sale, "netRevenue">): void {
  const netRevenue = Number(sale.netRevenue);
  if (!Number.isFinite(netRevenue)) return;
  const revenueController = getWheelController(context);
  const currentNetRevenue = Number((revenueController.sessionNetRevenue as number | null | undefined) ?? 0) || 0;
  revenueController.sessionNetRevenue = currentNetRevenue + Math.max(0, netRevenue);
}

async function resolveWheelFairnessSpin(
  context: Record<string, unknown>,
  slotCount: number
): Promise<{
  resultIndex: number;
  hash: string;
  seed: string;
  clientSeed?: string;
  verificationUrl?: string;
  algorithm?: string;
}> {
  const buildLocalFallback = async () => {
    const localSeed = generateCryptoSeed();
    return {
      resultIndex: seedToIndex(localSeed, slotCount),
      hash: await hashSeed(localSeed),
      seed: localSeed
    };
  };

  const clientSeed = generateCryptoSeed();
  let commit = null;
  try {
    commit = await createWheelFairnessCommit(slotCount);
  } catch {
    return buildLocalFallback();
  }

  if (!commit) {
    return buildLocalFallback();
  }

  let reveal;
  try {
    reveal = await revealWheelFairnessResult(commit.commitToken, clientSeed);
  } catch {
    return buildLocalFallback();
  }
  if (reveal.serverSeedHash !== commit.serverSeedHash) {
    throw new Error("Wheel fairness hash mismatch.");
  }

  return {
    resultIndex: reveal.resultIndex,
    hash: reveal.serverSeedHash,
    seed: reveal.serverSeed,
    clientSeed: reveal.clientSeed,
    verificationUrl: reveal.verificationUrl,
    algorithm: reveal.algorithm
  };
}

export const wheelSpinMethods = {
  drawWheel(this: Record<string, unknown>, offset = 0): void {
    const canvasEl = (this.$refs as Record<string, unknown>).wheelCanvas as HTMLCanvasElement | null;
    if (!canvasEl) return;
    const ctx = canvasEl.getContext("2d");
    if (!ctx) return;

    const drawController = getWheelController(this as Record<string, unknown>);
    const slots = (((this as Record<string, unknown>).wheelDisplaySlots
      || drawController.activeSlots)) as WheelSlot[];
    const size = Math.max(20, (this as Record<string, unknown>).wheelCanvasSize as number);
    const dpr = getWheelCanvasDpr();

    ensureWheelCanvasSize(canvasEl, size, dpr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;

    ctx.clearRect(0, 0, size, size);

    if (!slots.length) {
      (this as Record<string, unknown>)._wheelStaticRenderCache = undefined;
      const cx = Math.round(size / 2);
      const cy = Math.round(size / 2);
      const r = Math.round(size / 2 - 10);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, 2 * Math.PI);
      ctx.fillStyle = "#1e2540";
      ctx.fill();
      ctx.fillStyle = "#5a6080";
      ctx.font = "16px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Configure & Apply", cx, cy);
      return;
    }

    const highlightedSlotIndex = Number(drawController.highlightedSlotIndex ?? -1);
    if (highlightedSlotIndex < 0) {
      const staticWheel = getStaticWheelRender(this as Record<string, unknown>, canvasEl, slots, size, dpr);
      if (staticWheel) {
        const cx = Math.round(size / 2);
        const cy = Math.round(size / 2);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(offset);
        ctx.drawImage(staticWheel, -Math.round(size / 2), -Math.round(size / 2), size, size);
        ctx.restore();
        return;
      }
    }

    renderWheelSurface(ctx, slots, size, offset, highlightedSlotIndex);
  },

  async spinWheel(this: Record<string, unknown>): Promise<void> {
    const vm = this as Record<string, unknown> & {
      spinWheelInternal: (recordSession?: boolean) => Promise<void>;
    };
    await vm.spinWheelInternal(true);
  },

  async testSpinWheel(this: Record<string, unknown>): Promise<void> {
    const vm = this as Record<string, unknown> & {
      spinWheelInternal: (recordSession?: boolean) => Promise<void>;
    };
    await vm.spinWheelInternal(false);
  },

  async spinWheelInternal(this: Record<string, unknown>, recordSession = true): Promise<void> {
    const vm = this as Record<string, unknown> & {
      drawWheel: (offset: number) => void;
      landOnSlot: (index: number, options?: { recordSession?: boolean }) => void;
      recordSpinResult: (index: number) => void;
      recordPreviewSpinResult: (index: number) => void;
      appendWheelFairnessHistory: (entry: WheelFairnessEntry, options?: { preview?: boolean }) => void;
      saveWheelSession: () => void;
    };
    const spinController = getWheelController(vm as Record<string, unknown>);
    const slots = (((vm as Record<string, unknown>).wheelDisplaySlots || spinController.activeSlots)) as WheelSlot[];
    if (vm.wheelSpinning || !slots.length) return;
    if (recordSession && ((vm as Record<string, unknown>).wheelSpinBlockedReason as string)) {
      const blockedController = getWheelController(vm as Record<string, unknown>);
      blockedController.inventoryWarning = (vm as Record<string, unknown>).wheelSpinBlockedReason as string;
      return;
    }

    const fairnessResult = await resolveWheelFairnessSpin(vm as Record<string, unknown>, slots.length);

    const initController = getWheelController(vm as Record<string, unknown>);
    initController.spinSeed = "";
    initController.spinHash = fairnessResult.hash;
    initController.spinClientSeed = fairnessResult.clientSeed || "";
    initController.spinVerificationUrl = "";
    initController.spinAlgorithm = fairnessResult.algorithm || "";
    initController.showSeed = false;
    initController.inventoryWarning = "";

    vm.wheelSpinning = true;
    initController.highlightedSlotIndex = -1;
    vm.wheelLastResult = "Spinning\u2026";
    initController.lastResultColor = "rgb(var(--v-theme-primary))";
    vm.saveWheelSession();

    const sliceAngle = (2 * Math.PI) / slots.length;
    const targetIndex = fairnessResult.resultIndex;
    if (recordSession) {
      vm.recordSpinResult(targetIndex);
    } else {
      vm.recordPreviewSpinResult(targetIndex);
      vm.saveWheelSession();
    }
    const currentAngle = (vm.wheelCurrentAngle || 0) as number;
    const extraRotations = Math.floor(5 + Math.random() * 4) * 2 * Math.PI;
    const endAngle = currentAngle - (targetIndex * sliceAngle + sliceAngle / 2) - (currentAngle % (2 * Math.PI)) + extraRotations;
    const duration = 4000 + Math.random() * 1500;
    const startAngle = currentAngle;
    const startTime = performance.now();

    const tick = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const currentOffset = startAngle + (endAngle - startAngle) * easeOutQuart(t);
      vm.wheelCurrentAngle = currentOffset;
      vm.drawWheel(currentOffset);

      if (t < 1) {
        requestAnimationFrame(tick);
        return;
      }

      vm.wheelCurrentAngle = endAngle;
      vm.drawWheel(endAngle);
      vm.wheelSpinning = false;
      const spinController = getWheelController(vm as Record<string, unknown>);
      spinController.spinSeed = fairnessResult.seed;
      spinController.spinClientSeed = fairnessResult.clientSeed || "";
      spinController.spinVerificationUrl = fairnessResult.verificationUrl || "";
      spinController.spinAlgorithm = fairnessResult.algorithm || "";
      spinController.showSeed = true;
      vm.appendWheelFairnessHistory({
        spinNumber: Number(recordSession
          ? ((vm as Record<string, unknown>).wheelTotalSpins || 0)
          : (spinController.previewTotalSpins || 0)),
        label: slots[targetIndex]?.name || "Unknown result",
        color: slots[targetIndex]?.color || "rgb(var(--v-theme-primary))",
        hash: fairnessResult.hash,
        seed: fairnessResult.seed,
        clientSeed: fairnessResult.clientSeed,
        verificationUrl: fairnessResult.verificationUrl,
        algorithm: fairnessResult.algorithm,
        timestamp: Date.now()
      }, { preview: !recordSession });
      vm.saveWheelSession();
      vm.landOnSlot(targetIndex, { recordSession });
    };

    requestAnimationFrame(tick);
  },

  recordPreviewSpinResult(this: Record<string, unknown>, slotIndex: number): void {
    const controller = getWheelController(this as Record<string, unknown>);
    const slots = (((this as Record<string, unknown>).wheelDisplaySlots
      || controller.activeSlots)) as WheelSlot[];
    if (!slots[slotIndex]) return;
    const counts = (controller.previewSpinCounts || []) as number[];
    const nextCounts = counts.length === slots.length ? [...counts] : new Array(slots.length).fill(0);
    nextCounts[slotIndex] = (nextCounts[slotIndex] || 0) + 1;
    controller.previewSpinCounts = nextCounts;
    controller.previewTotalSpins = (controller.previewTotalSpins || 0) + 1;
  },

  recordSpinResult(this: Record<string, unknown>, slotIndex: number): void {
    const recordController = getWheelController(this as Record<string, unknown>);
    const slots = (((this as Record<string, unknown>).wheelDisplaySlots
      || recordController.activeSlots)) as WheelSlot[];
    const slot = slots[slotIndex];
    if (!slot) return;

    const counts = (this.wheelSpinCounts || []) as number[];
    counts[slotIndex] = (counts[slotIndex] || 0) + 1;
    this.wheelSpinCounts = [...counts];
    this.wheelTotalSpins = ((this.wheelTotalSpins as number) || 0) + 1;

    if (!slot.isChase) {
      const config = (((this as Record<string, unknown>).wheelDisplayConfig
        || (this as Record<string, unknown>).activeWheelConfig)) as WheelConfig | null;
      const tier = config?.tiers.find((t) => t.id === slot.tier);
      if (tier?.boundLotId) {
        if (slot.deductionType === "none" || (slot.packsCount || 0) <= 0) {
          recordController.inventoryWarning = "";
          (this as Record<string, unknown> & { saveWheelSession: () => void }).saveWheelSession();
          return;
        }

        const lots = (this.lots || []) as Lot[];
        const boundLot = lots.find((entry) => entry.id === tier.boundLotId);
        if (slot.deductionType === "singles") {
          if (tier.boundSinglesId) {
            const availableQuantity = getAvailableSinglesQuantityForWheelTier(
              this,
              tier.boundLotId,
              tier.boundSinglesId
            );
            if (availableQuantity <= 0) {
              queuePendingInventoryIssue(this, {
                slot,
                slotIndex,
                boundLotId: tier.boundLotId,
                boundSinglesId: tier.boundSinglesId,
                warningText: `${slot.name} is no longer available in ${boundLot?.name || "the selected lot"}.`
              });
              return;
            }
          }
        } else if (slot.deductionType === "packs") {
          const remainingPacks = getRemainingPacksForWheelLot(this, tier.boundLotId);
          if (remainingPacks < slot.packsCount) {
            queuePendingInventoryIssue(this, {
              slot,
              slotIndex,
              boundLotId: tier.boundLotId,
              warningText: `${slot.name} needs ${slot.packsCount} item${slot.packsCount === 1 ? "" : "s"}, but only ${remainingPacks} remain in ${boundLot?.name || "the selected lot"}.`
            });
            return;
          }
        }
        const sale = createWheelSale({
          config: config!, tier: slot.tier, cost: slot.cost,
          packsCount: slot.packsCount, deductionType: slot.deductionType,
          label: slot.name, lotId: tier.boundLotId, lots,
          singlesEntryId: tier.boundSinglesId
        });
        const addWheelSale = (this as Record<string, unknown>).addWheelSaleToLot as
          ((lotId: number, sale: Sale) => void) | undefined;
        if (typeof addWheelSale === "function") {
          addWheelSale(tier.boundLotId, sale);
        }
        appendWheelSessionNetRevenue(this, sale);
      }
    }
    (this as Record<string, unknown> & { saveWheelSession: () => void }).saveWheelSession();
  },

  landOnSlot(this: Record<string, unknown>, slotIndex: number, options: { recordSession?: boolean } = {}): void {
    const landController = getWheelController(this as Record<string, unknown>);
    const slots = (((this as Record<string, unknown>).wheelDisplaySlots
      || landController.activeSlots)) as WheelSlot[];
    const slot = slots[slotIndex];
    if (!slot) return;
    const recordSession = options.recordSession ?? true;
    const existingHighlightTimeoutId = (this as Record<string, unknown>)._wheelHighlightTimeoutId as number | undefined;
    if (existingHighlightTimeoutId != null) {
      clearTimeout(existingHighlightTimeoutId);
    }
    landController.highlightedSlotIndex = slotIndex;
    const redraw = (this as Record<string, unknown>).drawWheel as ((offset?: number) => void) | undefined;
    (this as Record<string, unknown>)._wheelHighlightTimeoutId = globalThis.setTimeout(() => {
      landController.highlightedSlotIndex = -1;
      (this as Record<string, unknown>)._wheelHighlightTimeoutId = undefined;
      redraw?.(((this as Record<string, unknown>).wheelCurrentAngle as number) || 0);
    }, 2200);
    redraw?.(((this as Record<string, unknown>).wheelCurrentAngle as number) || 0);

    this.wheelLastResult = "🎉 " + slot.name;
    landController.lastResultColor = slot.color;
    if (slot.isChase) {
      const config = (((this as Record<string, unknown>).wheelDisplayConfig
        || (this as Record<string, unknown>).activeWheelConfig)) as WheelConfig | null;
      const tier = config?.tiers.find((entry) => entry.id === slot.tier);
      const lot = tier?.boundLotId != null
        ? ((this.lots || []) as Lot[]).find((entry) => entry.id === tier.boundLotId)
        : null;
      const image = tier?.boundSinglesId != null
        ? lot?.singlesPurchases?.find((entry) => entry.id === tier.boundSinglesId)?.image
        : undefined;
      (this as Record<string, unknown> & {
        triggerWheelCelebration?: (payload: { label: string; color: string; image?: string; preview?: boolean }) => void;
      }).triggerWheelCelebration?.({
        label: slot.name,
        color: slot.color,
        image,
        preview: !recordSession
      });
    }

    if (!recordSession) {
      if (slot.isChase) {
        (this as Record<string, unknown>).wheelChasePendingTierId = slot.tier;
        (this as Record<string, unknown>).wheelChaseReplacementSinglesId = null;
        (this as Record<string, unknown>).wheelChasePreviewMode = true;
        (this as Record<string, unknown>).wheelChaseDialog = true;
        (this as Record<string, unknown> & { saveWheelSession: () => void }).saveWheelSession();
        return;
      }
      (this as Record<string, unknown>).wheelChaseDialog = false;
      (this as Record<string, unknown>).wheelChaseReplacementSinglesId = null;
      (this as Record<string, unknown>).wheelChasePendingTierId = "";
      (this as Record<string, unknown> & { saveWheelSession: () => void }).saveWheelSession();
      return;
    }

    if (slot.isChase) {
      (this as Record<string, unknown>).wheelChasePreviewMode = false;
      (this as Record<string, unknown>).wheelChasePendingTierId = slot.tier;
      (this as Record<string, unknown>).wheelChaseReplacementSinglesId = null;
      (this as Record<string, unknown>).wheelChaseDialog = true;
    }
    (this as Record<string, unknown> & { saveWheelSession: () => void }).saveWheelSession();
    void broadcastWheelSession(this as Parameters<typeof broadcastWheelSession>[0]);
  }
};
