import {
  calculateNetFromGross,
  type FeeProfileInput
} from "./calculations-fees.ts";

export type ForecastScenarioUnitLabel = "item" | "box" | "spot";

export type ForecastScenario<Id extends string = string> = {
  id: Id;
  label: string;
  unitLabel: ForecastScenarioUnitLabel;
  units: number;
  unitPrice: number;
  estimatedNetRemaining: number;
  forecastRevenue: number;
  forecastProfit: number;
  forecastMarginPercent: number | null;
};

export type ForecastProjection = {
  units: number;
  gross: number;
  estimatedNetRemaining: number;
};

export function createForecastProjectionFromUnitPrice(params: {
  units: number;
  unitPrice: number;
  sellingTaxPercent: number;
  shippingPerOrder?: number;
  feeProfileInput?: FeeProfileInput;
}): ForecastProjection {
  const units = Math.max(0, Number(params.units) || 0);
  const unitPrice = Math.max(0, Number(params.unitPrice) || 0);
  const gross = units * unitPrice;
  return {
    units,
    gross,
    estimatedNetRemaining: units > 0
      ? calculateNetFromGross(gross, params.sellingTaxPercent, params.shippingPerOrder, units, params.feeProfileInput)
      : 0
  };
}

export function estimateNetRemainingFromUnitPrice(payload: {
  units: number;
  unitPrice: number;
  sellingTaxPercent: number;
  shippingPerOrder?: number;
  feeProfileInput?: FeeProfileInput;
}): number {
  return createForecastProjectionFromUnitPrice(payload).estimatedNetRemaining;
}

export function createForecastScenario<Id extends string>(
  totals: {
    baseRevenue: number;
    baseCost: number;
  },
  payload: {
    id: Id;
    label: string;
    unitLabel: ForecastScenarioUnitLabel;
    units: number;
    unitPrice: number;
    estimatedNetRemaining: number;
  }
): ForecastScenario<Id> {
  const units = Math.max(0, Number(payload.units) || 0);
  const unitPrice = Math.max(0, Number(payload.unitPrice) || 0);
  const estimatedNetRemaining = Number(payload.estimatedNetRemaining) || 0;
  const forecastRevenue = (Number(totals.baseRevenue) || 0) + estimatedNetRemaining;
  const totalCost = Number(totals.baseCost) || 0;
  const forecastProfit = forecastRevenue - totalCost;
  const forecastMarginPercent = totalCost > 0 ? ((forecastProfit / totalCost) * 100) : null;

  return {
    id: payload.id,
    label: payload.label,
    unitLabel: payload.unitLabel,
    units,
    unitPrice,
    estimatedNetRemaining,
    forecastRevenue,
    forecastProfit,
    forecastMarginPercent
  };
}

export function createForecastScenarioFromUnitPrice<Id extends string>(params: {
  id: Id;
  label: string;
  unitLabel: ForecastScenarioUnitLabel;
  units: number;
  unitPrice: number;
  baseRevenue: number;
  baseCost: number;
  sellingTaxPercent: number;
  shippingPerOrder?: number;
  feeProfileInput?: FeeProfileInput;
}): ForecastScenario<Id> {
  const projection = createForecastProjectionFromUnitPrice({
    units: params.units,
    unitPrice: params.unitPrice,
    sellingTaxPercent: params.sellingTaxPercent,
    shippingPerOrder: params.shippingPerOrder,
    feeProfileInput: params.feeProfileInput
  });
  return createForecastScenario(
    {
      baseRevenue: params.baseRevenue,
      baseCost: params.baseCost
    },
    {
      id: params.id,
      label: params.label,
      unitLabel: params.unitLabel,
      units: projection.units,
      unitPrice: params.unitPrice,
      estimatedNetRemaining: projection.estimatedNetRemaining
    }
  );
}

export function createForecastScenarioFromProjection<Id extends string>(params: {
  id: Id;
  label: string;
  unitLabel: ForecastScenarioUnitLabel;
  projection: ForecastProjection | null | undefined;
  baseRevenue: number;
  baseCost: number;
}): ForecastScenario<Id> | null {
  if (!params.projection || params.projection.units <= 0) return null;
  const unitPrice = params.projection.gross / params.projection.units;
  return createForecastScenario(
    {
      baseRevenue: params.baseRevenue,
      baseCost: params.baseCost
    },
    {
      id: params.id,
      label: params.label,
      unitLabel: params.unitLabel,
      units: params.projection.units,
      unitPrice,
      estimatedNetRemaining: params.projection.estimatedNetRemaining
    }
  );
}

export function pickBestForecastScenario<Id extends string>(
  scenarios: Array<ForecastScenario<Id>> | null | undefined
): ForecastScenario<Id> | null {
  if (!Array.isArray(scenarios) || scenarios.length === 0) return null;
  return [...scenarios].sort((a, b) => b.forecastProfit - a.forecastProfit)[0] ?? null;
}
