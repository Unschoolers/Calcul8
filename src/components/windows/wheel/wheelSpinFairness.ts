import { createWheelFairnessCommit, revealWheelFairnessResult } from "../../../app-core/methods/wheel-fairness-api.ts";
import {
  generateCryptoSeed,
  hashSeed,
  seedToIndex
} from "./wheelHelpers.ts";
import type { WheelFairnessResult } from "./wheelSpinState.ts";

export async function resolveWheelFairnessSpin(
  slotCount: number
): Promise<WheelFairnessResult> {
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
