import { DEFAULT_VALUES } from "../../constants.ts";
import {
  createForecastProjectionFromUnitPrice,
  createForecastScenarioFromProjection,
  calculatePriceForUnits as calculateUnitPrice,
  calculateTotalSpots
} from "../../domain/calculations.ts";
import type { Lot } from "../../types/app.ts";
import {
  createForecastScenario,
  type ForecastScenario,
  type ForecastScenarioUnitLabel
} from "./forecast-scenarios.ts";

export type PortfolioForecastModeId = "item" | "box" | "rtyh";

export type PortfolioModeProjection = {
  units: number;
  gross: number;
  estimatedNetRemaining: number;
};

export type PortfolioModeProjections = {
  item: PortfolioModeProjection | null;
  box: PortfolioModeProjection | null;
  rtyh: PortfolioModeProjection | null;
};

type PortfolioForecastLotInput = Pick<
  Lot,
  "id" |
  "lotType" |
  "boxesPurchased" |
  "packsPerBox" |
  "spotsPerBox" |
  "sellingTaxPercent" |
  "sellingShippingPerOrder" |
  "packPrice" |
  "boxPriceSell" |
  "spotPrice" |
  "targetProfitPercent"
>;

export function computeLotModeProjections(payload: {
  lot: PortfolioForecastLotInput;
  summary: {
    soldPacks: number;
    totalPacks: number;
    totalCost: number;
  };
  isCurrentLot: boolean;
  hasProAccess: boolean;
  livePackPrice: number;
  liveBoxPriceSell: number;
  liveSpotPrice: number;
}): PortfolioModeProjections {
  const totalPacks = Math.max(0, Number(payload.summary.totalPacks) || 0);
  const soldPacks = Math.max(0, Number(payload.summary.soldPacks) || 0);
  const remainingItems = Math.max(0, totalPacks - soldPacks);
  if (remainingItems <= 0) {
    return { item: null, box: null, rtyh: null };
  }

  const lotTaxPercent = Math.max(0, Number(payload.lot.sellingTaxPercent) || 0);
  const lotShipping = Math.max(0, Number(payload.lot.sellingShippingPerOrder) || 0);
  const lotType = payload.lot.lotType === "singles" ? "singles" : "bulk";

  let itemUnitPrice = 0;
  if (lotType === "singles") {
    const avgBasis = totalPacks > 0
      ? (Math.max(0, Number(payload.summary.totalCost) || 0) / totalPacks)
      : 0;
    const lotTargetProfitPercent = payload.hasProAccess
      ? Math.max(0, Number(payload.lot.targetProfitPercent) || 0)
      : 0;
    const targetNetPerItem = avgBasis * (1 + (lotTargetProfitPercent / 100));
    itemUnitPrice = Math.max(0, calculateUnitPrice(1, targetNetPerItem, lotTaxPercent, lotShipping));
  } else {
    itemUnitPrice = Math.max(
      0,
      Number(payload.isCurrentLot ? payload.livePackPrice : payload.lot.packPrice) || 0
    );
  }

  const item = createForecastProjectionFromUnitPrice({
    units: remainingItems,
    unitPrice: itemUnitPrice,
    sellingTaxPercent: lotTaxPercent,
    shippingPerOrder: lotShipping
  });

  if (lotType === "singles") {
    return { item, box: null, rtyh: null };
  }

  let box: PortfolioModeProjection | null = null;
  const packsPerBox = Math.max(0, Number(payload.lot.packsPerBox) || 0);
  if (packsPerBox > 0) {
    const boxUnits = remainingItems / packsPerBox;
    const boxUnitPrice = Math.max(
      0,
      Number(payload.isCurrentLot ? payload.liveBoxPriceSell : payload.lot.boxPriceSell) || 0
    );
    box = createForecastProjectionFromUnitPrice({
      units: boxUnits,
      unitPrice: boxUnitPrice,
      sellingTaxPercent: lotTaxPercent,
      shippingPerOrder: lotShipping
    });
  }

  let rtyh: PortfolioModeProjection | null = null;
  if (totalPacks > 0) {
    const lotSpotsTotal = calculateTotalSpots(
      payload.lot.boxesPurchased,
      payload.lot.spotsPerBox || DEFAULT_VALUES.SPOTS_PER_BOX
    );
    const spotUnits = (remainingItems / totalPacks) * lotSpotsTotal;
    if (spotUnits > 0) {
      const spotUnitPrice = Math.max(
        0,
        Number(payload.isCurrentLot ? payload.liveSpotPrice : payload.lot.spotPrice) || 0
      );
      rtyh = createForecastProjectionFromUnitPrice({
        units: spotUnits,
        unitPrice: spotUnitPrice,
        sellingTaxPercent: lotTaxPercent,
        shippingPerOrder: lotShipping
      });
    }
  }

  return { item, box, rtyh };
}

export function buildScenarioFromProjection<Id extends PortfolioForecastModeId>(payload: {
  id: Id;
  label: string;
  unitLabel: ForecastScenarioUnitLabel;
  projection: PortfolioModeProjection | null;
  baseRevenue: number;
  baseCost: number;
}): ForecastScenario<Id> | null {
  return createForecastScenarioFromProjection(payload);
}

export function summarizeForecastAverage(payload: {
  projections: Array<PortfolioModeProjection | null>;
  baseRevenue: number;
  baseCost: number;
}): {
  forecastScenarioCount: number;
  forecastRevenueAverage: number | null;
  forecastProfitAverage: number | null;
} {
  const validProjections = payload.projections.filter(
    (projection): projection is PortfolioModeProjection => !!projection && projection.units > 0
  );
  const forecastScenarioCount = validProjections.length;
  if (forecastScenarioCount === 0) {
    return {
      forecastScenarioCount: 0,
      forecastRevenueAverage: null,
      forecastProfitAverage: null
    };
  }

  const forecastRevenues = validProjections.map((projection) => {
    return (Number(payload.baseRevenue) || 0) + projection.estimatedNetRemaining;
  });
  const forecastProfits = forecastRevenues.map((forecastRevenue) => {
    return forecastRevenue - (Number(payload.baseCost) || 0);
  });

  const forecastRevenueAverage = forecastRevenues.reduce((sum, value) => sum + value, 0) / forecastScenarioCount;
  const forecastProfitAverage = forecastProfits.reduce((sum, value) => sum + value, 0) / forecastScenarioCount;
  return {
    forecastScenarioCount,
    forecastRevenueAverage,
    forecastProfitAverage
  };
}
