import type { SinglesCatalogSource } from "../../types/app.ts";

export function resolveDefaultSinglesCatalogSourceFromValue(value: unknown): SinglesCatalogSource {
  const raw = String(value || "ua")
    .trim()
    .toLowerCase();
  if (raw === "none") return "none";
  if (raw === "pokemon" || raw === "pkmn") return "pokemon";
  return "ua";
}

export function resolveDefaultSinglesCatalogSourceFromEnv(): SinglesCatalogSource {
  return resolveDefaultSinglesCatalogSourceFromValue(import.meta.env.VITE_CARDS_SEARCH_GAME as string | undefined);
}

export function normalizeSinglesCatalogSource(
  value: unknown,
  fallback: SinglesCatalogSource = resolveDefaultSinglesCatalogSourceFromEnv()
): SinglesCatalogSource {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "none") return "none";
  if (raw === "pokemon" || raw === "pkmn") return "pokemon";
  if (raw === "ua") return "ua";
  return fallback;
}
