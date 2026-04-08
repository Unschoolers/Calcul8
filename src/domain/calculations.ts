import { DEFAULT_VALUES } from "../constants.ts";
import type {
  Lot,
  LotPerformanceSummary,
  PortfolioTotals,
  Sale,
  SalesStatus
} from "../types/app.ts";
import {
  calculateBoxPriceCostCad,
  calculateDefaultSellingPrices,
  calculateExactPriceForUnits,
  calculateNetFromGross,
  calculateTotalRevenueWithFees,
  calculatePriceForUnits,
  calculateProfitForListing,
  calculateSaleProfit,
  calculateSinglesLineProfitPreview,
  calculateSinglesPurchaseTotalCostInSellingCurrency,
  calculateSinglesPurchaseTotalMarketValueInSellingCurrency,
  calculateSinglesPurchaseTotals,
  calculateSinglesSaleCostBasis,
  calculateSinglesSaleProfitPreview,
  calculateTotalCaseCost,
  calculateTotalRevenue,
  getGrossRevenueForSale,
  getSaleProfitPreview,
  getSaleSinglesLines,
  getSinglesEntryUnitCostInSellingCurrency,
  getSinglesEntryUnitMarketValueInSellingCurrency,
  normalizeAdditionalFeeAppliesTo,
  resolveFeePolicy,
  type FeeProfileInput,
  toRate,
  type FeePolicy,
  type SaleProfitPreview,
  type SinglesLineProfitPreview,
  type SinglesSaleProfitPreview
} from "./calculations-fees.ts";
import {
  createForecastProjectionFromUnitPrice,
  createForecastScenario,
  createForecastScenarioFromProjection,
  createForecastScenarioFromUnitPrice,
  estimateNetRemainingFromUnitPrice,
  pickBestForecastScenario,
  type ForecastProjection,
  type ForecastScenario,
  type ForecastScenarioUnitLabel
} from "./calculations-forecast.ts";
import {
  calculatePortfolioSellThroughTimeline,
  calculateSparklineData,
  calculateSparklineGradient,
  type PortfolioSellThroughPoint
} from "./calculations-portfolio.ts";

export {
  calculateBoxPriceCostCad,
  calculateDefaultSellingPrices,
  calculateExactPriceForUnits,
  calculateNetFromGross,
  calculatePortfolioSellThroughTimeline,
  calculatePriceForUnits,
  calculateProfitForListing,
  calculateSaleProfit,
  calculateSinglesLineProfitPreview,
  calculateSinglesPurchaseTotalCostInSellingCurrency,
  calculateSinglesPurchaseTotalMarketValueInSellingCurrency,
  calculateSinglesPurchaseTotals,
  calculateSinglesSaleCostBasis,
  calculateSinglesSaleProfitPreview,
  calculateSparklineData,
  calculateSparklineGradient,
  calculateTotalCaseCost,
  calculateTotalRevenue,
  calculateTotalRevenueWithFees,
  createForecastProjectionFromUnitPrice, createForecastScenario,
  createForecastScenarioFromProjection,
  createForecastScenarioFromUnitPrice,
  estimateNetRemainingFromUnitPrice,
  getGrossRevenueForSale,
  getSaleProfitPreview,
  getSaleSinglesLines,
  getSinglesEntryUnitCostInSellingCurrency,
  getSinglesEntryUnitMarketValueInSellingCurrency,
  normalizeAdditionalFeeAppliesTo,
  pickBestForecastScenario,
  resolveFeePolicy,
  toRate
};

export type {
  FeeProfileInput,
  FeePolicy,
  ForecastProjection,
  ForecastScenario,
  ForecastScenarioUnitLabel,
  PortfolioSellThroughPoint,
  SaleProfitPreview,
  SinglesLineProfitPreview,
  SinglesSaleProfitPreview
};

export function calculateTotalPacks(
  boxesPurchased: number,
  packsPerBox: number,
  defaultPacksPerBox = 16
): number {
  return (Number(boxesPurchased) || 0) * (Number(packsPerBox) || defaultPacksPerBox);
}

export function calculateTotalSpots(
  boxesPurchased: number,
  spotsPerBox = DEFAULT_VALUES.SPOTS_PER_BOX
): number {
  const boxes = Number(boxesPurchased) || 0;
  const spots = Number(spotsPerBox) || 0;
  if (boxes <= 0 || spots <= 0) return 0;
  return boxes * spots;
}

