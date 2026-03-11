import {
  createForecastScenario as createScenario,
  pickBestForecastScenario as pickBestScenario,
  type ForecastScenario,
  type ForecastScenarioUnitLabel
} from "../../domain/calculations.ts";

export type { ForecastScenario, ForecastScenarioUnitLabel };

export type ForecastScenarioId = "item" | "box" | "rtyh" | "singles-suggested";

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
  return createScenario(totals, payload);
}

export function pickBestForecastScenario<Id extends string>(
  scenarios: Array<ForecastScenario<Id>> | null | undefined
): ForecastScenario<Id> | null {
  return pickBestScenario(scenarios);
}
