# Calcul8 Refactor Plan

## Current Priorities

- [ ] Split [whatnot-services.ts](/f:/Sources/Calcul8/apps/api/src/functions/whatnot-services.ts)
  - Separate OAuth/connect, status/disconnect, sync, import staging, and review-confirm flows
  - Keep provider mechanics in [whatnot.ts](/f:/Sources/Calcul8/apps/api/src/lib/whatnot.ts)
  - Add deeper tests for [whatnotRepository.ts](/f:/Sources/Calcul8/apps/api/src/lib/cosmos/whatnotRepository.ts)

- [ ] Decide workspace creation behavior and align code/docs
  - Current implementation seeds new workspaces from personal data in [workspaces.ts](/f:/Sources/Calcul8/src/app-core/methods/ui/workspaces.ts)
  - [teams-upgrade.md](/f:/Sources/Calcul8/docs/teams-upgrade.md) still describes empty workspace creation
  - Pick one behavior and update implementation, tests, and copy to match

- [ ] Split [syncSnapshotRepository.ts](/f:/Sources/Calcul8/apps/api/src/lib/cosmos/syncSnapshotRepository.ts)
  - Separate snapshot reads/rebuilds
  - Separate preset/meta persistence
  - Separate entity import/replace logic
  - Separate incremental sync apply and wheel config persistence

- [ ] Reduce frontend workspace orchestration coupling
  - Trim cross-feature responsibilities in [context.ts](/f:/Sources/Calcul8/src/app-core/context.ts)
  - Narrow the surfaces in [workspaces.ts](/f:/Sources/Calcul8/src/app-core/methods/ui/workspaces.ts) and [workspace-realtime.ts](/f:/Sources/Calcul8/src/app-core/methods/ui/workspace-realtime.ts)

- [ ] Finish entitlement scope decisions for workspaces
  - Workspace sync/collaboration is live, but entitlement resolution is still mostly user-scoped
  - Clarify whether team billing/access should be enforced at workspace scope

## Notes

- Older docs in [teams-upgrade.md](/f:/Sources/Calcul8/docs/teams-upgrade.md) and [entitlement-scope-refactor-prep.md](/f:/Sources/Calcul8/docs/entitlement-scope-refactor-prep.md) are partly stale and should be treated as historical unless updated.
- The previous chart/singles cleanup items are lower priority than the backend/workspace hotspots above.
