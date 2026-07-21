# Task 3: Migrate Workspace And Sync

This domain follows the reviewed identity/entitlement migration. Read the current `src/app-core/context` contracts and Task 1 guard before editing. Work directly on `main`, use TDD, and commit the complete workspace/sync domain only when its allow-list entries are permanently removed.

## Global constraints

- Preserve workspace creation, invitation, membership, switching, realtime recovery, presence, cloud pull/push, conflict recovery, local-reset recovery, debounce, and in-flight behavior exactly.
- Keep personal/workspace scoping explicit and centralized; no casts may bypass scope-aware contracts.
- Do not use `AppContext`, `AppMethodImplementation`, `AppComputedObject`, `as AppContext`, `any`, or broad substitute aliases.
- Do not modify commerce, Whatnot, game, buyer-profile, watcher, or lifecycle domains.
- Follow TDD: remove this domain from the temporary architecture allow-lists first, run the guard RED, then migrate to GREEN.

## Required ownership changes

Create `src/app-core/context/sync.ts` and export it through `context.ts`.

Move these methods out of `WorkspaceMethodState` into `SyncMethodState` without changing signatures:

```ts
pullCloudSync(forceApply?: boolean): Promise<void>;
pushCloudSync(force?: boolean, options?: { allowEmptyOverwrite?: boolean }): Promise<void>;
startCloudSyncScheduler(): void;
stopCloudSyncScheduler(): void;
```

Move sync-owned computed fields from `WorkspaceComputedState` into `SyncComputedState`:

```ts
accountSyncBadgeVisible: boolean;
accountSyncBadgeClass: string;
accountSyncIcon: string;
accountSyncIconSize: number;
accountSyncIconClass: string;
syncStatusTitle: string;
syncStatusSubtitle: string;
syncStatusIcon: string;
```

Update `AppComputedState` and `AppMethodState` to extend both workspace and sync interfaces, preserving the aggregate member set exactly.

Keep buyer-profile methods temporarily in `WorkspaceMethodState`; Task 5 will move them into a buyer-owned contract. Do not expand this task into buyer behavior.

## Required migration

- Extend `src/app-core/context/workspace.ts` with named workspace API, scope, membership, invite, realtime, and UI-helper contexts plus exact focused implementation types.
- Create named sync payload, snapshot-apply, status, service, session, polling, and method implementation contexts in `context/sync.ts`. Reuse shared DTO/domain types rather than indexing `AppContext` for field types.
- Migrate every aggregate consumer under `src/app-core/methods/ui/workspace` and `src/app-core/methods/ui/sync`.
- Replace authenticated API casts with structurally compatible `ScopedApiContext` or a named extension containing the exact required capabilities.
- Do not change runtime branching, retries, timers, storage reads/writes, or network options to satisfy types.

## Architecture test cycle

1. Remove workspace and sync files from all aggregate allow-lists in `tests/context-contracts.test.ts` and add recursive directory assertions.
2. Run `npm run test -- tests/context-contracts.test.ts` and record the correct RED consumer list.
3. Migrate until the guard is GREEN. Never re-add a migrated file to an allow-list.

## Verification

Run:

```text
npm run test -- tests/context-contracts.test.ts tests/ui-workspaces.test.ts tests/workspace-members.test.ts tests/workspace-realtime.test.ts tests/workspace-scope.test.ts tests/workspace-config-sync.test.ts tests/workspace-config-realtime-methods.test.ts tests/ui-sync.test.ts tests/sync-service.test.ts tests/sync-contracts.test.ts tests/sync-status.test.ts tests/lot-entity-polling.test.ts
npm run typecheck
npm run typecheck:tests:web
npm run verify:all
git diff --check
```

All must pass. Self-review for cross-scope leaks, changed runtime behavior, import cycles, leftover casts, duplicated ownership, and missing aggregate members.

Commit only this domain with message `refactor(web): scope workspace and sync contexts`.

## Report

Write `.superpowers/sdd/task-3-report.md` with files changed, RED evidence, focused/full verification evidence, commit hash, and concerns. Return only status, commit hash, one-line test summary, and concerns.
