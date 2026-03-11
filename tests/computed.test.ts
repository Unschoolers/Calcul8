import assert from "node:assert/strict";
import { test } from "vitest";
import { appComputed } from "../src/app-core/computed.ts";
import { GOOGLE_PROFILE_CACHE_KEY, GOOGLE_TOKEN_KEY } from "../src/app-core/methods/ui/shared.ts";
import { calculateTotalRevenue } from "../src/domain/calculations.ts";

type MockStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
};

function withMockedLocalStorage(run: (storage: MockStorage, data: Map<string, string>) => void): void {
  const original = (globalThis as { localStorage?: MockStorage }).localStorage;
  const data = new Map<string, string>();

  const storage: MockStorage = {
    getItem(key: string): string | null {
      return data.has(key) ? data.get(key)! : null;
    },
    setItem(key: string, value: string): void {
      data.set(key, String(value));
    },
    removeItem(key: string): void {
      data.delete(key);
    },
    clear(): void {
      data.clear();
    }
  };

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage
  });

  try {
    run(storage, data);
  } finally {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: original
    });
  }
}

function toBase64Url(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createJwt(payload: Record<string, unknown>): string {
  const header = toBase64Url(JSON.stringify({ alg: "none", typ: "JWT" }));
  const body = toBase64Url(JSON.stringify(payload));
  return `${header}.${body}.sig`;
}

test("computed auth flags and decoded Google profile fields resolve token and cache", () => {
  withMockedLocalStorage((_storage, data) => {
    const unsignedVm = { googleAuthEpoch: 0 };
    assert.equal(
      appComputed.isGoogleSignedIn.call(unsignedVm as unknown as Parameters<typeof appComputed.isGoogleSignedIn>[0]),
      false
    );
    assert.equal(
      appComputed.googleProfileName.call(unsignedVm as unknown as Parameters<typeof appComputed.googleProfileName>[0]),
      ""
    );

    const token = createJwt({ name: " Token Name ", email: " token@example.com ", picture: " token.png " });
    data.set(GOOGLE_TOKEN_KEY, token);
    data.set(GOOGLE_PROFILE_CACHE_KEY, JSON.stringify({
      name: "Cache Name",
      email: "cache@example.com",
      picture: "cache.png"
    }));

    const signedVm = { googleAuthEpoch: 1 };
    assert.equal(
      appComputed.isGoogleSignedIn.call(signedVm as unknown as Parameters<typeof appComputed.isGoogleSignedIn>[0]),
      true
    );
    assert.equal(
      appComputed.googleProfileName.call(signedVm as unknown as Parameters<typeof appComputed.googleProfileName>[0]),
      "Token Name"
    );
    assert.equal(
      appComputed.googleProfileEmail.call(signedVm as unknown as Parameters<typeof appComputed.googleProfileEmail>[0]),
      "token@example.com"
    );
    assert.equal(
      appComputed.googleProfilePicture.call(signedVm as unknown as Parameters<typeof appComputed.googleProfilePicture>[0]),
      "token.png"
    );

    data.set(GOOGLE_TOKEN_KEY, "not.a.valid.jwt");
    const cacheFallbackVm = { googleAuthEpoch: 2 };
    assert.equal(
      appComputed.googleProfileName.call(cacheFallbackVm as unknown as Parameters<typeof appComputed.googleProfileName>[0]),
      "Cache Name"
    );
  });
});

test("computed theme and lot proxies map expected values", () => {
  const darkValue = appComputed.isDark.call({
    $vuetify: { theme: { global: { name: "unionArenaDark" } } }
  } as unknown as Parameters<typeof appComputed.isDark>[0]);
  assert.equal(darkValue, true);

  const lightValue = appComputed.isDark.call({
    $vuetify: { theme: { global: { name: "unionArenaLight" } } }
  } as unknown as Parameters<typeof appComputed.isDark>[0]);
  assert.equal(lightValue, false);

  const vm = { newLotName: "Initial" };
  assert.equal(
    appComputed.lotNameDraft.get.call(vm as unknown as Parameters<typeof appComputed.lotNameDraft.get>[0]),
    "Initial"
  );
  appComputed.lotNameDraft.set.call(
    vm as unknown as Parameters<typeof appComputed.lotNameDraft.set>[0],
    "Renamed"
  );
  assert.equal(vm.newLotName, "Renamed");
});

test("lot type/source and selection helpers normalize data for singles", () => {
  const lotTypeSingles = appComputed.currentLotType.call({
    currentLotId: 2,
    lots: [{ id: 2, lotType: "singles" }]
  } as unknown as Parameters<typeof appComputed.currentLotType>[0]);
  assert.equal(lotTypeSingles, "singles");

  const lotTypeDefault = appComputed.currentLotType.call({
    currentLotId: null,
    lots: []
  } as unknown as Parameters<typeof appComputed.currentLotType>[0]);
  assert.equal(lotTypeDefault, "bulk");

  const catalogSource = appComputed.currentLotCatalogSource.call({
    currentLotId: 2,
    lots: [{ id: 2, lotType: "singles", singlesCatalogSource: "pkmn" }]
  } as unknown as Parameters<typeof appComputed.currentLotCatalogSource>[0]);
  assert.equal(catalogSource, "pokemon");

  const catalogFallback = appComputed.currentLotCatalogSource.call({
    currentLotId: 3,
    lots: [{ id: 3, lotType: "singles", singlesCatalogSource: "unknown" }]
  } as unknown as Parameters<typeof appComputed.currentLotCatalogSource>[0]);
  assert.equal(catalogFallback, "ua");

  const hasLot = appComputed.hasLotSelected.call({
    currentLotId: 1
  } as unknown as Parameters<typeof appComputed.hasLotSelected>[0]);
  assert.equal(hasLot, true);

  const liveDisabled = appComputed.isLiveTabDisabled.call({
    hasLotSelected: false
  } as unknown as Parameters<typeof appComputed.isLiveTabDisabled>[0]);
  assert.equal(liveDisabled, true);

  const ids = appComputed.effectiveLiveSinglesIds.call({
    currentLotType: "singles",
    liveSinglesManualIds: [1, 1, 0, 2, 999],
    liveSinglesExternalIds: [2, 3, -1],
    singlesPurchases: [{ id: 1 }, { id: 2 }, { id: 3 }]
  } as unknown as Parameters<typeof appComputed.effectiveLiveSinglesIds>[0]);
  assert.deepEqual(ids, [1, 2, 3]);

  const entries = appComputed.effectiveLiveSinglesEntries.call({
    currentLotType: "singles",
    effectiveLiveSinglesIds: [3, 2, 404, 1],
    singlesPurchases: [
      { id: 1, item: "One" },
      { id: 2, item: "Two" },
      { id: 3, item: "Three" }
    ]
  } as unknown as Parameters<typeof appComputed.effectiveLiveSinglesEntries>[0]);
  assert.deepEqual(entries.map((entry) => entry.id), [3, 2, 1]);
});

test("list and portfolio filter item computed values mirror lots", () => {
  const lots = [
    { id: 11, name: "A", lotType: "bulk", purchaseDate: "2026-02-01" },
    { id: 22, name: "B", lotType: "singles", purchaseDate: "2026-03-01" }
  ];

  const lotItems = appComputed.lotItems.call({
    lots
  } as unknown as Parameters<typeof appComputed.lotItems>[0]);
  assert.equal(lotItems.length, 2);
  assert.deepEqual(lotItems[0], {
    title: "A",
    value: 11,
    subtitle: "Bulk • 2026-02-01",
    lotType: "bulk",
    groupLabel: "Bulk lots"
  });
  assert.deepEqual(lotItems[1], {
    title: "B",
    value: 22,
    subtitle: "Singles • 2026-03-01",
    lotType: "singles",
    groupLabel: "Singles lots"
  });

  const visibleLotItems = appComputed.visibleLotItems.call({
    lotItems: [
      { title: "Alpha bulk", value: 11, subtitle: "Bulk • 2026-02-01", lotType: "bulk", groupLabel: "Bulk lots" },
      { title: "Union arena singles", value: 22, subtitle: "Singles • 2026-03-01", lotType: "singles", groupLabel: "Singles lots" },
      { title: "Kagurabachi", value: 33, subtitle: "Bulk • 2026-03-03", lotType: "bulk", groupLabel: null }
    ],
    lotSearchQuery: "a"
  } as unknown as Parameters<typeof appComputed.visibleLotItems>[0]);
  assert.deepEqual(visibleLotItems.map((item) => [item.title, item.groupLabel]), [
    ["Alpha bulk", "Bulk lots"],
    ["Kagurabachi", null],
    ["Union arena singles", "Singles lots"]
  ]);

  const filterItems = appComputed.portfolioLotFilterItems.call({
    lots,
    portfolioLotTypeFilter: "both"
  } as unknown as Parameters<typeof appComputed.portfolioLotFilterItems>[0]);
  assert.deepEqual(filterItems, [
    {
      title: "A",
      value: 11,
      subtitle: "Bulk • 2026-02-01",
      lotType: "bulk",
      groupLabel: "Bulk lots"
    },
    {
      title: "B",
      value: 22,
      subtitle: "Singles • 2026-03-01",
      lotType: "singles",
      groupLabel: "Singles lots"
    }
  ]);

  const singlesOnly = appComputed.portfolioLotFilterItems.call({
    lots,
    portfolioLotTypeFilter: "singles"
  } as unknown as Parameters<typeof appComputed.portfolioLotFilterItems>[0]);
  assert.deepEqual(singlesOnly, [
    {
      title: "B",
      value: 22,
      subtitle: "Singles • 2026-03-01",
      lotType: "singles",
      groupLabel: "Singles lots"
    }
  ]);
});

test("single totals and basic sales aggregates are exposed via computed wrappers", () => {
  const singlesQuantity = appComputed.singlesPurchaseTotalQuantity.call({
    singlesPurchases: [
      { id: 1, quantity: 2, cost: 5, marketValue: 8 },
      { id: 2, quantity: 3, cost: 1, marketValue: 2 }
    ]
  } as unknown as Parameters<typeof appComputed.singlesPurchaseTotalQuantity>[0]);
  assert.equal(singlesQuantity, 5);

  const singlesMarket = appComputed.singlesPurchaseTotalMarketValue.call({
    singlesPurchases: [
      { id: 1, quantity: 2, cost: 5, marketValue: 8 },
      { id: 2, quantity: 3, cost: 1, marketValue: 2 }
    ]
  } as unknown as Parameters<typeof appComputed.singlesPurchaseTotalMarketValue>[0]);
  assert.equal(singlesMarket, 22);

  const sales = [{ id: 1, type: "pack", quantity: 2, packsCount: 2, price: 40, buyerShipping: 2, date: "2026-03-01" }];
  const revenue = appComputed.totalRevenue.call({
    sales,
    sellingTaxPercent: 15
  } as unknown as Parameters<typeof appComputed.totalRevenue>[0]);
  assert.equal(revenue, calculateTotalRevenue(sales, 15));

  const progress = appComputed.salesProgress.call({
    soldPacksCount: 5,
    totalPacks: 20
  } as unknown as Parameters<typeof appComputed.salesProgress>[0]);
  assert.equal(progress, 25);
});

test("pricing/cost proxy and conversion computed fields handle simple and expert flows", () => {
  const simpleVm = {
    purchaseUiMode: "simple",
    costInputMode: "perBox",
    boxPriceCost: 10,
    boxesPurchased: 2
  };
  assert.equal(
    appComputed.purchaseCostInputLabel.call(simpleVm as unknown as Parameters<typeof appComputed.purchaseCostInputLabel>[0]),
    "Total Purchase"
  );
  assert.equal(
    appComputed.purchaseCostInputValue.get.call(simpleVm as unknown as Parameters<typeof appComputed.purchaseCostInputValue.get>[0]),
    20
  );
  appComputed.purchaseCostInputValue.set.call(
    simpleVm as unknown as Parameters<typeof appComputed.purchaseCostInputValue.set>[0],
    50
  );
  assert.equal(simpleVm.boxPriceCost, 25);

  const expertVm = {
    purchaseUiMode: "expert",
    costInputMode: "perBox",
    boxPriceCost: 12,
    boxesPurchased: 3
  };
  assert.equal(
    appComputed.purchaseCostInputLabel.call(expertVm as unknown as Parameters<typeof appComputed.purchaseCostInputLabel>[0]),
    "Price per Box (No Tax)"
  );
  appComputed.purchaseCostInputValue.set.call(
    expertVm as unknown as Parameters<typeof appComputed.purchaseCostInputValue.set>[0],
    18
  );
  assert.equal(expertVm.boxPriceCost, 18);

  const totalModeVm = {
    purchaseUiMode: "expert",
    costInputMode: "total",
    boxPriceCost: 10,
    boxesPurchased: 0
  };
  appComputed.purchaseCostInputValue.set.call(
    totalModeVm as unknown as Parameters<typeof appComputed.purchaseCostInputValue.set>[0],
    999
  );
  assert.equal(totalModeVm.boxPriceCost, 0);

  const convertedBox = appComputed.boxPriceCostCAD.call({
    boxPriceCost: 100,
    currency: "USD",
    sellingCurrency: "CAD",
    exchangeRate: 1.4
  } as unknown as Parameters<typeof appComputed.boxPriceCostCAD>[0]);
  assert.equal(convertedBox, 140);

  const convertedShipping = appComputed.purchaseShippingCostCAD.call({
    purchaseShippingCost: 10,
    currency: "USD",
    sellingCurrency: "CAD",
    exchangeRate: 1.4
  } as unknown as Parameters<typeof appComputed.purchaseShippingCostCAD>[0]);
  assert.equal(convertedShipping, 14);

  const singlesConversion = appComputed.conversionInfo.call({
    currentLotType: "singles",
    singlesPurchases: [{ id: 1, quantity: 1, cost: 10, currency: "USD", marketValue: 0 }],
    currency: "CAD",
    sellingCurrency: "CAD",
    singlesPurchaseTotalCost: 14,
    boxPriceCostCAD: 0,
    boxesPurchased: 0,
    purchaseShippingCostCAD: 0,
    formatCurrency(value: number) {
      return Number(value).toFixed(2);
    }
  } as unknown as Parameters<typeof appComputed.conversionInfo>[0]);
  assert.ok(singlesConversion.includes("Converted purchase costs to CAD"));

  const bulkNoConversion = appComputed.conversionInfo.call({
    currentLotType: "bulk",
    singlesPurchases: [],
    currency: "CAD",
    sellingCurrency: "CAD",
    boxPriceCostCAD: 100,
    boxesPurchased: 2,
    purchaseShippingCostCAD: 8,
    formatCurrency(value: number) {
      return Number(value).toFixed(2);
    }
  } as unknown as Parameters<typeof appComputed.conversionInfo>[0]);
  assert.equal(bulkNoConversion, "");
});

test("derived target and remaining quantity computed values return expected numbers", () => {
  const targetNet = appComputed.targetNetRevenue.call({
    totalCaseCost: 1000,
    targetProfitPercent: 15
  } as unknown as Parameters<typeof appComputed.targetNetRevenue>[0]);
  assert.equal(targetNet, 1150);

  const remainingNet = appComputed.remainingNetRevenueForTarget.call({
    targetNetRevenue: 1150,
    totalRevenue: 800
  } as unknown as Parameters<typeof appComputed.remainingNetRevenueForTarget>[0]);
  assert.equal(remainingNet, 350);

  const remainingPacks = appComputed.remainingPacksCount.call({
    totalPacks: 20,
    soldPacksCount: 4
  } as unknown as Parameters<typeof appComputed.remainingPacksCount>[0]);
  assert.equal(remainingPacks, 16);

  const boxesEquivalent = appComputed.remainingBoxesEquivalent.call({
    packsPerBox: 8,
    remainingPacksCount: 16
  } as unknown as Parameters<typeof appComputed.remainingBoxesEquivalent>[0]);
  assert.equal(boxesEquivalent, 2);

  const spotsEquivalent = appComputed.remainingSpotsEquivalent.call({
    remainingPacksCount: 16,
    totalPacks: 20,
    totalSpots: 50
  } as unknown as Parameters<typeof appComputed.remainingSpotsEquivalent>[0]);
  assert.equal(spotsEquivalent, 40);

  const totalSpots = appComputed.totalSpots.call({
    currentLotType: "bulk",
    boxesPurchased: 3,
    spotsPerBox: 6
  } as unknown as Parameters<typeof appComputed.totalSpots>[0]);
  assert.equal(totalSpots, 18);
});

test("sales status and sorting computed values cover singles and generic cases", () => {
  const noSalesStatus = appComputed.salesStatus.call({
    currentLotType: "singles",
    sales: [],
    totalRevenue: 0,
    totalCaseCost: 25
  } as unknown as Parameters<typeof appComputed.salesStatus>[0]);
  assert.equal(noSalesStatus.title, "No Sales Yet");

  const positiveStatus = appComputed.salesStatus.call({
    currentLotType: "singles",
    sales: [{ id: 1, type: "pack", quantity: 1, packsCount: 1, price: 10, date: "2026-03-01" }],
    totalRevenue: 100,
    totalCaseCost: 80
  } as unknown as Parameters<typeof appComputed.salesStatus>[0]);
  assert.equal(positiveStatus.title, "Net Positive");

  const genericStatus = appComputed.salesStatus.call({
    currentLotType: "bulk",
    totalRevenue: 100,
    totalCaseCost: 80,
    salesProgress: 50
  } as unknown as Parameters<typeof appComputed.salesStatus>[0]);
  assert.ok(typeof genericStatus.title === "string");

  const sorted = appComputed.sortedSales.call({
    sales: [
      { id: 1, date: "2026-03-01" },
      { id: 2, date: "2026-03-03" },
      { id: 3, date: "2026-03-02" }
    ]
  } as unknown as Parameters<typeof appComputed.sortedSales>[0]);
  assert.deepEqual(sorted.map((sale) => sale.id), [2, 3, 1]);

  const sparkline = appComputed.sparklineData.call({
    sales: [],
    totalCaseCost: 0,
    sellingTaxPercent: 15
  } as unknown as Parameters<typeof appComputed.sparklineData>[0]);
  assert.ok(Array.isArray(sparkline));

  const gradient = appComputed.sparklineGradient.call({
    sales: [],
    totalCaseCost: 0,
    sellingTaxPercent: 15
  } as unknown as Parameters<typeof appComputed.sparklineGradient>[0]);
  assert.ok(Array.isArray(gradient));
});

test("portfolio summary wrappers return expected totals and presence flags", () => {
  const totals = appComputed.portfolioTotals.call({
    allLotPerformance: [
      {
        lotId: 1,
        lotName: "A",
        salesCount: 2,
        totalRevenue: 50,
        totalCost: 20,
        totalProfit: 30,
        marginPercent: 150,
        soldPacks: 2,
        totalPacks: 10,
        lastSaleDate: "2026-03-01"
      },
      {
        lotId: 2,
        lotName: "B",
        salesCount: 1,
        totalRevenue: 5,
        totalCost: 10,
        totalProfit: -5,
        marginPercent: -50,
        soldPacks: 1,
        totalPacks: 5,
        lastSaleDate: null
      }
    ]
  } as unknown as Parameters<typeof appComputed.portfolioTotals>[0]);
  assert.equal(totals.lotCount, 2);
  assert.equal(totals.totalProfit, 25);

  const hasData = appComputed.hasPortfolioData.call({
    allLotPerformance: [{}]
  } as unknown as Parameters<typeof appComputed.hasPortfolioData>[0]);
  assert.equal(hasData, true);

  const noData = appComputed.hasPortfolioData.call({
    allLotPerformance: []
  } as unknown as Parameters<typeof appComputed.hasPortfolioData>[0]);
  assert.equal(noData, false);
});



