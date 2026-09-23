import { strict as assert } from "node:assert";
import { test } from "vitest";
import {
  buildWhatnotConfirmationFingerprint,
  buildWhatnotConfirmationOperationKey,
  normalizeWhatnotConfirmationDecisions
} from "./confirmationRecovery";
import { normalizeWhatnotImportDecision } from "../../shared/whatnot-import-contracts.cjs";

test("Whatnot confirmation fingerprint is stable across decision order and harmless whitespace", () => {
  const left = normalizeWhatnotConfirmationDecisions([
    { rowId: " row-2 ", lotId: 8, saleType: "pack", skip: false },
    { rowId: "row-1", lotId: 7, saleType: "box", packsCount: 2 }
  ]);
  const right = normalizeWhatnotConfirmationDecisions([
    { rowId: "row-1", lotId: 7, saleType: "box", packsCount: 2 },
    { rowId: "row-2", lotId: 8, saleType: "pack" }
  ]);

  assert.deepEqual(left, right);
  assert.equal(buildWhatnotConfirmationFingerprint(left), buildWhatnotConfirmationFingerprint(right));
});

test("Whatnot confirmation fingerprint changes when a meaningful decision changes", () => {
  const original = normalizeWhatnotConfirmationDecisions([
    { rowId: "row-1", lotId: 7, saleType: "pack" }
  ]);
  const changed = normalizeWhatnotConfirmationDecisions([
    { rowId: "row-1", lotId: 9, saleType: "pack" }
  ]);

  assert.notEqual(buildWhatnotConfirmationFingerprint(original), buildWhatnotConfirmationFingerprint(changed));
});

test("shared Whatnot decision normalization preserves confirmation fields without inferring skip", () => {
  assert.deepEqual(normalizeWhatnotImportDecision({
    rowId: " row-1 ", lotId: 7, saleType: "box", packsCount: 2,
    targetKind: "manual_candidate", targetSaleId: "sale-3", selectedImportAction: "skip"
  }), {
    rowId: "row-1", skip: false, lotId: 7, saleType: "box", packsCount: 2,
    targetKind: "manual_candidate", targetSaleId: "sale-3", selectedImportAction: "skip"
  });
});

test("Whatnot confirmation operation keys are stable for grouped row ids", () => {
  assert.equal(
    buildWhatnotConfirmationOperationKey("batch-1", [" row-b ", "row-a", "row-a"]),
    buildWhatnotConfirmationOperationKey("batch-1", ["row-a", "row-b"])
  );
});
