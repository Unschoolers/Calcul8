# Task 1: Establish The Final Architecture Guard And Focused Implementation Utility

This is the foundation for a repo-wide frontend AppContext migration. Work directly in `F:\Sources\Calcul8` on `main`; the user explicitly approved domain commits on main. Do not touch other domains yet.

## Global constraints

- Preserve runtime behavior, storage semantics, API contracts, synchronization policy, and current Vue composition.
- Do not replace aggregate dependencies with anonymous aliases, `any`, `unknown`, or aggregate casts.
- Use TDD: change `tests/context-contracts.test.ts` first and run it to observe the expected failure before production edits.
- Keep the worktree free of unrelated changes.

## Required changes

Modify `tests/context-contracts.test.ts`, `src/app-core/context/runtime.ts`, and `src/app-core/context.ts`.

1. Add reusable recursive TypeScript source scanning to the architecture test.
2. Add a temporary explicit allow-list containing every current `src/**/*.ts` consumer of `AppContext`, `AppMethodImplementation`, `AppComputedObject`, and `as AppContext`. The test must reject any new aggregate consumer. Later domain tasks will shrink this list until only `context-app.ts` and `context.ts` remain for AppContext, and zero helper/cast consumers remain.
3. First run the test without the temporary allow-list and record the correct RED failure; then add the current allow-list to make it green.
4. Add and export this focused method implementation utility from `context/runtime.ts` and the context barrel:

```ts
export type FeatureMethodImplementation<Context, Methods> =
  ThisType<Context> & Methods;
```

5. Run:

```text
npm run test -- tests/context-contracts.test.ts
npm run typecheck
npm run typecheck:tests:web
git diff --check
```

6. Self-review for behavior changes and aggregate-cast loopholes.
7. Commit only your task changes with message `test(web): guard AppContext migration`.

## Report

Write `.superpowers/sdd/task-1-report.md` with files changed, RED evidence, GREEN/typecheck evidence, commit hash, and concerns. Return only status (`DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, or `BLOCKED`), commit hash, one-line test summary, and concerns.
