import { TAX_RATES, UNITS_PER_CASE, WHATNOT_FEES } from "../constants.ts";
import type { CurrencyCode, Sale, SalesStatus } from "../types/app.ts";

export function toRate(percent: number): number {
  return Math.max(0, Number(percent) || 0) / 100;
}

export function calculateTotalPacks(boxesPurchased: number, packsPerBox: number, defaultPacksPerBox = 16): number {
  return (Number(boxesPurchased) || 0) * (Number(packsPerBox) || defaultPacksPerBox);
}

export function calculateBoxPriceCostCad(
  boxPriceCost: number,
  currency: CurrencyCode,
  exchangeRate: number,
  defaultExchangeRate: number
): number {
  const price = Number(boxPriceCost) || 0;
  const rate = Number(exchangeRate) || defaultExchangeRate;
  return currency === "USD" ? price * rate : price;
}

export function calculateTotalCaseCost(params: {
  boxesPurchased: number;
  pricePerBoxCad: number;
  purchaseTaxPercent: number;
  includeTax: boolean;
  currency: CurrencyCode;
}): number {
  const boxes = Number(params.boxesPurchased) || 0;
  const basePrice = (Number(params.pricePerBoxCad) || 0) * boxes;
  const purchaseTaxRate = toRate(params.purchaseTaxPercent);
  const withTax = params.includeTax ? basePrice * (1 + purchaseTaxRate) : basePrice;
  const customs = params.currency === "USD" ? withTax * TAX_RATES.CUSTOMS : 0;
  return withTax + customs;
}

export function calculateNetFromGross(grossRevenue: number, units: number, sellingTaxPercent: number): number {
  const gross = Number(grossRevenue) || 0;
  const qty = Number(units) || 0;
  const buyerTaxRate = toRate(sellingTaxPercent);
  const orderTotal = gross * (1 + buyerTaxRate);

  const commission = gross * WHATNOT_FEES.COMMISSION;
  const processingPct = orderTotal * WHATNOT_FEES.PROCESSING;
  const processingFixed = WHATNOT_FEES.FIXED * qty;

  return gross - commission - processingPct - processingFixed;
}

export function calculateTotalRevenue(sales: Sale[], sellingTaxPercent: number): number {
  return sales.reduce((sum, sale) => {
    const grossRevenue = (sale.quantity || 0) * (sale.price || 0);
    return sum + calculateNetFromGross(grossRevenue, sale.quantity || 0, sellingTaxPercent);
  }, 0);
}

export function calculateSoldPacksCount(sales: Sale[]): number {
  return sales.reduce((sum, sale) => sum + (sale.packsCount || 0), 0);
}

export function calculateSalesProgress(soldPacksCount: number, totalPacks: number): number {
  const total = Number(totalPacks) || 0;
  if (total === 0) return 0;
  return ((Number(soldPacksCount) || 0) / total) * 100;
}

export function calculateSalesStatus(totalRevenue: number, totalCaseCost: number, salesProgress: number): SalesStatus {
  const profit = totalRevenue - totalCaseCost;
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
  return { color: "success", icon: "mdi-check-circle", title: "Case Complete & Profitable", profit, revenue: totalRevenue };
}

export function calculateProfitForListing(
  units: number,
  pricePerUnit: number,
  totalCaseCost: number,
  sellingTaxPercent: number
): number {
  const safeUnits = Number(units) || 0;
  const safePrice = Number(pricePerUnit) || 0;
  const grossRevenue = safeUnits * safePrice;
  const netRevenue = calculateNetFromGross(grossRevenue, safeUnits, sellingTaxPercent);
  return netRevenue - totalCaseCost;
}

export function calculatePriceForUnits(units: number, targetNetRevenue: number, sellingTaxPercent: number): number {
  const u = Number(units) || 1;
  const buyerTaxRate = toRate(sellingTaxPercent);
  const effectiveFeeRate = 1 - WHATNOT_FEES.COMMISSION - (WHATNOT_FEES.PROCESSING * (1 + buyerTaxRate));
  const fixedFees = WHATNOT_FEES.FIXED * u;
  if (effectiveFeeRate <= 0) return 0;

  const price = (targetNetRevenue + fixedFees) / (u * effectiveFeeRate);
  return Math.round(price);
}

export function calculateDefaultSellingPrices(params: {
  totalCaseCost: number;
  targetProfitPercent: number;
  boxesPurchased: number;
  totalPacks: number;
  sellingTaxPercent: number;
}): { spotPrice: number; boxPriceSell: number; packPrice: number } {
  const targetProfit = (params.totalCaseCost * (Number(params.targetProfitPercent) || 0)) / 100;
  const requiredNetRevenue = params.totalCaseCost + targetProfit;
  return {
    spotPrice: calculatePriceForUnits(UNITS_PER_CASE.SPOT, requiredNetRevenue, params.sellingTaxPercent),
    boxPriceSell: calculatePriceForUnits(params.boxesPurchased, requiredNetRevenue, params.sellingTaxPercent),
    packPrice: calculatePriceForUnits(params.totalPacks, requiredNetRevenue, params.sellingTaxPercent)
  };
}

function sortSalesByDateAsc(sales: Sale[]): Sale[] {
  return [...sales].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export function calculateSparklineData(sales: Sale[], totalCaseCost: number, sellingTaxPercent: number): number[] {
  const sortedSales = sortSalesByDateAsc(sales);
  let cumulativeProfit = -totalCaseCost;
  const data = [cumulativeProfit];

  sortedSales.forEach((sale) => {
    const grossRevenue = (sale.quantity || 0) * (sale.price || 0);
    const netRevenue = calculateNetFromGross(grossRevenue, sale.quantity || 0, sellingTaxPercent);
    cumulativeProfit += netRevenue;
    data.push(cumulativeProfit);
  });

  const minValue = Math.min(...data);
  return data.map((val) => val - minValue);
}

export function calculateSparklineGradient(sales: Sale[], totalCaseCost: number, sellingTaxPercent: number): string[] {
  const sortedSales = sortSalesByDateAsc(sales);
  let cumulativeProfit = -totalCaseCost;

  sortedSales.forEach((sale) => {
    const grossRevenue = (sale.quantity || 0) * (sale.price || 0);
    const netRevenue = calculateNetFromGross(grossRevenue, sale.quantity || 0, sellingTaxPercent);
    cumulativeProfit += netRevenue;
  });

  const finalProfit = cumulativeProfit || -totalCaseCost;
  if (finalProfit < -100) return ["#FF3B30", "#FF6B6B"];
  if (finalProfit < 100) return ["#FFB800", "#FFA000"];
  return ["#34C759", "#4CD964"];
}
