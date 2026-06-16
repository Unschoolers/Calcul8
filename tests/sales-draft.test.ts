import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import type { Sale } from "../src/types/app.ts";
import { makeSale } from "./helpers/fixtures.ts";

const getTodayDateMock = vi.hoisted(() => vi.fn(() => "2026-02-21"));

vi.mock("../src/app-core/methods/config-shared.ts", async () => {
  const actual = await vi.importActual<typeof import("../src/app-core/methods/config-shared.ts")>(
    "../src/app-core/methods/config-shared.ts"
  );
  return {
    ...actual,
    getTodayDate: getTodayDateMock
  };
});

import {
  changeNewSaleType,
  computeSinglesSaleLineMaxQuantity,
  editSaleDraft,
  openConvertedLiveSinglesSaleDraft,
  resetSaleDraft
} from "../src/app-core/methods/sales-draft.ts";

class MockHtmlInputElement {
  focus = vi.fn();
}

type Ctx = Record<string, unknown>;

function createContext(overrides: Ctx = {}): Ctx {
  return {
    currentLotType: "singles",
    hasProAccess: true,
    targetProfitPercent: 15,
    currency: "CAD",
    sellingCurrency: "CAD",
    exchangeRate: 1.4,
    sellingShippingPerOrder: 8,
    editingSale: null,
    sales: [],
    singlesSoldCountByPurchaseId: {},
    singlesPurchases: [],
    newSale: {
      type: "pack",
      quantity: 1,
      packsCount: null,
      singlesPurchaseEntryId: null,
      price: 0,
      customer: "",
      buyerShipping: 0,
      date: "2026-02-21"
    },
    showAddSaleModal: false,
    calculatePriceForUnits: vi.fn((units: number, targetNetRevenue: number) =>
      Math.round((Number(targetNetRevenue) || 0) / Math.max(1, Number(units) || 1))
    ),
    livePackPrice: 9,
    liveBoxPriceSell: 99,
    liveSpotPrice: 11,
    packPrice: 6,
    spotPrice: 8,
    boxPriceSell: 80,
    $refs: {},
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("HTMLInputElement", MockHtmlInputElement as unknown as typeof HTMLInputElement);
});

test("changeNewSaleType preserves singles pack-only behavior and bulk resets linked draft fields", () => {
  const singlesCtx = createContext({
    currentLotType: "singles",
    newSale: {
      type: "box",
      quantity: 1,
      packsCount: null,
      singlesPurchaseEntryId: null,
      price: 10,
      customer: "",
      buyerShipping: 0,
      date: "2026-02-21"
    }
  });

  changeNewSaleType(singlesCtx as never, "box");
  assert.equal((singlesCtx.newSale as { type?: string }).type, "pack");

  const bulkCtx = createContext({
    currentLotType: "bulk",
    newSale: {
      type: "pack",
      quantity: 5,
      packsCount: 4,
      singlesPurchaseEntryId: 10,
      singlesItems: [{ lineId: 1, singlesPurchaseEntryId: 10, quantity: 1, price: 5 }],
      price: 123,
      customer: "",
      buyerShipping: 0,
      date: "2026-02-21"
    },
    editingSale: null
  });

  changeNewSaleType(bulkCtx as never, "rtyh");
  assert.equal((bulkCtx.newSale as { type?: string }).type, "rtyh");
  assert.equal((bulkCtx.newSale as { quantity?: number | null }).quantity, 1);
  assert.equal((bulkCtx.newSale as { singlesPurchaseEntryId?: number | null }).singlesPurchaseEntryId, null);
  assert.equal((bulkCtx.newSale as { singlesItems?: unknown }).singlesItems, undefined);
});

test("computeSinglesSaleLineMaxQuantity releases editing quantity and excludes other draft lines", () => {
  const editingSale: Sale = {
    id: 10,
    type: "pack",
    quantity: 2,
    packsCount: 2,
    singlesPurchaseEntryId: 51,
    price: 20,
    date: "2026-02-21"
  };

  const ctx = createContext({
    editingSale,
    singlesSoldCountByPurchaseId: { 51: 4 },
    singlesPurchases: [
      { id: 51, item: "Card Max", cost: 5, quantity: 5, marketValue: 6, currency: "CAD" }
    ],
    newSale: {
      type: "pack",
      quantity: null,
      packsCount: null,
      singlesPurchaseEntryId: null,
      singlesItems: [
        { lineId: 1, singlesPurchaseEntryId: 51, quantity: 1, price: 10 },
        { lineId: 2, singlesPurchaseEntryId: 51, quantity: 1, price: 10 }
      ],
      price: null,
      customer: "",
      buyerShipping: 0,
      date: "2026-02-21"
    }
  });

  assert.equal(computeSinglesSaleLineMaxQuantity(ctx as never, 0), 2);
});

test("editSaleDraft and openConvertedLiveSinglesSaleDraft shape singles editor drafts consistently", () => {
  const focusInput = new MockHtmlInputElement();
  const ctx = createContext({
    $refs: {
      saleQuantityInput: focusInput
    }
  });
  const sale: Sale = makeSale({
    id: 333,
    type: "pack",
    quantity: 2,
    packsCount: 2,
    singlesPurchaseEntryId: 55,
    price: 40,
    buyerShipping: 1,
    customer: "Alex",
    date: "not-a-date"
  });

  editSaleDraft(ctx as never, sale);
  assert.equal(ctx.showAddSaleModal, true);
  assert.equal((ctx.newSale as { date?: string }).date, "2026-02-21");

  openConvertedLiveSinglesSaleDraft(ctx as never, [
    { singlesPurchaseEntryId: 55, quantity: 2, price: 40 },
    { singlesPurchaseEntryId: 77, quantity: 1, price: 12.5 }
  ], {
    buyerShipping: 5,
    memo: "bundle draft",
    date: "2026-03-19T12:00:00.000Z"
  });

  const newSale = ctx.newSale as {
    date: string;
    quantity: number;
    price: number;
    buyerShipping: number;
    memo?: string;
    singlesItems?: Array<{ singlesPurchaseEntryId?: number | null; quantity?: number; price?: number | null }>;
  };
  assert.equal(newSale.date, "2026-03-19");
  assert.equal(newSale.quantity, 3);
  assert.equal(newSale.price, 52.5);
  assert.equal(newSale.buyerShipping, 5);
  assert.equal(newSale.memo, "bundle draft");
});

test("resetSaleDraft closes modal and restores the baseline draft", () => {
  const ctx = createContext({
    showAddSaleModal: true,
    editingSale: makeSale({ id: 12 }),
    newSale: {
      type: "rtyh",
      quantity: 2,
      packsCount: 3,
      singlesPurchaseEntryId: 99,
      singlesItems: [{ lineId: 1, singlesPurchaseEntryId: 99, quantity: 2, price: 50 }],
      price: 50,
      customer: "Bob",
      memo: "x",
      buyerShipping: 4,
      date: "2026-03-01"
    }
  });

  resetSaleDraft(ctx as never);

  assert.equal(ctx.showAddSaleModal, false);
  assert.equal(ctx.editingSale, null);
  assert.equal((ctx.newSale as { type?: string }).type, "pack");
  assert.equal((ctx.newSale as { customer?: string }).customer, "");
  assert.equal((ctx.newSale as { buyerShipping?: number }).buyerShipping, 8);
});
