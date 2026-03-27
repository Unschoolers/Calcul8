import assert from "node:assert/strict";
import { test } from "vitest";

import { buildWhatnotImportRowFromNormalizedInput } from "./whatnot";

function toExpectedLocalDate(value: string): string {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

test("buildWhatnotImportRowFromNormalizedInput preserves enriched Whatnot metadata", () => {
  const row = buildWhatnotImportRowFromNormalizedInput({
    externalSaleId: "sale-1",
    externalOrderId: "order-1",
    externalOrderItemId: "item-1",
    externalAccountId: "seller-1",
    title: "Kaiju #8",
    listingTitle: "Kaiju #8 Listing",
    sku: "SKU-1",
    productCategory: "Singles",
    buyerName: "Buyer One",
    quantity: 2,
    price: 20,
    originalItemPrice: 11,
    buyerShipping: 5,
    date: "2026-03-01T14:00:00.000Z",
    orderPlacedAt: "2026-03-01T12:00:00.000Z",
    orderStatus: "COMPLETED",
    listingId: "listing-1",
    productId: "product-1",
    variantId: "variant-1"
  });

  assert.equal(row.listingTitle, "Kaiju #8 Listing");
  assert.equal(row.buyerName, "Buyer One");
  assert.equal(row.originalItemPrice, 11);
  assert.equal(row.orderPlacedAt, "2026-03-01T12:00:00.000Z");
  assert.equal(row.date, "2026-03-01");
});

test("buildWhatnotImportRowFromNormalizedInput normalizes UTC timestamps to the local calendar date", () => {
  const utcTimestamp = "2026-03-08T00:30:00.000Z";
  const row = buildWhatnotImportRowFromNormalizedInput({
    externalSaleId: "sale-2",
    externalOrderId: "order-2",
    externalOrderItemId: "item-2",
    externalAccountId: "seller-1",
    title: "Bleach vol2 box",
    quantity: 1,
    price: 82,
    buyerShipping: 0,
    date: utcTimestamp,
    orderPlacedAt: utcTimestamp
  });

  assert.equal(row.date, toExpectedLocalDate(utcTimestamp));
});
