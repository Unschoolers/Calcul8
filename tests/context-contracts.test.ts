import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("the app context is composed from focused feature contracts", () => {
  const aggregate = readSource("src/app-core/context-app.ts");
  const featureContractFiles = [
    "src/app-core/context/runtime.ts",
    "src/app-core/context/api.ts",
    "src/app-core/context/auth.ts",
    "src/app-core/context/commerce.ts",
    "src/app-core/context/portfolio.ts",
    "src/app-core/context/workspace.ts"
  ];

  for (const file of featureContractFiles) {
    assert.doesNotThrow(() => readSource(file), `${file} should define a focused context boundary`);
  }

  assert.doesNotMatch(aggregate, /export interface AppComputedState\s*\{/);
  assert.doesNotMatch(aggregate, /export interface AppMethodState\s*\{/);
  for (const contract of [
    "RuntimeComputedState",
    "AuthComputedState",
    "CommerceComputedState",
    "PortfolioComputedState",
    "WorkspaceComputedState",
    "WhatnotComputedState",
    "RuntimeMethodState",
    "AuthMethodState",
    "CommerceMethodState",
    "PortfolioMethodState",
    "WorkspaceMethodState",
    "WhatnotMethodState",
    "GameMethodState"
  ]) {
    assert.match(aggregate, new RegExp(`\\b${contract}\\b`), `${contract} should remain in the aggregate contract`);
  }
  assert.match(aggregate, /export type AppContext\s*=/);
  assert.ok(
    aggregate.split(/\r?\n/).length < 100,
    "context-app.ts should compose feature contracts instead of declaring every capability"
  );
});

test("Portfolio leaf modules depend on the Portfolio context", () => {
  const computed = readSource("src/app-core/computed/portfolio.ts");
  const hydration = readSource("src/app-core/methods/sales-portfolio-hydration.ts");

  assert.match(computed, /PortfolioComputedObject/);
  assert.doesNotMatch(computed, /AppComputedObject/);
  assert.doesNotMatch(computed, /AppContext/);
  assert.match(hydration, /PortfolioContext/);
  assert.doesNotMatch(hydration, /AppContext/);
});

test("feature computed modules use feature-scoped computed contracts", () => {
  const computedDirectory = new URL("../src/app-core/computed/", import.meta.url);
  const featureComputedFiles = readdirSync(computedDirectory)
    .filter((file) => file.endsWith(".ts"))
    .map((file) => `src/app-core/computed/${file}`);

  for (const file of featureComputedFiles) {
    const source = readSource(file);
    assert.doesNotMatch(source, /AppComputedObject/, `${file} should not consume the aggregate computed contract`);
    assert.doesNotMatch(source, /AppContext/, `${file} should not consume the aggregate app context`);
  }
});

test("auth and commerce contracts own only their feature capabilities", () => {
  const auth = readSource("src/app-core/context/auth.ts");
  const commerce = readSource("src/app-core/context/commerce.ts");

  assert.doesNotMatch(auth, /lotNameDraft|newLotName|canUsePaidActions/);
  assert.doesNotMatch(commerce, /from "\.\/auth\.ts"/);
  assert.match(commerce, /lotNameDraft/);
  assert.match(commerce, /canUsePaidActions/);
});

test("generic scoped API transport does not require sales cache capabilities", () => {
  const apiContract = readSource("src/app-core/context/api.ts");
  const transport = readSource("src/app-core/methods/entity-api-shared.ts");

  assert.doesNotMatch(apiContract, /getSalesStorageKey|SalesEntityContext/);
  assert.doesNotMatch(transport, /getSalesStorageKey|SalesEntityContext|SalesLiveApiApp/);
  assert.match(transport, /ScopedApiContext/);
});

test("shared sales boundaries use commerce capabilities instead of AppContext", () => {
  const salesBoundaryFiles = [
    "src/app-core/methods/entity-api-shared.ts",
    "src/app-core/methods/lot-sales-api.ts",
    "src/app-core/methods/sales-ui-helpers.ts",
    "src/app-core/shared/sales-cache-storage.ts"
  ];

  for (const file of salesBoundaryFiles) {
    assert.doesNotMatch(
      readSource(file),
      /AppContext/,
      `${file} should declare only the commerce capabilities it consumes`
    );
  }
});
