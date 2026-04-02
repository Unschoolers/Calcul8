# Calcul8 Refactor Plan

## Current Priorities

- [ ] Reduce remaining Whatnot service coupling
  - Keep [whatnot-services.ts](/f:/Sources/Calcul8/apps/api/src/functions/whatnot-services.ts) as the thin export facade it is now
  - Continue trimming cross-cutting helpers out of [whatnot-service-core.ts](/f:/Sources/Calcul8/apps/api/src/functions/whatnot-service-core.ts)
  - Split grouping/manual-duplicate/import-confirm logic inside [whatnot-import-service.ts](/f:/Sources/Calcul8/apps/api/src/functions/whatnot-import-service.ts)
  - Keep provider mechanics in [whatnot.ts](/f:/Sources/Calcul8/apps/api/src/lib/whatnot.ts)
  - Add deeper tests for [whatnotRepository.ts](/f:/Sources/Calcul8/apps/api/src/lib/cosmos/whatnotRepository.ts)

- [ ] Split [syncSnapshotRepository.ts](/f:/Sources/Calcul8/apps/api/src/lib/cosmos/syncSnapshotRepository.ts)
  - Separate snapshot reads/rebuilds
  - Separate preset/meta persistence
  - Separate entity import/replace logic
  - Separate incremental sync apply and wheel config persistence

- [ ] Reduce frontend workspace orchestration coupling
  - Trim cross-feature responsibilities in [context.ts](/f:/Sources/Calcul8/src/app-core/context.ts)
  - Narrow the surfaces in [workspaces.ts](/f:/Sources/Calcul8/src/app-core/methods/ui/workspaces.ts) and [workspace-realtime.ts](/f:/Sources/Calcul8/src/app-core/methods/ui/workspace-realtime.ts)

- [ ] Define the future workspace billing and access model
  - Keep current behavior for now: workspace creation, membership, sync, and collaboration stay open to all signed-in users until dedicated workspace licensing ships
  - Treat `hasProAccess` as personal-only
  - Do not overload [entitlements-status-service.ts](/f:/Sources/Calcul8/src/app-core/methods/ui/entitlements-status-service.ts) or [entitlementsMe.ts](/f:/Sources/Calcul8/apps/api/src/functions/entitlementsMe.ts) to mean "workspace is paid"
  - Introduce a separate workspace billing domain instead of stretching personal Pro into team licensing
  - Candidate commercial model: workspace subscription with per-member pricing such as `$5 / user / month`
  - Keep the architecture flexible enough for a future access model shaped like:
    - `personalHasProAccess`
    - `workspacePlan`
    - `workspaceSeatStatus`
    - `effectiveFeatureAccess`
  - When we decide to lock workspaces down:
    - Add workspace billing state and workspace-level entitlement APIs
    - Compute effective access by scope instead of reading raw `hasProAccess` everywhere
    - Move workspace feature gates to workspace plan/seat status
    - Keep personal Pro checks only for personal scope or explicitly personal-only tools
    - Expose billing source in UI copy, for example personal Pro vs workspace-paid access
  - Prefer a grace-first rollout with enforcement behind a flag until billing, seat handling, and fallback messaging are solid

- [ ] Centralize workspace realtime room + token conventions
  - Keep frontend subscribe behavior in [workspace-realtime.ts](/f:/Sources/Calcul8/src/app-core/methods/ui/workspace-realtime.ts) aligned with backend room/token helpers in [realtime.ts](/f:/Sources/Calcul8/apps/api/src/lib/realtime.ts)
  - Avoid duplicating room name shapes or prod fallback URLs across multiple call sites
  - Keep realtime publish best-effort so authoritative HTTP writes do not block on websocket fan-out

## Notes

- This file is the active backlog only. Completed work should be removed instead of tracked here.
- Chart and singles cleanup remain lower priority than the backend and workspace items above.
