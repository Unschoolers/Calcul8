import assert from "node:assert/strict";
import { test } from "vitest";
import { WhatnotReviewDialog } from "../src/components/windows/whatnot/WhatnotReviewDialog.ts";

test("whatnotReviewGroups groups rows without relying on a callable computed helper", () => {
  const context = {
    preferredLanguage: "en",
    whatnotReviewRows: [
      {
        rowId: "row-2",
        buyerName: "Alice",
        listingTitle: "One Piece Box",
        title: "One Piece Box",
        orderPlacedAt: "2026-04-10T14:12:00Z",
        date: "2026-04-10",
        externalOrderId: "order-2"
      },
      {
        rowId: "row-1",
        buyerName: "Alice",
        listingTitle: "One Piece Box",
        title: "One Piece Box",
        orderPlacedAt: "2026-04-10T09:01:00Z",
        date: "2026-04-10",
        externalOrderId: "order-1"
      },
      {
        rowId: "row-3",
        buyerName: "Bob",
        listingTitle: "Bleach Starter",
        title: "Bleach Starter",
        orderPlacedAt: "2026-04-11T09:01:00Z",
        date: "2026-04-11",
        externalOrderId: "order-3"
      }
    ]
  };

  const groups = WhatnotReviewDialog.computed.whatnotReviewGroups.call(context);

  assert.equal(groups.length, 2);
  assert.equal(groups[0]?.buyerLabel, "Alice");
  assert.equal(groups[0]?.rows.length, 2);
  assert.deepEqual(
    groups[0]?.rows.map((row: { rowId: string }) => row.rowId),
    ["row-1", "row-2"]
  );
  assert.equal(groups[1]?.buyerLabel, "Bob");
});

test("whatnotRowTargetLabel does not call a computed language value like a function", () => {
  const context = {
    preferredLanguage: "en",
    whatnotSelectedImportAction: () => "skip",
    buildWhatnotClientManualDuplicateCandidates: () => []
  };

  const label = WhatnotReviewDialog.methods.whatnotRowTargetLabel.call(context, {
    rowId: "row-1"
  });

  assert.equal(label, "Skipping this row");
});

test("whatnotReviewIdentityBadge labels repeat-safe import states", () => {
  const context = {
    preferredLanguage: "en"
  };

  assert.deepEqual(
    WhatnotReviewDialog.methods.whatnotReviewIdentityBadge.call(context, {
      externalSaleId: "ledger-1",
      externalOrderId: "order-1",
      externalOrderItemId: "ledger-1",
      action: "create"
    }),
    { color: "success", label: "New" }
  );
  assert.deepEqual(
    WhatnotReviewDialog.methods.whatnotReviewIdentityBadge.call(context, {
      externalSaleId: "ledger-1",
      externalOrderId: "order-1",
      externalOrderItemId: "ledger-1",
      existingSaleId: "7",
      action: "skip"
    }),
    { color: "info", label: "Already imported" }
  );
  assert.deepEqual(
    WhatnotReviewDialog.methods.whatnotReviewIdentityBadge.call(context, {
      externalSaleId: "ledger-1",
      externalOrderId: "order-1",
      externalOrderItemId: "ledger-1",
      existingSaleId: "7",
      action: "update"
    }),
    { color: "warning", label: "Changed" }
  );
  assert.deepEqual(
    WhatnotReviewDialog.methods.whatnotReviewIdentityBadge.call(context, {
      externalSaleId: "",
      externalOrderId: "order-1",
      externalOrderItemId: "",
      action: "create"
    }),
    { color: "error", label: "Missing id" }
  );
});

test("whatnotReviewDecisionSummary exposes repeat-safe counts for the review header", () => {
  const context = {
    preferredLanguage: "en",
    whatnotReviewRows: [
      {
        rowId: "new",
        externalSaleId: "ledger-1",
        externalOrderId: "order-1",
        externalOrderItemId: "ledger-1",
        action: "create",
        requiresManualReview: true,
        skipImport: false
      },
      {
        rowId: "already",
        externalSaleId: "ledger-2",
        externalOrderId: "order-2",
        externalOrderItemId: "ledger-2",
        action: "skip",
        existingSaleId: "8",
        targetKind: "whatnot_mapping",
        targetSaleId: "8",
        requiresManualReview: false,
        skipImport: true
      },
      {
        rowId: "changed",
        externalSaleId: "ledger-3",
        externalOrderId: "order-3",
        externalOrderItemId: "ledger-3",
        action: "update",
        existingSaleId: "9",
        targetKind: "whatnot_mapping",
        targetSaleId: "9",
        requiresManualReview: false,
        skipImport: false
      }
    ]
  };

  const summary = WhatnotReviewDialog.computed.whatnotReviewDecisionSummary.call(context);

  assert.equal(summary.readyCount, 2);
  assert.equal(summary.createCount, 1);
  assert.equal(summary.updateCount, 1);
  assert.equal(summary.skipCount, 1);
  assert.equal(summary.alreadyImportedCount, 1);
  assert.equal(summary.changedCount, 1);
});

