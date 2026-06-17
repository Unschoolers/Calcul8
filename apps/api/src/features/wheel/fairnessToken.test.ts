import assert from "node:assert/strict";
import { test } from "vitest";
import { createApiConfig } from "../../test-support/function-test-helpers";
import { HttpError } from "../../lib/auth";
import { WHEEL_FAIRNESS_ALGORITHM } from "./fairnessVerifier";
import {
  decryptCommitToken,
  encryptCommitToken,
  generateServerSeed
} from "./fairnessToken";

test("fairness token encrypts and decrypts commit payloads without exposing raw JSON", () => {
  const config = createApiConfig({ cosmosKey: "token-key" });
  const payload = {
    version: "v1" as const,
    algorithm: WHEEL_FAIRNESS_ALGORITHM as "whatfees-wheel-v1",
    serverSeed: "server-seed",
    serverSeedHash: "a".repeat(64),
    layoutHash: "b".repeat(64),
    slotCount: 12,
    committedAt: 100,
    expiresAt: 200
  };

  const token = encryptCommitToken(config, payload);

  assert.match(token, /^v1\./);
  assert.doesNotMatch(token, /server-seed/);
  assert.deepEqual(decryptCommitToken(config, token), payload);
});

test("fairness token rejects malformed commit tokens", () => {
  assert.throws(() => decryptCommitToken(createApiConfig(), "bad-token"), (error: unknown) => (
    error instanceof HttpError
    && error.status === 400
    && error.message === "Field 'commitToken' is invalid."
  ));
});

test("fairness token generates opaque server seeds", () => {
  const seed = generateServerSeed();

  assert.match(seed, /^[0-9a-f]{64}$/);
});
