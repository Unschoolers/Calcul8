import assert from "node:assert/strict";
import { test } from "vitest";
import { HttpError } from "../../lib/auth";
import {
  WHEEL_FAIRNESS_ALGORITHM,
  deriveFairResult,
  hashSeed,
  serializeProofLayout
} from "./fairnessVerifier";

test("fairness verifier exposes stable algorithm hashing and layout serialization", () => {
  assert.equal(WHEEL_FAIRNESS_ALGORITHM, "whatfees-wheel-v1");
  assert.equal(hashSeed("abc123"), "6ca13d52ca70c883e0f0bb101e425a89e8624de51db2d2392593af6a84118090");
  assert.equal(serializeProofLayout([
    { name: "Prize", color: "#f00", tier: "tier-1", isChase: false },
    { name: "Chase", color: "#0f0", tier: "tier-2", isChase: true }
  ]), "[[\"Prize\",\"#f00\",\"tier-1\",0],[\"Chase\",\"#0f0\",\"tier-2\",1]]");
});

test("fairness verifier derives deterministic wheel results", () => {
  assert.deepEqual(deriveFairResult("server-seed", "client-seed", 1), {
    resultIndex: 0,
    proofHash: "9fd0e6082bb1dac7b648ab2b33f43ff76553f7d2f4b6f8c50be418ae4dcdbcb9"
  });

  const fifteenSlotResult = deriveFairResult("server-seed", "client-seed", 15);
  assert.ok(fifteenSlotResult.resultIndex >= 0 && fifteenSlotResult.resultIndex < 15);
  assert.equal(fifteenSlotResult.proofHash.length, 64);
});

test("fairness verifier rejects impossible slot counts at the math boundary", () => {
  assert.throws(() => deriveFairResult("server-seed", "client-seed", 0), (error: unknown) => (
    error instanceof HttpError
    && error.status === 400
    && error.message === "Field 'slotCount' must be at least 1."
  ));
});
