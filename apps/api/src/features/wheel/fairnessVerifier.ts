import { createHash } from "node:crypto";
import { HttpError } from "../../lib/auth";
import type { WheelFairnessProofLayoutSlot } from "../../types";

export const WHEEL_FAIRNESS_ALGORITHM = "whatfees-wheel-v1";
export const WHEEL_FAIRNESS_MAX_SLOT_COUNT = 512;
export const WHEEL_FAIRNESS_COMMIT_TTL_MS = 15 * 60 * 1000;

export function hashSeed(seed: string): string {
  return createHash("sha256").update(seed, "utf8").digest("hex");
}

export function serializeProofLayout(slots: WheelFairnessProofLayoutSlot[]): string {
  return JSON.stringify(slots.map((slot) => ([
    slot.name,
    slot.color,
    slot.tier,
    slot.isChase ? 1 : 0
  ])));
}

export function deriveFairResult(serverSeed: string, clientSeed: string, slotCount: number): {
  resultIndex: number;
  proofHash: string;
} {
  if (slotCount < 1) {
    throw new HttpError(400, "Field 'slotCount' must be at least 1.");
  }

  const limit = Math.floor(0x1_0000_0000 / slotCount) * slotCount;

  for (let counter = 0; counter < 128; counter += 1) {
    const proofHash = createHash("sha256")
      .update(`${WHEEL_FAIRNESS_ALGORITHM}:${serverSeed}:${clientSeed}:${counter}`, "utf8")
      .digest("hex");
    const value = parseInt(proofHash.slice(0, 8), 16);
    if (value < limit) {
      return {
        resultIndex: value % slotCount,
        proofHash
      };
    }
  }

  throw new HttpError(500, "Failed to derive a wheel fairness result.");
}
