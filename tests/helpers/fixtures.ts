import type { Lot, LotSetup, Sale } from "../../src/types/app.ts";

export function makeSale(overrides: Partial<Sale> = {}): Sale {
  return {
    id: 1,
    type: "pack",
    quantity: 1,
    packsCount: 1,
    price: 10,
    date: "2026-02-21",
    ...overrides
  };
}

export function makeLot(overrides: Partial<Lot> = {}): Lot {
  return {
    id: 101,
    name: "Lot A",
    lotType: "bulk",
    boxPriceCost: 70,
    boxesPurchased: 16,
    packsPerBox: 16,
    spotsPerBox: 5,
    costInputMode: "perBox",
    currency: "CAD",
    sellingCurrency: "CAD",
    exchangeRate: 1.4,
    purchaseDate: "2026-02-22",
    purchaseShippingCost: 2,
    purchaseTaxPercent: 12,
    sellingTaxPercent: 15,
    sellingShippingPerOrder: 0,
    includeTax: true,
    spotPrice: 1,
    boxPriceSell: 2,
    packPrice: 3,
    targetProfitPercent: 10,
    ...overrides
  };
}

export function makeLotSetup(overrides: Partial<LotSetup> = {}): LotSetup {
  return {
    boxPriceCost: 70,
    boxesPurchased: 16,
    packsPerBox: 16,
    spotsPerBox: 5,
    costInputMode: "perBox",
    currency: "CAD",
    sellingCurrency: "CAD",
    exchangeRate: 1.4,
    purchaseDate: "2026-02-22",
    purchaseShippingCost: 2,
    purchaseTaxPercent: 12,
    sellingTaxPercent: 15,
    sellingShippingPerOrder: 0,
    includeTax: true,
    spotPrice: 1,
    boxPriceSell: 2,
    packPrice: 3,
    targetProfitPercent: 10,
    ...overrides
  };
}
