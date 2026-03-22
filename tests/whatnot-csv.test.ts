import assert from "node:assert/strict";
import { test } from "vitest";
import {
  buildWhatnotCsvImportDraft,
  normalizeWhatnotReviewRows,
  parseWhatnotCsvRowsWithMapping
} from "../src/app-core/shared/whatnot-csv.ts";

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
  assert.equal(draft?.mapping.quantity, 13);
  assert.equal(draft?.mapping.date, 3);
  assert.equal(draft?.mapping.externalAccountId, 4);
  assert.equal(draft?.mapping.externalSaleId, 33);
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

test("parseWhatnotCsvRowsWithMapping normalizes whatnot weekly export rows with completed date and box inference", () => {
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
  assert.equal(parsed.entries[0]?.price, 82);
  assert.equal(parsed.entries[0]?.date, "2026-03-12");
  assert.equal(parsed.entries[0]?.suggestedSaleType, "box");
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
