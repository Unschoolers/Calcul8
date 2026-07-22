import { broadcastWheelSession } from "../../../../app-core/methods/ui/spectator/wheel-broadcast.ts";
import { createWheelFairnessProofLink } from "../../../../app-core/methods/wheel-fairness-api.ts";
import { isSinglesLot } from "../../../../app-core/shared/lot-types.ts";
import { getWheelTierSourceLotIds, isWheelTierMultiLot } from "../../../../app-core/shared/wheel-tier-sources.ts";
import {
    chooseWheelPreviewTargetIndex,
    createWheelSpinPlan,
    easeOutQuart,
    resolveWheelLiveDurationMs,
    resolveWheelLiveExtraRotations,
    resolveWheelPreviewDurationMs,
    resolveWheelPreviewExtraRotations
} from "../../../../app-core/shared/game-spin.ts";
import { assignWheelPendingInventoryIssues, normalizeWheelPendingInventoryIssues } from "../../../../app-core/shared/wheel-session-compat.ts";
import type { GameCoordinatorContext, GameSessionStateContext } from "../../../../app-core/context/game.ts";
import type { Lot, WheelConfig, WheelFairnessEntry } from "../../../../types/app.ts";
import {
    ensureWheelCanvasSize,
    getStaticWheelRender,
    getWheelCanvasDpr,
    renderWheelSurface
} from "../stage/wheelCanvasRender.ts";
import { playWheelTick } from "../services/wheelAudio.ts";
import type { GameHostState } from "../services/gameHostState.ts";
import { getWheelController } from "../services/gameSessionState.ts";
import { settleSessionGameOutcomeSale } from "../services/gameOutcomeSettlement.ts";
import type { WheelSlot } from "../services/wheelSlots.ts";
import { serializeWheelLayoutForFairness } from "../services/wheelFairnessLayout.ts";
import {
    getAvailableSinglesQuantityForWheelTier,
    getRemainingPacksForWheelLot
} from "../services/wheelSaleSupport.ts";
import { resolveWheelFairnessSpin } from "../services/wheelSpinFairness.ts";
import {
    applyWheelSpinBlockedReason,
    beginWheelSpin,
    buildWheelReadableVerificationUrl,
    buildWheelSpinFairnessEntry,
    finalizeWheelSpinProof,
    getWheelSpinSlots,
    shouldRecordWheelLiveSession
} from "../services/wheelSpinState.ts";
import { recordWheelSessionSpin } from "../services/wheelSessionState.ts";

type WheelSpinCommandContext = GameSessionStateContext
  & Pick<GameCoordinatorContext,
    | "lots" | "addWheelSaleToLot" | "wheelConfigs" | "activeWheelConfigId"
    | "activeScopeType" | "activeWorkspaceId" | "googleAuthEpoch" | "hasProAccess"
  >
  & Pick<GameHostState,
    | "wheelAutospinEnabled" | "wheelSoundEnabled" | "wheelCanvasSize" | "wheelChaseDialog"
    | "wheelChasePendingTierId" | "wheelChasePreviewMode" | "wheelChaseReplacementSinglesId" | "wheelViewportWidth"
  >
  & {
    activeWheelConfig: WheelConfig | null;
    wheelDisplayConfig: WheelConfig | null;
    wheelIsCompactLayout: boolean;
    wheelSpinBlockedReason: string;
    _gameSpectatorSpinAnimation?: import("../../../../types/app.ts").GameSpectatorSpinAnimation | null;
    _wheelAnimationAngle?: number;
    _wheelCelebrationAnimId?: number;
    _wheelHighlightTime?: number;
    _wheelHighlightTimeoutId?: number;
    _wheelStaticRenderCache?: unknown;
    $refs?: Record<string, unknown>;
    appendWheelFairnessHistory(entry: WheelFairnessEntry, options?: { preview?: boolean }): void;
    drawWheel(offset?: number): void;
    landOnSlot(slotIndex: number, options?: { recordSession?: boolean }): void;
    recordPreviewSpinResult(slotIndex: number): void;
    recordSpinResult(slotIndex: number): void;
    saveWheelSession(): void;
    scheduleNextWheelAutospin(delayMs?: number): void;
    spinWheelInternal(recordSession?: boolean): Promise<void>;
    stopWheelAutospin(): void;
    triggerWheelCelebration?(payload: { label: string; color: string; image?: string; emoji?: string; preview?: boolean }): void;
  };

