# Task 5 Report: Canonical Shared Game And Sync Contracts

## Result

- Kept `shared/game-public-session-contracts.d.ts` as the only game public-session declaration body.
- Replaced the byte-identical root `.d.mts` and `.d.cts` copies with one-line re-exports.
- Replaced the API-local game public-session and sync declaration copies with one-line re-exports of the canonical root declarations.
- Preserved the existing runtime `.mjs` and `.cjs` implementations, frontend bundler resolution, API NodeNext resolution, API `rootDir`, and all exported public shapes.
- Added architecture checks that prevent declaration bodies from being copied back into module-mode shims or the API package.
- Added compile-time exact-type parity checks across canonical extensionless, `.mjs`, `.cjs`, API extensionless, and API CommonJS consumers.
- Added an isolated NodeNext fixture with ESM and CommonJS consumers so Bundler resolution cannot hide invalid declaration specifiers.

## TDD Evidence

RED:

```text
npm run test -- tests/shared-game-public-session-contracts.test.ts tests/shared-sync-contracts.test.ts
```

Exited 1. The new architecture tests reported the 128-line game `.d.mts` declaration body and the 271-line API sync declaration body instead of the required one-line re-exports.

GREEN:

```text
npm run test -- tests/shared-game-public-session-contracts.test.ts tests/shared-sync-contracts.test.ts
```

Exited 0: 2 files and 13 tests passed.

## Production TypeScript LOC

Compared with Task 5 base `789f6d3`:

- Added: 5 lines
- Deleted: 726 lines
- Net: **721 production TypeScript lines deleted**

Cumulative shared-game-engine delta compared with `adc6473`:

- Added: 934 lines
- Deleted: 1,972 lines
- Net: **1,038 production TypeScript lines deleted**

The counts include production `.ts`, `.mts`, and `.cts` declarations and exclude tests and `.superpowers` artifacts.

## Verification

- Focused shared contract suites: 2 files / 13 tests passed.
- Frontend production typecheck: `npm run typecheck` passed.
- Frontend test typecheck: `npm run typecheck:tests:web` passed.
- API NodeNext production typecheck: `npm --prefix apps/api run typecheck` passed.
- API test typecheck: `npm --prefix apps/api run typecheck:tests` passed.
- API public-session and repository suites: 2 files / 19 tests passed.
- API build: `npm --prefix apps/api run build` passed with the existing `rootDir` unchanged.
- `git diff --check` passed (line-ending conversion warnings only).

No generated declaration copies, checked-in build outputs, runtime package, or secondary contract source was introduced. `.superpowers/sdd/progress.md` was not modified.

## Review Correction: NodeNext Module Specifiers

Review found that the original one-line `.d.mts` re-exports used extensionless specifiers. Frontend Bundler resolution accepted those specifiers, but a true NodeNext ESM consumer rejected them with `TS2835` and could not see the exported contract types.

Correction RED:

```text
node node_modules/typescript/bin/tsc --project tests/fixtures/shared-contracts-nodenext/tsconfig.json
```

Exited 1 with `TS2835` for both `game-public-session-contracts.d.mts` and `sync-contracts.d.mts`, followed by missing-export errors in the ESM fixture consumer.

Correction implementation:

- Changed only the two `.d.mts` re-exports to explicit `.js` specifiers.
- TypeScript's NodeNext extension substitution resolves those specifiers to the canonical `.d.ts` declarations without creating a circular `.mjs` declaration reference.
- Kept the CommonJS `.d.cts` shims extensionless because NodeNext permits extensionless CommonJS resolution.

Correction GREEN:

- Isolated NodeNext ESM/CommonJS fixture compile passed with `skipLibCheck: false`.
- Focused shared contract suites passed: 2 files / 14 tests.
- The production LOC delta remains **721 lines deleted** for Task 5 and **1,038 lines deleted** cumulatively versus `adc6473`.
