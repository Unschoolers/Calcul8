import type { MysteryGridReveal, WheelConfig, WheelFairnessEntry } from "../../../../types/app.ts";
import {
  buildMysteryGridCellStates,
  createMysteryGridAutoResetPlan,
  createMysteryGridRevealPlan,
  getMysteryGridOutcomeCount,
  pickUnrevealedMysteryGridCellIndex,
  resolveMysteryGridSlotIndex,
  type MysteryGridCellState
} from "../../../../app-core/shared/game-domain.ts";
import { getWheelDisplayConfig } from "../coordinator/gameComputedShared.ts";
import { getWheelController, type GameWindowThis } from "../coordinator/gameControllerState.ts";
import { hashSeed, hashWheelLayoutForFairness } from "../services/wheelFairnessLayout.ts";
import type { WheelSlot } from "../services/wheelSlots.ts";
import { playMysteryGridRevealDing, playMysteryGridShuffleTick } from "../services/wheelAudio.ts";
import {
  applyWheelSpinBlockedReason,
  beginWheelSpin,
  buildWheelSpinFairnessEntry,
  finalizeWheelSpinProof,
  getWheelSpinSlots,
  shouldRecordWheelLiveSession
} from "../services/wheelSpinState.ts";

export type MysteryGridCell = MysteryGridCellState;

type MysteryGridSurfacePreviewController = {
  previewMysteryGridSelection?: (cellIndex: number) => void;
  clearMysteryGridSelectionPreview?: () => void;
};

function getGridReveals(context: Record<string, unknown>, preview: boolean): MysteryGridReveal[] {
  const controller = getWheelController(context);
  return ((preview ? controller.previewGridReveals : controller.gridReveals) || []) as MysteryGridReveal[];
}

function setGridReveals(context: Record<string, unknown>, preview: boolean, reveals: MysteryGridReveal[]): void {
  const controller = getWheelController(context);
  if (preview) {
    controller.previewGridReveals = reveals;
  } else {
    controller.gridReveals = reveals;
  }
}

export function getMysteryGridCellCount(config: WheelConfig | null | undefined): number {
  return getMysteryGridOutcomeCount(config);
}

export function isMysteryGridConfig(config: WheelConfig | null | undefined): boolean {
  return config?.gameType === "grid";
}

export function buildMysteryGridCells(context: Record<string, unknown>): MysteryGridCell[] {
  const config = (context.wheelDisplayConfig as WheelConfig | null) || getWheelDisplayConfig(context);
  const preview = context.wheelMode === "config";
  return buildMysteryGridCellStates({
    cellCount: getMysteryGridCellCount(config),
    reveals: getGridReveals(context, preview)
  });
}

export function pickRandomMysteryGridCellIndex(
  cells: MysteryGridCell[],
  random: () => number = Math.random
): number {
  return pickUnrevealedMysteryGridCellIndex(cells, random);
}

export function resolveMysteryGridCellSlotIndex(cellIndex: number, slots: WheelSlot[]): number {
  return resolveMysteryGridSlotIndex(cellIndex, slots);
}

function waitForMysteryGridAnimationFrame(delayMs: number): Promise<void> {
  if (delayMs <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, Math.max(0, delayMs));
  });
}