test("whatnotReviewChangeDiffs resolves the mapped sale from the selected lot", () => {
  const context = {
    preferredLanguage: "en",
    loadSalesForLotId: (lotId: number) => lotId === 7
      ? [{
          id: 9,
          type: "pack",
          quantity: 1,
          packsCount: 1,
          price: 20,
          buyerShipping: 0,
          date: "2026-03-08"
        }]
      : []
  };

  const diffs = WhatnotReviewDialog.methods.whatnotReviewChangeDiffs.call(context, {
    rowId: "changed",
    externalSaleId: "ledger-3",
    externalOrderId: "order-3",
    externalOrderItemId: "ledger-3",
    action: "update",
    existingSaleId: "9",
    targetSaleId: "9",
    selectedLotId: 7,
    price: 21.5,
    buyerShipping: 1,
    date: "2026-03-09"
  });

  assert.deepEqual(diffs, [
    { field: "date", before: "2026-03-08", after: "2026-03-09" },
    { field: "saleTotal", before: 20, after: 21.5 },
    { field: "buyerShipping", before: 0, after: 1 }
  ]);
});

test("handleWhatnotImportActionSelection splits rows that share one manual candidate sale", () => {
  const duplicateCandidate = {
    saleId: "12",
    confidence: "high",
    reasonSummary: "Grouped local sale",
    saleSummary: {
      date: "2026-05-08",
      price: 316.97,
      quantity: 3,
      packsCount: 3
    }
  };
  const rows = [
    {
      rowId: "row-1",
      selectedLotId: 7,
      selectedImportAction: "update_existing",
      targetKind: "manual_candidate",
      targetSaleId: "12",
      manualDuplicateCandidate: duplicateCandidate,
      listingTitle: "Nikke Box",
      title: "Nikke Box"
    },
    {
      rowId: "row-2",
      selectedLotId: 7,
      selectedImportAction: "update_existing",
      targetKind: "manual_candidate",
      targetSaleId: "12",
      manualDuplicateCandidate: duplicateCandidate,
      listingTitle: "Nikke Box #2",
      title: "Nikke Box #2"
    },
    {
      rowId: "row-3",
      selectedLotId: 7,
      selectedImportAction: "update_existing",
      targetKind: "manual_candidate",
      targetSaleId: "12",
      manualDuplicateCandidate: duplicateCandidate,
      listingTitle: "Nikke Box #3",
      title: "Nikke Box #3"
    },
    {
      rowId: "row-4",
      selectedLotId: 7,
      selectedImportAction: "update_existing",
      targetKind: "manual_candidate",
      targetSaleId: "99",
      manualDuplicateCandidate: {
        ...duplicateCandidate,
        saleId: "99"
      },
      listingTitle: "Other Box",
      title: "Other Box"
    }
  ];
  const context = {
    preferredLanguage: "en",
    whatnotReviewRows: rows,
    buildWhatnotClientManualDuplicateCandidate: () => null,
    buildWhatnotClientManualDuplicateCandidates: () => [duplicateCandidate],
    syncWhatnotManualDuplicateCandidatesForGroup: () => null,
    whatnotSplitGroupRowCount: WhatnotReviewDialog.methods.whatnotSplitGroupRowCount,
    applyWhatnotSelectionToSimilarRows: WhatnotReviewDialog.methods.applyWhatnotSelectionToSimilarRows,
    applyWhatnotSelectionToManualCandidateRows: WhatnotReviewDialog.methods.applyWhatnotSelectionToManualCandidateRows
  };

  assert.equal(WhatnotReviewDialog.methods.whatnotCanSplitGroup.call(context, rows[0]), true);

  WhatnotReviewDialog.methods.handleWhatnotImportActionSelection.call(context, rows[0], "split_group");

  assert.deepEqual(
    rows.slice(0, 3).map((row) => ({
      selectedImportAction: row.selectedImportAction,
      targetKind: row.targetKind,
      targetSaleId: row.targetSaleId,
      skipImport: row.skipImport
    })),
    [
      { selectedImportAction: "split_group", targetKind: "new", targetSaleId: null, skipImport: false },
      { selectedImportAction: "split_group", targetKind: "new", targetSaleId: null, skipImport: false },
      { selectedImportAction: "split_group", targetKind: "new", targetSaleId: null, skipImport: false }
    ]
  );
  assert.equal(rows[3]?.selectedImportAction, "update_existing");
  assert.equal(rows[3]?.targetSaleId, "99");
});
