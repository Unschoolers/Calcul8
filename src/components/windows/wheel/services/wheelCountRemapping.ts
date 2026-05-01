import type { WheelSlot } from "./wheelSlots.ts";

export function remapSpinCountsByTier(oldTierIds: string[], oldCounts: number[], newSlots: WheelSlot[]): number[] {
  const totalByTier: Record<string, number> = {};
  const limit = Math.min(oldTierIds.length, oldCounts.length);
  for (let index = 0; index < limit; index += 1) {
    const tierId = oldTierIds[index];
    if (!tierId) continue;
    totalByTier[tierId] = (totalByTier[tierId] || 0) + (oldCounts[index] || 0);
  }

  const slotCountByTier: Record<string, number> = {};
  for (const slot of newSlots) {
    slotCountByTier[slot.tier] = (slotCountByTier[slot.tier] || 0) + 1;
  }

  const seenByTier: Record<string, number> = {};
  return newSlots.map((slot) => {
    const total = totalByTier[slot.tier] || 0;
    const totalSlots = slotCountByTier[slot.tier] || 1;
    const seen = seenByTier[slot.tier] || 0;
    seenByTier[slot.tier] = seen + 1;
    if (!total) return 0;
    const base = Math.floor(total / totalSlots);
    const remainder = total % totalSlots;
    return base + (seen < remainder ? 1 : 0);
  });
}