function shouldReduceMotion(context?: Record<string, unknown>): boolean {
  return context?.wheelReducedMotion === true
    || typeof window === "undefined"
    || (typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

function shouldPlayWheelSounds(context: Record<string, unknown>): boolean {
  return context.wheelSoundEnabled !== false;
}

function getMysteryGridSurfacePreviewController(context: Record<string, unknown>): MysteryGridSurfacePreviewController | null {
  const refs = (context.$refs || {}) as Record<string, unknown>;
  const controller = refs.mysteryGridSurface as MysteryGridSurfacePreviewController | undefined;
  return controller && typeof controller === "object" ? controller : null;
}

async function playMysteryGridRevealAnimation(context: Record<string, unknown>, cellIndex: number): Promise<void> {
  context.wheelGridRevealAnimating = true;
  context.wheelGridHighlightCellIndex = cellIndex;
  getMysteryGridSurfacePreviewController(context)?.previewMysteryGridSelection?.(cellIndex);
  // Publish the pre-reveal highlight so spectator mode can mirror the selector shake.
  ((context as Record<string, unknown>).publishGameSpectatorSessionSnapshot as (() => Promise<void>) | undefined)?.();
  await waitForMysteryGridAnimationFrame(shouldReduceMotion(context) ? 0 : 620);
}

function scheduleMysteryGridAutoReset(
  context: Record<string, unknown>,
  params: {
    preview: boolean;
    gridCellCount: number;
  }
): void {
  const timerKey = params.preview ? "_wheelPreviewGridAutoResetTimer" : "_wheelGridAutoResetTimer";
  const existingTimer = context[timerKey] as ReturnType<typeof setTimeout> | undefined;
  if (existingTimer) {
    globalThis.clearTimeout(existingTimer);
  }

  const resetPlan = createMysteryGridAutoResetPlan({
    revealedCount: getGridReveals(context, params.preview).length,
    cellCount: params.gridCellCount,
    reducedMotion: shouldReduceMotion(context)
  });
  if (!resetPlan) return;

  context[timerKey] = globalThis.setTimeout(() => {
    const currentReveals = getGridReveals(context, params.preview);
    if (currentReveals.length < params.gridCellCount) return;

    context.wheelGridResetAnimating = true;
    ((context as Record<string, unknown>).publishGameSpectatorSessionSnapshot as (() => Promise<void>) | undefined)?.();

    globalThis.setTimeout(() => {
      const resetSession = params.preview
        ? (context as Record<string, unknown> & { resetPreviewSession?: () => void }).resetPreviewSession
        : (context as Record<string, unknown> & { resetWheelSession?: () => void }).resetWheelSession;
      if (typeof resetSession === "function") {
        resetSession.call(context);
      } else {
        setGridReveals(context, params.preview, []);
        ((context as Record<string, unknown> & { saveWheelSession?: () => void }).saveWheelSession)?.();
      }
      context.wheelGridHighlightCellIndex = -1;
      context.wheelGridRevealAnimating = false;
      context.wheelGridResetAnimating = false;
    }, resetPlan.resetDelayMs);
  }, resetPlan.startDelayMs);
}

function appendGridReveal(
  context: Record<string, unknown>,
  params: {
    preview: boolean;
    cellIndex: number;
    slotIndex: number;
    slots: WheelSlot[];
    spinNumber: number;
  }
): void {
  const slot = params.slots[params.slotIndex];
  if (!slot) return;
  const current = getGridReveals(context, params.preview);
  if (current.some((entry) => entry.cellIndex === params.cellIndex)) return;
  setGridReveals(context, params.preview, [
    ...current,
    {
      cellIndex: params.cellIndex,
      slotIndex: params.slotIndex,
      label: slot.name,
      color: slot.color,
      tier: slot.tier,
      spinNumber: params.spinNumber,
      timestamp: Date.now()
    }
  ]);
}

export const mysteryGridMethods = {
  async animateMysteryGridRandomSelection(this: GameWindowThis | Record<string, unknown>, targetCellIndex: number): Promise<void> {
    const vm = this as GameWindowThis;
    const context = this as Record<string, unknown>;
    const cells = buildMysteryGridCells(context);
    const unrevealedCells = cells.filter((cell) => !cell.revealed);
    if (!unrevealedCells.length || targetCellIndex < 0) return;
    const reducedMotion = shouldReduceMotion(context);
    const steps = reducedMotion ? [targetCellIndex] : Array.from({ length: 18 }, (_, index) => {
      const progress = index / 17;
      const randomCell = unrevealedCells[Math.floor(Math.random() * unrevealedCells.length)];
      return index === 17 ? targetCellIndex : (randomCell?.index ?? targetCellIndex);
    });
    vm.wheelGridRevealAnimating = true;
    const surfacePreview = getMysteryGridSurfacePreviewController(context);
    try {
      for (let index = 0; index < steps.length; index += 1) {
        const highlightCellIndex = steps[index] ?? targetCellIndex;
        if (surfacePreview?.previewMysteryGridSelection) {
          surfacePreview.previewMysteryGridSelection(highlightCellIndex);
        } else {
          vm.wheelGridHighlightCellIndex = highlightCellIndex;
        }
        const progress = steps.length <= 1 ? 1 : index / (steps.length - 1);
        if (!reducedMotion && shouldPlayWheelSounds(context)) {
          playMysteryGridShuffleTick(progress);
        }
        const delayMs = reducedMotion ? 0 : 32 + Math.round(progress * progress * 58);
        await waitForMysteryGridAnimationFrame(delayMs);
      }
    } finally {
      vm.wheelGridHighlightCellIndex = targetCellIndex;
      vm.wheelGridRevealAnimating = false;
      surfacePreview?.clearMysteryGridSelectionPreview?.();
    }
  },

  async revealMysteryGridRandomCell(this: GameWindowThis | Record<string, unknown>, recordSession = true): Promise<void> {
    const vm = this as GameWindowThis;
    const context = this as Record<string, unknown>;
    const cells = buildMysteryGridCells(context);
    const cellIndex = pickRandomMysteryGridCellIndex(cells);
    if (cellIndex < 0) return Promise.resolve();
    await vm.animateMysteryGridRandomSelection(cellIndex);
    const reveal = vm.revealMysteryGridCell;
    if (typeof reveal === "function") {
      await reveal.call(this, cellIndex, recordSession);
      return;
    }
    await mysteryGridMethods.revealMysteryGridCell.call(this, cellIndex, recordSession);
  },

  async runMysteryGridAutoPreviewAnimation(this: GameWindowThis | Record<string, unknown>): Promise<void> {
    const vm = this as GameWindowThis;
    if (vm.wheelGridRevealAnimating || vm.wheelSpinning) return;
    const cells = buildMysteryGridCells(this as Record<string, unknown>);
    const cellIndex = pickRandomMysteryGridCellIndex(cells);
    if (cellIndex < 0) return;
    await vm.animateMysteryGridRandomSelection(cellIndex);
    if (vm.wheelAutospinEnabled) {
      vm.scheduleNextWheelAutospin?.();
    }
  },

  async revealMysteryGridCell(this: GameWindowThis | Record<string, unknown>, cellIndex: number, recordSession = true): Promise<void> {
    const vm = this as GameWindowThis;
    const context = this as Record<string, unknown>;
    const slots = getWheelSpinSlots(vm);
    const config = vm.wheelDisplayConfig || getWheelDisplayConfig(context);
    const gridCellCount = getMysteryGridCellCount(config);
    const targetCellIndex = Math.floor(Number(cellIndex));
    const shouldRecordLiveSession = shouldRecordWheelLiveSession(vm, recordSession);
    const preview = !shouldRecordLiveSession;

    if (vm.wheelSpinning || vm.wheelGridRevealAnimating || !slots.length) return;
    if (!Number.isFinite(targetCellIndex) || targetCellIndex < 0 || targetCellIndex >= gridCellCount) return;
    if (getGridReveals(context, preview).some((entry) => entry.cellIndex === targetCellIndex)) return;
    if (shouldRecordLiveSession && vm.wheelSpinBlockedReason) {
      applyWheelSpinBlockedReason(vm, vm.wheelSpinBlockedReason);
      return;
    }

    const revealPlan = createMysteryGridRevealPlan(targetCellIndex, slots);
    if (!revealPlan) return;
    const targetIndex = revealPlan.slotIndex;
    const layoutHash = await hashWheelLayoutForFairness(slots);
    const seed = `grid-cell:${targetCellIndex}:${layoutHash}`;
    const fairnessResult = {
      resultIndex: targetIndex,
      hash: await hashSeed(seed),
      seed,
      layoutHash,
      algorithm: "whatfees-grid-v1"
    };

    await playMysteryGridRevealAnimation(context, targetCellIndex);
    beginWheelSpin(vm, fairnessResult);

    if (shouldRecordLiveSession) {
      vm.recordSpinResult(targetIndex);
    } else {
      vm.recordPreviewSpinResult(targetIndex);
    }

    const spinController = getWheelController(vm);
    const spinNumber = Number(shouldRecordLiveSession
      ? (vm.wheelTotalSpins || 0)
      : (spinController.previewTotalSpins || 0));
    appendGridReveal(context, {
      preview,
      cellIndex: targetCellIndex,
      slotIndex: targetIndex,
      slots,
      spinNumber
    });
    if (shouldPlayWheelSounds(context)) {
      playMysteryGridRevealDing();
    }

    finalizeWheelSpinProof(vm, fairnessResult);
    vm.appendWheelFairnessHistory(buildWheelSpinFairnessEntry(vm, {
      fairnessResult,
      slots,
      targetIndex,
      shouldRecordLiveSession
    }), { preview });
    vm.wheelSpinning = false;
    vm.wheelGridHighlightCellIndex = targetCellIndex;
    vm.wheelGridRevealAnimating = false;
    getMysteryGridSurfacePreviewController(context)?.clearMysteryGridSelectionPreview?.();
    vm.saveWheelSession();
    vm.landOnSlot(targetIndex, { recordSession: shouldRecordLiveSession });
    if (getGridReveals(context, preview).length >= gridCellCount) {
      scheduleMysteryGridAutoReset(context, {
        preview,
        gridCellCount
      });
    }
  },

  clearMysteryGridReveals(this: GameWindowThis, options: { preview?: boolean } = {}): void {
    setGridReveals(this as unknown as Record<string, unknown>, options.preview === true, []);
  }
};


