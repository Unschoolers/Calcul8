import assert from "node:assert/strict";
import { test } from "vitest";
import { createHttpRequest } from "../../test-support/function-test-helpers";
import {
  buildStoredProofVerificationUrl,
  buildVerificationJsonUrl,
  buildVerificationUrl
} from "./fairnessUrls";

test("fairness URLs preserve Azure route prefixes and localhost /api fallback", () => {
  const revealRequest = createHttpRequest({
    url: "http://localhost:7071/wheel/fairness/reveal"
  });
  const verificationUrl = buildVerificationUrl(
    revealRequest as never,
    "server-seed",
    "client-seed",
    5,
    "a".repeat(64)
  );

  assert.match(verificationUrl, /^http:\/\/localhost:7071\/api\/wheel\/fairness\/verify\?/);
  assert.match(verificationUrl, /serverSeed=server-seed/);
  assert.match(verificationUrl, /layoutHash=aaaaaaaa/);

  const jsonUrl = buildVerificationJsonUrl(revealRequest as never, "server-seed", "client-seed", 5, null);
  assert.match(jsonUrl, /format=json/);
});

test("fairness URLs build short stored proof links without embedding layouts", () => {
  const proofRequest = createHttpRequest({
    url: "https://api.example/api/wheel/fairness/proof"
  });

  assert.equal(
    buildStoredProofVerificationUrl(proofRequest as never, "proof-123", "html"),
    "https://api.example/api/wheel/fairness/verify?proofId=proof-123&format=html"
  );
  assert.equal(
    buildStoredProofVerificationUrl(proofRequest as never, "proof-123", "json"),
    "https://api.example/api/wheel/fairness/verify?proofId=proof-123&format=json"
  );
});
