import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

interface TypeScriptSource {
  file: string;
  source: string;
}

function readTypeScriptSources(relativeDirectory: string): TypeScriptSource[] {
  const sources: TypeScriptSource[] = [];

  function visit(relativePath: string): void {
    const directory = new URL(`../${relativePath}/`, import.meta.url);
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = `${relativePath}/${entry.name}`;
      if (entry.isDirectory()) {
        visit(entryPath);
      } else if (entry.isFile() && entry.name.endsWith(".ts")) {
        sources.push({ file: entryPath, source: readSource(entryPath) });
      }
    }
  }

  visit(relativeDirectory);
  return sources.sort((left, right) => left.file.localeCompare(right.file));
}

function withoutTypeScriptComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

function findSourceConsumers(
  sources: TypeScriptSource[],
  pattern: RegExp,
  allowedFiles: ReadonlySet<string>
): string[] {
  return sources
    .filter(({ file, source }) => pattern.test(withoutTypeScriptComments(source)) && !allowedFiles.has(file))
    .map(({ file }) => file);
}

test("aggregate app context dependencies cannot spread to new source files", () => {
  const sources = readTypeScriptSources("src");
  // This migration ledger is intentionally explicit. Each domain migration removes
  // its files until only the declaration and barrel remain for AppContext, and the
  // implementation helpers and casts have no remaining consumers.
  const allowedAppContextFiles = new Set([
    "src/app-core/auth/session.ts",
    "src/app-core/context-app.ts",
    "src/app-core/context-contracts.ts",
    "src/app-core/context.ts",
    "src/app-core/lifecycle.ts",
    "src/app-core/methods/config-io.ts",
    "src/app-core/methods/config-live-pricing.ts",
    "src/app-core/methods/config-lots.ts",
    "src/app-core/methods/lot-live-pricing-api.ts",
    "src/app-core/methods/sales-charts.ts",
    "src/app-core/methods/sales-freshness.ts",
    "src/app-core/methods/sales-persistence.ts",
    "src/app-core/methods/ui/auth/account.ts",
    "src/app-core/methods/ui/auth/auth-session.ts",
    "src/app-core/methods/ui/buyers/buyer-profile-api.ts",
    "src/app-core/methods/ui/common/api-client.ts",
    "src/app-core/methods/ui/common/onboarding.ts",
    "src/app-core/methods/ui/entitlements/entitlement-access-defaults.ts",
    "src/app-core/methods/ui/entitlements/entitlement-cache.ts",
    "src/app-core/methods/ui/entitlements/entitlements-purchase-types.ts",
    "src/app-core/methods/ui/entitlements/entitlements-signin-service.ts",
    "src/app-core/methods/ui/entitlements/entitlements-status-service.ts",
    "src/app-core/methods/ui/entitlements/entitlements-stripe.ts",
    "src/app-core/methods/ui/entitlements/purchase-verification.ts",
    "src/app-core/methods/ui/spectator/game-spectator.ts",
    "src/app-core/methods/ui/spectator/wheel-broadcast.ts",
    "src/app-core/methods/ui/sync/lot-entity-polling.ts",
    "src/app-core/methods/ui/sync/sync-apply.ts",
    "src/app-core/methods/ui/sync/sync-payload.ts",
    "src/app-core/methods/ui/sync/sync-service.ts",
    "src/app-core/methods/ui/sync/sync-status.ts",
    "src/app-core/methods/ui/whatnot/whatnot-http.ts",
    "src/app-core/methods/ui/whatnot/whatnot-types.ts",
    "src/app-core/methods/ui/workspace/workspace-api.ts",
    "src/app-core/methods/ui/workspace/workspace-members.ts",
    "src/app-core/methods/ui/workspace/workspace-realtime-state.ts",
    "src/app-core/methods/ui/workspace/workspace-ui-helpers.ts",
    "src/app-core/watch.ts",
    "src/components/windows/game/coordinator/gameControllerState.ts"
  ]);
  const allowedAppMethodImplementationFiles = new Set([
    "src/app-core/context-app.ts",
    "src/app-core/methods/config-io.ts",
    "src/app-core/methods/config-lots.ts",
    "src/app-core/methods/config-pricing.ts",
    "src/app-core/methods/config-storage.ts",
    "src/app-core/methods/config.ts",
    "src/app-core/methods/live-singles.ts",
    "src/app-core/methods/pwa.ts",
    "src/app-core/methods/sales.ts",
    "src/app-core/methods/ui/auth/account.ts",
    "src/app-core/methods/ui/buyers/buyer-profiles.ts",
    "src/app-core/methods/ui/common/base.ts",
    "src/app-core/methods/ui/common/onboarding.ts",
    "src/app-core/methods/ui/entitlements/entitlements-purchase.ts",
    "src/app-core/methods/ui/entitlements/entitlements-signin.ts",
    "src/app-core/methods/ui/entitlements/entitlements-status.ts",
    "src/app-core/methods/ui/entitlements/entitlements.ts",
    "src/app-core/methods/ui/sync/sync.ts",
    "src/app-core/methods/ui/whatnot/whatnot.ts",
    "src/app-core/methods/ui/workspace/workspace-invite-methods.ts",
    "src/app-core/methods/ui/workspace/workspace-membership-methods.ts",
    "src/app-core/methods/ui/workspace/workspace-realtime-methods.ts",
    "src/app-core/methods/ui/workspace/workspace-scope-methods.ts",
    "src/app-core/methods/ui/workspace/workspaces.ts",
    "src/app-core/methods/ui.ts"
  ]);
  const allowedAppComputedObjectFiles = new Set([
    "src/app-core/computed.ts",
    "src/app-core/context-contracts.ts",
    "src/app-core/context.ts"
  ]);
  const allowedAppContextCastFiles = new Set([
    "src/app-core/methods/config-live-pricing.ts",
    "src/app-core/methods/ui/spectator/game-spectator.ts",
    "src/app-core/methods/ui/workspace/workspace-members.ts"
  ]);
  const aggregateDependencies = [
    { name: "AppContext", pattern: /\bAppContext\b/, allowedFiles: allowedAppContextFiles },
    {
      name: "AppMethodImplementation",
      pattern: /\bAppMethodImplementation\b/,
      allowedFiles: allowedAppMethodImplementationFiles
    },
    { name: "AppComputedObject", pattern: /\bAppComputedObject\b/, allowedFiles: allowedAppComputedObjectFiles },
    { name: "as AppContext", pattern: /\bas\s+AppContext\b/, allowedFiles: allowedAppContextCastFiles }
  ];

  for (const dependency of aggregateDependencies) {
    assert.deepEqual(
      findSourceConsumers(sources, dependency.pattern, dependency.allowedFiles),
      [],
      `${dependency.name} consumers must stay within the explicit migration allow-list`
    );
  }
});

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
