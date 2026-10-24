import type { Lot, Sale, SinglesPurchaseEntry } from "../../src/types/app.ts";
import { makeLot, makeSale } from "./fixtures.ts";

export interface DenseVolumeFixtureTargets {
  oldestHighestPriceSaleId: number;
  mostRecentSaleId: number;
  finalItemId: number;
}

export interface DenseVolumeFixture {
  lot: Lot;
  sales: Sale[];
  targets: DenseVolumeFixtureTargets;
}

const ITEM_COUNT = 1_000;
const FIRST_ITEM_ID = 20_000;
const FIRST_SALE_ID = 30_000;
const FIRST_SALE_DATE = Date.UTC(2023, 0, 1);
const DAY_MS = 24 * 60 * 60 * 1_000;
const LONG_ACCENTED_NAMES = [
  "Édition spéciale — Collection complète de Montréal",
  "Très rare: Pokémon Écarlate et Violet, illustration alternative",
  "Carte promotionnelle déjà gradée — édition française"
];
const REPEATED_CUSTOMERS = ["Alex Morgan", "Sam Lee", "Jordan Tremblay", "Alex Morgan", "Sam Lee"];

function dateForIndex(index: number): string {
  return new Date(FIRST_SALE_DATE + index * DAY_MS).toISOString().slice(0, 10);
}

export function createDenseVolumeFixture(): DenseVolumeFixture {
  const singlesPurchases: SinglesPurchaseEntry[] = Array.from({ length: ITEM_COUNT }, (_, index) => ({
    id: FIRST_ITEM_ID + index,
    item: index === ITEM_COUNT - 1
      ? "ZZZ — Recherche ciblée, dernière ligne du lot"
      : LONG_ACCENTED_NAMES[index % LONG_ACCENTED_NAMES.length] + ` #${index + 1}`,
    cardNumber: `V-${String(index + 1).padStart(4, "0")}`,
    cost: 2 + (index % 9),
    currency: "CAD",
    quantity: index < ITEM_COUNT / 2 ? 1 : 2,
    marketValue: 5 + (index % 13),
    marketValueCurrency: "CAD"
  }));

  const sales: Sale[] = singlesPurchases.map((entry, index) => makeSale({
    id: FIRST_SALE_ID + index,
    type: "pack",
    quantity: 1,
    packsCount: 1,
    price: index === 0 ? 1_000 : 10 + (index % 8),
    priceIsTotal: true,
    customer: REPEATED_CUSTOMERS[index % REPEATED_CUSTOMERS.length],
    date: dateForIndex(index),
    singlesPurchaseEntryId: entry.id,
    singlesItems: [{
      singlesPurchaseEntryId: entry.id,
      quantity: 1,
      price: index === 0 ? 1_000 : 10 + (index % 8)
    }]
  }));

  const lot = makeLot({
    id: 10_000,
    name: "WhatFees volume test — 1 000 items",
    lotType: "singles",
    purchaseDate: dateForIndex(0),
    singlesCatalogSource: "none",
    currency: "CAD",
    sellingCurrency: "CAD",
    boxesPurchased: 0,
    singlesPurchases
  });

  return {
    lot,
    sales,
    targets: {
      oldestHighestPriceSaleId: FIRST_SALE_ID,
      mostRecentSaleId: FIRST_SALE_ID + ITEM_COUNT - 1,
      finalItemId: FIRST_ITEM_ID + ITEM_COUNT - 1
    }
  };
}
