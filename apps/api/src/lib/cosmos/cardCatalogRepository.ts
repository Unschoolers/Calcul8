import type { ApiConfig } from "../../types";
import { getContainers, withCosmosRetry } from "./core";

interface SearchCardsInput {
  game: string;
  query: string;
  limit: number;
  filter?: string;
}

export interface CardCatalogFilterOption {
  value: string;
  label: string;
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

function resolveCardCatalogFilterField(game: string): "setId" | "series" | null {
  if (game === "pokemon") return "setId";
  if (game === "ua") return "series";
  return null;
}

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
  const clauses = [] as string[];
  const textQuery = tokens
    .filter((token) => !token.rarityOnly)
    .map((token) => token.value)
    .join(" ");

  if (textQuery) {
    const paramName = `@token${parameters.length}`;
    parameters.push({ name: paramName, value: textQuery });
    clauses.push(`(
        STARTSWITH(c.name, ${paramName}, true)
        OR STARTSWITH(c.cardNo, ${paramName}, true)
        OR (IS_DEFINED(c.rarity) AND STARTSWITH(c.rarity, ${paramName}, true))
      )`);
  }

  for (const token of tokens.filter((token) => token.rarityOnly)) {
    const paramName = `@token${parameters.length}`;
    parameters.push({ name: paramName, value: token.value });
    clauses.push(`(IS_DEFINED(c.rarity) AND STARTSWITH(c.rarity, ${paramName}, true))`);
  }

  return { clause: clauses.join("\n      AND "), parameters };
}

export async function searchCardCatalog(
  config: ApiConfig,
  input: SearchCardsInput
): Promise<CardCatalogSearchResult[]> {
  const { cardCatalog } = getContainers(config);
  const safeGame = String(input.game || "").trim().toLowerCase();
  const safeLimit = Math.max(1, Math.min(25, Math.floor(Number(input.limit) || 25)));
  const safeFilter = String(input.filter || "").trim();
  const searchClause = buildCardCatalogSearchClause(input.query);
  const filterField = resolveCardCatalogFilterField(safeGame);

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
      AND ${searchClause.clause}${safeFilter && filterField ? `
      AND c.${filterField} = @filter` : ""}
      ORDER BY c.cardNo`,
    parameters: [
      { name: "@pk", value: safeGame },
      { name: "@game", value: safeGame },
      ...searchClause.parameters,
      ...(safeFilter && filterField ? [{ name: "@filter", value: safeFilter }] : [])
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

export async function listCardCatalogFilterOptions(
  config: ApiConfig,
  game: string
): Promise<CardCatalogFilterOption[]> {
  const { cardCatalog } = getContainers(config);
  const safeGame = String(game || "").trim().toLowerCase();
  const filterField = resolveCardCatalogFilterField(safeGame);
  if (!safeGame || !filterField) return [];

  const querySpec = {
    query: `SELECT c.${filterField}, c.seriesName
      FROM c
      WHERE c.pk = @pk
      AND c.game = @game
      AND IS_DEFINED(c.${filterField})`,
    parameters: [
      { name: "@pk", value: safeGame },
      { name: "@game", value: safeGame }
    ]
  };
  const iterator = cardCatalog.items.query<Record<string, unknown>>(querySpec, {
    partitionKey: safeGame
  });
  const { resources } = await withCosmosRetry(() => iterator.fetchAll());
  const uniqueOptions = new Map<string, CardCatalogFilterOption>();

  for (const row of resources || []) {
    const value = String(row[filterField] || "").trim();
    if (!value || uniqueOptions.has(value)) continue;
    const label = String(row.seriesName || "").trim() || value;
    uniqueOptions.set(value, { value, label });
  }

  return [...uniqueOptions.values()].sort((left, right) => (
    left.label.localeCompare(right.label) || left.value.localeCompare(right.value)
  ));
}
