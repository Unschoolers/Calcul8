import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import {
    createApiConfig,
    createHttpRequest
} from "../test-support/function-test-helpers";

vi.mock("@azure/functions", () => ({
  app: {
    http: vi.fn()
  }
}));

const { getConfigMock } = vi.hoisted(() => ({
  getConfigMock: vi.fn()
}));

vi.mock("../lib/config", () => ({
  getConfig: getConfigMock
}));

import {
    wheelFairnessCommit,
    wheelFairnessHash,
    wheelFairnessReveal,
    wheelFairnessVerify
} from "./wheelFairness";

beforeEach(() => {
  vi.clearAllMocks();
  getConfigMock.mockReturnValue(createApiConfig());
});

test("wheelFairnessCommit creates an opaque commit and wheelFairnessReveal resolves it deterministically", async () => {
  const commitResponse = await wheelFairnessCommit(createHttpRequest({
    method: "POST",
    body: {
      slotCount: 15
    }
  }) as never);

  assert.equal(commitResponse.status, 200);
  const commitBody = commitResponse.jsonBody as {
    commitToken: string;
    serverSeedHash: string;
    slotCount: number;
    algorithm: string;
    committedAt: number;
    expiresAt: number;
  };
  assert.equal(commitBody.slotCount, 15);
  assert.equal(commitBody.algorithm, "whatfees-wheel-v1");
  assert.ok(commitBody.commitToken.startsWith("v1."));
  assert.equal(commitBody.serverSeedHash.length, 64);

  const revealResponse = await wheelFairnessReveal(createHttpRequest({
    method: "POST",
    body: {
      commitToken: commitBody.commitToken,
      clientSeed: "client-seed-123"
    },
    query: ""
  }) as never);

  assert.equal(revealResponse.status, 200);
  const revealBody = revealResponse.jsonBody as {
    serverSeedHash: string;
    serverSeed: string;
    clientSeed: string;
    resultIndex: number;
    slotCount: number;
    algorithm: string;
    verificationUrl: string;
  };

  assert.equal(revealBody.serverSeedHash, commitBody.serverSeedHash);
  assert.equal(revealBody.clientSeed, "client-seed-123");
  assert.equal(revealBody.slotCount, 15);
  assert.equal(revealBody.algorithm, "whatfees-wheel-v1");
  assert.ok(revealBody.resultIndex >= 0 && revealBody.resultIndex < 15);
  assert.match(revealBody.verificationUrl, /wheel\/fairness\/verify/);

  const verifyResponse = await wheelFairnessVerify(createHttpRequest({
    method: "GET",
    query: `serverSeed=${encodeURIComponent(revealBody.serverSeed)}&clientSeed=${encodeURIComponent(revealBody.clientSeed)}&slotCount=15&slotLabel=${encodeURIComponent("1 Pack")}&wheelName=${encodeURIComponent("Demo Wheel")}&spinNumber=7`
  }) as never);

  assert.equal(verifyResponse.status, 200);
  const verifyBody = verifyResponse.jsonBody as {
    serverSeedHash: string;
    resultIndex: number;
    resultSlotNumber: number;
    slotLabel: string | null;
    wheelName: string | null;
    spinNumber: number | null;
    summaryTitle: string;
    summary: string;
    slotCount: number;
    algorithm: string;
    proofHash: string;
  };

  assert.equal(verifyBody.serverSeedHash, revealBody.serverSeedHash);
  assert.equal(verifyBody.resultIndex, revealBody.resultIndex);
  assert.equal(verifyBody.resultSlotNumber, revealBody.resultIndex + 1);
  assert.equal(verifyBody.slotLabel, "1 Pack");
  assert.equal(verifyBody.wheelName, "Demo Wheel");
  assert.equal(verifyBody.spinNumber, 7);
  assert.match(verifyBody.summaryTitle, /Demo Wheel/);
  assert.match(verifyBody.summary, /1 Pack/);
  assert.equal(verifyBody.slotCount, 15);
  assert.equal(verifyBody.algorithm, "whatfees-wheel-v1");
  assert.equal(verifyBody.proofHash.length, 64);
});

test("wheelFairnessReveal builds localhost verification URLs under /api", async () => {
  const commitResponse = await wheelFairnessCommit(createHttpRequest({
    method: "POST",
    body: {
      slotCount: 20
    },
    url: "http://localhost:7071/api/wheel/fairness/commit"
  }) as never);

  const commitBody = commitResponse.jsonBody as { commitToken: string };

  const revealResponse = await wheelFairnessReveal(createHttpRequest({
    method: "POST",
    body: {
      commitToken: commitBody.commitToken,
      clientSeed: "client-seed-456"
    },
    url: "http://localhost:7071/wheel/fairness/reveal"
  }) as never);

  assert.equal(revealResponse.status, 200);
  const revealBody = revealResponse.jsonBody as { verificationUrl: string };
  assert.match(revealBody.verificationUrl, /^http:\/\/localhost:7071\/api\/wheel\/fairness\/verify\?/);
});

test("wheelFairnessVerify renders a human-readable public proof page when format=html", async () => {
  const commitResponse = await wheelFairnessCommit(createHttpRequest({
    method: "POST",
    body: {
      slotCount: 15
    }
  }) as never);
  const commitBody = commitResponse.jsonBody as {
    commitToken: string;
  };

  const revealResponse = await wheelFairnessReveal(createHttpRequest({
    method: "POST",
    body: {
      commitToken: commitBody.commitToken,
      clientSeed: "client-seed-123"
    }
  }) as never);
  const revealBody = revealResponse.jsonBody as {
    serverSeed: string;
    clientSeed: string;
  };

  const verifyResponse = await wheelFairnessVerify(createHttpRequest({
    method: "GET",
    query: `serverSeed=${encodeURIComponent(revealBody.serverSeed)}&clientSeed=${encodeURIComponent(revealBody.clientSeed)}&slotCount=15&slotLabel=${encodeURIComponent("1 Pack")}&wheelName=${encodeURIComponent("Demo Wheel")}&spinNumber=7&format=html`
  }) as never);

  assert.equal(verifyResponse.status, 200);
  assert.equal((verifyResponse.headers as Record<string, string>)["Content-Type"], "text/html; charset=utf-8");
  assert.match(String(verifyResponse.body || ""), /Demo Wheel/);
  assert.match(String(verifyResponse.body || ""), /1 Pack/);
  assert.match(String(verifyResponse.body || ""), /Spin #7/);
  assert.match(String(verifyResponse.body || ""), /server seed/i);
});

test("wheelFairnessHash exposes a public sha256 helper for revealed seeds", async () => {
  const response = await wheelFairnessHash(createHttpRequest({
    method: "GET",
    query: "seed=abc123"
  }) as never);

  assert.equal(response.status, 200);
  assert.deepEqual(response.jsonBody, {
    hash: "6ca13d52ca70c883e0f0bb101e425a89e8624de51db2d2392593af6a84118090",
    algorithm: "sha256"
  });
});

test("wheelFairnessReveal rejects malformed tokens", async () => {
  const response = await wheelFairnessReveal(createHttpRequest({
    method: "POST",
    body: {
      commitToken: "nope",
      clientSeed: "client-seed-123"
    }
  }) as never);

  assert.equal(response.status, 400);
  assert.equal((response.jsonBody as { error: string }).error, "Field 'commitToken' is invalid.");
});
