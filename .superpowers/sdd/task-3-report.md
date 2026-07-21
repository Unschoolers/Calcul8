# Task 3 Report: Workspace And Sync AppContext Migration

## Status

Complete. The workspace and sync domains use focused context contracts, all temporary allow-list entries for these domains are permanently removed, and the migration is committed on `main`.

## Commit

`49f4baa` — `refactor(web): scope workspace and sync contexts`

## Files changed

- Composition and contract ownership:
  - `src/app-core/context-app.ts`
  - `src/app-core/context.ts`
  - `src/app-core/context/entitlements.ts`
  - `src/app-core/context/sync.ts` (new)
  - `src/app-core/context/workspace.ts`
- Sync consumers:
  - `src/app-core/methods/ui/sync/lot-entity-polling.ts`
  - `src/app-core/methods/ui/sync/sync-apply.ts`
  - `src/app-core/methods/ui/sync/sync-conflict-policy.ts`
  - `src/app-core/methods/ui/sync/sync-payload.ts`
  - `src/app-core/methods/ui/sync/sync-service.ts`
  - `src/app-core/methods/ui/sync/sync-session.ts`
  - `src/app-core/methods/ui/sync/sync-status.ts`
  - `src/app-core/methods/ui/sync/sync-storage-reset-recovery.ts`
  - `src/app-core/methods/ui/sync/sync.ts`
- Workspace consumers:
  - `src/app-core/methods/ui/workspace/workspace-api.ts`
  - `src/app-core/methods/ui/workspace/workspace-invite-methods.ts`
  - `src/app-core/methods/ui/workspace/workspace-members.ts`
  - `src/app-core/methods/ui/workspace/workspace-membership-methods.ts`
  - `src/app-core/methods/ui/workspace/workspace-realtime-events.ts`
  - `src/app-core/methods/ui/workspace/workspace-realtime-methods.ts`
  - `src/app-core/methods/ui/workspace/workspace-realtime-recovery.ts`
  - `src/app-core/methods/ui/workspace/workspace-realtime-socket.ts`
  - `src/app-core/methods/ui/workspace/workspace-realtime-state.ts`
  - `src/app-core/methods/ui/workspace/workspace-scope-methods.ts`
  - `src/app-core/methods/ui/workspace/workspace-ui-helpers.ts`
  - `src/app-core/methods/ui/workspace/workspaces.ts`
- Architecture guard:
  - `tests/context-contracts.test.ts`

## RED evidence

After removing all workspace/sync temporary allow-list entries and adding recursive directory assertions, this command failed as required:

`npm run test -- tests/context-contracts.test.ts`

The guard reported these nine `AppContext` consumers:

- `src/app-core/methods/ui/sync/lot-entity-polling.ts`
- `src/app-core/methods/ui/sync/sync-apply.ts`
- `src/app-core/methods/ui/sync/sync-payload.ts`
- `src/app-core/methods/ui/sync/sync-service.ts`
- `src/app-core/methods/ui/sync/sync-status.ts`
- `src/app-core/methods/ui/workspace/workspace-api.ts`
- `src/app-core/methods/ui/workspace/workspace-members.ts`
- `src/app-core/methods/ui/workspace/workspace-realtime-state.ts`
- `src/app-core/methods/ui/workspace/workspace-ui-helpers.ts`

The separate aggregate inventory also identified six `AppMethodImplementation` consumers:

- `src/app-core/methods/ui/sync/sync.ts`
- `src/app-core/methods/ui/workspace/workspace-invite-methods.ts`
- `src/app-core/methods/ui/workspace/workspace-membership-methods.ts`
- `src/app-core/methods/ui/workspace/workspace-realtime-methods.ts`
- `src/app-core/methods/ui/workspace/workspace-scope-methods.ts`
- `src/app-core/methods/ui/workspace/workspaces.ts`

`workspace-members.ts` also contained the two authenticated API `as AppContext` casts removed by this migration.

## Verification evidence

- Required focused suite: 12 files passed, 125 tests passed.
- `npm run typecheck`: passed.
- `npm run typecheck:tests:web`: passed.
- `npm run verify:all`: passed.
  - Web: 157 files, 1,310 tests passed; build and security scan passed.
  - Vue: 6 files, 77 tests passed.
  - API: 70 files, 498 tests passed; build and typechecks passed.
  - Realtime: 11 tests passed; build passed.
- `git diff --check`: passed.
- Final recursive source scan found no `AppContext`, `AppMethodImplementation`, `AppComputedObject`, `as AppContext`, or TypeScript `any` usage in either migrated directory.
- Final guard scan found no workspace/sync file in an aggregate allow-list.

## Self-review

- Personal/workspace scope remains centralized through the existing scope helpers.
- Runtime branches, retry rules, timers, storage operations, network options, debounce, and in-flight coordination were not changed.
- Authenticated workspace/realtime API calls now pass structurally compatible named contexts without scope-bypassing casts.
- Sync computed fields and methods have single ownership in `context/sync.ts`; buyer-profile methods remain in `WorkspaceMethodState` for Task 5.
- The workspace/sync cross-reference is type-only and is erased at runtime, so it introduces no runtime import cycle.
- Aggregate computed and method membership is preserved by extending both workspace and sync contracts.

## Concerns

None. Existing expected test warnings/logging (including the Node `--localstorage-file` warning) remained non-blocking and unchanged.

## Post-commit review fix

Commit: `5fc8e50` — `refactor(web): narrow sync workflow contexts`

The review identified over-broad sync workflow capabilities. Usage verification showed that payload creation does not read `sales` or `loadSalesForLotId`, snapshot apply does not call any persistence save method, and the sync service itself is the owner that reads `loadSalesForLotId` while evaluating local cloud-pull state.

Changes:

- Removed `sales` and `loadSalesForLotId` from `SyncPayloadContext`.
- Removed `saveLotsToStorage`, `saveWheelConfigsToStorage`, and `saveSystemPricingDefaultsToStorage` from `SyncSnapshotApplyContext`.
- Removed the repeated pricing-save capability from `SyncServiceContext` and added `loadSalesForLotId` directly to that service context.
- Removed the resulting unused `GameMethodState` dependency.
- Stopped passing ignored sales capabilities to `createSyncPayload` in sync service, workspace seeding, and realtime recovery.
- Removed stale test fixture inputs and artificial save-method assertions that did not match the real snapshot-apply workflow.
- Added an architecture assertion that keeps payload, snapshot-apply, and service ownership narrow.

RED evidence:

- `npm run test -- tests/context-contracts.test.ts` failed 1 of 11 tests because `SyncPayloadContext` still exposed `sales` and `loadSalesForLotId`.

Verification evidence:

- Required focused suites plus directly affected fixture suites: 6 files passed, 74 tests passed.
- The exact required four-suite subset accounted for 57 passing tests before the stale fixture type errors were corrected.
- `npm run typecheck`: passed.
- `npm run typecheck:tests:web`: passed after removing the stale fixture capabilities and artificial save assertions.
- `git diff --check`: passed.
- `npm run verify:all` was not rerun because this follow-up only removed unused type capabilities and ignored object-literal properties; it did not alter composition membership or runtime behavior.

Post-review concerns: none.
