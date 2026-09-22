import { type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { HttpError } from "../../lib/auth";
import {
  type CardCatalogFilterOption,
  listCardCatalogFilterOptions
} from "../../lib/cosmos/cardCatalogRepository";
import { executeHttpHandler, jsonResponse } from "../../lib/http";

export const CARD_CATALOG_FILTER_OPTIONS_CACHE_TTL_MS = 15 * 60 * 1000;

type FilterOptionsLoader = (game: string) => Promise<CardCatalogFilterOption[]>;

type FilterOptionsCacheEntry = {
  expiresAtMs: number;
  value?: CardCatalogFilterOption[];
  loading?: Promise<CardCatalogFilterOption[]>;
};

export function createCardCatalogFilterOptionsCache(
  load: FilterOptionsLoader,
  now: () => number = Date.now
): { get(game: string): Promise<CardCatalogFilterOption[]> } {
  const entries = new Map<string, FilterOptionsCacheEntry>();

  return {
    async get(game: string): Promise<CardCatalogFilterOption[]> {
      const normalizedGame = String(game || "").trim().toLowerCase();
      const existing = entries.get(normalizedGame);
      if (existing?.value && existing.expiresAtMs > now()) return existing.value;
      if (existing?.loading) return existing.loading;

      const loading = load(normalizedGame)
        .then((value) => {
          entries.set(normalizedGame, {
            value,
            expiresAtMs: now() + CARD_CATALOG_FILTER_OPTIONS_CACHE_TTL_MS
          });
          return value;
        })
        .catch((error: unknown) => {
          if (entries.get(normalizedGame)?.loading === loading) {
            entries.delete(normalizedGame);
          }
          throw error;
        });
      entries.set(normalizedGame, { expiresAtMs: 0, loading });
      return loading;
    }
  };
}

let filterOptionsCache: ReturnType<typeof createCardCatalogFilterOptionsCache> | null = null;

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

export async function cardsFilterOptions(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  return executeHttpHandler(request, context, {
    errorLogMessage: "GET /cards/filter-options failed",
    fallbackErrorMessage: "Failed to load card filter options.",
    operation: async ({ config }) => {
      const game = (getQueryParam(request, "game") ?? "").trim().toLowerCase();
      if (!game) {
        throw new HttpError(400, "Query param 'game' is required.");
      }

      if (!filterOptionsCache) {
        filterOptionsCache = createCardCatalogFilterOptionsCache(async (cacheGame) => (
          await listCardCatalogFilterOptions(config, cacheGame)
        ));
      }
      const items = await filterOptionsCache.get(game);
      return jsonResponse(request, config, 200, {
        ok: true,
        game,
        count: items.length,
        items
      });
    }
  });
}
