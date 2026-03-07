export type ForecastScenarioUnitLabel = "item" | "box" | "spot";

export type ForecastScenarioId = "item" | "box" | "rtyh" | "singles-suggested";

export type ForecastScenario<Id extends string = ForecastScenarioId> = {
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

export function estimateNetRemainingFromUnitPrice(payload: {
  units: number;
  unitPrice: number;
  shippingPerOrder: number;
  netFromGross: (grossRevenue: number, buyerShippingPerOrder?: number, orderCount?: number) => number;
}): number {
  const units = Math.max(0, Number(payload.units) || 0);
  const unitPrice = Math.max(0, Number(payload.unitPrice) || 0);
  const grossRemaining = units * unitPrice;
  return units > 0
    ? payload.netFromGross(grossRemaining, payload.shippingPerOrder, units)
    : 0;
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

export function pickBestForecastScenario<Id extends string>(
  scenarios: Array<ForecastScenario<Id>> | null | undefined
): ForecastScenario<Id> | null {
  if (!Array.isArray(scenarios) || scenarios.length === 0) return null;
  return [...scenarios].sort((a, b) => b.forecastProfit - a.forecastProfit)[0] ?? null;
}
