import { getWhatnotCommissionPercent, getWhatnotPeriod, getWhatnotTier, normalizeWhatnotVertical, type WhatnotTier } from "../../domain/whatnot-fees.ts";
import { getGrossRevenueForSale } from "../../domain/calculations-fees.ts";
import type { FeeProfileInput } from "../../domain/calculations-fees.ts";
import type { Lot, LotSetup, Sale, WhatnotVertical } from "../../types/app.ts";

const THRESHOLDS_CAD = [10_000, 20_000, 35_000, 50_000, 65_000, 85_000] as const;

export interface WhatnotFeePeriodSummary {
  currentTier: WhatnotTier;
  previousPeriodGrossCad: number;
  currentPeriodGrossCad: number;
  nextThresholdCad: number | null;
  isEstimate: boolean;
  missingLotIds: number[];
  periodStart: string | null;
  periodEndExclusive: string | null;
  previousPeriodStart: string | null;
  previousPeriodEndExclusive: string | null;
}

export function resolveEffectiveWhatnotFeeInput<T extends Pick<LotSetup, "feeProfilePreset" | "platformFeePercent" | "additionalFeePercent" | "additionalFeeAppliesTo" | "fixedFeePerOrder"> & { whatnotVertical?: WhatnotVertical | null }>(
  lotOrSetup: T,
  summary: Pick<WhatnotFeePeriodSummary, "currentTier" | "periodStart"> | null | undefined
): T | FeeProfileInput {
  const vertical = normalizeWhatnotVertical(lotOrSetup.whatnotVertical);
  if (
    lotOrSetup.feeProfilePreset !== "whatnot"
    || vertical == null
    || summary == null
    || summary.periodStart == null
  ) return lotOrSetup;
  return {
    platformFeePercent: getWhatnotCommissionPercent(vertical, summary.currentTier),
    additionalFeePercent: lotOrSetup.additionalFeePercent,
    additionalFeeAppliesTo: lotOrSetup.additionalFeeAppliesTo,
    fixedFeePerOrder: lotOrSetup.fixedFeePerOrder
  };
}

export function summarizeWhatnotFeePeriod(params: {
  lots: readonly Lot[];
  salesByLotId: ReadonlyMap<number, readonly Sale[]>;
  dateOnly: string;
  missingLotIds: readonly number[];
}): WhatnotFeePeriodSummary {
  const period = getWhatnotPeriod(params.dateOnly);
  const missingLotIds = Array.from(new Set(params.missingLotIds.filter((id) => Number.isFinite(id) && id > 0)));
  let previousPeriodGrossCad = 0;
  let currentPeriodGrossCad = 0;

  if (period) {
    for (const lot of params.lots) {
      const sales = params.salesByLotId.get(lot.id) ?? [];
      for (const sale of sales) {
        if (!isWhatnotSale(sale, lot) || !isValidDateOnly(sale.date)) continue;
        const inPrevious = sale.date >= period.previousStart && sale.date < period.previousEndExclusive;
        const inCurrent = sale.date >= period.start && sale.date < period.endExclusive;
        if (!inPrevious && !inCurrent) continue;
        // Wheel `quantity` tracks the number of prize packs, while `price` is
        // the single spin's total sale amount, including in legacy records.
        const gross = sale.type === "wheel"
          ? Math.max(0, Number(sale.price) || 0)
          : getGrossRevenueForSale(sale);
        if (!Number.isFinite(gross) || gross < 0) continue;
        const grossCad = lot.sellingCurrency === "USD"
          ? (isValidExchangeRate(lot.exchangeRate) ? gross * lot.exchangeRate : null)
          : lot.sellingCurrency === "CAD" ? gross : null;
        if (grossCad == null || !Number.isFinite(grossCad)) continue;
        if (inPrevious) previousPeriodGrossCad += grossCad;
        else currentPeriodGrossCad += grossCad;
      }
    }
  }

  const currentTier = getWhatnotTier(previousPeriodGrossCad);
  return {
    currentTier,
    previousPeriodGrossCad,
    currentPeriodGrossCad,
    nextThresholdCad: THRESHOLDS_CAD.find((threshold) => currentPeriodGrossCad < threshold) ?? null,
    isEstimate: true,
    missingLotIds,
    periodStart: period?.start ?? null,
    periodEndExclusive: period?.endExclusive ?? null,
    previousPeriodStart: period?.previousStart ?? null,
    previousPeriodEndExclusive: period?.previousEndExclusive ?? null
  };
}

function isWhatnotSale(sale: Sale, lot: Lot): boolean {
  if (typeof sale.externalProvider === "string" && sale.externalProvider.trim()) {
    return sale.externalProvider.trim().toLowerCase() === "whatnot";
  }
  if (sale.externalTransactionRefs?.some((ref) => ref.provider.trim().toLowerCase() === "whatnot")) return true;
  if (sale.wasWhatnotSale === true) return true;
  if (sale.wasWhatnotSale === false) return false;
  return lot.feeProfilePreset === "whatnot";
}

function isValidExchangeRate(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
