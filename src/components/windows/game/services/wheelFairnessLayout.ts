import type { GameOutcomeSlot } from "../../../../app-core/shared/game-domain.ts";

type FairnessLayoutSlot = Pick<GameOutcomeSlot, "name" | "color" | "tier" | "isChase">;

export function generateCryptoSeed(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashSeed(seed: string): Promise<string> {
  const encoded = new TextEncoder().encode(seed);
  const buffer = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function serializeWheelLayoutForFairness(slots: FairnessLayoutSlot[]): string {
  return JSON.stringify(slots.map((slot) => ([
    String(slot.name || "").trim(),
    String(slot.color || "").trim().toLowerCase(),
    String(slot.tier || "").trim(),
    slot.isChase === true ? 1 : 0
  ])));
}

export async function hashWheelLayoutForFairness(slots: FairnessLayoutSlot[]): Promise<string> {
  return hashSeed(serializeWheelLayoutForFairness(slots));
}

export function seedToIndex(seed: string, slotCount: number): number {
  const value = parseInt(seed.substring(0, 8), 16);
  return value % slotCount;
}