export function calculateSoldPacksCount(sales: Sale[]): number {
  return sales.reduce((sum, sale) => sum + (sale.packsCount || 0), 0);
}

export function calculateSalesProgress(soldPacksCount: number, totalPacks: number): number {
  const total = Number(totalPacks) || 0;
  if (total === 0) return 0;
  return ((Number(soldPacksCount) || 0) / total) * 100;
}

export function calculateSalesStatus(
  totalRevenue: number,
  totalLotCost: number,
  salesProgress: number
): SalesStatus {
  const profit = totalRevenue - totalLotCost;
  const percentSold = salesProgress;

  if (percentSold === 0) {
    return { color: "grey", icon: "mdi-information", title: "No Sales Yet", profit: 0, revenue: 0 };
  }
  if (profit < 0) {
    return { color: "error", icon: "mdi-alert-circle", title: "Below Break-Even", profit, revenue: totalRevenue };
  }
  if (percentSold < 100) {
    return { color: "warning", icon: "mdi-alert", title: "Break-Even Reached", profit, revenue: totalRevenue };
  }
  return { color: "success", icon: "mdi-check-circle", title: "Lot Complete & Profitable", profit, revenue: totalRevenue };
}

export function calculateLotPerformanceSummary(
  lot: Lot,
  sales: Sale[],
  defaultExchangeRate: number,
  feeProfileInput: FeeProfileInput = lot
): LotPerformanceSummary {
  const isSinglesLot = lot.lotType === "singles";
  const singlesTotals = calculateSinglesPurchaseTotals(lot.singlesPurchases);
  const singlesTotalCostInSellingCurrency = calculateSinglesPurchaseTotalCostInSellingCurrency({
    entries: lot.singlesPurchases,
    purchaseCurrency: lot.currency,
    sellingCurrency: lot.sellingCurrency,
    exchangeRate: lot.exchangeRate,
    defaultExchangeRate
  });
  const totalPacks = isSinglesLot
    ? (singlesTotalCostInSellingCurrency > 0 ? singlesTotals.totalQuantity : 0)
    : calculateTotalPacks(lot.boxesPurchased, lot.packsPerBox, 16);
  const soldPacks = calculateSoldPacksCount(sales);
  const totalCost = isSinglesLot
    ? singlesTotalCostInSellingCurrency
    : calculateTotalCaseCost({
      boxesPurchased: lot.boxesPurchased,
      pricePerBoxCad: calculateBoxPriceCostCad(
        lot.boxPriceCost,
        lot.currency,
        lot.sellingCurrency,
        lot.exchangeRate,
        defaultExchangeRate
      ),
      purchaseShippingCad: calculateBoxPriceCostCad(
        lot.purchaseShippingCost,
        lot.currency,
        lot.sellingCurrency,
        lot.exchangeRate,
        defaultExchangeRate
      ),
      purchaseTaxPercent: lot.purchaseTaxPercent,
      includeTax: lot.includeTax,
      currency: lot.currency
    });
  const totalRevenue = calculateTotalRevenueWithFees(sales, lot.sellingTaxPercent, feeProfileInput);
  const totalProfit = totalRevenue - totalCost;
  const marginPercent = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : null;

  let lastSaleDate: string | null = null;
  for (const sale of sales) {
    if (!lastSaleDate || sale.date > lastSaleDate) {
      lastSaleDate = sale.date;
    }
  }

  return {
    lotId: lot.id,
    lotName: lot.name,
    salesCount: sales.length,
    totalRevenue,
    totalCost,
    totalProfit,
    marginPercent,
    soldPacks,
    totalPacks,
    lastSaleDate
  };
}

export function calculatePortfolioTotals(rows: LotPerformanceSummary[]): PortfolioTotals {
  return rows.reduce<PortfolioTotals>(
    (acc, row) => ({
      lotCount: acc.lotCount + 1,
      profitableLotCount: acc.profitableLotCount + (row.totalProfit > 0 ? 1 : 0),
      totalSalesCount: acc.totalSalesCount + row.salesCount,
      totalRevenue: acc.totalRevenue + row.totalRevenue,
      totalCost: acc.totalCost + row.totalCost,
      totalProfit: acc.totalProfit + row.totalProfit
    }),
    {
      lotCount: 0,
      profitableLotCount: 0,
      totalSalesCount: 0,
      totalRevenue: 0,
      totalCost: 0,
      totalProfit: 0
    }
  );
}