function queuePendingInventoryIssue(
  context: WheelSpinCommandContext,
  params: {
    slot: WheelSlot;
    slotIndex: number;
    boundLotId: number | null;
    boundSinglesId?: number | null;
    candidateLotIds?: number[];
    requiresLotSelection?: boolean;
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
    selectedLotId: params.requiresLotSelection === true ? null : params.boundLotId,
    spinNumber: context.wheelTotalSpins || 0,
    slotSinglesId: params.boundSinglesId ?? null,
    ...(params.candidateLotIds?.length ? { candidateLotIds: params.candidateLotIds } : {}),
    ...(params.requiresLotSelection === true ? { requiresLotSelection: true } : {})
  });
  assignWheelPendingInventoryIssues(context as unknown as Record<string, unknown>, pendingIssues);
  const issueController = getWheelController(context);
  issueController.wheelInventoryWarning = params.warningText || "";
  context.saveWheelSession();
}

const MOBILE_SPIN_FRAME_INTERVAL_MS = 33;
const DESKTOP_CELEBRATION_FRAME_INTERVAL_MS = 33;
const MOBILE_CELEBRATION_FRAME_INTERVAL_MS = 50;

function isCompactWheelPerformanceMode(context: WheelSpinCommandContext): boolean {
  const viewportWidth = Number(context.wheelViewportWidth || 0);
  const isCompactLayout = context.wheelIsCompactLayout === true || (viewportWidth > 0 && viewportWidth <= 720);
  const navigatorLike = (globalThis as { navigator?: { maxTouchPoints?: number } }).navigator;
  return isCompactLayout || Number(navigatorLike?.maxTouchPoints || 0) > 0;
}

function getSpinFrameIntervalMs(context: WheelSpinCommandContext): number {
  return isCompactWheelPerformanceMode(context) ? MOBILE_SPIN_FRAME_INTERVAL_MS : 0;
}

function shouldPlayWheelSounds(context: WheelSpinCommandContext): boolean {
  return context.wheelSoundEnabled !== false;
}

function getCelebrationFrameIntervalMs(context: WheelSpinCommandContext): number {
  return isCompactWheelPerformanceMode(context)
    ? MOBILE_CELEBRATION_FRAME_INTERVAL_MS
    : DESKTOP_CELEBRATION_FRAME_INTERVAL_MS;
}

function getWheelCenterIcon(context: WheelSpinCommandContext): HTMLElement | null {
  return (context.$refs?.wheelOuter as HTMLElement | null)
    ?.querySelector(".wheel-center-cap__icon") as HTMLElement | null;
}

function setWheelAnimatedAngle(
  context: WheelSpinCommandContext,
  angle: number,
  centerIcon: HTMLElement | null
): void {
  context._wheelAnimationAngle = angle;
  if (centerIcon) {
    centerIcon.style.transform = `rotate(${angle}rad)`;
  }
}

function clearWheelAnimatedAngle(context: WheelSpinCommandContext): void {
  context._wheelAnimationAngle = undefined;
}

