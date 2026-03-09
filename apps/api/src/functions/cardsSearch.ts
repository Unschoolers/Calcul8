import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { HttpError } from "../lib/auth";
import { getConfig } from "../lib/config";
import { searchCardCatalog } from "../lib/cosmos";
import { errorResponse, jsonResponse, maybeHandleCorsPreflight, maybeHandleGlobalRateLimit } from "../lib/http";

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
  if (!rawLimit) return 10;
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
  const config = getConfig();
  const preflightResponse = maybeHandleCorsPreflight(request, config);
  if (preflightResponse) return preflightResponse;

  const rateLimitResponse = maybeHandleGlobalRateLimit(request, config);
  if (rateLimitResponse) return rateLimitResponse;

  try {
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
  } catch (error) {
    context.error("GET /cards/search failed", error);
    return errorResponse(request, config, error, "Failed to search cards.");
  }
}

app.http("cardsSearch", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "cards/search",
  handler: cardsSearch
});

