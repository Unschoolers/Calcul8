import { type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { HttpError } from "../../lib/auth";
import { searchCardCatalog } from "../../lib/cosmos/cardCatalogRepository";
import { incrementRateLimitCounter } from "../../lib/cosmos/rateLimitRepository";
import { executeHttpHandler, jsonResponse } from "../../lib/http";
import type { ApiConfig } from "../../types";

const CARDS_SEARCH_RATE_LIMIT_MINUTE_LIMIT = 40;
const CARDS_SEARCH_RATE_LIMIT_BURST_LIMIT = 10;
const CARDS_SEARCH_RATE_LIMIT_MINUTE_WINDOW_SECONDS = 60;
const CARDS_SEARCH_RATE_LIMIT_BURST_WINDOW_SECONDS = 10;

function parseClientIp(request: HttpRequest): string {
  const fromForwardedFor = String(request.headers.get("x-forwarded-for") || "").trim();
  if (fromForwardedFor) {
    const forwardedChain = fromForwardedFor.split(",");
    const connectedClient = forwardedChain[forwardedChain.length - 1]?.trim();
    if (connectedClient) return connectedClient.slice(0, 128).toLowerCase();
  }
  return "unknown";
}

function floorWindowStart(nowMs: number, windowSeconds: number): number {
  const windowMs = windowSeconds * 1000;
  return Math.floor(nowMs / windowMs) * windowMs;
}

function computeRetryAfterSeconds(nowMs: number, windowStartMs: number, windowSeconds: number): number {
  return Math.max(1, Math.ceil(((windowStartMs + (windowSeconds * 1000)) - nowMs) / 1000));
}

async function checkCardsSearchRateLimit(
  request: HttpRequest,
  config: ApiConfig,
  nowMs = Date.now()
): Promise<{
  allowed: boolean;
  limit: number;
  windowSeconds: number;
  retryAfterSeconds: number | null;
}> {
  if (String(request.method || "GET").toUpperCase() === "OPTIONS") {
    return {
      allowed: true,
      limit: CARDS_SEARCH_RATE_LIMIT_BURST_LIMIT,
      windowSeconds: CARDS_SEARCH_RATE_LIMIT_BURST_WINDOW_SECONDS,
      retryAfterSeconds: null
    };
  }

  if (config.apiEnv !== "prod") {
    return {
      allowed: true,
      limit: CARDS_SEARCH_RATE_LIMIT_BURST_LIMIT,
      windowSeconds: CARDS_SEARCH_RATE_LIMIT_BURST_WINDOW_SECONDS,
      retryAfterSeconds: null
    };
  }

  const clientIp = parseClientIp(request);
  const clientKey = `cards_search:${clientIp}`;
  const minuteWindowStartMs = floorWindowStart(nowMs, CARDS_SEARCH_RATE_LIMIT_MINUTE_WINDOW_SECONDS);
  const burstWindowStartMs = floorWindowStart(nowMs, CARDS_SEARCH_RATE_LIMIT_BURST_WINDOW_SECONDS);

  const [minuteCount, burstCount] = await Promise.all([
    incrementRateLimitCounter(config, {
      clientKey,
      windowStartMs: minuteWindowStartMs,
      windowSeconds: CARDS_SEARCH_RATE_LIMIT_MINUTE_WINDOW_SECONDS
    }),
    incrementRateLimitCounter(config, {
      clientKey,
      windowStartMs: burstWindowStartMs,
      windowSeconds: CARDS_SEARCH_RATE_LIMIT_BURST_WINDOW_SECONDS
    })
  ]);

  if (minuteCount > CARDS_SEARCH_RATE_LIMIT_MINUTE_LIMIT) {
    return {
      allowed: false,
      limit: CARDS_SEARCH_RATE_LIMIT_MINUTE_LIMIT,
      windowSeconds: CARDS_SEARCH_RATE_LIMIT_MINUTE_WINDOW_SECONDS,
      retryAfterSeconds: computeRetryAfterSeconds(nowMs, minuteWindowStartMs, CARDS_SEARCH_RATE_LIMIT_MINUTE_WINDOW_SECONDS)
    };
  }
  if (burstCount > CARDS_SEARCH_RATE_LIMIT_BURST_LIMIT) {
    return {
      allowed: false,
      limit: CARDS_SEARCH_RATE_LIMIT_BURST_LIMIT,
      windowSeconds: CARDS_SEARCH_RATE_LIMIT_BURST_WINDOW_SECONDS,
      retryAfterSeconds: computeRetryAfterSeconds(nowMs, burstWindowStartMs, CARDS_SEARCH_RATE_LIMIT_BURST_WINDOW_SECONDS)
    };
  }

  return {
    allowed: true,
    limit: CARDS_SEARCH_RATE_LIMIT_BURST_LIMIT,
    windowSeconds: CARDS_SEARCH_RATE_LIMIT_BURST_WINDOW_SECONDS,
    retryAfterSeconds: null
  };
}

function getQueryParam(request: HttpRequest, key: string): string | null {
  if (request.query && typeof request.query.get === "function") {
    return request.query.get(key);
  }

  if (!request.url) return null;
  try {
    return new URL(request.url).searchParams.get(key);
  } catch {
    return null;
  }
}

function parseLimit(rawLimit: string | null): number {
  if (!rawLimit) return 25;
  const parsed = Number(rawLimit);
  if (!Number.isFinite(parsed)) {
    throw new HttpError(400, "Query param 'limit' must be a number.");
  }
  const intLimit = Math.floor(parsed);
  if (intLimit < 1 || intLimit > 25) {
    throw new HttpError(400, "Query param 'limit' must be between 1 and 25.");
  }
  return intLimit;
}

export async function cardsSearch(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  return executeHttpHandler(request, context, {
    errorLogMessage: "GET /cards/search failed",
    fallbackErrorMessage: "Failed to search cards.",
    operation: async ({ config }) => {
    const rateLimitDecision = await checkCardsSearchRateLimit(request, config);
    if (!rateLimitDecision.allowed) {
      return jsonResponse(
        request,
        config,
        429,
        {
          error: "Too many card search requests. Please retry shortly."
        },
        {
          "Retry-After": String(rateLimitDecision.retryAfterSeconds ?? 1),
          "X-RateLimit-Limit": String(rateLimitDecision.limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Window-Seconds": String(rateLimitDecision.windowSeconds)
        }
      );
    }

    const game = (getQueryParam(request, "game") ?? "").trim().toLowerCase();
    const q = (getQueryParam(request, "q") ?? "").trim();
    const limit = parseLimit(getQueryParam(request, "limit"));

    if (!game) {
      throw new HttpError(400, "Query param 'game' is required.");
    }
    if (q.length < 2) {
      throw new HttpError(400, "Query param 'q' must be at least 2 characters.");
    }

    const items = await searchCardCatalog(config, {
      game,
      query: q,
      limit
    });

    return jsonResponse(request, config, 200, {
      ok: true,
      game,
      q,
      limit,
      count: items.length,
      items
    });
    }
  });
}
