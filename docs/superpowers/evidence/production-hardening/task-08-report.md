# Task 8: clean 409 recovery

## Behavior

A clean push conflict now performs its recovery pull directly through the active sync session. It checks the payload signature captured before the push both before dispatching the recovery GET and immediately before applying the returned snapshot. If local data changed in either window, recovery returns a conflict and leaves local data intact.

The coordinator publishes the recovery promise and outcome to ordinary pulls queued behind the push. Those readers share the recovery result, including an early pre-GET conflict, so they do not launch a later unguarded pull. A queued `forceApply` pull continues through the normal queue and can still explicitly overwrite local data.

## Evidence

- Added deferred HTTP regressions using `runCloudSyncPush` and `runCloudSyncPull` with the real coordinator and conflict policy.
- Verified an edit during the push response skips recovery GET and settles two queued pulls as conflicts.
- Verified an edit during the recovery GET prevents apply and settles both queued pulls as conflicts with one GET total.
- Verified queued `forceApply` still performs its explicit overwrite after guarded recovery detects an edit.
- `npx vitest run --config vitest.config.mjs tests/sync-service.test.ts tests/ui-sync.test.ts` passed (50 tests).
- `npx tsc --noEmit` passed.
- `git diff --check` passed.
- `npm test -- --reporter=dot` ran 1,716 tests; 1,715 passed and one unrelated existing CSV quantity assertion failed in `tests/config-lots-methods.test.ts` (expected quantity 4, received 8).
- `npm run typecheck:tests:web` passed.

## Task 14 integration point

The real full-pull pre-apply stage is in `performCloudSyncPull` in `src/app-core/methods/ui/sync/sync-pull.ts`. Task 14 can add an optional pre-apply guard to `SyncPullOptions`, thread it through `runCloudSyncPull` and the UI method, then check it after the response is read and immediately before `applyCloudSnapshotToLocal`. This keeps the WebSocket catch-up decision inside the real pull path and avoids the current post-apply `app.pullCloudSync()` race. The coordinator currently coalesces ordinary queued pulls without retaining per-caller options, so Task 14 must ensure a guarded catch-up request cannot join a generic active or pending pull and lose its guard; it can bypass generic coalescing or give guarded pulls a separate queue key.
