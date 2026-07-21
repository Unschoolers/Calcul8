# Task 4: Migrate Commerce, Configuration, Sales, And Portfolio

This domain follows reviewed identity/entitlement and workspace/sync contracts. Read current focused contracts before editing. Work on `main`, use TDD, and remove every commerce/config/sales aggregate consumer permanently before committing.

## Global constraints

- Preserve all lot, pricing, local storage, authoritative live pricing, sale persistence, chart, portfolio, debounce, in-flight, optimistic concurrency, and offline behavior exactly.
- Reuse the existing commerce, portfolio, scoped API, runtime, workspace, and sync contracts. Split by coherent workflow rather than growing one replacement god-context.
- No `AppContext`, `AppMethodImplementation`, `AppComputedObject`, `as AppContext`, `any`, `unknown`, or anonymous aggregate substitute aliases.
- Keep storage/scope keys centralized and personal/workspace caches isolated.
- Do not modify buyer, Whatnot, game, spectator, PWA, common UI, watcher, or lifecycle domains.
- Follow TDD by removing the domain from architecture allow-lists and observing RED before production edits.

## Required migration surface

Migrate aggregate consumers in:

- `src/app-core/methods/config-io.ts`
- `src/app-core/methods/config-live-pricing.ts`
- `src/app-core/methods/config-lots.ts`
- `src/app-core/methods/config-pricing.ts`
- `src/app-core/methods/config-storage.ts`
- `src/app-core/methods/config.ts`
- `src/app-core/methods/live-singles.ts`
- `src/app-core/methods/lot-live-pricing-api.ts`
- `src/app-core/methods/sales-charts.ts`
- `src/app-core/methods/sales-freshness.ts`
- `src/app-core/methods/sales-persistence.ts`
- `src/app-core/methods/sales.ts`

Extend `src/app-core/context/commerce.ts` and `src/app-core/context/portfolio.ts`, or add smaller commerce-owned contract files when separation is clearer. Export named workflow contexts and exact focused implementation types.

## Required boundaries

- Lot IO/import/export contexts own configuration snapshot and authoritative hydration dependencies.
- Lot storage contexts own storage/persistence capabilities without network concerns.
- Pricing contexts own fee/currency/target calculations and only their save/notification dependencies.
- Live-pricing API uses `ScopedApiContext` plus a dedicated pricing payload type; it must not index `AppContext`.
- Queued live-pricing save/hydration contexts expose exact timer/version/in-flight state and public API capabilities.
- Sales persistence separates local mutation/cache/chart capabilities from authoritative API capabilities.
- Sales charts expose only chart state, Vue refs/next-tick, formatting, lot/sale access, and chart retry state.
- Sales freshness exposes scope/cache freshness state without the full commerce context.
- Method objects use `FeatureMethodImplementation` with exact method subsets.

## Architecture test cycle

1. Remove all listed files from temporary aggregate allow-lists in `tests/context-contracts.test.ts` and add a named commerce/config/sales assertion.
2. Run `npm run test -- tests/context-contracts.test.ts`; record RED with the current consumers.
3. Migrate until GREEN. Never re-add migrated files or use aggregate casts.

## Verification

Run strict application/test typechecks and:

```text
npm run test -- tests/context-contracts.test.ts tests/config-io-methods.test.ts tests/config-lot-crud.test.ts tests/config-lot-delete.test.ts tests/config-lot-loading.test.ts tests/config-lots-entity.test.ts tests/config-lots-import.test.ts tests/config-lots-methods.test.ts tests/config-lots-singles.test.ts tests/config-lots-state.test.ts tests/config-pricing-methods.test.ts tests/config-storage-methods.test.ts tests/config-window-system-config.test.ts tests/live-price-card.test.ts tests/live-singles-methods.test.ts tests/live-window.test.ts tests/sales-chart-config.test.ts tests/sales-core.test.ts tests/sales-draft.test.ts tests/sales-live-api.test.ts tests/sales-methods-entity.test.ts tests/sales-methods.test.ts tests/sales-persistence.test.ts tests/sales-portfolio-hydration.test.ts tests/sales-ui-helpers.test.ts tests/sales-window.test.ts tests/portfolio-forecast.test.ts tests/portfolio-performance.test.ts tests/portfolio-window.test.ts tests/computed.test.ts
npm run typecheck
npm run typecheck:tests:web
npm run verify:all
git diff --check
```

All must pass. Self-review for behavior changes, scope/cache leaks, import cycles, casts, duplicated state ownership, and missing aggregate members.

Commit only this domain with message `refactor(web): scope commerce and portfolio contexts`.

## Report

Write `.superpowers/sdd/task-4-report.md` with files changed, RED evidence, focused/full verification evidence, commit hash, and concerns. Return only status, commit hash, one-line test summary, and concerns.
