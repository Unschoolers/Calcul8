import { DEFAULT_FEE_PROFILE_FIELDS, DEFAULT_VALUES, TAX_RATES } from "../constants.ts";
import type {
    AdditionalFeeAppliesTo,
    CurrencyCode,
    FeeProfileFields,
    LotType,
    Sale,
    SinglesPurchaseEntry
} from "../types/app.ts";

export type { AdditionalFeeAppliesTo } from "../types/app.ts";

type ExplicitFeeFields = Pick<
  FeeProfileFields,
  "platformFeePercent" |
  "additionalFeePercent" |
  "additionalFeeAppliesTo" |
  "fixedFeePerOrder"
>;

export interface FeePolicy {
  platformFeePercent: number;
  additionalFeePercent: number;
  additionalFeeAppliesTo: AdditionalFeeAppliesTo;
  fixedFeePerOrder: number;
  platformFeeRate: number;
  additionalFeeRate: number;
}

export type FeeProfileInput =
  | Partial<ExplicitFeeFields>
  | null
  | undefined;

export function toRate(percent: number): number {
  return Math.max(0, Number(percent) || 0) / 100;
}

export function normalizeAdditionalFeeAppliesTo(value: unknown): AdditionalFeeAppliesTo {
  return value === "sale_plus_shipping" ? "sale_plus_shipping" : "sale_only";
}

export function resolveFeePolicy(input: FeeProfileInput = DEFAULT_FEE_PROFILE_FIELDS): FeePolicy {
  const objectInput = typeof input === "object" && input ? input : null;
  const platformFeeCandidate = objectInput ? Number(objectInput.platformFeePercent) : NaN;
  const additionalFeeCandidate = objectInput ? Number(objectInput.additionalFeePercent) : NaN;
  const fixedFeeCandidate = objectInput ? Number(objectInput.fixedFeePerOrder) : NaN;

  const platformFeePercent = Math.max(
    0,
    Number.isFinite(platformFeeCandidate) ? platformFeeCandidate : DEFAULT_FEE_PROFILE_FIELDS.platformFeePercent
  );
  const additionalFeePercent = Math.max(
    0,
    Number.isFinite(additionalFeeCandidate) ? additionalFeeCandidate : DEFAULT_FEE_PROFILE_FIELDS.additionalFeePercent
  );
  const fixedFeePerOrder = Math.max(
    0,
    Number.isFinite(fixedFeeCandidate) ? fixedFeeCandidate : DEFAULT_FEE_PROFILE_FIELDS.fixedFeePerOrder
  );
  const additionalFeeAppliesTo = normalizeAdditionalFeeAppliesTo(
    objectInput?.additionalFeeAppliesTo ?? DEFAULT_FEE_PROFILE_FIELDS.additionalFeeAppliesTo
  );

  return {
    platformFeePercent,
    additionalFeePercent,
    additionalFeeAppliesTo,
    fixedFeePerOrder,
    platformFeeRate: toRate(platformFeePercent),
    additionalFeeRate: toRate(additionalFeePercent)
  };
}

function calculateNetFromGrossWithPolicy(
  policy: FeePolicy,
  grossRevenue: number,
  _sellingTaxPercent: number,
  buyerShippingPerOrder: number,
  orderCount: number
): number {
  const gross = Number(grossRevenue) || 0;
  const orders = Math.max(1, Number(orderCount) || 1);
  const shippingTotal = (Number(buyerShippingPerOrder) || 0) * orders;
  const additionalFeeBase = policy.additionalFeeAppliesTo === "sale_plus_shipping"
    ? gross + shippingTotal
    : gross;
  const platformFee = gross * policy.platformFeeRate;
  const additionalFee = additionalFeeBase * policy.additionalFeeRate;
  const fixedFee = policy.fixedFeePerOrder * orders;

  return gross - platformFee - additionalFee - fixedFee;
}

