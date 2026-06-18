import type { Page } from "@playwright/test";
import type { Lot, Sale } from "../../../src/types/app.ts";
import {
  getSalesCacheStatusKey,
  getSalesStorageKey,
  getScopedLastLotStorageKey,
  getScopedPresetsStorageKey,
  STORAGE_KEYS
} from "../../../src/app-core/storageKeys.ts";

type VisualSmokeLanguage = "en" | "fr";
type VisualSmokeTheme = "unionArenaLight" | "unionArenaDark";

type VisualSmokeSeedOptions = {
  language: VisualSmokeLanguage;
  theme: VisualSmokeTheme;
};

const smokeDate = "2026-06-15";
const smokeNow = "2026-06-15T16:00:00.000Z";
const smokeLotId = 86015001;
const personalScope = { scopeType: "personal" as const };

const smokeLot: Lot = {
  id: smokeLotId,
  name: "Collection Étoile Très Long Nom Mobile - smoke dense cards",
  lotType: "singles",
  singlesCatalogSource: "none",
  singlesPurchases: [
    {
      id: 91001,
      item: "Blue-Eyes White Dragon - première édition ultra rare longue",
      cardNumber: "SDK-001",
      condition: "NM",
      language: "fr",
      cost: 18,
      currency: "CAD",
      quantity: 3,
      marketValue: 42,
      marketValueCurrency: "CAD"
    },
    {
      id: 91002,
      item: "Pikachu promo long-title smoke check avec accents Édition spéciale",
      cardNumber: "SM-P-001",
      condition: "LP",
      language: "en",
      cost: 12,
      currency: "CAD",
      quantity: 2,
      marketValue: 27,
      marketValueCurrency: "CAD"
    }
  ],
  isComplete: true,
  boxPriceCost: 96,
  boxesPurchased: 1,
  packsPerBox: 12,
  spotsPerBox: 12,
  costInputMode: "perBox",
  currency: "USD",
  sellingCurrency: "CAD",
  exchangeRate: 1.35,
  purchaseDate: smokeDate,
  createdAt: smokeDate,
  purchaseShippingCost: 10,
  purchaseTaxPercent: 5,
  sellingTaxPercent: 5,
  sellingShippingPerOrder: 4,
  feeProfilePreset: "custom",
  platformFeePercent: 8,
  additionalFeePercent: 2.9,
  additionalFeeAppliesTo: "subtotal",
  fixedFeePerOrder: 0.3,
  includeTax: true,
  externalSku: "SMOKE-UI-001",
  spotPrice: 15,
  boxPriceSell: 180,
  packPrice: 14,
  targetProfitPercent: 15
};

const smokeSales: Sale[] = [
  {
    id: 92001,
    type: "pack",
    quantity: 1,
    packsCount: 1,
    price: 48,
    priceIsTotal: true,
    customer: "Alex Smoke Client Très Long",
    memo: "Visual smoke seeded sale",
    buyerShipping: 4,
    date: smokeDate,
    version: 1,
    updatedAt: smokeNow
  },
  {
    id: 92002,
    type: "pack",
    quantity: 1,
    packsCount: 1,
    singlesItems: [
      {
        singlesPurchaseEntryId: 91001,
        quantity: 1,
        price: 55
      }
    ],
    price: 55,
    priceIsTotal: true,
    customer: "Camille Démonstration Étoile Client Très Long",
    memo: "Vente avec accents pour le rendu mobile",
    buyerShipping: 4,
    date: smokeDate,
    version: 1,
    updatedAt: smokeNow
  }
];

export async function seedVisualSmokeState(page: Page, options: VisualSmokeSeedOptions): Promise<void> {
  const keys = {
    activeScopeType: STORAGE_KEYS.ACTIVE_SCOPE_TYPE,
    exchangeRateCache: STORAGE_KEYS.EXCHANGE_RATE_CACHE,
    language: STORAGE_KEYS.LANGUAGE,
    lastLotId: getScopedLastLotStorageKey(personalScope),
    lastTab: STORAGE_KEYS.LAST_TAB,
    onboardingStatus: STORAGE_KEYS.ONBOARDING_STATUS,
    presets: getScopedPresetsStorageKey(personalScope),
    proAccess: STORAGE_KEYS.PRO_ACCESS,
    sales: getSalesStorageKey(smokeLotId, personalScope),
    salesStatus: getSalesCacheStatusKey(smokeLotId, personalScope),
    theme: STORAGE_KEYS.THEME
  };

  await page.addInitScript(({ storageKeys, language, theme, lot, sales, now }) => {
    window.localStorage.setItem(storageKeys.activeScopeType, "personal");
    window.localStorage.setItem(storageKeys.language, language);
    window.localStorage.setItem(storageKeys.theme, theme);
    window.localStorage.setItem(storageKeys.proAccess, "1");
    window.localStorage.setItem(storageKeys.onboardingStatus, "completed");
    window.localStorage.setItem(storageKeys.lastTab, "config");
    window.localStorage.setItem(storageKeys.lastLotId, String(lot.id));
    window.localStorage.setItem(storageKeys.presets, JSON.stringify([lot]));
    window.localStorage.setItem(storageKeys.sales, JSON.stringify(sales));
    window.localStorage.setItem(storageKeys.salesStatus, "loaded");
    window.localStorage.setItem(storageKeys.exchangeRateCache, JSON.stringify({
      cadRate: lot.exchangeRate,
      fetchedAt: Date.parse(now)
    }));
  }, {
    storageKeys: keys,
    language: options.language,
    theme: options.theme,
    lot: smokeLot,
    sales: smokeSales,
    now: smokeNow
  });
}
