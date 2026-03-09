import assert from "node:assert/strict";
import { beforeEach, test } from "vitest";
import type { HttpRequest } from "@azure/functions";
import {
  checkGlobalRateLimit,
  GLOBAL_RATE_LIMIT_BURST_LIMIT,
  GLOBAL_RATE_LIMIT_BURST_WINDOW_SECONDS,
  GLOBAL_RATE_LIMIT_MINUTE_LIMIT,
  resetRateLimitState
} from "./rateLimit";

function makeRequest(overrides: {
  method?: string;
  ip?: string;
  url?: string;
} = {}): HttpRequest {
  const headers = new Map<string, string>();
  if (overrides.ip) {
    headers.set("x-forwarded-for", overrides.ip);
  }

  return {
    method: overrides.method ?? "GET",
    url: overrides.url ?? "https://example.test/api/sync/pull",
    headers: {
      get(name: string) {
        return headers.get(String(name).toLowerCase()) ?? null;
      }
    }
  } as unknown as HttpRequest;
}

beforeEach(() => {
  resetRateLimitState();
});

test("allows requests until burst limit and blocks next request", () => {
  const request = makeRequest({ ip: "198.51.100.10" });

  for (let index = 0; index < GLOBAL_RATE_LIMIT_BURST_LIMIT; index += 1) {
    const decision = checkGlobalRateLimit(request, index);
    assert.equal(decision.allowed, true);
  }

  const blocked = checkGlobalRateLimit(request, GLOBAL_RATE_LIMIT_BURST_LIMIT + 1);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.limit, GLOBAL_RATE_LIMIT_BURST_LIMIT);
  assert.equal(blocked.windowSeconds, GLOBAL_RATE_LIMIT_BURST_WINDOW_SECONDS);
  assert.ok((blocked.retryAfterSeconds ?? 0) >= 1);
});

test("enforces minute limit across multiple burst windows", () => {
  const request = makeRequest({ ip: "198.51.100.20" });

  let nowMs = 0;
  for (let windowIndex = 0; windowIndex < 4; windowIndex += 1) {
    for (let burstIndex = 0; burstIndex < GLOBAL_RATE_LIMIT_BURST_LIMIT; burstIndex += 1) {
      const decision = checkGlobalRateLimit(request, nowMs);
      assert.equal(decision.allowed, true);
      nowMs += 1;
    }
    nowMs = (windowIndex + 1) * GLOBAL_RATE_LIMIT_BURST_WINDOW_SECONDS * 1000;
  }

  const blocked = checkGlobalRateLimit(request, nowMs + 1);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.limit, GLOBAL_RATE_LIMIT_MINUTE_LIMIT);
  assert.equal(blocked.windowSeconds, 60);
  assert.ok((blocked.retryAfterSeconds ?? 0) >= 1);
});

test("tracks limits independently per client key", () => {
  const requestA = makeRequest({ ip: "198.51.100.31" });
  const requestB = makeRequest({ ip: "198.51.100.32" });

  for (let index = 0; index < GLOBAL_RATE_LIMIT_BURST_LIMIT; index += 1) {
    const decision = checkGlobalRateLimit(requestA, index);
    assert.equal(decision.allowed, true);
  }

  const blockedA = checkGlobalRateLimit(requestA, 100);
  assert.equal(blockedA.allowed, false);

  const allowedB = checkGlobalRateLimit(requestB, 100);
  assert.equal(allowedB.allowed, true);
});

test("skips limiting for OPTIONS preflight requests", () => {
  const request = makeRequest({ method: "OPTIONS", ip: "198.51.100.40" });

  for (let index = 0; index < GLOBAL_RATE_LIMIT_BURST_LIMIT + 5; index += 1) {
    const decision = checkGlobalRateLimit(request, index);
    assert.equal(decision.allowed, true);
  }
});
