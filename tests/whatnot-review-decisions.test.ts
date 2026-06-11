import assert from "node:assert/strict";
import { test } from "vitest";
import type { Sale, WhatnotImportReviewRow } from "../src/types/app.ts";
import {
  buildWhatnotReviewChangeDiffs,
  buildWhatnotReviewDecisions,
  buildWhatnotReviewDecisionSummary,
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

test("validateWhatnotReviewRowsForImport blocks non-skipped rows without stable Whatnot identity", () => {
  const notices: Array<[string, string | undefined]> = [];
  const result = validateWhatnotReviewRowsForImport({
    whatnotReviewRows: [
      createReviewRow({
        externalSaleId: "",
        externalOrderItemId: "",
        selectedImportAction: "create"
      })
    ],
    notify: (message, color) => {
      notices.push([message, color]);
    }
  });

  assert.equal(result, false);
  assert.deepEqual(notices, [[
    "Whatnot row Bleach Volume 2 box is missing a stable import id. Skip it or upload the weekly Whatnot order report.",
    "warning"
  ]]);
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
    }),
    createReviewRow({
      rowId: "row-split",
      selectedImportAction: "split_group",
      targetKind: "manual_candidate",
      targetSaleId: "sale-existing"
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
    },
    {
      rowId: "row-split",
      lotId: 7,
      saleType: "box",
      packsCount: null,
      skip: false,
      selectedImportAction: "split_group",
      targetKind: "new",
      targetSaleId: undefined
    }
  ]);
});

test("buildWhatnotReviewDecisionSummary exposes repeat-safe import decisions", () => {
  const summary = buildWhatnotReviewDecisionSummary([
    createReviewRow({
      rowId: "row-create",
      action: "create",
      selectedImportAction: "create"
    }),
    createReviewRow({
      rowId: "row-skip",
      action: "skip",
      existingSaleId: "11",
      targetSaleId: "11",
      targetKind: "whatnot_mapping"
    }),
    createReviewRow({
      rowId: "row-update",
      action: "update",
      existingSaleId: "12",
      targetSaleId: "12",
      targetKind: "whatnot_mapping",
      requiresManualReview: false
    }),
    createReviewRow({
      rowId: "row-split",
      selectedImportAction: "split_group",
      manualDuplicateCandidate: {
        saleId: "12",
        confidence: "high",
        reasonSummary: "Grouped rows match sale",
        saleSummary: {
          date: "2026-03-08",
          price: 75,
          quantity: 3,
          packsCount: 36
        }
      }
    }),
    createReviewRow({
      rowId: "row-missing",
      externalSaleId: "",
      externalOrderItemId: "",
      selectedImportAction: "create"
    })
  ]);

  assert.deepEqual(summary, {
    totalCount: 5,
    readyCount: 3,
    createCount: 1,
    updateCount: 1,
    splitCount: 1,
    skipCount: 1,
    alreadyImportedCount: 1,
    changedCount: 1,
    missingIdentityCount: 1,
    blockedCount: 1,
    manualReviewCount: 1
  });
});

test("buildWhatnotReviewChangeDiffs compares imported rows to the target sale", () => {
  const existingSale: Sale = {
    id: 12,
    type: "pack",
    quantity: 1,
    packsCount: 1,
    price: 20,
    buyerShipping: 0,
    date: "2026-03-08"
  };

  const diffs = buildWhatnotReviewChangeDiffs(
    createReviewRow({
      action: "update",
      existingSaleId: "12",
      targetSaleId: "12",
      price: 22.5,
      buyerShipping: 1.25,
      date: "2026-03-09"
    }),
    existingSale
  );

  assert.deepEqual(diffs, [
    { field: "date", before: "2026-03-08", after: "2026-03-09" },
    { field: "saleTotal", before: 20, after: 22.5 },
    { field: "buyerShipping", before: 0, after: 1.25 }
  ]);
});
