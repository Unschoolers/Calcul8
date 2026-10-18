# Task 4: Preserve the dirty sync baseline on no-op pulls

## Root cause

`performCloudSyncPull` called `setLastSyncedPayloadHash` in both the empty-response branch and the branch where `shouldApplyCloudSnapshot` rejects the remote snapshot. Those branches had only completed a read; they had not sent the current local payload or applied and persisted the cloud snapshot. Replacing the baseline with the current payload signature made the next non-forced push treat unsent local changes as already synchronized.

## Change

Removed the two baseline updates from no-op pull branches. A successful pull still updates sync status and returns a confirmed read outcome, but the last-synced payload hash now advances only after an applied snapshot or a confirmed push. This also avoids localStorage writes for clean unchanged no-op pulls.

Added coordinator-level regressions for an empty pull response and a same-version snapshot. Each verifies that the pre-existing baseline survives the pull, a subsequent ordinary push reaches the network, and the confirmed push advances the baseline. A clean same-version pull test verifies that no signature write occurs.

## Verification

- Red: `npx vitest run --config vitest.config.mjs tests/sync-service.test.ts --pool=forks --maxWorkers=1 --minWorkers=1` failed on the expected baseline overwrite in both dirty cases and the extra storage write in the clean case.
- Green: `npx vitest run --config vitest.config.mjs tests/sync-service.test.ts tests/sync-status.test.ts --pool=forks --maxWorkers=1 --minWorkers=1` passed (36 tests).
- `npm run typecheck` passed.
- `npm run typecheck:tests:web` passed.
