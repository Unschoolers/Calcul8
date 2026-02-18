import { TAX_RATES, UNITS_PER_CASE, WHATNOT_FEES } from "../constants.ts";
import type {
  CurrencyCode,
  PortfolioTotals,
  Preset,
  PresetPerformanceSummary,
  Sale,
  SalesStatus
} from "../types/app.ts";

export function toRate(percent: number): number {
  return Math.max(0, Number(percent) || 0) / 100;
}

export function calculateTotalPacks(boxesPurchased: number, packsPerBox: number, defaultPacksPerBox = 16): number {
  return (Number(boxesPurchased) || 0) * (Number(packsPerBox) || defaultPacksPerBox);
}

export function calculateBoxPriceCostCad(
  boxPriceCost: number,
  buyCurrency: CurrencyCode,
  sellingCurrency: CurrencyCode,
  exchangeRate: number,
  defaultExchangeRate: number
): number {
  const price = Number(boxPriceCost) || 0;
  const rate = Number(exchangeRate) || defaultExchangeRate;
  if (buyCurrency === sellingCurrency) {
    return price;
  }
  // Convert both ways using USD->CAD exchange rate.
  if (buyCurrency === "USD" && sellingCurrency === "CAD") {
    return price * rate;
  }
  if (buyCurrency === "CAD" && sellingCurrency === "USD") {
    return rate > 0 ? price / rate : price;
  }
  return price;
}

export function calculateTotalCaseCost(params: {
  boxesPurchased: number;
  pricePerBoxCad: number;
  purchaseShippingCad: number;
  purchaseTaxPercent: number;
  includeTax: boolean;
  currency: CurrencyCode;
}): number {
  const boxes = Number(params.boxesPurchased) || 0;
  const basePrice = (Number(params.pricePerBoxCad) || 0) * boxes;
  const shippingCost = Number(params.purchaseShippingCad) || 0;
  const purchaseTaxRate = toRate(params.purchaseTaxPercent);
  const withTax = params.includeTax ? basePrice * (1 + purchaseTaxRate) : basePrice;
  const customs = params.currency === "USD" ? withTax * TAX_RATES.CUSTOMS : 0;
  return withTax + customs + shippingCost;
}

export function calculateNetFromGross(
  grossRevenue: number,
  sellingTaxPercent: number,
  buyerShippingPerOrder = 0,
  orderCount = 1
): number {
  const gross = Number(grossRevenue) || 0;
  const buyerTaxRate = toRate(sellingTaxPercent);
  const orders = Math.max(1, Number(orderCount) || 1);
  const shippingTotal = (Number(buyerShippingPerOrder) || 0) * orders;
  const orderTotal = (gross * (1 + buyerTaxRate)) + shippingTotal;
  const commission = gross * WHATNOT_FEES.COMMISSION;
  const processingPct = orderTotal * WHATNOT_FEES.PROCESSING;
  const processingFixed = WHATNOT_FEES.FIXED * orders;

  return gross - commission - processingPct - processingFixed;
}

