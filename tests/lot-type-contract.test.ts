import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "vitest";
import {
  applySystemPricingDefaultsToLot,
  normalizeSystemPricingDefaults
} from "../src/app-core/shared/system-pricing-defaults.ts";

type LotTypeHelpers = {
  LOT_TYPES: readonly string[];
  getLotType: (lot?: { lotType?: unknown } | null) => "bulk" | "singles";
  isBulkLot: (lot?: { lotType?: unknown } | null) => boolean;
  isSinglesLot: (lot?: { lotType?: unknown } | null) => boolean;
};

type LotTypeContractHelpers = {
  createLotTypeContractCases: (overrides?: Record<string, unknown>) => Array<{
    lotType: "bulk" | "singles";
    lot: Record<string, unknown>;
  }>;
};

async function loadLotTypeHelpers(): Promise<LotTypeHelpers> {
  const loaded = await import("../src/app-core/shared/lot-types.ts").catch((error: unknown) => ({ error }));
  if ("error" in loaded) {
    assert.fail(`Expected shared lot type helpers to exist: ${String(loaded.error)}`);
  }
  return loaded as LotTypeHelpers;
}

async function loadLotTypeContractHelpers(): Promise<LotTypeContractHelpers> {
  const loaded = await import("./helpers/lot-type-contract.ts").catch((error: unknown) => ({ error }));
  if ("error" in loaded) {
    assert.fail(`Expected reusable lot type contract test helpers to exist: ${String(loaded.error)}`);
  }
  return loaded as LotTypeContractHelpers;
}

function collectSourceFiles(root: string): string[] {
  const entries = readdirSync(root);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(root, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
      continue;
    }
    if (fullPath.endsWith(".ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

test("shared lot type helpers declare every supported mode and normalize legacy lots", async () => {
  const { LOT_TYPES, getLotType, isBulkLot, isSinglesLot } = await loadLotTypeHelpers();

  assert.deepEqual(LOT_TYPES, ["bulk", "singles"]);
  assert.equal(getLotType({}), "bulk");
  assert.equal(getLotType({ lotType: "bulk" }), "bulk");
  assert.equal(getLotType({ lotType: "singles" }), "singles");
  assert.equal(getLotType({ lotType: "unknown" }), "bulk");
  assert.equal(isBulkLot({}), true);
  assert.equal(isBulkLot({ lotType: "singles" }), false);
  assert.equal(isSinglesLot({ lotType: "singles" }), true);
  assert.equal(isSinglesLot({ lotType: "bulk" }), false);
});

test("lot type contract test matrix covers bulk and singles lots", async () => {
  const { createLotTypeContractCases } = await loadLotTypeContractHelpers();
  const cases = createLotTypeContractCases();

  assert.deepEqual(cases.map((entry) => entry.lotType), ["bulk", "singles"]);
  assert.equal(cases[0]?.lot.lotType, "bulk");
  assert.equal(cases[1]?.lot.lotType, "singles");
  assert.ok(Array.isArray(cases[1]?.lot.singlesPurchases));
});

test("system pricing defaults contract covers inherited and overridden bulk and singles lots", async () => {
  const { createLotTypeContractCases } = await loadLotTypeContractHelpers();
  const defaults = normalizeSystemPricingDefaults({
    sellingCurrency: "USD",
    sellingTaxPercent: 7,
    sellingShippingPerOrder: 3,
    targetProfitPercent: 19,
    spotsPerBox: 11,
    feeProfilePreset: "none"
  });

  for (const { lotType, lot } of createLotTypeContractCases({
    usesSystemPricingDefaults: true,
    sellingCurrency: "CAD",
    sellingTaxPercent: 99,
    sellingShippingPerOrder: 99,
    targetProfitPercent: 2,
    spotsPerBox: 4
  })) {
    const applied = applySystemPricingDefaultsToLot(lot as never, defaults);
    assert.equal(applied.lotType, lotType);
    assert.equal(applied.sellingCurrency, "USD");
    assert.equal(applied.sellingTaxPercent, 7);
    assert.equal(applied.sellingShippingPerOrder, 3);
    assert.equal(applied.targetProfitPercent, 19);
    assert.equal(applied.spotsPerBox, 11);
  }

  for (const { lot } of createLotTypeContractCases({
    usesSystemPricingDefaults: false,
    sellingCurrency: "CAD",
    sellingTaxPercent: 99,
    sellingShippingPerOrder: 99,
    targetProfitPercent: 2,
    spotsPerBox: 4
  })) {
    const applied = applySystemPricingDefaultsToLot(lot as never, defaults);
    assert.equal(applied.sellingCurrency, "CAD");
    assert.equal(applied.sellingTaxPercent, 99);
    assert.equal(applied.sellingShippingPerOrder, 99);
    assert.equal(applied.targetProfitPercent, 2);
    assert.equal(applied.spotsPerBox, 4);
  }
});

test("production TypeScript routes raw lot.lotType comparisons through shared helpers", () => {
  const sourceRoot = join(process.cwd(), "src");
  const allowedFiles = new Set([
    join(sourceRoot, "app-core", "shared", "lot-types.ts"),
    join(sourceRoot, "shared", "lot-types.ts")
  ]);
  const rawComparisonPattern = /\.lotType\s*(?:={2,3}|!={1,2})\s*["']singles["']|["']singles["']\s*(?:={2,3}|!={1,2})\s*[^;\n]*\.lotType/;
  const violations = collectSourceFiles(sourceRoot)
    .filter((file) => !allowedFiles.has(file))
    .flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return source
        .split(/\r?\n/)
        .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
        .filter(({ line }) => rawComparisonPattern.test(line))
        .map(({ line, lineNumber }) => `${relative(process.cwd(), file)}:${lineNumber}: ${line}`);
    });

  assert.deepEqual(violations, []);
});
