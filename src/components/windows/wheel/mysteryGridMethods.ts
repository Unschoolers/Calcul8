import type { MysteryGridReveal, WheelConfig, WheelFairnessEntry } from "../../../types/app.ts";
import { getWheelOutcomeCount } from "../../../app-core/shared/wheel-odds.ts";
import { getWheelDisplayConfig } from "./wheelComputedShared.ts";
import { getWheelController, type WheelWindowThis } from "./wheelControllerState.ts";
import { hashSeed, hashWheelLayoutForFairness, type WheelSlot } from "./wheelHelpers.ts";
import { playMysteryGridRevealDing, playMysteryGridShuffleTick } from "./wheelAudio.ts";
import {
  applyWheelSpinBlockedReason,
  beginWheelSpin,
  buildWheelSpinFairnessEntry,
  finalizeWheelSpinProof,
  getWheelSpinSlots,
  shouldRecordWheelLiveSession
} from "./wheelSpinState.ts";

export type MysteryGridCell = {
  index: number;
  label: string;
  color: string;
  revealed: boolean;
  reveal: MysteryGridReveal | null;
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
  return getWheelOutcomeCount(config);
}

export function isMysteryGridConfig(config: WheelConfig | null | undefined): boolean {
  return config?.gameType === "grid";
}

export function buildMysteryGridCells(context: Record<string, unknown>): MysteryGridCell[] {
  const config = (context.wheelDisplayConfig as WheelConfig | null) || getWheelDisplayConfig(context);
  const preview = context.wheelMode === "config";
  const revealsByCell = new Map(getGridReveals(context, preview).map((entry) => [entry.cellIndex, entry]));
  return Array.from({ length: getMysteryGridCellCount(config) }, (_, index) => {
    const reveal = revealsByCell.get(index) ?? null;
    return {
      index,
      label: reveal?.label || "",
      color: reveal?.color || "rgb(var(--v-theme-primary))",
      revealed: reveal != null,
      reveal
    };
  });
}

export function pickRandomMysteryGridCellIndex(
  cells: MysteryGridCell[],
  random: () => number = Math.random
): number {
  const unrevealedCells = cells.filter((cell) => !cell.revealed);
  if (!unrevealedCells.length) return -1;
  const randomIndex = Math.min(
    unrevealedCells.length - 1,
    Math.max(0, Math.floor(random() * unrevealedCells.length))
  );
  return unrevealedCells[randomIndex]?.index ?? -1;
}

export function resolveMysteryGridCellSlotIndex(cellIndex: number, slots: WheelSlot[]): number {
  const normalizedCellIndex = Math.floor(Number(cellIndex));
  if (!Number.isFinite(normalizedCellIndex) || normalizedCellIndex < 0) return -1;
  return normalizedCellIndex < slots.length ? normalizedCellIndex : -1;
}

function waitForMysteryGridAnimationFrame(delayMs: number): Promise<void> {
  if (delayMs <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, Math.max(0, delayMs));
  });
}

