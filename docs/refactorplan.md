# Calcul8 Refactor TODO

## 1. Game Public Session And Realtime Naming

= Priority

High

= Steps

- Finish replacing wheel-named spectator helpers, events, and contracts in `src/app-core/methods/ui/spectator`, `src/components/windows/game`, `src/spectator-main.ts`, `shared`, `apps/api`, and `apps/realtime`.
- Keep `/wheel/public-session` and `wheel-public:*` as compatibility adapters only until public URLs and realtime rooms have a deliberate migration path.
- Move `wheelSpectator*`, `wheelController` aliasing, `wheelCtx`, `activeWheelSlots`, and `wheelPreviewSlots` bridges behind named legacy adapter files, then delete them after tests prove no live callers remain.
- Add contract and realtime tests for wheel, mystery grid, bracket, stale snapshots, reconnect refresh, room counts, and compatibility events.

= Acceptance

Game and spectator internals use game-named APIs; legacy wheel route and room names are isolated at adapter boundaries; all game types publish and receive realtime updates through one tested public-session contract.

## 2. Workspace Sync, Access, And Conflict Semantics

= Priority

High

= Steps

- Continue auditing `apps/api/src/features/workspaces`, `apps/api/src/lib/cosmos/workspaceRepository.ts`, frontend workspace methods, and sync services for partial writes, broad upserts, stale access, and workspace/personal bleed risks.
- Finish deterministic workspace semantics for remaining cross-partition workspace writes with optimistic concurrency or compensating cleanup where Cosmos cannot make the write atomic across partitions.
- Align workspace-scoped sync, presence, remaining billing/access checks, and lost-access recovery across API handlers, frontend workspace state, and realtime subscriptions.
- Add tests for realtime reconnect, lost access, and local storage reset recovery.

= Acceptance

Workspace operations cannot leave a shared workspace without a valid owner membership; conflict/auth/lost-access paths return explicit errors; the frontend recovers to Personal scope without data bleed or silent destructive overwrite.

## 3. Whatnot, Sales, And Window Boundaries

= Priority

Medium

= Steps

- Continue splitting the remaining `src/app-core/methods/ui/whatnot/whatnot.ts` facade by connect, sync, CSV import, review, confirm, and discard workflows as each flow is changed, preserving local-first behavior and scope guards.
- Continue moving Whatnot parsing, normalization, duplicate detection, and conflict decisions into typed service helpers shared by `src/app-core/shared/whatnot-csv.ts` and `apps/api/src/features/whatnot`, including a shared boundary audit for CSV/API duplicate logic.
- Keep `src/components/windows/whatnot/WhatnotReviewDialog.ts` presentation-focused and extract repeated sales/window orchestration from large surfaces such as `LiveSinglesPanel`, `PortfolioWindow`, and `SinglesConfigWindow` only along real domain boundaries.
- Add regression tests around auth expiry, offline recovery, workspace ownership, duplicate/update decisions, sale refresh, and workspace/personal scope isolation.

= Acceptance

Whatnot and sales workflows are testable without mounting large windows or Azure runtime state; UI files coordinate user interactions while domain services own normalization, conflict handling, persistence, and recovery behavior.

## 4. Verification, Release, And Artifact Hygiene

= Priority

Low

= Steps

- Decide whether `npm run verify` should include API and realtime checks, or document the split command set clearly beside the existing frontend/API/realtime scripts.
- Keep release docs aligned with the current CI, API, realtime, Google Play, and generated-asset scripts.
- Keep generated output, local build artifacts, coverage output, API/realtime `dist`, and one-time migration products out of source-control review surfaces.
- Gradually group flat tests by feature area when touched so failures point to the product boundary they cover.

= Acceptance

Developers can tell which command set mirrors CI for the area they touched; release docs match the live scripts; generated artifacts do not pollute code review or refactor diffs.
