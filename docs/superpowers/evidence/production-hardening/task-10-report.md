# Task 10: Reject oversized Whatnot CSV imports

## Change

`createWhatnotImportBatchFromRowsForActor` now rejects uploads above `MAX_SYNC_ROWS` (250) with HTTP 400 before resolving scope, reading snapshots or mappings, or clearing/replacing pending batches. The service now processes the original row array after the size check, so a 250-row upload stages all 250 rows. The UI regression confirms a failed API upload leaves the current review batch and CSV draft visible.

## Code commit

`dd3b10398caa6268a1ea5c14d71879e3caea569e` (`fix: reject oversized Whatnot CSV imports`)

## Verification evidence

- Red phase: before the service change, the 251-row and 1000-row tests failed with “Missing expected rejection”; the 250-row test passed.
- Focused API regressions: `VITEST_MAX_WORKERS=1 npm test -- --run src/features/whatnot/importService.test.ts --testNamePattern='rejects 251|rejects 1000|processes all 250'` — 3 passed.
- API build: `npm run build` in `apps/api` — passed; 48 shared contract artifacts checked.
- API test types: `npm run typecheck:tests` in `apps/api` — passed.
- Frontend regression suite: `npm test -- --run tests/whatnot-ui-methods.test.ts` — 7 passed.
- Frontend test types: `npm run typecheck:tests:web` — passed.
- `git diff --check` — passed.

## Limitations

The full `apps/api/src/features/whatnot/importService.test.ts` file has three failures in existing duplicate-candidate grouping expectations: `attaches a manual duplicate candidate`, `groups same customer and listing title rows against one manual sale`, and `suggests grouped manual sale when buyer date lot and total match despite title drift`. Those same failures were present in the initial red run before the service implementation changed; the Task 10 regressions pass. No broader API suite was run.

## Independent Sol6.1 addendum

Root reproduced the three grouping failures on untouched baseline under runtime default Asia/Bangkok; reran full modified file with TZ=UTC (CI-equivalent) and all23 tests passed. Frontend7/7 passed independently. No date behavior was changed.
