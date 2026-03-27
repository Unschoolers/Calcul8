import assert from "node:assert/strict";
import { test } from "vitest";
import {
  buildWhatnotCsvImportDraft,
  normalizeWhatnotReviewRows,
  parseWhatnotCsvRowsWithMapping
} from "../src/app-core/shared/whatnot-csv.ts";

function toExpectedLocalDate(value: string): string {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

test("buildWhatnotCsvImportDraft infers sparse Whatnot headers and keeps optional SKU", () => {
  const draft = buildWhatnotCsvImportDraft(
    "Title,SKU,Qty,Price,Shipping,Date,Status,Sale Type,Packs Count\n" +
      "Bleach volume 2,,2,$25.00,$8,2026-03-07,CREATED,box,16"
  );

  assert.ok(draft);
  assert.equal(draft?.headers[0], "Title");
  assert.equal(draft?.mapping.title, 0);
  assert.equal(draft?.mapping.sku, 1);
  assert.equal(draft?.mapping.quantity, 2);
  assert.equal(draft?.mapping.price, 3);
  assert.equal(draft?.mapping.buyerShipping, 4);
  assert.equal(draft?.mapping.date, 5);
  assert.equal(draft?.mapping.orderStatus, 6);
  assert.equal(draft?.mapping.saleType, 7);
  assert.equal(draft?.mapping.packsCount, 8);
});

test("buildWhatnotCsvImportDraft auto-maps real weekly Whatnot export headers with preferred fields", () => {
  const draft = buildWhatnotCsvImportDraft(
    "\"REPORT_START_DATE\",\"WEEK_NUMBER\",\"ORDER_PLACED_AT_UTC\",\"TRANSACTION_COMPLETED_AT_UTC\",\"SELLER_ID\",\"TRANSACTION_TYPE\",\"TRANSACTION_MESSAGE\",\"ORDER_ID\",\"LISTING_TITLE\",\"LISTING_DESCRIPTION\",\"PRODUCT_CATEGORY\",\"BUY_FORMAT\",\"SALE_TYPE\",\"QUANTITY_SOLD\",\"SKU\",\"COST_OF_GOODS\",\"LIVESTREAM_ID\",\"LIVESTREAM_TITLE\",\"BUYER_NAME\",\"BUYER_STATE\",\"BUYER_COUNTRY\",\"SHIPMENT_ID\",\"TRANSACTION_CURRENCY\",\"TRANSACTION_AMOUNT\",\"BUYER_PAID\",\"ORIGINAL_ITEM_PRICE\",\"COUPON_COST\",\"POST_COUPON_PRICE\",\"SHIPPING_FEE\",\"COMMISSION_FEE\",\"PAYMENT_PROCESSING_FEE\",\"TAX_ON_COMMISSION_FEE\",\"TAX_ON_PAYMENT_PROCESSING_FEE\",\"LEDGER_TRANSACTION_ID\"\n" +
      "\"2026-03-09 00:00:00\",11,\"2026-02-22 04:47:05\",\"2026-03-12 04:06:00\",49208085,\"ORDER_EARNINGS\",\"Earnings for selling a Bleach vol2 box\",\"847164719\",\"Bleach vol2 box\",\"1 box of bleach vol2\",\"Union Arena\",\"BUY_IT_NOW\",\"FLASH\",1,\"\",0,\"0cd63995-10f9-4191-8d18-b211faac1509\",\"Saturday evening rips QC\",\"cougarraph\",\"WA\",\"AU\",\"299875656\",\"CAD\",71.38,99.19,82.00,0.00,82.00,0.00,6.56,2.68,0.98,0.40,\"849694245\""
  );

  assert.ok(draft);
  assert.equal(draft?.mapping.externalOrderId, 7);
  assert.equal(draft?.mapping.title, 8);
  assert.equal(draft?.mapping.listingTitle, 8);
  assert.equal(draft?.mapping.buyerName, 18);
  assert.equal(draft?.mapping.orderPlacedAt, 2);
  assert.equal(draft?.mapping.originalItemPrice, 25);
  assert.equal(draft?.mapping.quantity, 13);
  assert.equal(draft?.mapping.date, 3);
  assert.equal(draft?.mapping.externalAccountId, 4);
  assert.equal(draft?.mapping.externalSaleId, 33);
  assert.equal(draft?.mapping.productCategory, 10);
  assert.equal(draft?.mapping.price, 27);
  assert.equal(draft?.mapping.buyerShipping, 28);
  assert.equal(draft?.mapping.orderStatus, 5);
});

test("parseWhatnotCsvRowsWithMapping normalizes sparse rows and skips blank titles", () => {
  const parsed = parseWhatnotCsvRowsWithMapping(
    [
      ["Bleach volume 2", "", "2", "$25.00", "$8", "2026-03-07", "CREATED", "box", "16"],
      ["", "", "1", "$12.00", "$0", "2026-03-08", "CREATED", "pack", "1"]
    ],
    9,
    {
      title: 0,
      sku: 1,
      quantity: 2,
      price: 3,
      buyerShipping: 4,
      date: 5,
      orderStatus: 6,
      saleType: 7,
      packsCount: 8,
      externalSaleId: null,
      externalOrderId: null,
      externalOrderItemId: null,
      externalAccountId: null
    }
  );

  assert.equal(parsed.skippedCount, 1);
  assert.equal(parsed.entries.length, 1);
  assert.equal(parsed.entries[0]?.title, "Bleach volume 2");
  assert.equal(parsed.entries[0]?.sku, undefined);
  assert.equal(parsed.entries[0]?.quantity, 2);
  assert.equal(parsed.entries[0]?.price, 25);
  assert.equal(parsed.entries[0]?.buyerShipping, 8);
  assert.equal(parsed.entries[0]?.suggestedSaleType, "box");
  assert.equal(parsed.entries[0]?.suggestedPacksCount, 16);
  assert.equal(parsed.entries[0]?.selectedSaleType, null);
  assert.equal(parsed.entries[0]?.requiresManualReview, true);
});

test("parseWhatnotCsvRowsWithMapping normalizes whatnot weekly export rows with order placed date priority and box inference", () => {
  const expectedLocalDate = toExpectedLocalDate("2026-02-22T04:47:05.000Z");
  const parsed = parseWhatnotCsvRowsWithMapping(
    [[
      "2026-03-09 00:00:00",
      "11",
      "2026-02-22 04:47:05",
      "2026-03-12 04:06:00",
      "49208085",
      "ORDER_EARNINGS",
      "Earnings for selling a Bleach vol2 box",
      "847164719",
      "Bleach vol2 box",
      "1 box of bleach vol2",
      "Union Arena",
      "BUY_IT_NOW",
      "FLASH",
      "1",
      "",
      "0",
      "0cd63995-10f9-4191-8d18-b211faac1509",
      "Saturday evening rips QC",
      "cougarraph",
      "WA",
      "AU",
      "299875656",
      "CAD",
      "71.38",
      "99.19",
      "82.00",
      "0.00",
      "82.00",
      "0.00",
      "6.56",
      "2.68",
      "0.98",
      "0.40",
      "849694245"
    ]],
    34,
    {
      title: 8,
      listingTitle: 8,
      buyerName: 18,
      orderPlacedAt: 2,
      originalItemPrice: 25,
      sku: 14,
      quantity: 13,
      price: 27,
      buyerShipping: 28,
      date: 3,
      orderStatus: 5,
      externalSaleId: 33,
      externalOrderId: 7,
      externalOrderItemId: null,
      externalAccountId: 4,
      saleType: 12,
      packsCount: null
    }
  );

  assert.equal(parsed.skippedCount, 0);
  assert.equal(parsed.entries.length, 1);
  assert.equal(parsed.entries[0]?.externalOrderId, "847164719");
  assert.equal(parsed.entries[0]?.externalSaleId, "849694245");
  assert.equal(parsed.entries[0]?.externalAccountId, "49208085");
  assert.equal(parsed.entries[0]?.buyerName, "cougarraph");
  assert.equal(parsed.entries[0]?.listingTitle, "Bleach vol2 box");
  assert.equal(parsed.entries[0]?.orderPlacedAt, expectedLocalDate);
  assert.equal(parsed.entries[0]?.originalItemPrice, 82);
  assert.equal(parsed.entries[0]?.price, 82);
  assert.equal(parsed.entries[0]?.date, expectedLocalDate);
  assert.equal(parsed.entries[0]?.suggestedSaleType, "box");
});

test("parseWhatnotCsvRowsWithMapping converts UTC timestamps to the local calendar date", () => {
  const rawOrderPlacedAt = "2026-03-08T00:30:00.000Z";
  const rawCompletedAt = "2026-03-09T04:06:00.000Z";
  const expectedLocalDate = toExpectedLocalDate(rawOrderPlacedAt);

  const parsed = parseWhatnotCsvRowsWithMapping(
    [[
      "Bleach vol2 box",
      "nightbuyer",
      rawOrderPlacedAt,
      rawCompletedAt,
      "1",
      "82.00",
      "0.00",
      "ORDER_EARNINGS"
    ]],
    8,
    {
      title: 0,
      buyerName: 1,
      orderPlacedAt: 2,
      date: 3,
      quantity: 4,
      price: 5,
      buyerShipping: 6,
      orderStatus: 7,
      listingTitle: null,
      originalItemPrice: null,
      sku: null,
      productCategory: null,
      externalSaleId: null,
      externalOrderId: null,
      externalOrderItemId: null,
      externalAccountId: null,
      saleType: null,
      packsCount: null
    }
  );

  assert.equal(parsed.entries[0]?.orderPlacedAt, expectedLocalDate);
  assert.equal(parsed.entries[0]?.date, expectedLocalDate);
});

test("parseWhatnotCsvRowsWithMapping treats bare ORDER_PLACED_AT_UTC strings as UTC timestamps", () => {
  const rawOrderPlacedAt = "3/15/2026 0:20";
  const expectedLocalDate = toExpectedLocalDate("2026-03-15T00:20:00.000Z");

  const parsed = parseWhatnotCsvRowsWithMapping(
    [[
      "Kagurabachi box",
      rawOrderPlacedAt,
      "3/20/2026 12:00",
      "1",
      "150.00",
      "ORDER_EARNINGS"
    ]],
    6,
    {
      title: 0,
      orderPlacedAt: 1,
      date: 2,
      quantity: 3,
      price: 4,
      orderStatus: 5,
      listingTitle: null,
      buyerName: null,
      originalItemPrice: null,
      sku: null,
      productCategory: null,
      buyerShipping: null,
      externalSaleId: null,
      externalOrderId: null,
      externalOrderItemId: null,
      externalAccountId: null,
      saleType: null,
      packsCount: null
    }
  );

  assert.equal(parsed.entries[0]?.orderPlacedAt, expectedLocalDate);
  assert.equal(parsed.entries[0]?.date, expectedLocalDate);
});

test("normalizeWhatnotReviewRows preserves suggestion fields and infers RTYH from title", () => {
  const rows = normalizeWhatnotReviewRows([
    {
      title: "RTYH Wheel - mystery slot",
      suggestedLotId: 101,
      suggestedSaleType: "rtyh",
      suggestedPacksCount: 4,
      price: 22,
      quantity: 1,
      buyerShipping: 8
    }
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.title, "RTYH Wheel - mystery slot");
  assert.equal(rows[0]?.suggestedLotId, 101);
  assert.equal(rows[0]?.selectedLotId, 101);
  assert.equal(rows[0]?.suggestedSaleType, "rtyh");
  assert.equal(rows[0]?.selectedSaleType, "rtyh");
  assert.equal(rows[0]?.suggestedPacksCount, 4);
  assert.equal(rows[0]?.selectedPacksCount, 4);
  assert.equal(rows[0]?.requiresManualReview, true);
  assert.equal(rows[0]?.skipImport, false);
});

test("normalizeWhatnotReviewRows preserves manual duplicate candidates and selected import action", () => {
  const rows = normalizeWhatnotReviewRows([
    {
      title: "Kaiju #8",
      action: "update",
      selectedImportAction: "update_existing",
      targetKind: "manual_candidate",
      targetSaleId: "sale-99",
      manualDuplicateCandidate: {
        saleId: "sale-99",
        confidence: "high",
        reasonSummary: "Same lot, date, and buyer",
        saleSummary: {
          date: "2026-03-01",
          price: 14,
          quantity: 1,
          packsCount: 1,
          customer: "Memo Buyer",
          memo: "Manually added"
        }
      }
    }
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.selectedImportAction, "update_existing");
  assert.equal(rows[0]?.targetKind, "manual_candidate");
  assert.equal(rows[0]?.targetSaleId, "sale-99");
  assert.equal(rows[0]?.manualDuplicateCandidate?.saleId, "sale-99");
  assert.equal(rows[0]?.manualDuplicateCandidate?.saleSummary.customer, "Memo Buyer");
  assert.equal(rows[0]?.manualDuplicateCandidate?.saleSummary.memo, "Manually added");
});

test("parseWhatnotCsvRowsWithMapping skips TIP transaction rows", () => {
  const parsed = parseWhatnotCsvRowsWithMapping(
    [
      ["Received a tip from pippyuwu", "TIP", "50", "3/18/2026 2:17"],
      ["Kagurabachi box", "ORDER_EARNINGS", "150", "3/5/2026 0:47"]
    ],
    4,
    {
      title: 0,
      orderStatus: 1,
      price: 2,
      orderPlacedAt: 3,
      listingTitle: null,
      buyerName: null,
      originalItemPrice: null,
      sku: null,
      productCategory: null,
      quantity: null,
      buyerShipping: null,
      date: null,
      externalSaleId: null,
      externalOrderId: null,
      externalOrderItemId: null,
      externalAccountId: null,
      saleType: null,
      packsCount: null
    }
  );

  assert.equal(parsed.skippedCount, 1);
  assert.equal(parsed.entries.length, 1);
  assert.equal(parsed.entries[0]?.title, "Kagurabachi box");
});

test("parseWhatnotCsvRowsWithMapping preserves raw ORDER_PLACED_AT_UTC and normalizes local dates for pasted example rows", () => {
  const rows = [
    [
      "3/16/2026 0:00",
      "12",
      "3/5/2026 0:47",
      "3/18/2026 23:07",
      "49208085",
      "ORDER_EARNINGS",
      "Earnings for selling a Kagurabachi box",
      "871874070",
      "Kagurabachi box",
      "\"12 cards / pack\n16 packs / box\"",
      "Union Arena",
      "BUY_IT_NOW",
      "",
      "1",
      "",
      "0",
      "eb28fb58-46dc-47ef-8a61-cbb54be8c406",
      "Morning stream",
      "dbleezy",
      "CA",
      "US",
      "309385324",
      "CAD",
      "129.71",
      "184.49",
      "150",
      "0",
      "150",
      "0",
      "12",
      "5.65",
      "1.8",
      "0.84",
      "875067696"
    ],
    [
      "3/16/2026 0:00",
      "12",
      "3/15/2026 0:20",
      "3/19/2026 19:14",
      "49208085",
      "ORDER_EARNINGS",
      "Earnings for selling a RIP TILL YOU HIT! Kaiju ONLY",
      "894778611",
      "RIP TILL YOU HIT! Kaiju ONLY",
      "I stop at SR rarity",
      "Union Arena",
      "BUY_IT_NOW",
      "",
      "1",
      "",
      "",
      "d60c377e-80a2-421f-b847-b0756612d462",
      "Breaks !",
      "dcgreybush",
      "ON",
      "CA",
      "316227567",
      "CAD",
      "19.74",
      "38.69",
      "23",
      "0",
      "23",
      "0",
      "1.84",
      "1.42",
      "0",
      "0",
      "898672481"
    ]
  ];

  const parsed = parseWhatnotCsvRowsWithMapping(
    rows,
    34,
    {
      title: 8,
      listingTitle: 8,
      buyerName: 18,
      orderPlacedAt: 2,
      originalItemPrice: 25,
      sku: 14,
      quantity: 13,
      price: 27,
      buyerShipping: 28,
      date: 3,
      orderStatus: 5,
      externalSaleId: 33,
      externalOrderId: 7,
      externalOrderItemId: null,
      externalAccountId: 4,
      saleType: 12,
      packsCount: null,
      productCategory: 10
    }
  );

  assert.equal(parsed.entries.length, 2);
  assert.equal(parsed.entries[0]?.externalOrderId, "871874070");
  assert.equal(parsed.entries[0]?.orderPlacedAtRaw, "3/5/2026 0:47");
  assert.equal(parsed.entries[0]?.orderPlacedAt, toExpectedLocalDate("2026-03-05T00:47:00.000Z"));
  assert.equal(parsed.entries[1]?.externalOrderId, "894778611");
  assert.equal(parsed.entries[1]?.orderPlacedAtRaw, "3/15/2026 0:20");
  assert.equal(parsed.entries[1]?.orderPlacedAt, toExpectedLocalDate("2026-03-15T00:20:00.000Z"));
});
