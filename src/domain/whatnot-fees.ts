import type { WhatnotVertical } from "../types/app";

export type WhatnotTier = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const WHATNOT_VERTICALS: readonly WhatnotVertical[] = ["sports", "tcg", "fashion", "other_collectibles", "coins", "other"];

export function normalizeWhatnotVertical(value: unknown): WhatnotVertical | null {
  return typeof value === "string" && WHATNOT_VERTICALS.includes(value as WhatnotVertical)
    ? value as WhatnotVertical
    : null;
}

const COMMISSION_PERCENT: Readonly<Record<WhatnotVertical, readonly number[]>> = Object.freeze({
  sports: Object.freeze([8, 7.75, 7.5, 7.25, 7, 6.75, 6.5]),
  tcg: Object.freeze([8, 7.75, 7.5, 7.25, 7, 6.75, 6.5]),
  fashion: Object.freeze([8, 7, 6.5, 5.5, 5, 4.5, 4.5]),
  other_collectibles: Object.freeze([8, 7.25, 6.5, 6, 5, 5, 5]),
  coins: Object.freeze([4, 3.9, 3.8, 3.7, 3.6, 3.55, 3.5]),
  other: Object.freeze([8, 7, 6.5, 5.5, 4, 4, 4])
});

const TIER_THRESHOLDS_CAD = [0, 10_000, 20_000, 35_000, 50_000, 65_000, 85_000] as const;
const PERIOD_START_ORDINAL = dateOrdinal("2026-09-21")!;
const PERIOD_DAYS = 28;

export function getWhatnotCommissionPercent(vertical: WhatnotVertical, tier: WhatnotTier): number {
  return COMMISSION_PERCENT[vertical][tier];
}

export function getWhatnotTier(grossCad: number): WhatnotTier {
  if (!Number.isFinite(grossCad)) return 0;
  for (let tier = TIER_THRESHOLDS_CAD.length - 1; tier >= 1; tier -= 1) {
    if (grossCad >= TIER_THRESHOLDS_CAD[tier]) return tier as WhatnotTier;
  }
  return 0;
}

export interface WhatnotPeriod {
  start: string;
  endExclusive: string;
  previousStart: string;
  previousEndExclusive: string;
}

export function getWhatnotPeriod(dateOnly: string): WhatnotPeriod | null {
  const ordinal = dateOrdinal(dateOnly);
  if (ordinal === null || ordinal < PERIOD_START_ORDINAL) return null;
  const periodIndex = Math.floor((ordinal - PERIOD_START_ORDINAL) / PERIOD_DAYS);
  const start = PERIOD_START_ORDINAL + periodIndex * PERIOD_DAYS;
  const startDate = ordinalDate(start);
  const endExclusiveDate = ordinalDate(start + PERIOD_DAYS);
  const previousStartDate = ordinalDate(start - PERIOD_DAYS);
  const previousEndExclusiveDate = ordinalDate(start);
  if (![startDate, endExclusiveDate, previousStartDate, previousEndExclusiveDate].every(isDateOnly)) return null;
  return {
    start: startDate,
    endExclusive: endExclusiveDate,
    previousStart: previousStartDate,
    previousEndExclusive: previousEndExclusiveDate
  };
}

function dateOrdinal(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return Math.floor(timestamp / 86_400_000);
}

function isDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function ordinalDate(ordinal: number): string {
  return new Date(ordinal * 86_400_000).toISOString().slice(0, 10);
}
