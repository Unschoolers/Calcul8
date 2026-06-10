import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import { buildWhatnotCsvImportDraft } from "../src/app-core/shared/whatnot-csv.ts";
import { WhatnotCsvImportDialog } from "../src/components/windows/whatnot/WhatnotCsvImportDialog.ts";

test("whatnot CSV import dialog exposes weekly report preflight totals", () => {
  const draft = buildWhatnotCsvImportDraft(
    "\"REPORT_START_DATE\",\"WEEK_NUMBER\",\"ORDER_PLACED_AT_UTC\",\"TRANSACTION_COMPLETED_AT_UTC\",\"SELLER_ID\",\"TRANSACTION_TYPE\",\"TRANSACTION_MESSAGE\",\"ORDER_ID\",\"LISTING_TITLE\",\"LISTING_DESCRIPTION\",\"PRODUCT_CATEGORY\",\"BUY_FORMAT\",\"SALE_TYPE\",\"QUANTITY_SOLD\",\"SKU\",\"COST_OF_GOODS\",\"LIVESTREAM_ID\",\"LIVESTREAM_TITLE\",\"BUYER_NAME\",\"BUYER_STATE\",\"BUYER_COUNTRY\",\"SHIPMENT_ID\",\"TRANSACTION_CURRENCY\",\"TRANSACTION_AMOUNT\",\"BUYER_PAID\",\"ORIGINAL_ITEM_PRICE\",\"COUPON_COST\",\"POST_COUPON_PRICE\",\"SHIPPING_FEE\",\"COMMISSION_FEE\",\"PAYMENT_PROCESSING_FEE\",\"TAX_ON_COMMISSION_FEE\",\"TAX_ON_PAYMENT_PROCESSING_FEE\",\"LEDGER_TRANSACTION_ID\"\n" +
      "\"2026-06-01 00:00:00\",23,\"2026-05-30 00:00:05\",\"2026-06-06 00:53:44\",49208085,\"ORDER_EARNINGS\",\"Earnings for selling a Jujutsu Kaisen vol2 Pack\",\"1073366887\",\"Jujutsu Kaisen vol2 Pack\",\"One JJKvol2 Pack\",\"Union Arena\",\"BUY_IT_NOW\",\"\",1,\"\",\"\",\"030a130a-58c7-4402-a0d3-f27f80fa9e0f\",\"C'est bon la poutine\",\"genbenji_tcg\",\"QC\",\"CA\",\"375880115\",\"CAD\",\"6.79\",\"9.20\",\"8.00\",\"0.00\",\"8.00\",\"0.00\",\"0.64\",\"0.57\",\"0.00\",\"0.00\",\"1083346744\""
  );

  assert.ok(draft);
  const preflight = WhatnotCsvImportDialog.computed.whatnotCsvWeeklyPreflight.call({
    whatnotCsvHeaders: draft.headers,
    whatnotCsvRows: draft.rows
  });

  assert.equal(preflight.detected, true);
  assert.equal(preflight.importableRows, 1);
  assert.equal(preflight.grossAmount, 8);
  assert.equal(preflight.feeAmount, 1.21);
  assert.equal(preflight.netAmount, 6.79);
  assert.equal(preflight.buyerPaidAmount, 9.2);
});

test("whatnot CSV import dialog template includes the weekly report preflight", () => {
  const template = readFileSync("src/components/windows/whatnot/WhatnotCsvImportDialog.html", "utf8");

  assert.match(template, /whatnotCsvWeeklyPreflight/);
  assert.match(template, /whatnotCsvPreflightStat/);
  assert.match(template, /whatnotCsvPreflightWillImport/);
  assert.match(template, /whatnotCsvGenericReadyBody/);
});
