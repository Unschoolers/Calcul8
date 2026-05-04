import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "vitest";
import { createHttpRequest } from "../../test-support/function-test-helpers";
import { HttpError } from "../../lib/auth";
import {
  getQueryParam,
  parseClientSeed,
  parseLayoutHash,
  parseLayoutPayload,
  parseProofCreationRequest,
  parseSlotCount,
  requireBodyRecord,
  tryParseLayoutPayload
} from "./fairnessParser";

const layoutTuples: Array<[string, string, string, number]> = [
  ["1 Pack", "#f00", "tier-1", 0],
  ["Chase", "#0f0", "tier-2", 1]
];

function encodeLayout(slots: Array<[string, string, string, number]>): string {
  return Buffer.from(JSON.stringify(slots), "utf8").toString("base64url");
}

function hashLayout(slots: Array<[string, string, string, number]>): string {
  return createHash("sha256").update(JSON.stringify(slots), "utf8").digest("hex");
}

test("fairness parser reads query params from Azure-style query maps and fallback URLs", () => {
  const queryRequest = createHttpRequest({ query: "seed=query-seed" });
  const urlRequest = createHttpRequest({ url: "https://api.example/wheel/fairness/hash?seed=url-seed" });

  assert.equal(getQueryParam(queryRequest as never, "seed"), "query-seed");
  assert.equal(getQueryParam(urlRequest as never, "seed"), "url-seed");
});

test("fairness parser normalizes and validates core fields", () => {
  assert.equal(parseSlotCount("2.9"), 2);
  assert.equal(parseClientSeed("  client-seed  "), "client-seed");
  assert.equal(parseLayoutHash("A".repeat(64)), "a".repeat(64));
  assert.deepEqual(requireBodyRecord({ ok: true }), { ok: true });

  assert.throws(() => parseSlotCount("0"), (error: unknown) => (
    error instanceof HttpError
    && error.status === 400
    && error.message === "Field 'slotCount' must be between 1 and 512."
  ));
  assert.throws(() => parseClientSeed(""), /Field 'clientSeed' is required\./);
  assert.throws(() => parseLayoutHash("bad"), /64 character SHA-256/);
  assert.throws(() => requireBodyRecord([]), /Request body must be a JSON object\./);
});

test("fairness parser accepts raw JSON and base64url layout payloads", () => {
  const rawSlots = parseLayoutPayload(JSON.stringify(layoutTuples), 2, hashLayout(layoutTuples));
  const encodedSlots = parseLayoutPayload(encodeLayout(layoutTuples), 2, hashLayout(layoutTuples));

  assert.deepEqual(rawSlots, [
    { name: "1 Pack", color: "#f00", tier: "tier-1", isChase: false },
    { name: "Chase", color: "#0f0", tier: "tier-2", isChase: true }
  ]);
  assert.deepEqual(encodedSlots, rawSlots);
});

test("fairness parser reports optional layout errors without throwing", () => {
  const result = tryParseLayoutPayload(encodeLayout(layoutTuples), 2, "c".repeat(64));

  assert.deepEqual(result, {
    layoutSlots: null,
    layoutError: "Field 'layout' does not match 'layoutHash'."
  });
});

test("fairness parser builds a normalized stored proof request payload", () => {
  const proof = parseProofCreationRequest({
    serverSeed: " server-seed ",
    clientSeed: "client-seed",
    slotCount: "2",
    layoutHash: hashLayout(layoutTuples),
    layout: encodeLayout(layoutTuples),
    slotLabel: " Chase ",
    wheelName: "Demo Wheel",
    spinNumber: "7"
  });

  assert.deepEqual(proof, {
    serverSeed: "server-seed",
    clientSeed: "client-seed",
    slotCount: 2,
    layoutHash: hashLayout(layoutTuples),
    layoutSlots: [
      { name: "1 Pack", color: "#f00", tier: "tier-1", isChase: false },
      { name: "Chase", color: "#0f0", tier: "tier-2", isChase: true }
    ],
    slotLabel: "Chase",
    wheelName: "Demo Wheel",
    spinNumber: 7
  });
});