export function calculateTotalRevenue(sales: Sale[], sellingTaxPercent: number): number {
  return sales.reduce((sum, sale) => {
    const grossRevenue = (sale.quantity || 0) * (sale.price || 0);
    const buyerShipping = Number(sale.buyerShipping) || 0;
    return sum + calculateNetFromGross(grossRevenue, sellingTaxPercent, buyerShipping, 1);
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
  sellingTaxPercent: number,
  buyerShippingPerOrder = 0
): number {
  const safeUnits = Number(units) || 0;
  const safePrice = Number(pricePerUnit) || 0;
  const grossRevenue = safeUnits * safePrice;
  const netRevenue = calculateNetFromGross(grossRevenue, sellingTaxPercent, buyerShippingPerOrder, safeUnits);
  return netRevenue - totalCaseCost;
}

export function calculatePriceForUnits(
  units: number,
  targetNetRevenue: number,
  sellingTaxPercent: number,
  buyerShippingPerOrder = 0
): number {
  const u = Number(units) || 1;
  const buyerTaxRate = toRate(sellingTaxPercent);
  const effectiveFeeRate = 1 - WHATNOT_FEES.COMMISSION - (WHATNOT_FEES.PROCESSING * (1 + buyerTaxRate));
  const perOrderFixed = WHATNOT_FEES.FIXED + (WHATNOT_FEES.PROCESSING * (Number(buyerShippingPerOrder) || 0));
  const fixedFees = perOrderFixed * u;
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
  sellingShippingPerOrder: number;
}): { spotPrice: number; boxPriceSell: number; packPrice: number } {
  const targetProfit = (params.totalCaseCost * (Number(params.targetProfitPercent) || 0)) / 100;
  const requiredNetRevenue = params.totalCaseCost + targetProfit;
  return {
    spotPrice: calculatePriceForUnits(UNITS_PER_CASE.SPOT, requiredNetRevenue, params.sellingTaxPercent, params.sellingShippingPerOrder),
    boxPriceSell: calculatePriceForUnits(params.boxesPurchased, requiredNetRevenue, params.sellingTaxPercent, params.sellingShippingPerOrder),
    packPrice: calculatePriceForUnits(params.totalPacks, requiredNetRevenue, params.sellingTaxPercent, params.sellingShippingPerOrder)
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
    const netRevenue = calculateNetFromGross(grossRevenue, sellingTaxPercent, sale.buyerShipping || 0, 1);
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
    const netRevenue = calculateNetFromGross(grossRevenue, sellingTaxPercent, sale.buyerShipping || 0, 1);
    cumulativeProfit += netRevenue;
  });

  const finalProfit = cumulativeProfit || -totalCaseCost;
  if (finalProfit < -100) return ["#FF3B30", "#FF6B6B"];
  if (finalProfit < 100) return ["#FFB800", "#FFA000"];
  return ["#34C759", "#4CD964"];
}

export function calculatePresetPerformanceSummary(
  preset: Preset,
  sales: Sale[],
  defaultExchangeRate: number
): PresetPerformanceSummary {
  const totalPacks = calculateTotalPacks(preset.boxesPurchased, preset.packsPerBox, 16);
  const soldPacks = calculateSoldPacksCount(sales);
  const pricePerBoxCad = calculateBoxPriceCostCad(
    preset.boxPriceCost,
    preset.currency,
    preset.sellingCurrency,
    preset.exchangeRate,
    defaultExchangeRate
  );
  const totalCost = calculateTotalCaseCost({
    boxesPurchased: preset.boxesPurchased,
    pricePerBoxCad,
    purchaseShippingCad: calculateBoxPriceCostCad(
      preset.purchaseShippingCost,
      preset.currency,
      preset.sellingCurrency,
      preset.exchangeRate,
      defaultExchangeRate
    ),
    purchaseTaxPercent: preset.purchaseTaxPercent,
    includeTax: preset.includeTax,
    currency: preset.currency
  });
  const totalRevenue = calculateTotalRevenue(sales, preset.sellingTaxPercent);
  const totalProfit = totalRevenue - totalCost;
  const marginPercent = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : null;

  let lastSaleDate: string | null = null;
  for (const sale of sales) {
    if (!lastSaleDate || sale.date > lastSaleDate) {
      lastSaleDate = sale.date;
    }
  }

  return {
    presetId: preset.id,
    presetName: preset.name,
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

export function calculatePortfolioTotals(rows: PresetPerformanceSummary[]): PortfolioTotals {
  return rows.reduce<PortfolioTotals>(
    (acc, row) => ({
      presetCount: acc.presetCount + 1,
      profitablePresetCount: acc.profitablePresetCount + (row.totalProfit > 0 ? 1 : 0),
      totalSalesCount: acc.totalSalesCount + row.salesCount,
      totalRevenue: acc.totalRevenue + row.totalRevenue,
      totalCost: acc.totalCost + row.totalCost,
      totalProfit: acc.totalProfit + row.totalProfit
    }),
    {
      presetCount: 0,
      profitablePresetCount: 0,
      totalSalesCount: 0,
      totalRevenue: 0,
      totalCost: 0,
      totalProfit: 0
    }
  );
}