function shouldReduceMotion(): boolean {
  return typeof window === "undefined"
    || (typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

async function playMysteryGridRevealAnimation(context: Record<string, unknown>, cellIndex: number): Promise<void> {
  context.wheelGridRevealAnimating = true;
  context.wheelGridHighlightCellIndex = cellIndex;
  // Publish the pre-reveal highlight so spectator mode can mirror the selector shake.
  ((context as Record<string, unknown>).publishWheelSpectatorSessionSnapshot as (() => Promise<void>) | undefined)?.();
  await waitForMysteryGridAnimationFrame(shouldReduceMotion() ? 0 : 620);
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

  const delayMs = shouldReduceMotion() ? 0 : 1800;
  context[timerKey] = globalThis.setTimeout(() => {
    const currentReveals = getGridReveals(context, params.preview);
    if (currentReveals.length < params.gridCellCount) return;

    context.wheelGridResetAnimating = true;
    ((context as Record<string, unknown>).publishWheelSpectatorSessionSnapshot as (() => Promise<void>) | undefined)?.();

    globalThis.setTimeout(() => {
      setGridReveals(context, params.preview, []);
      context.wheelGridHighlightCellIndex = -1;
      context.wheelGridRevealAnimating = false;
      context.wheelGridResetAnimating = false;
      ((context as Record<string, unknown> & { saveWheelSession?: () => void }).saveWheelSession)?.();
    }, shouldReduceMotion() ? 0 : 680);
  }, delayMs);
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
  async animateMysteryGridRandomSelection(this: Record<string, unknown>, targetCellIndex: number): Promise<void> {
    const cells = buildMysteryGridCells(this);
    const unrevealedCells = cells.filter((cell) => !cell.revealed);
    if (!unrevealedCells.length || targetCellIndex < 0) return;
    const reducedMotion = shouldReduceMotion();
    const steps = reducedMotion ? [targetCellIndex] : Array.from({ length: 18 }, (_, index) => {
      const progress = index / 17;
      const randomCell = unrevealedCells[Math.floor(Math.random() * unrevealedCells.length)];
      return index === 17 ? targetCellIndex : (randomCell?.index ?? targetCellIndex);
    });
    this.wheelGridRevealAnimating = true;
    try {
      for (let index = 0; index < steps.length; index += 1) {
        this.wheelGridHighlightCellIndex = steps[index] ?? targetCellIndex;
        const progress = steps.length <= 1 ? 1 : index / (steps.length - 1);
        if (!reducedMotion) {
          playMysteryGridShuffleTick(progress);
        }
        const delayMs = reducedMotion ? 0 : 32 + Math.round(progress * progress * 58);
        await waitForMysteryGridAnimationFrame(delayMs);
      }
    } finally {
      this.wheelGridHighlightCellIndex = targetCellIndex;
      this.wheelGridRevealAnimating = false;
    }
  },

  async revealMysteryGridRandomCell(this: Record<string, unknown>, recordSession = true): Promise<void> {
    const cells = buildMysteryGridCells(this);
    const cellIndex = pickRandomMysteryGridCellIndex(cells);
    if (cellIndex < 0) return Promise.resolve();
    const animate = (this as Record<string, unknown> & {
      animateMysteryGridRandomSelection?: (cellIndex: number) => Promise<void>;
    }).animateMysteryGridRandomSelection;
    if (typeof animate === "function") {
      await animate.call(this, cellIndex);
    } else {
      await mysteryGridMethods.animateMysteryGridRandomSelection.call(this, cellIndex);
    }
    const reveal = (this as Record<string, unknown> & {
      revealMysteryGridCell?: (cellIndex: number, recordSession?: boolean) => Promise<void>;
    }).revealMysteryGridCell;
    if (typeof reveal === "function") {
      await reveal.call(this, cellIndex, recordSession);
      return;
    }
    await mysteryGridMethods.revealMysteryGridCell.call(this, cellIndex, recordSession);
  },

  async runMysteryGridAutoPreviewAnimation(this: Record<string, unknown>): Promise<void> {
    if (this.wheelGridRevealAnimating || this.wheelSpinning) return;
    const cells = buildMysteryGridCells(this);
    const cellIndex = pickRandomMysteryGridCellIndex(cells);
    if (cellIndex < 0) return;
    await mysteryGridMethods.animateMysteryGridRandomSelection.call(this, cellIndex);
    if ((this as Record<string, unknown>).wheelAutospinEnabled) {
      ((this as Record<string, unknown>).scheduleNextWheelAutospin as ((delayMs?: number) => void) | undefined)?.();
    }
  },

  async revealMysteryGridCell(this: Record<string, unknown>, cellIndex: number, recordSession = true): Promise<void> {
    const vm = this as Record<string, unknown> & {
      recordSpinResult: (index: number) => void;
      recordPreviewSpinResult: (index: number) => void;
      appendWheelFairnessHistory: (entry: WheelFairnessEntry, options?: { preview?: boolean }) => void;
      landOnSlot: (index: number, options?: { recordSession?: boolean }) => void;
      saveWheelSession: () => void;
    };
    const slots = getWheelSpinSlots(vm);
    const config = ((vm.wheelDisplayConfig || getWheelDisplayConfig(vm)) as WheelConfig | null);
    const gridCellCount = getMysteryGridCellCount(config);
    const targetCellIndex = Math.floor(Number(cellIndex));
    const shouldRecordLiveSession = shouldRecordWheelLiveSession(vm, recordSession);
    const preview = !shouldRecordLiveSession;

    if (vm.wheelSpinning || vm.wheelGridRevealAnimating || !slots.length) return;
    if (!Number.isFinite(targetCellIndex) || targetCellIndex < 0 || targetCellIndex >= gridCellCount) return;
    if (getGridReveals(vm, preview).some((entry) => entry.cellIndex === targetCellIndex)) return;
    if (shouldRecordLiveSession && (vm.wheelSpinBlockedReason as string)) {
      applyWheelSpinBlockedReason(vm, vm.wheelSpinBlockedReason as string);
      return;
    }

    const targetIndex = resolveMysteryGridCellSlotIndex(targetCellIndex, slots);
    if (targetIndex < 0) return;
    const layoutHash = await hashWheelLayoutForFairness(slots);
    const seed = `grid-cell:${targetCellIndex}:${layoutHash}`;
    const fairnessResult = {
      resultIndex: targetIndex,
      hash: await hashSeed(seed),
      seed,
      layoutHash,
      algorithm: "whatfees-grid-v1"
    };

    await playMysteryGridRevealAnimation(vm, targetCellIndex);
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
    appendGridReveal(vm, {
      preview,
      cellIndex: targetCellIndex,
      slotIndex: targetIndex,
      slots,
      spinNumber
    });
    playMysteryGridRevealDing();

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
    vm.saveWheelSession();
    vm.landOnSlot(targetIndex, { recordSession: shouldRecordLiveSession });
    if (getGridReveals(vm, preview).length >= gridCellCount) {
      scheduleMysteryGridAutoReset(vm, {
        preview,
        gridCellCount
      });
    }
  },

  clearMysteryGridReveals(this: WheelWindowThis, options: { preview?: boolean } = {}): void {
    setGridReveals(this as unknown as Record<string, unknown>, options.preview === true, []);
  }
};
