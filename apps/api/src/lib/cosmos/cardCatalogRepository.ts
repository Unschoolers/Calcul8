import type { ApiConfig } from "../../types";
import { getContainers, withCosmosRetry } from "./core";

interface SearchCardsInput {
  game: string;
  query: string;
  limit: number;
}

export interface CardCatalogSearchResult {
  id: string;
  game: string;
  cardNo: string;
  name: string;
  series?: string;
  seriesName?: string;
  image?: string;
  rarity?: string;
  marketPrice?: number | null;
}

type CardCatalogSearchClause = {
  clause: string;
  parameters: Array<{ name: string; value: string }>;
};

export function buildCardCatalogSearchClause(query: unknown): CardCatalogSearchClause {
  const tokens = String(query || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .map((token) => {
      const normalized = token.replace(/[★☆✩✭✮✯]/g, "*");
      const rarityOnly = normalized.includes("*");
      return {
        rarityOnly,
        value: (rarityOnly ? normalized.replace(/\*/g, "★") : normalized).trim()
      };
    })
    .filter((token) => token.value.replace(/[★☆✩✭✮✯]/g, "").length > 0);

  if (tokens.length === 0) {
    return { clause: "", parameters: [] };
  }

  const parameters = [] as Array<{ name: string; value: string }>;
  const clause = tokens
    .map((token, index) => {
      const paramName = `@token${index}`;
      parameters.push({ name: paramName, value: token.value });
      if (token.rarityOnly) {
        return `(IS_DEFINED(c.rarity) AND STARTSWITH(c.rarity, ${paramName}, true))`;
      }
      return `(
        STARTSWITH(c.name, ${paramName}, true)
        OR STARTSWITH(c.cardNo, ${paramName}, true)
        OR (IS_DEFINED(c.rarity) AND STARTSWITH(c.rarity, ${paramName}, true))
      )`;
    })
    .join("\n      AND ");

  return { clause, parameters };
}

export async function searchCardCatalog(
  config: ApiConfig,
  input: SearchCardsInput
): Promise<CardCatalogSearchResult[]> {
  const { cardCatalog } = getContainers(config);
  const safeGame = String(input.game || "").trim().toLowerCase();
  const safeLimit = Math.max(1, Math.min(25, Math.floor(Number(input.limit) || 25)));
  const searchClause = buildCardCatalogSearchClause(input.query);

  if (!safeGame || !searchClause.clause) return [];

  const querySpec = {
    query: `SELECT TOP ${safeLimit}
      c.id,
      c.game,
      c.cardNo,
      c.name,
      c.series,
      c.seriesName,
      c.image,
      c.rarity,
      c.marketPrice
      FROM c
      WHERE c.pk = @pk
      AND c.game = @game
      AND ${searchClause.clause}
      ORDER BY c.cardNo`,
    parameters: [
      { name: "@pk", value: safeGame },
      { name: "@game", value: safeGame },
      ...searchClause.parameters
    ]
  };

  const iterator = cardCatalog.items.query<CardCatalogSearchResult>(querySpec, {
    partitionKey: safeGame,
    maxItemCount: safeLimit
  });

  const { resources } = await withCosmosRetry(() => iterator.fetchAll());
  return (resources || []).map((row) => ({
    id: String(row.id || ""),
    game: String(row.game || safeGame),
    cardNo: String(row.cardNo || ""),
    name: String(row.name || ""),
    series: typeof row.series === "string" ? row.series : undefined,
    seriesName: typeof row.seriesName === "string" ? row.seriesName : undefined,
    image: typeof row.image === "string" ? row.image : undefined,
    rarity: typeof row.rarity === "string" ? row.rarity : undefined,
    marketPrice: Number.isFinite(Number(row.marketPrice)) ? Number(row.marketPrice) : null
  }));
}
