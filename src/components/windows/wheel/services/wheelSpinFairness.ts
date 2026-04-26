import { createWheelFairnessCommit, revealWheelFairnessResult } from "../../../../app-core/methods/wheel-fairness-api.ts";
import type { WheelSlot } from "./wheelHelpers.ts";
import {
    generateCryptoSeed,
    hashSeed,
    hashWheelLayoutForFairness,
    seedToIndex
} from "./wheelFairnessLayout.ts";
import type { WheelFairnessResult } from "./wheelSpinState.ts";

export async function resolveWheelFairnessSpin(
  slotCount: number,
  slots: WheelSlot[]
): Promise<WheelFairnessResult> {
  const buildLocalFallback = async () => {
    const localSeed = generateCryptoSeed();
    const layoutHash = await hashWheelLayoutForFairness(slots);
    return {
      resultIndex: seedToIndex(localSeed, slotCount),
      hash: await hashSeed(localSeed),
      seed: localSeed,
      layoutHash
    };
  };

  const clientSeed = generateCryptoSeed();
  const layoutHash = await hashWheelLayoutForFairness(slots);
  let commit = null;
  try {
    commit = await createWheelFairnessCommit(slotCount, layoutHash);
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
  if (reveal.layoutHash !== layoutHash) {
    throw new Error("Wheel fairness layout hash mismatch.");
  }

  return {
    resultIndex: reveal.resultIndex,
    hash: reveal.serverSeedHash,
    seed: reveal.serverSeed,
    clientSeed: reveal.clientSeed,
    layoutHash: reveal.layoutHash,
    verificationUrl: reveal.verificationUrl,
    algorithm: reveal.algorithm
  };
}
