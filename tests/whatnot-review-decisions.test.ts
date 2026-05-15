import assert from "node:assert/strict";
import { test } from "vitest";
import type { WhatnotImportReviewRow } from "../src/types/app.ts";
import {
  buildWhatnotReviewDecisions,
  validateWhatnotReviewRowsForImport
} from "../src/app-core/methods/ui/whatnot/whatnot-review-decisions.ts";

function createReviewRow(overrides: Partial<WhatnotImportReviewRow> = {}): WhatnotImportReviewRow {
  return {
    rowId: "row-1",
    externalSaleId: "sale-1",
    externalOrderId: "order-1",
    externalOrderItemId: "item-1",
    externalAccountId: "seller-1",
    title: "Bleach Volume 2 box",
    quantity: 1,
    price: 25,
    buyerShipping: 0,
    date: "2026-03-08",
    orderStatus: "ORDER_EARNINGS",
    action: "create",
    matchSource: "none",
    requiresManualReview: true,
    selectedLotId: 7,
    selectedSaleType: "box",
    selectedPacksCount: null,
    skipImport: false,
    ...overrides
  };
}

test("validateWhatnotReviewRowsForImport blocks update decisions without a target sale", () => {
  const notices: Array<[string, string | undefined]> = [];
  const result = validateWhatnotReviewRowsForImport({
    whatnotReviewRows: [
      createReviewRow({
        action: "update",
        selectedImportAction: "update_existing",
        existingSaleId: "",
        targetSaleId: null,
        manualDuplicateCandidate: null
      })
    ],
    notify: (message, color) => {
      notices.push([message, color]);
    }
  });

  assert.equal(result, false);
  assert.deepEqual(notices, [["Choose a matching sale to update for Bleach Volume 2 box.", "warning"]]);
});

test("buildWhatnotReviewDecisions keeps manual duplicate targets and explicit skips", () => {
  const decisions = buildWhatnotReviewDecisions([
    createReviewRow({
      rowId: "row-update",
      action: "update",
      selectedImportAction: "update_existing",
      selectedLotId: 8,
      selectedSaleType: "pack",
      selectedPacksCount: 3,
      manualDuplicateCandidate: {
        saleId: "sale-existing",
        confidence: "high",
        reasonSummary: "Same buyer and price",
        saleSummary: {
          date: "2026-03-08",
          price: 25,
          quantity: 1,
          packsCount: 3
        }
      }
    }),
    createReviewRow({
      rowId: "row-skip",
      selectedImportAction: "skip",
      skipImport: true
    })
  ]);

  assert.deepEqual(decisions, [
    {
      rowId: "row-update",
      lotId: 8,
      saleType: "pack",
      packsCount: 3,
      skip: false,
      selectedImportAction: "update_existing",
      targetKind: "manual_candidate",
      targetSaleId: "sale-existing"
    },
    {
      rowId: "row-skip",
      lotId: 7,
      saleType: "box",
      packsCount: null,
      skip: true,
      selectedImportAction: "skip",
      targetKind: null,
      targetSaleId: undefined
    }
  ]);
});
