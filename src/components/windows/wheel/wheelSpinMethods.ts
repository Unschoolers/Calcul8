import { broadcastWheelSession } from "../../../app-core/methods/ui/wheel-broadcast.ts";
import { createWheelFairnessProofLink } from "../../../app-core/methods/wheel-fairness-api.ts";
import { assignWheelPendingInventoryIssues, normalizeWheelPendingInventoryIssues } from "../../../app-core/shared/wheel-session-compat.ts";
import type { Lot, Sale, WheelConfig, WheelFairnessEntry } from "../../../types/app.ts";
import {
    ensureWheelCanvasSize,
    getStaticWheelRender,
    getWheelCanvasDpr,
    playWheelTick,
    renderWheelSurface
} from "./wheelCanvasRender.ts";
import { getWheelController, type WheelWindowThis } from "./wheelControllerState.ts";
import {
    createWheelSale,
    easeOutQuart,
    serializeWheelLayoutForFairness,
    type WheelSlot
} from "./wheelHelpers.ts";
import {
    getAvailableSinglesQuantityForWheelTier,
    getRemainingPacksForWheelLot
} from "./wheelSaleSupport.ts";
import { resolveWheelFairnessSpin } from "./wheelSpinFairness.ts";
import {
    applyWheelSpinBlockedReason,
    beginWheelSpin,
    buildWheelReadableVerificationUrl,
    buildWheelSpinFairnessEntry,
    finalizeWheelSpinProof,
    getWheelSpinSlots,
    shouldRecordWheelLiveSession
} from "./wheelSpinState.ts";

function queuePendingInventoryIssue(
  context: WheelWindowThis,
  params: {
    slot: WheelSlot;
    slotIndex: number;
    boundLotId: number;
    boundSinglesId?: number | null;
    warningText?: string;
  }
): void {
  const pendingIssues = normalizeWheelPendingInventoryIssues(context.wheelPendingInventoryIssues);
  pendingIssues.push({
    slotName: params.slot.name,
    slotColor: params.slot.color,
    slotCost: params.slot.cost,
    slotTier: params.slot.tier,
    slotPacksCount: params.slot.packsCount,
    slotDeductionType: params.slot.deductionType,
    slotIndex: params.slotIndex,
    selectedLotId: params.boundLotId,
    spinNumber: context.wheelTotalSpins || 0,
    slotSinglesId: params.boundSinglesId ?? null
  });
  assignWheelPendingInventoryIssues(context as unknown as Record<string, unknown>, pendingIssues);
  const issueController = getWheelController(context);
  issueController.inventoryWarning = params.warningText || "";
  context.saveWheelSession();
}

function appendWheelSessionNetRevenue(context: WheelWindowThis, sale: Pick<Sale, "netRevenue">): void {
  const netRevenue = Number(sale.netRevenue);
  if (!Number.isFinite(netRevenue)) return;
  const revenueController = getWheelController(context);
  const currentNetRevenue = Number(revenueController.sessionNetRevenue ?? 0) || 0;
  revenueController.sessionNetRevenue = currentNetRevenue + Math.max(0, netRevenue);
}

