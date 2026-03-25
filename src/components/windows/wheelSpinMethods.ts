import { broadcastWheelSession } from "../../app-core/methods/ui/wheel-broadcast.ts";
import type { Lot, Sale, SkippedWheelDeduction, WheelConfig } from "../../types/app.ts";
import {
    createWheelSale,
    easeOutQuart,
    generateCryptoSeed,
    hashSeed,
    seedToIndex,
    type WheelSlot
} from "./wheelHelpers.ts";

export const wheelSpinMethods = {
  drawWheel(this: Record<string, unknown>, offset = 0): void {
    const canvasEl = (this.$refs as Record<string, unknown>).wheelCanvas as HTMLCanvasElement | null;
    if (!canvasEl) return;
    const ctx = canvasEl.getContext("2d");
    if (!ctx) return;

    const slots = (this as Record<string, unknown>).activeWheelSlots as WheelSlot[];
    const size = Math.max(20, (this as Record<string, unknown>).wheelCanvasSize as number);
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 10;

    ctx.clearRect(0, 0, size, size);

    if (!slots.length) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, 2 * Math.PI);
      ctx.fillStyle = "#1e2540";
      ctx.fill();
      ctx.fillStyle = "#5a6080";
      ctx.font = "16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Configure & Apply", cx, cy);
      return;
    }

    const sliceAngle = (2 * Math.PI) / slots.length;

    slots.forEach((slot, i) => {
      const startAngle = offset + i * sliceAngle;
      const endAngle = startAngle + sliceAngle;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = slot.color;
      ctx.fill();
      ctx.strokeStyle = "#0a0c10";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(startAngle + sliceAngle / 2);
      ctx.textAlign = "right";
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
  },

  async spinWheel(this: Record<string, unknown>): Promise<void> {
    const vm = this as Record<string, unknown> & {
      drawWheel: (offset: number) => void;
      landOnSlot: (index: number) => void;
      recordSpinResult: (index: number) => void;
    };
    const slots = vm.activeWheelSlots as WheelSlot[];
    if (vm.wheelSpinning || !slots.length) return;

    // Provably-fair: generate seed, hash it, show hash before spinning
    const seed = generateCryptoSeed();
    const hash = await hashSeed(seed);
    (vm as Record<string, unknown>).wheelSpinSeed = "";
    (vm as Record<string, unknown>).wheelSpinHash = hash;
    (vm as Record<string, unknown>).wheelShowSeed = false;

    vm.wheelSpinning = true;
    vm.wheelLastResult = "Spinning…";
    (vm as Record<string, unknown>).wheelLastResultColor = "rgb(var(--v-theme-primary))";

    const sliceAngle = (2 * Math.PI) / slots.length;
    const targetIndex = seedToIndex(seed, slots.length);
    vm.recordSpinResult(targetIndex);
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
      (vm as Record<string, unknown>).wheelSpinSeed = seed;
      (vm as Record<string, unknown>).wheelShowSeed = true;
      vm.landOnSlot(targetIndex);
    };

    requestAnimationFrame(tick);
  },

  recordSpinResult(this: Record<string, unknown>, slotIndex: number): void {
    const slots = (this as Record<string, unknown>).activeWheelSlots as WheelSlot[];
    const slot = slots[slotIndex];
    if (!slot) return;

    const counts = (this.wheelSpinCounts || []) as number[];
    counts[slotIndex] = (counts[slotIndex] || 0) + 1;
    this.wheelSpinCounts = [...counts];
    this.wheelTotalSpins = ((this.wheelTotalSpins as number) || 0) + 1;

    if (!slot.isChase) {
      const config = (this as Record<string, unknown>).activeWheelConfig as WheelConfig | null;
      const tier = config?.tiers.find((t) => t.id === slot.tier);
      if (tier?.boundLotId) {
        const lots = (this.lots || []) as Lot[];
        if (slot.deductionType === "singles" && tier.boundSinglesId) {
          const lot = lots.find((l) => l.id === tier.boundLotId);
          const entry = lot?.singlesPurchases?.find((e) => e.id === tier.boundSinglesId);
          if ((entry?.quantity ?? 0) <= 0) {
            const skipped = (this.wheelSkippedDeductions || []) as SkippedWheelDeduction[];
            skipped.push({
              slotName: slot.name,
              slotColor: slot.color,
              slotCost: slot.cost,
              slotTier: slot.tier,
              slotPacksCount: slot.packsCount,
              slotDeductionType: slot.deductionType,
              slotIndex,
              selectedLotId: tier.boundLotId,
              spinNumber: (this.wheelTotalSpins as number) || 0,
              slotSinglesId: tier.boundSinglesId ?? null
            });
            this.wheelSkippedDeductions = [...skipped];
            (this as Record<string, unknown> & { saveWheelSession: () => void }).saveWheelSession();
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
      }
    }
    (this as Record<string, unknown> & { saveWheelSession: () => void }).saveWheelSession();
  },

  landOnSlot(this: Record<string, unknown>, slotIndex: number): void {
    const slots = (this as Record<string, unknown>).activeWheelSlots as WheelSlot[];
    const slot = slots[slotIndex];
    if (!slot) return;

    this.wheelLastResult = "🎉 " + slot.name;
    (this as Record<string, unknown>).wheelLastResultColor = slot.color;

    if (slot.isChase) {
      (this as Record<string, unknown>).wheelChasePendingTierId = slot.tier;
      (this as Record<string, unknown>).wheelChaseReplacementSinglesId = null;
      (this as Record<string, unknown>).wheelChaseDialog = true;
    }
    (this as Record<string, unknown> & { saveWheelSession: () => void }).saveWheelSession();
    void broadcastWheelSession(this as Parameters<typeof broadcastWheelSession>[0]);
  }
};