function calculateRawPriceForUnitsWithPolicy(
  policy: FeePolicy,
  units: number,
  targetNetRevenue: number,
  _sellingTaxPercent: number,
  buyerShippingPerOrder: number
): number {
  const u = Number(units) || 1;
  const effectiveFeeRate = 1 - policy.platformFeeRate - policy.additionalFeeRate;
  const additionalShippingFee = policy.additionalFeeAppliesTo === "sale_plus_shipping"
    ? policy.additionalFeeRate * (Number(buyerShippingPerOrder) || 0)
    : 0;
  const perOrderFixed = policy.fixedFeePerOrder + additionalShippingFee;
  const fixedFees = perOrderFixed * u;
  if (effectiveFeeRate <= 0) return 0;

  return (targetNetRevenue + fixedFees) / (u * effectiveFeeRate);
}

function calculatePriceForUnitsWithPolicy(
  policy: FeePolicy,
  units: number,
  targetNetRevenue: number,
  sellingTaxPercent: number,
  buyerShippingPerOrder: number
): number {
  return Math.round(calculateRawPriceForUnitsWithPolicy(
    policy,
    units,
    targetNetRevenue,
    sellingTaxPercent,
    buyerShippingPerOrder
  ));
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
): { totalQuantity: number; totalCost: number } {
  if (!Array.isArray(entries) || entries.length === 0) {
    return {
      totalQuantity: 0,
      totalCost: 0
    };
  }

  return entries.reduce(
    (acc, entry) => {
      const quantity = Math.max(0, Math.floor(Number(entry.quantity) || 0));
      const cost = Math.max(0, Number(entry.cost) || 0);

      return {
        totalQuantity: acc.totalQuantity + quantity,
        totalCost: acc.totalCost + (cost * quantity)
      };
    },
    {
      totalQuantity: 0,
      totalCost: 0
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

export function getSinglesEntryUnitMarketValueInSellingCurrency(
  entry: Pick<SinglesPurchaseEntry, "marketValue"> & { marketValueCurrency?: string; currency?: string },
  fallbackMarketCurrency: CurrencyCode,
  sellingCurrency: CurrencyCode,
  exchangeRate: number,
  defaultExchangeRate = DEFAULT_VALUES.EXCHANGE_RATE
): number {
  const unitMarketValue = Math.max(0, Number(entry.marketValue) || 0);
  const marketCurrency = entry.marketValueCurrency === "USD" || entry.marketValueCurrency === "CAD"
    ? entry.marketValueCurrency
    : (entry.currency === "USD" || entry.currency === "CAD"
      ? entry.currency
      : fallbackMarketCurrency);
  return calculateBoxPriceCostCad(
    unitMarketValue,
    marketCurrency,
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

export function calculateSinglesPurchaseTotalMarketValueInSellingCurrency(params: {
  entries: SinglesPurchaseEntry[] | undefined;
  fallbackMarketCurrency: CurrencyCode;
  sellingCurrency: CurrencyCode;
  exchangeRate: number;
  defaultExchangeRate?: number;
}): number {
  if (!Array.isArray(params.entries) || params.entries.length === 0) return 0;

  return params.entries.reduce((sum, entry) => {
    const quantity = Math.max(0, Math.floor(Number(entry.quantity) || 0));
    const convertedUnitMarketValue = getSinglesEntryUnitMarketValueInSellingCurrency(
      entry,
      params.fallbackMarketCurrency,
      params.sellingCurrency,
      params.exchangeRate,
      params.defaultExchangeRate
    );
    return sum + (convertedUnitMarketValue * quantity);
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

export type SaleProfitPreview = SinglesSaleProfitPreview & {
  /** Profit vs pure cost basis (all lines using cost, ignoring market values). */
  allCostBasisValue: number;
  allCostValue: number;
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
  singlesPurchases: Array<Pick<SinglesPurchaseEntry, "id" | "marketValue" | "cost"> & { currency?: string; marketValueCurrency?: string }> | undefined;
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
  const unitMarket = selectedEntry
    ? getSinglesEntryUnitMarketValueInSellingCurrency(
      selectedEntry,
      params.purchaseCurrency,
      params.sellingCurrency,
      params.exchangeRate,
      params.defaultExchangeRate
    )
    : 0;
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
  orderCount = 1,
  feeProfileInput: FeeProfileInput = DEFAULT_FEE_PROFILE_FIELDS
): number {
  return calculateNetFromGrossWithPolicy(
    resolveFeePolicy(feeProfileInput),
    grossRevenue,
    sellingTaxPercent,
    buyerShippingPerOrder,
    orderCount
  );
}

export function getGrossRevenueForSale(sale: Pick<Sale, "quantity" | "price" | "priceIsTotal">): number {
  const quantity = Number(sale.quantity) || 0;
  const price = Number(sale.price) || 0;
  if (sale.priceIsTotal) {
    return Math.max(0, price);
  }
  return quantity * price;
}

function getStoredSaleNetRevenue(sale: Pick<Sale, "netRevenue">): number | null {
  const netRevenue = Number(sale.netRevenue);
  if (!Number.isFinite(netRevenue)) return null;
  return Math.max(0, netRevenue);
}

export function calculateTotalRevenue(
  sales: Sale[],
  sellingTaxPercent: number,
  feeProfileInput: FeeProfileInput = DEFAULT_FEE_PROFILE_FIELDS
): number {
  return calculateTotalRevenueWithFees(sales, sellingTaxPercent, feeProfileInput);
}

export function calculateTotalRevenueWithFees(
  sales: Sale[],
  sellingTaxPercent: number,
  feeProfileInput: FeeProfileInput = DEFAULT_FEE_PROFILE_FIELDS
): number {
  return sales.reduce((sum, sale) => {
    const storedNetRevenue = getStoredSaleNetRevenue(sale);
    if (storedNetRevenue != null) {
      return sum + storedNetRevenue;
    }
    const grossRevenue = getGrossRevenueForSale(sale);
    const buyerShipping = Number(sale.buyerShipping) || 0;
    return sum + calculateNetFromGross(grossRevenue, sellingTaxPercent, buyerShipping, 1, feeProfileInput);
  }, 0);
}

export function calculateProfitForListing(
  units: number,
  pricePerUnit: number,
  totalCaseCost: number,
  sellingTaxPercent: number,
  buyerShippingPerOrder = 0,
  feeProfileInput: FeeProfileInput = DEFAULT_FEE_PROFILE_FIELDS
): number {
  const safeUnits = Number(units) || 0;
  const safePrice = Number(pricePerUnit) || 0;
  const grossRevenue = safeUnits * safePrice;
  const netRevenue = calculateNetFromGross(grossRevenue, sellingTaxPercent, buyerShippingPerOrder, safeUnits, feeProfileInput);
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
  feeProfileInput?: FeeProfileInput;
}): number {
  const grossRevenue = getGrossRevenueForSale(params.sale);
  const netRevenue = getStoredSaleNetRevenue(params.sale) ?? calculateNetFromGross(
    grossRevenue,
    params.sellingTaxPercent,
    params.sale.buyerShipping || 0,
    1,
    params.feeProfileInput
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

export function getSaleProfitPreview(params: {
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
  feeProfileInput?: FeeProfileInput;
}): SaleProfitPreview | null {
  const grossRevenue = getGrossRevenueForSale(params.sale);
  const netRevenue = getStoredSaleNetRevenue(params.sale) ?? calculateNetFromGross(
    grossRevenue,
    params.sellingTaxPercent,
    params.sale.buyerShipping || 0,
    1,
    params.feeProfileInput
  );

  if (params.lotType === "singles") {
    const entriesById = new Map(
      (params.singlesPurchases || []).map((entry) => [entry.id, entry] as const)
    );
    const lines = getSaleSinglesLines(params.sale);
    let costBasisValue = 0;
    let marketBasisValue = 0;
    let allCostBasisValue = 0;
    let quantity = 0;

    for (const line of lines) {
      quantity += line.quantity;
      if (!line.singlesPurchaseEntryId) continue;
      const entry = entriesById.get(line.singlesPurchaseEntryId);
      if (!entry) continue;

      const unitCost = getSinglesEntryUnitCostInSellingCurrency(
        entry,
        params.purchaseCurrency,
        params.sellingCurrency,
        params.exchangeRate,
        params.defaultExchangeRate
      );
      const unitMarket = getSinglesEntryUnitMarketValueInSellingCurrency(
        entry,
        params.purchaseCurrency,
        params.sellingCurrency,
        params.exchangeRate,
        params.defaultExchangeRate
      );
      allCostBasisValue += unitCost * line.quantity;
      if (unitMarket > 0) {
        marketBasisValue += unitMarket * line.quantity;
      } else {
        costBasisValue += unitCost * line.quantity;
      }
    }

    const value = netRevenue - marketBasisValue - costBasisValue;
    const allCostValue = netRevenue - allCostBasisValue;
    const basisLabel: "Market" | "Cost" | "Mixed" =
      marketBasisValue > 0 && costBasisValue > 0 ? "Mixed"
      : marketBasisValue > 0 ? "Market"
      : "Cost";

    return { ...buildSinglesProfitPresentation({ value, quantity, basisLabel, marketBasisValue, costBasisValue }), allCostBasisValue, allCostValue };
  }

  const costPerPack = params.totalPacks > 0 ? (params.totalCaseCost / params.totalPacks) : 0;
  const allocatedCost = (params.sale.packsCount || 0) * costPerPack;
  const value = netRevenue - allocatedCost;
  const quantity = Number(params.sale.quantity) || 0;
  return {
    ...buildSinglesProfitPresentation({ value, quantity, basisLabel: "Cost", marketBasisValue: 0, costBasisValue: allocatedCost }),
    allCostBasisValue: allocatedCost,
    allCostValue: value
  };
}

export function calculatePriceForUnits(
  units: number,
  targetNetRevenue: number,
  sellingTaxPercent: number,
  buyerShippingPerOrder = 0,
  feeProfileInput: FeeProfileInput = DEFAULT_FEE_PROFILE_FIELDS
): number {
  return calculatePriceForUnitsWithPolicy(
    resolveFeePolicy(feeProfileInput),
    units,
    targetNetRevenue,
    sellingTaxPercent,
    buyerShippingPerOrder
  );
}

export function calculateExactPriceForUnits(
  units: number,
  targetNetRevenue: number,
  sellingTaxPercent: number,
  buyerShippingPerOrder = 0,
  feeProfileInput: FeeProfileInput = DEFAULT_FEE_PROFILE_FIELDS
): number {
  return calculateRawPriceForUnitsWithPolicy(
    resolveFeePolicy(feeProfileInput),
    units,
    targetNetRevenue,
    sellingTaxPercent,
    buyerShippingPerOrder
  );
}

export function calculateDefaultSellingPrices(params: {
  totalCaseCost: number;
  targetProfitPercent: number;
  boxesPurchased: number;
  totalSpots: number;
  totalPacks: number;
  sellingTaxPercent: number;
  sellingShippingPerOrder: number;
  feeProfileInput?: FeeProfileInput;
}): { spotPrice: number; boxPriceSell: number; packPrice: number } {
  const targetProfit = (params.totalCaseCost * (Number(params.targetProfitPercent) || 0)) / 100;
  const requiredNetRevenue = params.totalCaseCost + targetProfit;
  return {
    spotPrice: calculatePriceForUnits(
      params.totalSpots,
      requiredNetRevenue,
      params.sellingTaxPercent,
      params.sellingShippingPerOrder,
      params.feeProfileInput
    ),
    boxPriceSell: calculatePriceForUnits(
      params.boxesPurchased,
      requiredNetRevenue,
      params.sellingTaxPercent,
      params.sellingShippingPerOrder,
      params.feeProfileInput
    ),
    packPrice: calculatePriceForUnits(
      params.totalPacks,
      requiredNetRevenue,
      params.sellingTaxPercent,
      params.sellingShippingPerOrder,
      params.feeProfileInput
    )
  };
}