export const wheelSpinMethods = {
  drawWheel(this: WheelWindowThis, offset = 0): void {
    const canvasEl = this.$refs.wheelCanvas as HTMLCanvasElement | null;
    if (!canvasEl) return;
    const ctx = canvasEl.getContext("2d");
    if (!ctx) return;

    const drawController = getWheelController(this);
    const slots = getWheelSpinSlots(this as unknown as Record<string, unknown>);
    const size = Math.max(20, this.wheelCanvasSize);
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

    const highlightTime = Number((this as Record<string, unknown>)._wheelHighlightTime ?? 0);

    renderWheelSurface(ctx, slots, size, offset, highlightedSlotIndex, highlightTime);
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
    const slots = getWheelSpinSlots(vm as Record<string, unknown>);
    const shouldRecordLiveSession = shouldRecordWheelLiveSession(vm as Record<string, unknown>, recordSession);
    if (vm.wheelSpinning || !slots.length) return;
    if (shouldRecordLiveSession && ((vm as Record<string, unknown>).wheelSpinBlockedReason as string)) {
      applyWheelSpinBlockedReason(
        vm as Record<string, unknown>,
        (vm as Record<string, unknown>).wheelSpinBlockedReason as string
      );
      return;
    }

    const fairnessResult = await resolveWheelFairnessSpin(slots.length, slots);

    beginWheelSpin(vm as Record<string, unknown>, fairnessResult);
    vm.saveWheelSession();

    const sliceAngle = (2 * Math.PI) / slots.length;
    const targetIndex = fairnessResult.resultIndex;
    if (shouldRecordLiveSession) {
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

    // Pointer wobble: detect when slice dividers cross the pointer position
    let prevBoundaryCount = 0;
    const refs = (vm.$refs || {}) as Record<string, unknown>;
    const pointerEl = (refs.wheelOuter as HTMLElement | null)
      ?.querySelector(".wheel-pointer") as HTMLElement | null;

    const tick = async (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const currentOffset = startAngle + (endAngle - startAngle) * easeOutQuart(t);
      vm.wheelCurrentAngle = currentOffset;
      vm.drawWheel(currentOffset);

      // Wobble pointer when a divider crosses
      if (pointerEl) {
        const totalAngleSwept = Math.abs(currentOffset - startAngle);
        const boundaryCount = Math.floor(totalAngleSwept / sliceAngle);
        if (boundaryCount > prevBoundaryCount) {
          prevBoundaryCount = boundaryCount;
          pointerEl.classList.remove("wheel-pointer--tick");
          void pointerEl.offsetWidth; // force reflow to restart animation
          pointerEl.classList.add("wheel-pointer--tick");
          // Tick volume fades as the wheel slows down
          const tickVolume = 0.04 + 0.06 * (1 - t);
          playWheelTick(tickVolume);
        }
      }

      if (t < 1) {
        requestAnimationFrame(tick);
        return;
      }

      vm.wheelCurrentAngle = endAngle;
      vm.drawWheel(endAngle);
      vm.wheelSpinning = false;
      pointerEl?.classList.remove("wheel-pointer--tick");
      const config = (((vm as Record<string, unknown>).wheelDisplayConfig
        || (vm as Record<string, unknown>).activeWheelConfig)) as WheelConfig | null;
      const spinNumber = Number(shouldRecordLiveSession
        ? ((vm as Record<string, unknown>).wheelTotalSpins || 0)
        : (spinController.previewTotalSpins || 0));
      let verificationUrl = buildWheelReadableVerificationUrl(fairnessResult.verificationUrl, {
        slotLabel: slots[targetIndex]?.name,
        wheelName: config?.name,
        spinNumber,
        slots
      });
      if (fairnessResult.seed && fairnessResult.clientSeed) {
        try {
          const proofLink = await createWheelFairnessProofLink({
            serverSeed: fairnessResult.seed,
            clientSeed: fairnessResult.clientSeed,
            slotCount: slots.length,
            layoutHash: fairnessResult.layoutHash,
            layout: serializeWheelLayoutForFairness(slots),
            slotLabel: slots[targetIndex]?.name,
            wheelName: config?.name,
            spinNumber
          });
          verificationUrl = proofLink.verificationUrl;
        } catch {
          // Fall back to the short GET proof URL without the full ordered layout payload.
        }
      }
      const readableFairnessResult = {
        ...fairnessResult,
        verificationUrl
      };
      finalizeWheelSpinProof(vm as Record<string, unknown>, readableFairnessResult);
      vm.appendWheelFairnessHistory(buildWheelSpinFairnessEntry(vm as Record<string, unknown>, {
        fairnessResult: readableFairnessResult,
        slots,
        targetIndex,
        shouldRecordLiveSession
      }), { preview: !shouldRecordLiveSession });
      vm.saveWheelSession();
      vm.landOnSlot(targetIndex, { recordSession: shouldRecordLiveSession });
    };

    requestAnimationFrame(tick);
  },

  recordPreviewSpinResult(this: WheelWindowThis, slotIndex: number): void {
    const controller = getWheelController(this);
    const slots = getWheelSpinSlots(this as unknown as Record<string, unknown>);
    if (!slots[slotIndex]) return;
    const counts = (controller.previewSpinCounts || []) as number[];
    const nextCounts = counts.length === slots.length ? [...counts] : new Array(slots.length).fill(0);
    nextCounts[slotIndex] = (nextCounts[slotIndex] || 0) + 1;
    controller.previewSpinCounts = nextCounts;
    controller.previewTotalSpins = (controller.previewTotalSpins || 0) + 1;
  },

  recordSpinResult(this: WheelWindowThis, slotIndex: number): void {
    const recordController = getWheelController(this);
    const slots = getWheelSpinSlots(this as unknown as Record<string, unknown>);
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

  landOnSlot(this: WheelWindowThis, slotIndex: number, options: { recordSession?: boolean } = {}): void {
    const landController = getWheelController(this);
    const slots = getWheelSpinSlots(this as unknown as Record<string, unknown>);
    const slot = slots[slotIndex];
    if (!slot) return;
    const recordSession = options.recordSession ?? true;

    // Cancel any existing celebration animation
    const existingHighlightTimeoutId = (this as Record<string, unknown>)._wheelHighlightTimeoutId as number | undefined;
    if (existingHighlightTimeoutId != null) {
      clearTimeout(existingHighlightTimeoutId);
    }
    const hasRAF = typeof requestAnimationFrame === "function";
    const existingAnimationId = (this as Record<string, unknown>)._wheelCelebrationAnimId as number | undefined;
    if (existingAnimationId != null && hasRAF) {
      cancelAnimationFrame(existingAnimationId);
    }

    landController.highlightedSlotIndex = slotIndex;
    const redraw = (this as Record<string, unknown>).drawWheel as ((offset?: number) => void) | undefined;
    const getAngle = () => ((this as Record<string, unknown>).wheelCurrentAngle as number) || 0;

    // Animated celebration loop — chaser lights + pulsing glow
    const celebrationDuration = 5000;

    if (hasRAF) {
      const celebrationStart = performance.now();
      const celebrateTick = (now: number) => {
        const elapsed = now - celebrationStart;
        if (elapsed >= celebrationDuration) {
          landController.highlightedSlotIndex = -1;
          (this as Record<string, unknown>)._wheelHighlightTime = 0;
          (this as Record<string, unknown>)._wheelCelebrationAnimId = undefined;
          redraw?.(getAngle());
          return;
        }
        const t = elapsed / 1000;
        (this as Record<string, unknown>)._wheelHighlightTime = t;
        redraw?.(getAngle());
        (this as Record<string, unknown>)._wheelCelebrationAnimId = requestAnimationFrame(celebrateTick);
      };
      (this as Record<string, unknown>)._wheelCelebrationAnimId = requestAnimationFrame(celebrateTick);
    } else {
      // Fallback for non-browser environments
      redraw?.(getAngle());
      (this as Record<string, unknown>)._wheelHighlightTimeoutId = globalThis.setTimeout(() => {
        landController.highlightedSlotIndex = -1;
        (this as Record<string, unknown>)._wheelHighlightTimeoutId = undefined;
        redraw?.(getAngle());
      }, celebrationDuration);
    }

    this.wheelLastResult = "🎉 " + slot.name;
    landController.lastResultColor = slot.color;
    {
      const config = (((this as Record<string, unknown>).wheelDisplayConfig
        || (this as Record<string, unknown>).activeWheelConfig)) as WheelConfig | null;
      const tier = config?.tiers.find((entry) => entry.id === slot.tier);
      const emoji = tier?.celebrationEmoji || undefined;
      if (slot.isChase || emoji) {
        const lot = tier?.boundLotId != null
          ? ((this.lots || []) as Lot[]).find((entry) => entry.id === tier.boundLotId)
          : null;
        const image = slot.isChase && tier?.boundSinglesId != null
          ? lot?.singlesPurchases?.find((entry) => entry.id === tier.boundSinglesId)?.image
          : undefined;
        (this as Record<string, unknown> & {
          triggerWheelCelebration?: (payload: { label: string; color: string; image?: string; emoji?: string; preview?: boolean }) => void;
        }).triggerWheelCelebration?.({
          label: slot.name,
          color: slot.color,
          image,
          emoji,
          preview: !recordSession
        });
      }
    }

    if (!recordSession) {
      if (slot.isChase) {
        (this as Record<string, unknown> & { stopWheelAutospin?: () => void }).stopWheelAutospin?.();
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
      if ((this as Record<string, unknown>).wheelAutospinEnabled) {
        (this as Record<string, unknown> & { scheduleNextWheelAutospin?: (delayMs?: number) => void }).scheduleNextWheelAutospin?.();
      }
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
