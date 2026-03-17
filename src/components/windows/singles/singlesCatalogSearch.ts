import type { SinglesCatalogSource } from "../../../types/app.ts";
import { normalizeSinglesCatalogSource } from "../../../app-core/shared/singles-catalog-source.ts";

export const SINGLES_CARD_SEARCH_DEBOUNCE_MS = 400;
export const SINGLES_CARD_SEARCH_LIMIT = 25;

export type CardSearchApiItem = {
  name?: string;
  cardNo?: string;
  image?: string;
  rarity?: string;
  marketPrice?: number | null;
};

export type SinglesCardSuggestion = {
  title: string;
  value: string;
  name: string;
  cardNo: string;
  image: string;
  rarity: string;
  marketPrice: number | null;
};

type CardSearchToken = {
  value: string;
  rarityOnly: boolean;
};

export function createSinglesCardSuggestionValue(name: unknown, cardNo: unknown, rarity: unknown): string {
  const safeName = String(name || "").trim();
  const safeCardNo = String(cardNo || "").trim();
  const safeRarity = String(rarity || "").trim();
  return `${safeName}|${safeCardNo}|${safeRarity}`;
}

export function createSinglesCardImageCacheKey(
  catalogSource: unknown,
  item: unknown,
  cardNo: unknown
): string {
  const source = normalizeSinglesCatalogSource(catalogSource as SinglesCatalogSource);
  const safeItem = String(item || "").trim().toLocaleLowerCase();
  const safeCardNo = String(cardNo || "").trim().toLocaleLowerCase();
  if (!safeItem) return "";
  return `${source}|${safeItem}|${safeCardNo}`;
}

export function mapCardSearchItemToSuggestion(item: CardSearchApiItem, index: number): SinglesCardSuggestion | null {
  const name = String(item.name || "").trim();
  if (!name) return null;
  const cardNo = String(item.cardNo || "").trim();
  const image = String(item.image || "").trim();
  const rarity = String(item.rarity || "").trim();
  const marketPriceRaw = Number(item.marketPrice);
  const marketPrice = Number.isFinite(marketPriceRaw) ? marketPriceRaw : null;
  return {
    title: cardNo ? `${name} #${cardNo}` : name,
    value: createSinglesCardSuggestionValue(name, cardNo, rarity || index),
    name,
    cardNo,
    image,
    rarity,
    marketPrice
  } satisfies SinglesCardSuggestion;
}

export function normalizeSinglesSearchTokens(query: unknown): string[] {
  const normalized = String(query || "").trim().toLocaleLowerCase();
  if (!normalized) return [];
  return normalized.split(/\s+/).filter((token) => token.length > 0);
}

function normalizeCardSearchComparable(value: unknown): string {
  return String(value || "")
    .trim()
    .toLocaleLowerCase()
    .replace(/[★☆✩✭✮✯]/g, "*");
}

function tokenizeCardSearchQuery(query: unknown): CardSearchToken[] {
  return String(query || "")
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .map((token) => {
      const normalized = token.replace(/[★☆✩✭✮✯]/g, "*");
      const rarityOnly = normalized.includes("*");
      const value = normalized.trim();
      return {
        value,
        rarityOnly
      };
    })
    .filter((token) => token.value.replace(/\*/g, "").length > 0);
}

export function matchesCardSuggestionQuery(item: SinglesCardSuggestion, query: unknown): boolean {
  const tokens = tokenizeCardSearchQuery(query);
  if (tokens.length === 0) return true;

  const name = normalizeCardSearchComparable(item.name);
  const cardNo = normalizeCardSearchComparable(item.cardNo);
  const rarity = normalizeCardSearchComparable(item.rarity);

  return tokens.every((token) => {
    if (token.rarityOnly) {
      return rarity.startsWith(token.value);
    }
    return name.includes(token.value) || cardNo.includes(token.value) || rarity.includes(token.value);
  });
}

export function resolveCardSearchBackendQuery(query: unknown): string {
  const rawQuery = String(query || "").trim();
  const tokens = tokenizeCardSearchQuery(rawQuery);
  if (tokens.length === 0) return "";
  return rawQuery;
}
