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