export const wheelSpinMethods = {
  drawWheel(this: WheelSpinCommandContext, offset = 0): void {
    const canvasEl = this.$refs?.wheelCanvas as HTMLCanvasElement | null;
    if (!canvasEl) return;
    const ctx = canvasEl.getContext("2d");
    if (!ctx) return;

    const drawController = getWheelController(this);
    const slots = getWheelSpinSlots(this);
    const size = Math.max(20, this.wheelCanvasSize);
    const dpr = getWheelCanvasDpr();

    ensureWheelCanvasSize(canvasEl, size, dpr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;

    ctx.clearRect(0, 0, size, size);

    if (!slots.length) {
      this._wheelStaticRenderCache = undefined;
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

    const highlightedSlotIndex = Number(drawController.wheelHighlightedSlotIndex ?? -1);
    if (highlightedSlotIndex < 0) {
      const staticWheel = getStaticWheelRender(this as unknown as Record<string, unknown>, canvasEl, slots, size, dpr);
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

    const highlightTime = Number(this._wheelHighlightTime ?? 0);

    renderWheelSurface(ctx, slots, size, offset, highlightedSlotIndex, highlightTime);
  },

  async spinWheel(this: WheelSpinCommandContext): Promise<void> {
    await this.spinWheelInternal(true);
  },

  async testSpinWheel(this: WheelSpinCommandContext): Promise<void> {
    await this.spinWheelInternal(false);
  },

  async runWheelAutoPreviewAnimation(this: WheelSpinCommandContext | Record<string, unknown>): Promise<void> {
    const vm = this as WheelSpinCommandContext;
    const slots = getWheelSpinSlots(vm);
    if (vm.wheelSpinning || !slots.length) return;

    const currentAngle = (vm.wheelCurrentAngle || 0) as number;
    const targetIndex = chooseWheelPreviewTargetIndex(slots.length, Math.random());
    const plan = createWheelSpinPlan({
      slotCount: slots.length,
      targetIndex,
      currentAngle,
      extraRotations: resolveWheelPreviewExtraRotations(Math.random()),
      durationMs: resolveWheelPreviewDurationMs(Math.random()),
      startedAt: Date.now()
    });
    if (!plan) return;
    const { endAngle, durationMs: duration, startAngle } = plan;
    const startTime = performance.now();
    const centerIcon = getWheelCenterIcon(vm);
    const spinFrameIntervalMs = getSpinFrameIntervalMs(vm);
    let lastSpinFrameTime = startTime - spinFrameIntervalMs;

    vm.wheelSpinning = true;

    if (typeof requestAnimationFrame !== "function") {
      vm.wheelCurrentAngle = endAngle;
      vm.drawWheel(endAngle);
      vm.wheelSpinning = false;
      vm.scheduleNextWheelAutospin?.();
      return;
    }

    const tick = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const currentOffset = startAngle + (endAngle - startAngle) * easeOutQuart(t);
      const shouldDrawFrame = t >= 1 || spinFrameIntervalMs <= 0 || now - lastSpinFrameTime >= spinFrameIntervalMs;
      if (shouldDrawFrame) {
        lastSpinFrameTime = now;
        setWheelAnimatedAngle(vm, currentOffset, centerIcon);
        vm.drawWheel(currentOffset);
      }

      if (t < 1) {
        requestAnimationFrame(tick);
        return;
      }

      vm.wheelCurrentAngle = endAngle;
      clearWheelAnimatedAngle(vm);
      vm.drawWheel(endAngle);
      vm.wheelSpinning = false;
      if (vm.wheelAutospinEnabled) {
        vm.scheduleNextWheelAutospin?.();
      }
    };

    requestAnimationFrame(tick);
  },

  async spinWheelInternal(this: WheelSpinCommandContext | Record<string, unknown>, recordSession = true): Promise<void> {
    const vm = this as WheelSpinCommandContext;
    const spinController = getWheelController(vm);
    const slots = getWheelSpinSlots(vm);
    const shouldRecordLiveSession = shouldRecordWheelLiveSession(vm, recordSession);
    if (vm.wheelSpinning || !slots.length) return;
    if (shouldRecordLiveSession && vm.wheelSpinBlockedReason) {
      applyWheelSpinBlockedReason(vm, vm.wheelSpinBlockedReason);
      return;
    }

    const fairnessResult = await resolveWheelFairnessSpin(slots.length, slots);

    beginWheelSpin(vm, fairnessResult);

    const targetIndex = fairnessResult.resultIndex;
    const currentAngle = (vm.wheelCurrentAngle || 0) as number;
    const startedAt = Date.now();
    const plan = createWheelSpinPlan({
      slotCount: slots.length,
      targetIndex,
      currentAngle,
      extraRotations: resolveWheelLiveExtraRotations(Math.random()),
      durationMs: resolveWheelLiveDurationMs(Math.random()),
      startedAt,
      spinIdSeed: String(startedAt)
    });
    if (!plan) return;
    const { sliceAngle, endAngle, durationMs: duration, startAngle } = plan;
    const startTime = performance.now();
    vm._gameSpectatorSpinAnimation = plan.spectatorAnimation;
    if (shouldRecordLiveSession) {
      vm.recordSpinResult(targetIndex);
    } else {
      vm.recordPreviewSpinResult(targetIndex);
    }
    vm.saveWheelSession();

    // Pointer wobble: detect when slice dividers cross the pointer position
    let prevBoundaryCount = 0;
    const pointerEl = (vm.$refs?.wheelOuter as HTMLElement | null)
      ?.querySelector(".wheel-pointer") as HTMLElement | null;
    const centerIcon = getWheelCenterIcon(vm);
    const spinFrameIntervalMs = getSpinFrameIntervalMs(vm);
    let lastSpinFrameTime = startTime - spinFrameIntervalMs;
    let spinFrameId: number | undefined;
    let spinCompleted = false;
    let visibilityChangeHandler: (() => void) | undefined;
    const cleanupSpinLoop = () => {
      spinCompleted = true;
      if (visibilityChangeHandler && typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", visibilityChangeHandler);
        visibilityChangeHandler = undefined;
      }
    };
    const scheduleSpinFrame = () => {
      spinFrameId = requestAnimationFrame(tick);
    };

    const tick = async (now: number) => {
      if (spinCompleted) return;
      const t = Math.min((now - startTime) / duration, 1);
      const currentOffset = startAngle + (endAngle - startAngle) * easeOutQuart(t);
      const shouldDrawFrame = t >= 1 || spinFrameIntervalMs <= 0 || now - lastSpinFrameTime >= spinFrameIntervalMs;
      if (shouldDrawFrame) {
        lastSpinFrameTime = now;
        setWheelAnimatedAngle(vm, currentOffset, centerIcon);
        vm.drawWheel(currentOffset);
      }

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
          if (shouldPlayWheelSounds(vm)) {
            playWheelTick(tickVolume);
          }
        }
      }

      if (t < 1) {
        scheduleSpinFrame();
        return;
      }

      cleanupSpinLoop();
      vm.wheelCurrentAngle = endAngle;
      clearWheelAnimatedAngle(vm);
      vm.drawWheel(endAngle);
      vm.wheelSpinning = false;
      pointerEl?.classList.remove("wheel-pointer--tick");
      const config = vm.wheelDisplayConfig || vm.activeWheelConfig;
      const spinNumber = Number(shouldRecordLiveSession
        ? (vm.wheelTotalSpins || 0)
        : (spinController.wheelPreviewTotalSpins || 0));
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
      vm._gameSpectatorSpinAnimation = null;
      finalizeWheelSpinProof(vm, readableFairnessResult);
      vm.appendWheelFairnessHistory(buildWheelSpinFairnessEntry(vm, {
        fairnessResult: readableFairnessResult,
        slots,
        targetIndex,
        shouldRecordLiveSession
      }), { preview: !shouldRecordLiveSession });
      vm.saveWheelSession();
      vm.landOnSlot(targetIndex, { recordSession: shouldRecordLiveSession });
    };

    if (typeof document !== "undefined") {
      visibilityChangeHandler = () => {
        if (document.visibilityState !== "visible" || spinCompleted) return;
        if (spinFrameId != null && typeof cancelAnimationFrame === "function") {
          cancelAnimationFrame(spinFrameId);
          spinFrameId = undefined;
        }
        void tick(performance.now());
      };
      document.addEventListener("visibilitychange", visibilityChangeHandler);
    }

    scheduleSpinFrame();
  },

  recordPreviewSpinResult(this: WheelSpinCommandContext, slotIndex: number): void {
    const controller = getWheelController(this);
    const slots = getWheelSpinSlots(this);
    recordWheelSessionSpin(this, controller, "preview", slotIndex, slots.length);
  },

  recordSpinResult(this: WheelSpinCommandContext, slotIndex: number): void {
    const recordController = getWheelController(this);
    const slots = getWheelSpinSlots(this);
    const slot = slots[slotIndex];
    if (!slot) return;

    recordWheelSessionSpin(this, recordController, "live", slotIndex, slots.length);

    if (!slot.isChase) {
      const config = this.wheelDisplayConfig || this.activeWheelConfig;
      const tier = config?.tiers.find((t) => t.id === slot.tier);
      if (tier && isWheelTierMultiLot(tier)) {
        const candidateLotIds = getWheelTierSourceLotIds(tier)
          .filter((lotId) => {
            const lot = ((this.lots || []) as Lot[]).find((entry) => entry.id === lotId);
            return !isSinglesLot(lot);
          });
        queuePendingInventoryIssue(this, {
          slot,
          slotIndex,
          boundLotId: null,
          candidateLotIds,
          requiresLotSelection: true,
          warningText: `Resolve the pending lot selection for ${slot.name}.`
        });
        return;
      }
      if (tier?.boundLotId) {
        if (slot.deductionType === "none" || (slot.packsCount || 0) <= 0) {
          recordController.wheelInventoryWarning = "";
          this.saveWheelSession();
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
        settleSessionGameOutcomeSale({
          config: config!, tierId: slot.tier, cost: slot.cost,
          packsCount: slot.packsCount, deductionType: slot.deductionType,
          label: slot.name, lotId: tier.boundLotId, lots,
          singlesEntryId: tier.boundSinglesId
        }, this, recordController);
      }
    }
    this.saveWheelSession();
  },

  landOnSlot(this: WheelSpinCommandContext, slotIndex: number, options: { recordSession?: boolean } = {}): void {
    const landController = getWheelController(this);
    const slots = getWheelSpinSlots(this);
    const slot = slots[slotIndex];
    if (!slot) return;
    const recordSession = options.recordSession ?? true;

    // Cancel any existing celebration animation
    const existingHighlightTimeoutId = this._wheelHighlightTimeoutId;
    if (existingHighlightTimeoutId != null) {
      clearTimeout(existingHighlightTimeoutId);
    }
    const hasRAF = typeof requestAnimationFrame === "function";
    const existingAnimationId = this._wheelCelebrationAnimId;
    if (existingAnimationId != null && hasRAF) {
      cancelAnimationFrame(existingAnimationId);
    }

    landController.wheelHighlightedSlotIndex = slotIndex;
    const redraw = this.drawWheel;
    const getAngle = () => this.wheelCurrentAngle || 0;

    // Animated celebration loop — chaser lights + pulsing glow
    const celebrationDuration = 5000;

    if (hasRAF) {
      const celebrationStart = performance.now();
      const celebrationFrameIntervalMs = getCelebrationFrameIntervalMs(this);
      let lastCelebrationFrameTime = celebrationStart - celebrationFrameIntervalMs;
      const celebrateTick = (now: number) => {
        const elapsed = now - celebrationStart;
        if (elapsed >= celebrationDuration) {
          landController.wheelHighlightedSlotIndex = -1;
          this._wheelHighlightTime = 0;
          this._wheelCelebrationAnimId = undefined;
          redraw?.(getAngle());
          return;
        }
        if (now - lastCelebrationFrameTime >= celebrationFrameIntervalMs) {
          lastCelebrationFrameTime = now;
          const t = elapsed / 1000;
          this._wheelHighlightTime = t;
          redraw?.(getAngle());
        }
        this._wheelCelebrationAnimId = requestAnimationFrame(celebrateTick);
      };
      this._wheelCelebrationAnimId = requestAnimationFrame(celebrateTick);
    } else {
      // Fallback for non-browser environments
      redraw?.(getAngle());
      this._wheelHighlightTimeoutId = globalThis.setTimeout(() => {
        landController.wheelHighlightedSlotIndex = -1;
        this._wheelHighlightTimeoutId = undefined;
        redraw?.(getAngle());
      }, celebrationDuration) as unknown as number;
    }

    this.wheelLastResult = "🎉 " + slot.name;
    landController.wheelLastResultColor = slot.color;
    {
      const config = this.wheelDisplayConfig || this.activeWheelConfig;
      const tier = config?.tiers.find((entry) => entry.id === slot.tier);
      const emoji = slot.celebrationEmoji || tier?.celebrationEmoji || undefined;
      const lot = tier?.boundLotId != null
        ? ((this.lots || []) as Lot[]).find((entry) => entry.id === tier.boundLotId)
        : null;
      const image = slot.isChase && tier?.boundSinglesId != null
        ? lot?.singlesPurchases?.find((entry) => entry.id === tier.boundSinglesId)?.image
        : undefined;
      this.triggerWheelCelebration?.({
        label: slot.name,
        color: slot.color,
        image,
        emoji,
        preview: !recordSession
      });
    }

    if (!recordSession) {
      if (slot.isChase) {
        this.stopWheelAutospin?.();
        this.wheelChasePendingTierId = slot.tier;
        this.wheelChaseReplacementSinglesId = null;
        this.wheelChasePreviewMode = true;
        this.wheelChaseDialog = true;
        this.saveWheelSession();
        return;
      }
      this.wheelChaseDialog = false;
      this.wheelChaseReplacementSinglesId = null;
      this.wheelChasePendingTierId = "";
      this.saveWheelSession();
      if (this.wheelAutospinEnabled) {
        this.scheduleNextWheelAutospin?.();
      }
      return;
    }

    if (slot.isChase) {
      this.wheelChasePreviewMode = false;
      this.wheelChasePendingTierId = slot.tier;
      this.wheelChaseReplacementSinglesId = null;
      this.wheelChaseDialog = true;
    }
    this.saveWheelSession();
    void broadcastWheelSession(this);
  }
};


