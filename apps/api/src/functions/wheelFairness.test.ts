import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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

const { createWheelFairnessProofMock, getWheelFairnessProofMock } = vi.hoisted(() => ({
  createWheelFairnessProofMock: vi.fn(),
  getWheelFairnessProofMock: vi.fn()
}));

vi.mock("../lib/config", () => ({
  getConfig: getConfigMock
}));

vi.mock("../lib/cosmos/wheelFairnessProofRepository", () => ({
  createWheelFairnessProof: createWheelFairnessProofMock,
  getWheelFairnessProof: getWheelFairnessProofMock
}));

import {
    wheelFairnessCommit,
    wheelFairnessHash,
    wheelFairnessProof,
    wheelFairnessReveal,
    wheelFairnessVerify
} from "./wheelFairness";

function encodeProofLayout(slots: Array<[string, string, string, number]>): string {
  return Buffer.from(JSON.stringify(slots), "utf8").toString("base64url");
}

function hashProofLayout(slots: Array<[string, string, string, number]>): string {
  return createHash("sha256").update(JSON.stringify(slots), "utf8").digest("hex");
}

beforeEach(() => {
  vi.clearAllMocks();
  getConfigMock.mockReturnValue(createApiConfig());
  createWheelFairnessProofMock.mockResolvedValue({
    id: "wheel_fairness_proof:proof-123",
    docType: "wheel_fairness_proof",
    proofId: "proof-123",
    createdAt: "2026-04-18T00:00:00.000Z",
    serverSeed: "server-seed-proof",
    clientSeed: "client-seed-proof",
    slotCount: 2,
    layoutHash: null,
    layoutSlots: [
      { name: "1 Pack", color: "#f00", tier: "tier-1", isChase: false },
      { name: "Chase", color: "#0f0", tier: "tier-2", isChase: true }
    ],
    slotLabel: "1 Pack",
    wheelName: "Demo Wheel",
    spinNumber: 9
  });
  getWheelFairnessProofMock.mockResolvedValue({
    id: "wheel_fairness_proof:proof-123",
    docType: "wheel_fairness_proof",
    proofId: "proof-123",
    createdAt: "2026-04-18T00:00:00.000Z",
    serverSeed: "server-seed-proof",
    clientSeed: "client-seed-proof",
    slotCount: 2,
    layoutHash: null,
    layoutSlots: [
      { name: "1 Pack", color: "#f00", tier: "tier-1", isChase: false },
      { name: "Chase", color: "#0f0", tier: "tier-2", isChase: true }
    ],
    slotLabel: "1 Pack",
    wheelName: "Demo Wheel",
    spinNumber: 9
  });
});

