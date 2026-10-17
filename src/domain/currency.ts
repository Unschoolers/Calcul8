import type { CurrencyCode } from "../types/app.ts";

export function normalizeUsdToCadRate(exchangeRate: unknown, defaultExchangeRate: number): number {
  const rate = Number(exchangeRate);
  if (Number.isFinite(rate) && rate > 0) return rate;
  const fallback = Number(defaultExchangeRate);
  return Number.isFinite(fallback) && fallback > 0 ? fallback : 1;
}

export function convertAmountToCad(
  amount: number,
  currency: CurrencyCode,
  exchangeRate: unknown,
  defaultExchangeRate: number
): number {
  const value = Number(amount) || 0;
  if (currency === "CAD") return value;
  return value * normalizeUsdToCadRate(exchangeRate, defaultExchangeRate);
}
