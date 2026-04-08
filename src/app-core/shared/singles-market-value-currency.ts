import type { CurrencyCode, SinglesCatalogSource } from "../../types/app.ts";

export function resolveDefaultSinglesMarketValueCurrency(
  catalogSource: SinglesCatalogSource | undefined,
  fallbackCurrency: CurrencyCode
): CurrencyCode {
  return catalogSource === "ua" ? "USD" : fallbackCurrency;
}

export function normalizeSinglesMarketValueCurrency(
  value: unknown,
  fallbackCurrency: CurrencyCode,
  catalogSource?: SinglesCatalogSource
): CurrencyCode {
  if (value === "USD" || value === "CAD") {
    return value;
  }
  return resolveDefaultSinglesMarketValueCurrency(catalogSource, fallbackCurrency);
}
