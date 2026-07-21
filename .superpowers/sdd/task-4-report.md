# Task 4 Report: Commerce, Configuration, Sales, And Portfolio

## Status

Implementation and verification are complete. Every required commerce, configuration,
sales, and portfolio consumer uses focused contracts, and all temporary aggregate
allow-list entries for this domain are permanently removed.

The required commit is pending because the sandbox denies writes to `.git`; the
escalation request was rejected when the automatic approval reviewer reported that
the account usage limit is exhausted until July 27, 2026.

## Commit

Pending — intended message: `refactor(web): scope commerce and portfolio contexts`.

## Files changed

- Focused contract ownership:
  - `src/app-core/context/commerce.ts`
  - `src/app-core/context/portfolio.ts`
- Configuration and lot workflows:
  - `src/app-core/methods/config-io.ts`
  - `src/app-core/methods/config-live-pricing.ts`
  - `src/app-core/methods/config-lots.ts`
  - `src/app-core/methods/config-pricing.ts`
  - `src/app-core/methods/config-storage.ts`
  - `src/app-core/methods/config.ts`
  - `src/app-core/methods/live-singles.ts`
  - `src/app-core/methods/lot-live-pricing-api.ts`
- Sales and portfolio workflows:
  - `src/app-core/methods/sales-charts.ts`
  - `src/app-core/methods/sales-freshness.ts`
  - `src/app-core/methods/sales-persistence.ts`
  - `src/app-core/methods/sales.ts`
- Architecture guard:
  - `tests/context-contracts.test.ts`

## RED evidence

After removing every listed file from the temporary aggregate allow-lists and adding
the named commerce/configuration/sales/portfolio assertion, this command failed as
required:

`npm run test -- tests/context-contracts.test.ts`

The aggregate guard and the named domain guard both reported these seven remaining
`AppContext` consumers:

- `src/app-core/methods/config-io.ts`
- `src/app-core/methods/config-live-pricing.ts`
- `src/app-core/methods/config-lots.ts`
- `src/app-core/methods/lot-live-pricing-api.ts`
- `src/app-core/methods/sales-charts.ts`
- `src/app-core/methods/sales-freshness.ts`
- `src/app-core/methods/sales-persistence.ts`

The removed method-implementation allow-list entries additionally covered
`config-io.ts`, `config-lots.ts`, `config-pricing.ts`, `config-storage.ts`,
`config.ts`, `live-singles.ts`, and `sales.ts`. The live-pricing aggregate cast entry
was also removed.

## Verification evidence

- Required focused matrix: 30 files passed, 354 tests passed.
- `npm run typecheck`: passed.
- `npm run typecheck:tests:web`: passed.
- Final `npm run verify:all`: passed.
  - Web: 157 files and 1,312 tests passed; production build, strict typecheck, and
    security scan passed.
  - Vue: 6 files and 77 tests passed.
  - API: 70 files and 498 tests passed; build and test typecheck passed.
  - Realtime: 11 tests passed; build passed.
- `git diff --check`: passed.
- Final domain source scan found no `AppContext`, `AppMethodImplementation`,
  `AppComputedObject`, `as AppContext`, `any`, or `unknown` usage in the required
  migrated files.

## Self-review

- Lot storage remains scope-aware through the existing storage-key and workspace-scope
  helpers; no personal/workspace cache key behavior changed.
- Live-pricing debounce, version hashes, retry-on-conflict, hydration state, polling
  baselines, and in-flight ownership remain in their existing module-level state.
- Sales persistence now names local mutation, authoritative API, and chart-refresh
  capabilities separately while preserving the existing optimistic-concurrency paths.
- Sales and portfolio chart contracts expose their existing chart state, formatting,
  Vue refs/next-tick, lot/sale access, and hydration dependencies without aggregate
  casts.
- Method objects use exact `FeatureMethodImplementation` subsets. The legacy wheel
  persistence methods physically owned by `sales.ts` use the existing `GameMethodState`
  and `RootWheelSessionStateContext`; no game implementation was modified.
- Commerce/portfolio cross-references are type-only and therefore introduce no runtime
  import cycle.
- No buyer, Whatnot, game, spectator, PWA, common UI, watcher, or lifecycle file was
  modified.

## Concerns

- Commit creation remains blocked solely by sandbox `.git` permissions and the
  exhausted automatic approval-review allowance. All source changes remain unstaged.
- Existing expected `--localstorage-file` warnings remain non-blocking and unchanged.
