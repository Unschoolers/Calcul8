import { DEFAULT_VALUES, TAX_RATES, WHATNOT_FEES } from "../constants.ts";
import type {
  CurrencyCode,
  LotType,
  PortfolioTotals,
  Lot,
  LotPerformanceSummary,
  Sale,
  SalesStatus,
  SinglesPurchaseEntry
} from "../types/app.ts";

export function toRate(percent: number): number {
  return Math.max(0, Number(percent) || 0) / 100;
}

export function calculateTotalPacks(boxesPurchased: number, packsPerBox: number, defaultPacksPerBox = 16): number {
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

export function calculateSinglesPurchaseTotals(
  entries: SinglesPurchaseEntry[] | undefined
): { totalQuantity: number; totalCost: number; totalMarketValue: number } {
  if (!Array.isArray(entries) || entries.length === 0) {
    return {
      totalQuantity: 0,
      totalCost: 0,
      totalMarketValue: 0
    };
  }

  return entries.reduce(
    (acc, entry) => {
      const quantity = Math.max(0, Math.floor(Number(entry.quantity) || 0));
      const cost = Math.max(0, Number(entry.cost) || 0);
      const marketValue = Math.max(0, Number(entry.marketValue) || 0);

      return {
        totalQuantity: acc.totalQuantity + quantity,
        totalCost: acc.totalCost + (cost * quantity),
        totalMarketValue: acc.totalMarketValue + (marketValue * quantity)
      };
    },
    {
      totalQuantity: 0,
      totalCost: 0,
      totalMarketValue: 0
    }
  );
}

export function getSinglesEntryUnitCostInSellingCurrency(
  entry: Pick<SinglesPurchaseEntry, "cost"> & { currency?: string },
  purchaseCurrency: CurrencyCode,
  sellingCurrency: CurrencyCode,
  exchangeRate: number,
  defaultExchangeRate = DEFAULT_VALUES.EXCHANGE_RATE
): number {
  const unitCost = Math.max(0, Number(entry.cost) || 0);
  const entryCurrency = entry.currency === "USD" || entry.currency === "CAD"
    ? entry.currency
    : purchaseCurrency;
  return calculateBoxPriceCostCad(
    unitCost,
    entryCurrency,
    sellingCurrency,
    exchangeRate,
    defaultExchangeRate
  );
}

export function calculateSinglesPurchaseTotalCostInSellingCurrency(params: {
  entries: SinglesPurchaseEntry[] | undefined;
  purchaseCurrency: CurrencyCode;
  sellingCurrency: CurrencyCode;
  exchangeRate: number;
  defaultExchangeRate?: number;
}): number {
  if (!Array.isArray(params.entries) || params.entries.length === 0) return 0;

  return params.entries.reduce((sum, entry) => {
    const quantity = Math.max(0, Math.floor(Number(entry.quantity) || 0));
    const convertedUnitCost = getSinglesEntryUnitCostInSellingCurrency(
      entry,
      params.purchaseCurrency,
      params.sellingCurrency,
      params.exchangeRate,
      params.defaultExchangeRate
    );
    return sum + (convertedUnitCost * quantity);
  }, 0);
}

type SaleLineLike = {
  singlesPurchaseEntryId?: number;
  quantity: number;
  price: number;
};

export type SinglesLineProfitPreview = {
  value: number;
  unitValue: number | null;
  quantity: number;
  percent: number;
  sign: "+" | "-";
  colorClass: string;
  basisLabel: "Market" | "Cost";
  basisValue: number;
  marketBasisValue: number;
  costBasisValue: number;
};

export type SinglesSaleProfitPreview = {
  value: number;
  unitValue: number | null;
  quantity: number;
  percent: number;
  sign: "+" | "-";
  colorClass: string;
  basisLabel: "Market" | "Cost" | "Mixed";
  basisValue: number;
  marketBasisValue: number;
  costBasisValue: number;
};

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

function buildSinglesProfitPresentation<TBasisLabel extends "Market" | "Cost" | "Mixed">(params: {
  value: number;
  quantity: number;
  basisLabel: TBasisLabel;
  marketBasisValue: number;
  costBasisValue: number;
}): {
  value: number;
  unitValue: number | null;
  quantity: number;
  percent: number;
  sign: "+" | "-";
  colorClass: string;
  basisLabel: TBasisLabel;
  basisValue: number;
  marketBasisValue: number;
  costBasisValue: number;
} {
  const basisValue = params.marketBasisValue + params.costBasisValue;
  const percent = basisValue > 0
    ? (params.value / basisValue) * 100
    : (params.value >= 0 ? 100 : 0);
  const unitValue = params.quantity > 0 ? params.value / params.quantity : null;

  return {
    value: params.value,
    unitValue,
    quantity: params.quantity,
    percent,
    sign: params.value >= 0 ? "+" : "-",
    colorClass: params.value >= 0 ? "text-success" : "text-error",
    basisLabel: params.basisLabel,
    basisValue,
    marketBasisValue: params.marketBasisValue,
    costBasisValue: params.costBasisValue
  };
}

export function getSaleSinglesLines(
  sale: Pick<Sale, "singlesItems" | "singlesPurchaseEntryId" | "quantity" | "price">
): SaleLineLike[] {
  if (Array.isArray(sale.singlesItems) && sale.singlesItems.length > 0) {
    return sale.singlesItems
      .map((line) => {
        const entryId = Number(line.singlesPurchaseEntryId);
        return {
          singlesPurchaseEntryId: Number.isFinite(entryId) && entryId > 0 ? Math.floor(entryId) : undefined,
          quantity: Math.max(0, Math.floor(Number(line.quantity) || 0)),
          price: Math.max(0, Number(line.price) || 0)
        };
      })
      .filter((line) => line.quantity > 0);
  }

  const quantity = Math.max(0, Math.floor(Number(sale.quantity) || 0));
  if (quantity <= 0) return [];

  const entryId = Number(sale.singlesPurchaseEntryId);
  return [{
    singlesPurchaseEntryId: Number.isFinite(entryId) && entryId > 0 ? Math.floor(entryId) : undefined,
    quantity,
    price: Math.max(0, Number(sale.price) || 0)
  }];
}

export function calculateSinglesSaleCostBasis(params: {
  sale: Pick<Sale, "singlesItems" | "singlesPurchaseEntryId" | "quantity" | "price">;
  singlesPurchases: SinglesPurchaseEntry[] | undefined;
  purchaseCurrency: CurrencyCode;
  sellingCurrency: CurrencyCode;
  exchangeRate: number;
  defaultExchangeRate?: number;
}): number {
  const entriesById = new Map(
    (params.singlesPurchases || []).map((entry) => [entry.id, entry] as const)
  );

  return getSaleSinglesLines(params.sale).reduce((sum, line) => {
    if (!line.singlesPurchaseEntryId) return sum;
    const entry = entriesById.get(line.singlesPurchaseEntryId);
    if (!entry) return sum;
    const convertedUnitCost = getSinglesEntryUnitCostInSellingCurrency(
      entry,
      params.purchaseCurrency,
      params.sellingCurrency,
      params.exchangeRate,
      params.defaultExchangeRate
    );
    return sum + (convertedUnitCost * line.quantity);
  }, 0);
}

export function calculateSinglesLineProfitPreview(params: {
  line: { singlesPurchaseEntryId?: number | null; quantity?: number | null; price?: number | null };
  grossRevenue: number;
  netRevenue: number;
  singlesPurchases: Array<Pick<SinglesPurchaseEntry, "id" | "marketValue" | "cost"> & { currency?: string }> | undefined;
  purchaseCurrency: CurrencyCode;
  sellingCurrency: CurrencyCode;
  exchangeRate: number;
  defaultExchangeRate?: number;
}): SinglesLineProfitPreview | null {
  const entryId = Number(params.line.singlesPurchaseEntryId);
  const normalizedEntryId = Number.isFinite(entryId) && entryId > 0 ? Math.floor(entryId) : null;
  const quantity = Math.max(0, Math.floor(Number(params.line.quantity) || 0));
  const price = Math.max(0, Number(params.line.price) || 0);
  const hasMeaningfulInput = quantity > 0 || price > 0 || normalizedEntryId != null;
  if (!hasMeaningfulInput) return null;

  const grossRevenue = Math.max(0, Number(params.grossRevenue) || 0);
  const netRevenue = Number(params.netRevenue) || 0;
  const lineNetRevenue = grossRevenue > 0
    ? (netRevenue * (price / grossRevenue))
    : 0;

  const selectedEntry = normalizedEntryId != null
    ? (params.singlesPurchases || []).find((entry) => entry.id === normalizedEntryId)
    : null;
  const unitCost = selectedEntry
    ? getSinglesEntryUnitCostInSellingCurrency(
      selectedEntry,
      params.purchaseCurrency,
      params.sellingCurrency,
      params.exchangeRate,
      params.defaultExchangeRate
    )
    : 0;
  const unitMarket = Math.max(0, Number(selectedEntry?.marketValue) || 0);
  const marketBasisValue = unitMarket > 0 ? (unitMarket * quantity) : 0;
  const costBasisValue = unitMarket > 0 ? 0 : (unitCost * quantity);
  const basisProfit = lineNetRevenue - marketBasisValue - costBasisValue;

  const preview = buildSinglesProfitPresentation({
    value: basisProfit,
    quantity,
    basisLabel: marketBasisValue > 0 ? "Market" : "Cost",
    marketBasisValue,
    costBasisValue
  });

  return preview;
}

export function calculateSinglesSaleProfitPreview(
  linePreviews: Array<SinglesLineProfitPreview | null | undefined>
): SinglesSaleProfitPreview | null {
  const normalizedLines = linePreviews.filter(
    (line): line is SinglesLineProfitPreview => line != null
  );
  if (normalizedLines.length === 0) return null;

  const value = normalizedLines.reduce((sum, line) => sum + line.value, 0);
  const quantity = normalizedLines.reduce((sum, line) => sum + line.quantity, 0);
  const marketBasisValue = normalizedLines.reduce((sum, line) => sum + line.marketBasisValue, 0);
  const costBasisValue = normalizedLines.reduce((sum, line) => sum + line.costBasisValue, 0);
  const basisLabel = marketBasisValue > 0 && costBasisValue > 0
    ? "Mixed"
    : (marketBasisValue > 0 ? "Market" : "Cost");

  return buildSinglesProfitPresentation({
    value,
    quantity,
    basisLabel,
    marketBasisValue,
    costBasisValue
  });
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

export function createForecastProjectionFromUnitPrice(params: {
  units: number;
  unitPrice: number;
  sellingTaxPercent: number;
  shippingPerOrder?: number;
}): ForecastProjection {
  const units = Math.max(0, Number(params.units) || 0);
  const unitPrice = Math.max(0, Number(params.unitPrice) || 0);
  const gross = units * unitPrice;
  return {
    units,
    gross,
    estimatedNetRemaining: units > 0
      ? calculateNetFromGross(gross, params.sellingTaxPercent, params.shippingPerOrder, units)
      : 0
  };
}

export function estimateNetRemainingFromUnitPrice(payload: {
  units: number;
  unitPrice: number;
  sellingTaxPercent: number;
  shippingPerOrder?: number;
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
}): ForecastScenario<Id> {
  const projection = createForecastProjectionFromUnitPrice({
    units: params.units,
    unitPrice: params.unitPrice,
    sellingTaxPercent: params.sellingTaxPercent,
    shippingPerOrder: params.shippingPerOrder
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

export function getGrossRevenueForSale(sale: Pick<Sale, "quantity" | "price" | "priceIsTotal">): number {
  const quantity = Number(sale.quantity) || 0;
  const price = Number(sale.price) || 0;
  if (sale.priceIsTotal) {
    return Math.max(0, price);
  }
  return quantity * price;
}

export function calculateTotalRevenue(sales: Sale[], sellingTaxPercent: number): number {
  return sales.reduce((sum, sale) => {
    const grossRevenue = getGrossRevenueForSale(sale);
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

export function calculateSaleProfit(params: {
  sale: Sale;
  lotType: LotType;
  sellingTaxPercent: number;
  totalCaseCost: number;
  totalPacks: number;
  purchaseCurrency: CurrencyCode;
  sellingCurrency: CurrencyCode;
  exchangeRate: number;
  singlesPurchases?: SinglesPurchaseEntry[];
  defaultExchangeRate?: number;
}): number {
  const grossRevenue = getGrossRevenueForSale(params.sale);
  const netRevenue = calculateNetFromGross(
    grossRevenue,
    params.sellingTaxPercent,
    params.sale.buyerShipping || 0,
    1
  );

  if (params.lotType === "singles") {
    const allocatedCost = calculateSinglesSaleCostBasis({
      sale: params.sale,
      singlesPurchases: params.singlesPurchases,
      purchaseCurrency: params.purchaseCurrency,
      sellingCurrency: params.sellingCurrency,
      exchangeRate: params.exchangeRate,
      defaultExchangeRate: params.defaultExchangeRate
    });
    return netRevenue - allocatedCost;
  }

  const costPerPack = params.totalPacks > 0 ? (params.totalCaseCost / params.totalPacks) : 0;
  const allocatedCost = (params.sale.packsCount || 0) * costPerPack;
  return netRevenue - allocatedCost;
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
  totalSpots: number;
  totalPacks: number;
  sellingTaxPercent: number;
  sellingShippingPerOrder: number;
}): { spotPrice: number; boxPriceSell: number; packPrice: number } {
  const targetProfit = (params.totalCaseCost * (Number(params.targetProfitPercent) || 0)) / 100;
  const requiredNetRevenue = params.totalCaseCost + targetProfit;
  return {
    spotPrice: calculatePriceForUnits(params.totalSpots, requiredNetRevenue, params.sellingTaxPercent, params.sellingShippingPerOrder),
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
    const grossRevenue = getGrossRevenueForSale(sale);
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
    const grossRevenue = getGrossRevenueForSale(sale);
    const netRevenue = calculateNetFromGross(grossRevenue, sellingTaxPercent, sale.buyerShipping || 0, 1);
    cumulativeProfit += netRevenue;
  });

  const finalProfit = cumulativeProfit || -totalCaseCost;
  if (finalProfit < -100) return ["#FF3B30", "#FF6B6B"];
  if (finalProfit < 100) return ["#FFB800", "#FFA000"];
  return ["#34C759", "#4CD964"];
}

export function calculateLotPerformanceSummary(
  lot: Lot,
  sales: Sale[],
  defaultExchangeRate: number
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
  const totalRevenue = calculateTotalRevenue(sales, lot.sellingTaxPercent);
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