test("wheelFairnessCommit creates an opaque commit and wheelFairnessReveal resolves it deterministically", async () => {
  const layoutSlots: Array<[string, string, string, number]> = [
    ["1 Pack", "#f00", "tier-1", 0],
    ["Chase", "#0f0", "tier-2", 1],
    ["2 Pack", "#00f", "tier-3", 0],
    ["3 Pack", "#ff0", "tier-4", 0],
    ["4 Pack", "#0ff", "tier-5", 0],
    ["5 Pack", "#f0f", "tier-6", 0],
    ["6 Pack", "#aaa", "tier-7", 0],
    ["7 Pack", "#bbb", "tier-8", 0],
    ["8 Pack", "#ccc", "tier-9", 0],
    ["9 Pack", "#ddd", "tier-10", 0],
    ["10 Pack", "#eee", "tier-11", 0],
    ["11 Pack", "#123", "tier-12", 0],
    ["12 Pack", "#234", "tier-13", 0],
    ["13 Pack", "#345", "tier-14", 0],
    ["14 Pack", "#456", "tier-15", 0]
  ];
  const layoutHash = hashProofLayout(layoutSlots);
  const layout = encodeProofLayout(layoutSlots);
  const commitResponse = await wheelFairnessCommit(createHttpRequest({
    method: "POST",
    body: {
      slotCount: 15,
      layoutHash
    }
  }) as never);

  assert.equal(commitResponse.status, 200);
  const commitBody = commitResponse.jsonBody as {
    commitToken: string;
    serverSeedHash: string;
    layoutHash: string;
    slotCount: number;
    algorithm: string;
    committedAt: number;
    expiresAt: number;
  };
  assert.equal(commitBody.slotCount, 15);
  assert.equal(commitBody.algorithm, "whatfees-wheel-v1");
  assert.equal(commitBody.layoutHash, layoutHash);
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
    layoutHash: string;
    resultIndex: number;
    slotCount: number;
    algorithm: string;
    verificationUrl: string;
  };

  assert.equal(revealBody.serverSeedHash, commitBody.serverSeedHash);
  assert.equal(revealBody.clientSeed, "client-seed-123");
  assert.equal(revealBody.layoutHash, layoutHash);
  assert.equal(revealBody.slotCount, 15);
  assert.equal(revealBody.algorithm, "whatfees-wheel-v1");
  assert.ok(revealBody.resultIndex >= 0 && revealBody.resultIndex < 15);
  assert.match(revealBody.verificationUrl, /wheel\/fairness\/verify/);
  assert.match(revealBody.verificationUrl, /layoutHash=/);

  const verifyResponse = await wheelFairnessVerify(createHttpRequest({
    method: "GET",
    query: `serverSeed=${encodeURIComponent(revealBody.serverSeed)}&clientSeed=${encodeURIComponent(revealBody.clientSeed)}&slotCount=15&layoutHash=${layoutHash}&layout=${encodeURIComponent(layout)}&slotLabel=${encodeURIComponent("1 Pack")}&wheelName=${encodeURIComponent("Demo Wheel")}&spinNumber=7`
  }) as never);

  assert.equal(verifyResponse.status, 200);
  const verifyBody = verifyResponse.jsonBody as {
    serverSeedHash: string;
    layoutHash: string | null;
    layoutSlots: Array<{ name: string; color: string; tier: string; isChase: boolean }> | null;
    layoutError: string | null;
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
  assert.equal(verifyBody.layoutHash, layoutHash);
  assert.equal(verifyBody.layoutSlots?.length, 15);
  assert.equal(verifyBody.layoutError, null);
  assert.deepEqual(verifyBody.layoutSlots?.[0], {
    name: "1 Pack",
    color: "#f00",
    tier: "tier-1",
    isChase: false
  });
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
      slotCount: 20,
      layoutHash: "a".repeat(64)
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
  const layoutSlots: Array<[string, string, string, number]> = [
    ["1 Pack", "#f00", "tier-1", 0],
    ["Chase", "#0f0", "tier-2", 1],
    ["Bonus", "#00f", "tier-3", 0],
    ["Fourth", "#ff0", "tier-4", 0],
    ["Fifth", "#0ff", "tier-5", 0],
    ["Sixth", "#f0f", "tier-6", 0],
    ["Seventh", "#aaa", "tier-7", 0],
    ["Eighth", "#bbb", "tier-8", 0],
    ["Ninth", "#ccc", "tier-9", 0],
    ["Tenth", "#ddd", "tier-10", 0],
    ["Eleventh", "#eee", "tier-11", 0],
    ["Twelfth", "#123", "tier-12", 0],
    ["Thirteenth", "#234", "tier-13", 0],
    ["Fourteenth", "#345", "tier-14", 0],
    ["Fifteenth", "#456", "tier-15", 0]
  ];
  const layoutHash = hashProofLayout(layoutSlots);
  const layout = encodeProofLayout(layoutSlots);
  const commitResponse = await wheelFairnessCommit(createHttpRequest({
    method: "POST",
    body: {
      slotCount: 15,
      layoutHash
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
    query: `serverSeed=${encodeURIComponent(revealBody.serverSeed)}&clientSeed=${encodeURIComponent(revealBody.clientSeed)}&slotCount=15&layoutHash=${layoutHash}&layout=${encodeURIComponent(layout)}&slotLabel=${encodeURIComponent("1 Pack")}&wheelName=${encodeURIComponent("Demo Wheel")}&spinNumber=7&format=html`
  }) as never);

  assert.equal(verifyResponse.status, 200);
  assert.equal((verifyResponse.headers as Record<string, string>)["Content-Type"], "text/html; charset=utf-8");
  assert.match(String(verifyResponse.body || ""), /Demo Wheel/);
  assert.match(String(verifyResponse.body || ""), /1 Pack/);
  assert.match(String(verifyResponse.body || ""), /Spin #7/);
  assert.match(String(verifyResponse.body || ""), /server seed/i);
  assert.match(String(verifyResponse.body || ""), /layout hash/i);
  assert.match(String(verifyResponse.body || ""), /Exact wheel order used for this spin/);
  assert.match(String(verifyResponse.body || ""), /Chase/);
});

test("wheelFairnessProof creates a short proof-id URL that renders the exact wheel order", async () => {
  const proofResponse = await wheelFairnessProof(createHttpRequest({
    method: "POST",
    url: "http://localhost:7071/api/wheel/fairness/proof",
    body: {
      serverSeed: "server-seed-proof",
      clientSeed: "client-seed-proof",
      slotCount: 2,
      layoutHash: null,
      layout: JSON.stringify([
        ["1 Pack", "#f00", "tier-1", 0],
        ["Chase", "#0f0", "tier-2", 1]
      ]),
      slotLabel: "1 Pack",
      wheelName: "Demo Wheel",
      spinNumber: 9
    }
  }) as never);

  assert.equal(proofResponse.status, 200);
  const proofBody = proofResponse.jsonBody as {
    verificationUrl: string;
    jsonUrl: string;
  };
  assert.match(proofBody.verificationUrl, /^http:\/\/localhost:7071\/api\/wheel\/fairness\/verify\?proofId=proof-123/);
  assert.match(proofBody.jsonUrl, /^http:\/\/localhost:7071\/api\/wheel\/fairness\/verify\?proofId=proof-123/);

  const verifyResponse = await wheelFairnessVerify(createHttpRequest({
    method: "GET",
    url: proofBody.verificationUrl
  }) as never);

  assert.equal(verifyResponse.status, 200);
  assert.equal((verifyResponse.headers as Record<string, string>)["Content-Type"], "text/html; charset=utf-8");
  assert.match(String(verifyResponse.body || ""), /Exact wheel order used for this spin/);
  assert.match(String(verifyResponse.body || ""), /Chase/);
  assert.doesNotMatch(proofBody.verificationUrl, /layout=/);
  assert.equal(createWheelFairnessProofMock.mock.calls.length, 1);
  assert.equal(getWheelFairnessProofMock.mock.calls.length, 1);
});

test("wheelFairnessVerify reports layout payload mismatches without failing the proof", async () => {
  const response = await wheelFairnessVerify(createHttpRequest({
    method: "GET",
    query: `serverSeed=server-seed&clientSeed=client-seed&slotCount=1&layoutHash=${"c".repeat(64)}&layout=${encodeURIComponent(encodeProofLayout([["Prize", "#f00", "tier-1", 0]]))}`
  }) as never);

  assert.equal(response.status, 200);
  assert.deepEqual(response.jsonBody, {
    serverSeedHash: "91024ec49c5bec0b689e42892526320fce08337205c91de94c7a588c20d08eeb",
    layoutHash: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    layoutSlots: null,
    layoutError: "Field 'layout' does not match 'layoutHash'.",
    clientSeed: "client-seed",
    slotCount: 1,
    algorithm: "whatfees-wheel-v1",
    resultIndex: 0,
    resultSlotNumber: 1,
    slotLabel: null,
    wheelName: null,
    spinNumber: null,
    summaryTitle: "Wheel fairness verified",
    summary: "Verified fair result: slot 1 of 1.",
    proofHash: "9fd0e6082bb1dac7b648ab2b33f43ff76553f7d2f4b6f8c50be418ae4dcdbcb9"
  });
});

test("wheelFairnessVerify accepts raw JSON layout payloads", async () => {
  const response = await wheelFairnessVerify(createHttpRequest({
    method: "GET",
    query: `serverSeed=server-seed&clientSeed=client-seed&slotCount=1&layout=${encodeURIComponent(JSON.stringify([["Prize", "#f00", "tier-1", 0]]))}`
  }) as never);

  assert.equal(response.status, 200);
  const body = response.jsonBody as {
    layoutSlots: Array<{ name: string; color: string; tier: string; isChase: boolean }> | null;
    layoutError: string | null;
  };
  assert.equal(body.layoutError, null);
  assert.deepEqual(body.layoutSlots, [{
    name: "Prize",
    color: "#f00",
    tier: "tier-1",
    isChase: false
  }]);
});

test("wheelFairnessVerify keeps the proof page available when the layout payload is truncated", async () => {
  const response = await wheelFairnessVerify(createHttpRequest({
    method: "GET",
    query: `serverSeed=server-seed&clientSeed=client-seed&slotCount=1&layoutHash=${"c".repeat(64)}&format=html&layout=W1siUHJpemUiLCIjZjAwIiwidGllci0xIiw`
  }) as never);

  assert.equal(response.status, 200);
  assert.equal((response.headers as Record<string, string>)["Content-Type"], "text/html; charset=utf-8");
  assert.match(String(response.body || ""), /Exact wheel order could not be shown/);
  assert.match(String(response.body || ""), /Field &#39;layout&#39; is invalid\.|Field 'layout' is invalid\./);
});

test("wheelFairnessCommit rejects missing layout hashes", async () => {
  const response = await wheelFairnessCommit(createHttpRequest({
    method: "POST",
    body: {
      slotCount: 15
    }
  }) as never);

  assert.equal(response.status, 400);
  assert.equal((response.jsonBody as { error: string }).error, "Field 'layoutHash' must be a 64 character SHA-256 hex string.");
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
