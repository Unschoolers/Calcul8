# Task 1 Report: AppContext Migration Guard

## Status

DONE

## Files changed

- `tests/context-contracts.test.ts`
  - Added recursive `src/**/*.ts` source discovery.
  - Added reusable aggregate-consumer matching and explicit temporary allow-lists for `AppContext`, `AppMethodImplementation`, `AppComputedObject`, and `as AppContext`.
  - Added an architecture test that rejects aggregate consumers in any new source file.
- `src/app-core/context/runtime.ts`
  - Added `FeatureMethodImplementation<Context, Methods> = ThisType<Context> & Methods`.
- `src/app-core/context.ts`
  - Re-exported `FeatureMethodImplementation` from the context barrel.

## RED evidence

Before adding the temporary migration allow-lists, ran:

```text
npm run test -- tests/context-contracts.test.ts
```

Result: expected failure (`1 failed | 6 passed`). The new architecture test reported 37 existing `AppContext` consumer files outside the final `context-app.ts` / `context.ts` boundary, beginning with `src/app-core/auth/session.ts` and ending with `src/components/windows/game/coordinator/gameControllerState.ts`.

## GREEN and typecheck evidence

```text
npm run test -- tests/context-contracts.test.ts
PASS: 1 test file, 7 tests

npm run typecheck
PASS: tsc --noEmit

npm run typecheck:tests:web
PASS: tsc -p tsconfig.tests.web.json --noEmit

git diff --check
PASS: exit 0 (line-ending conversion warnings only)
```

## Commit

`a889c16533181570bf4c6b10566ac7c9d82d95ec` — `test(web): guard AppContext migration`

## Concerns

None. The allow-lists are deliberately temporary migration ledgers and must shrink as subsequent domain tasks remove aggregate consumers.

## Post-review fix: TypeScript-aware source scanning

### Review finding and root cause

The first implementation removed comments with regular expressions. A `//` or `/* ... */` sequence inside a valid string, template, or regular-expression literal could therefore be mistaken for a real comment and hide a later `AppContext` reference from the architecture guard.

### Fix RED evidence

Added a regression test with aggregate references after comment-like text in string, template, and regular-expression literals, then ran:

```text
npm run test -- tests/context-contracts.test.ts
```

Result: expected failure (`1 failed | 7 passed`). The scanner returned no consumers instead of all three synthetic source files.

### Fix implementation

Replaced regex comment stripping with TypeScript parsing and token collection. Actual comment trivia is excluded from the parsed token stream, while comment markers inside literals remain part of their literal tokens and cannot hide later aggregate identifiers.

### Fix GREEN evidence

```text
npm run test -- tests/context-contracts.test.ts
PASS: 1 test file, 8 tests

npm run typecheck:tests:web
PASS: tsc -p tsconfig.tests.web.json --noEmit

git diff --check
PASS: exit 0 (line-ending conversion warning only)
```

### Fix commit

`6adb2789e224bdee2b92475e9d301b4560b7e40c` — `test(web): harden context source scanner`

### Fix concerns

None.
