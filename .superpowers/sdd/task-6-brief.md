# Task 6: Migrate Runtime Composition And Remove Aggregate Helpers

This is the final implementation domain. All feature domains must already be committed and reviewed. Work on `main`, use TDD, migrate every remaining leaf aggregate dependency, enable the exact final zero-use guard, align docs, and commit only when the repository is clean.

## Global constraints

- Preserve Vue Options API composition and all runtime behavior, timers, storage, auth/session, offline, navigation, PWA, onboarding, watcher, and lifecycle semantics exactly.
- Only `src/app-core/context-app.ts` may declare/reference `AppContext`; `src/app-core/context.ts` may re-export it. No other frontend source file may contain an `AppContext` token outside comments.
- Remove `AppMethodImplementation` and `AppComputedObject` declarations and all frontend source uses entirely.
- Remove every `as AppContext` cast entirely.
- Do not introduce `any`, `unknown`, anonymous aggregate aliases, or a renamed replacement god-context.
- Keep root completeness validation through `AppComputedState` and `AppMethodState` while leaf `this` contexts remain focused.
- Follow TDD: enable final assertions first and observe RED before production edits.

## Required migration surface

- `src/app-core/context-contracts.ts`
- `src/app-core/computed.ts`
- `src/app-core/watch.ts`
- `src/app-core/lifecycle.ts`
- `src/app-core/methods/pwa.ts`
- `src/app-core/methods/ui/common/api-client.ts`
- `src/app-core/methods/ui/common/base.ts`
- `src/app-core/methods/ui/common/onboarding.ts`
- `src/app-core/methods/ui.ts`
- `src/app-core/methods/index.ts` if composition typing requires it
- `src/app-core/context-app.ts`
- `src/app-core/context.ts`
- focused context files needed to own shell, runtime, watcher, lifecycle, PWA, API-client, onboarding, and base-UI capabilities
- `tests/context-contracts.test.ts`
- `docs/refactorplan.md`
- `docs/c4/model/components/web.dsl`

## Required design

- Replace computed root typing with intersections of focused computed object contracts. Inline shell/workspace/Whatnot computed properties receive named focused contexts; do not introduce an app-wide computed `this` context.
- Split watcher typing by concern: scope/workspace, language/runtime, commerce/sales, portfolio, auth, and game. Each callback receives the smallest coherent context.
- Lifecycle helpers may compose focused public capabilities explicitly, but may not depend on `AppContext` or a renamed equivalent. Split helpers further if a single lifecycle context becomes the whole application.
- Type PWA, base UI, common API client, and onboarding method objects with `FeatureMethodImplementation` and exact method subsets.
- Root method/computed composition validates completeness against `AppMethodState`/`AppComputedState` without granting aggregate context to leaf objects.

## Final architecture test cycle

1. Replace temporary allow-list tests with final recursive assertions:

```ts
const allowedAppContextFiles = new Set([
  "src/app-core/context-app.ts",
  "src/app-core/context.ts"
]);
```

Assert all other `src/**/*.ts` token streams contain no `AppContext`, and every source token stream contains no `AppMethodImplementation` or `AppComputedObject`. Assert no source text contains `as AppContext` outside comments/literals.

2. Run `npm run test -- tests/context-contracts.test.ts` and record RED with the remaining runtime/composition consumers.
3. Migrate until the final source guard is GREEN. Do not add exceptions.

## Documentation completion

- Remove the active “Finish The Feature-Scoped Frontend Context Migration” item from `docs/refactorplan.md`.
- Update the C4 App Shell context property to state the exact declaration/re-export boundary and that all leaf modules consume focused contracts.
- Do not add product-roadmap content to technical/C4 docs.

## Verification

Run:

```text
npm run test -- tests/context-contracts.test.ts tests/computed.test.ts tests/pwa-methods.test.ts tests/onboarding-methods.test.ts tests/ui-shared.test.ts tests/ui-sync.test.ts tests/workspace-scope.test.ts tests/watch-sales-freshness.test.ts tests/state.test.ts
npm run typecheck
npm run typecheck:tests:web
npm run verify:all
git diff --check
npm run docs:c4:validate
```

All code/test/build/security gates must pass. If the Docker-dependent C4 validation cannot run because the local Docker daemon is unavailable, record the exact environment limitation after confirming the DSL diff directly.

Also run:

```text
rg -n "AppContext|AppMethodImplementation|AppComputedObject|as AppContext" src --glob "*.ts"
```

Expected: `AppContext` appears only in `context-app.ts` and its `context.ts` re-export; the other patterns have zero source occurrences.

Self-review for runtime changes, hidden renamed aggregates, loose casts/types, import cycles, missing aggregate signatures, weakened tests, and stale docs.

Commit with message `refactor(web): complete AppContext migration`.

## Report

Write `.superpowers/sdd/task-6-report.md` with files changed, final RED evidence, focused/full verification evidence, source-scan output, C4 validation result, commit hash, and concerns. Return only status, commit hash, one-line verification summary, and concerns.
