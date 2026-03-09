import type { HttpRequest } from "@azure/functions";

export const GLOBAL_RATE_LIMIT_MINUTE_LIMIT = 120;
export const GLOBAL_RATE_LIMIT_BURST_LIMIT = 30;
export const GLOBAL_RATE_LIMIT_MINUTE_WINDOW_SECONDS = 60;
export const GLOBAL_RATE_LIMIT_BURST_WINDOW_SECONDS = 10;

const MINUTE_WINDOW_MS = GLOBAL_RATE_LIMIT_MINUTE_WINDOW_SECONDS * 1000;
const BURST_WINDOW_MS = GLOBAL_RATE_LIMIT_BURST_WINDOW_SECONDS * 1000;
const STATE_TTL_MS = MINUTE_WINDOW_MS * 2;
const CLEANUP_INTERVAL = 200;

interface RateLimitState {
  minuteWindowStartMs: number;
  minuteCount: number;
  burstWindowStartMs: number;
  burstCount: number;
  lastSeenAtMs: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  windowSeconds: number;
  retryAfterSeconds: number | null;
}

const statesByKey = new Map<string, RateLimitState>();
let requestCountSinceCleanup = 0;

function parseClientIp(request: HttpRequest): string {
  const fromForwardedFor = String(request.headers.get("x-forwarded-for") || "").trim();
  if (fromForwardedFor) {
    const first = fromForwardedFor.split(",")[0]?.trim();
    if (first) return first.slice(0, 128).toLowerCase();
  }

  const fromRealIp = String(request.headers.get("x-real-ip") || "").trim();
  if (fromRealIp) return fromRealIp.slice(0, 128).toLowerCase();

  const fromClientIp = String(request.headers.get("x-client-ip") || "").trim();
  if (fromClientIp) return fromClientIp.slice(0, 128).toLowerCase();

  return "unknown";
}

function floorWindowStart(nowMs: number, windowMs: number): number {
  return Math.floor(nowMs / windowMs) * windowMs;
}

function getOrCreateState(key: string, nowMs: number): RateLimitState {
  const existing = statesByKey.get(key);
  if (existing) return existing;

  const created: RateLimitState = {
    minuteWindowStartMs: floorWindowStart(nowMs, MINUTE_WINDOW_MS),
    minuteCount: 0,
    burstWindowStartMs: floorWindowStart(nowMs, BURST_WINDOW_MS),
    burstCount: 0,
    lastSeenAtMs: nowMs
  };
  statesByKey.set(key, created);
  return created;
}

function maybeResetWindows(state: RateLimitState, nowMs: number): void {
  const minuteStart = floorWindowStart(nowMs, MINUTE_WINDOW_MS);
  if (minuteStart !== state.minuteWindowStartMs) {
    state.minuteWindowStartMs = minuteStart;
    state.minuteCount = 0;
  }

  const burstStart = floorWindowStart(nowMs, BURST_WINDOW_MS);
  if (burstStart !== state.burstWindowStartMs) {
    state.burstWindowStartMs = burstStart;
    state.burstCount = 0;
  }
}

function cleanupExpiredStates(nowMs: number): void {
  requestCountSinceCleanup += 1;
  if (requestCountSinceCleanup < CLEANUP_INTERVAL) return;
  requestCountSinceCleanup = 0;

  for (const [key, state] of statesByKey.entries()) {
    if ((nowMs - state.lastSeenAtMs) > STATE_TTL_MS) {
      statesByKey.delete(key);
    }
  }
}

export function checkGlobalRateLimit(request: HttpRequest, nowMs = Date.now()): RateLimitDecision {
  const method = String(request.method || "GET").toUpperCase();
  if (method === "OPTIONS") {
    return {
      allowed: true,
      limit: GLOBAL_RATE_LIMIT_BURST_LIMIT,
      remaining: GLOBAL_RATE_LIMIT_BURST_LIMIT,
      windowSeconds: GLOBAL_RATE_LIMIT_BURST_WINDOW_SECONDS,
      retryAfterSeconds: null
    };
  }

  cleanupExpiredStates(nowMs);
  const key = parseClientIp(request);
  const state = getOrCreateState(key, nowMs);
  state.lastSeenAtMs = nowMs;
  maybeResetWindows(state, nowMs);

  const minuteExceeded = state.minuteCount >= GLOBAL_RATE_LIMIT_MINUTE_LIMIT;
  const burstExceeded = state.burstCount >= GLOBAL_RATE_LIMIT_BURST_LIMIT;

  if (minuteExceeded || burstExceeded) {
    const minuteRetryMs = minuteExceeded
      ? (state.minuteWindowStartMs + MINUTE_WINDOW_MS) - nowMs
      : Number.POSITIVE_INFINITY;
    const burstRetryMs = burstExceeded
      ? (state.burstWindowStartMs + BURST_WINDOW_MS) - nowMs
      : Number.POSITIVE_INFINITY;
    const retryAfterSeconds = Math.max(1, Math.ceil(Math.min(minuteRetryMs, burstRetryMs) / 1000));
    const remainingMinute = Math.max(0, GLOBAL_RATE_LIMIT_MINUTE_LIMIT - state.minuteCount);
    const remainingBurst = Math.max(0, GLOBAL_RATE_LIMIT_BURST_LIMIT - state.burstCount);

    return {
      allowed: false,
      limit: minuteExceeded ? GLOBAL_RATE_LIMIT_MINUTE_LIMIT : GLOBAL_RATE_LIMIT_BURST_LIMIT,
      remaining: Math.min(remainingMinute, remainingBurst),
      windowSeconds: minuteExceeded ? GLOBAL_RATE_LIMIT_MINUTE_WINDOW_SECONDS : GLOBAL_RATE_LIMIT_BURST_WINDOW_SECONDS,
      retryAfterSeconds
    };
  }

  state.minuteCount += 1;
  state.burstCount += 1;

  const remainingMinute = Math.max(0, GLOBAL_RATE_LIMIT_MINUTE_LIMIT - state.minuteCount);
  const remainingBurst = Math.max(0, GLOBAL_RATE_LIMIT_BURST_LIMIT - state.burstCount);

  return {
    allowed: true,
    limit: Math.min(GLOBAL_RATE_LIMIT_MINUTE_LIMIT, GLOBAL_RATE_LIMIT_BURST_LIMIT),
    remaining: Math.min(remainingMinute, remainingBurst),
    windowSeconds: GLOBAL_RATE_LIMIT_BURST_WINDOW_SECONDS,
    retryAfterSeconds: null
  };
}

export function resetRateLimitState(): void {
  statesByKey.clear();
  requestCountSinceCleanup = 0;
}
