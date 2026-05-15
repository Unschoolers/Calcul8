# Calcul8 Refactor TODO

## 1. Game Public Session And Realtime Naming

= Priority

High

= Steps

- [50%] Finish replacing wheel-named spectator helpers, events, and contracts in `src/app-core/methods/ui/spectator`, `src/components/windows/game`, `src/spectator-main.ts`, `shared`, `apps/api`, and `apps/realtime`.
- [45%] Keep `/wheel/public-session` and `wheel-public:*` as compatibility adapters only until public URLs and realtime rooms have a deliberate migration path.
- [35%] Move `wheelSpectator*`, `wheelController` aliasing, `wheelCtx`, `activeWheelSlots`, and `wheelPreviewSlots` bridges behind named legacy adapter files, then delete them after tests prove no live callers remain.
- [40%] Add contract and realtime tests for wheel, mystery grid, bracket, stale snapshots, reconnect refresh, room counts, and compatibility events.

= Acceptance

Game and spectator internals use game-named APIs; legacy wheel route and room names are isolated at adapter boundaries; all game types publish and receive realtime updates through one tested public-session contract.

## 2. Workspace Sync, Access, And Conflict Semantics

= Priority

High

= Steps

- [70%] Audit remaining workspace document and membership writes in `apps/api/src/features/workspaces` and `apps/api/src/lib/cosmos/workspaceRepository.ts` for optimistic concurrency gaps, especially ownership transfer, workspace deletion, membership deactivation, profile snapshot backfill, and join-link lifecycle callers.
- [60%] Harden remaining cross-partition workspace write chains with explicit conflict results and compensating cleanup where ownership, membership, and workspace documents can diverge.
- [65%] Review workspace-scoped presence and billing/access handlers for route or query paths that bypass shared scope validation, reuse stale local workspace state, or miss lost-access recovery.
- [40%] Add tests for join-link consume races, ownership rollback, lost-access refresh failure, sync conflict pull failure, presence edge cases, billing/access checks, and local storage reset recovery.

= Acceptance

Workspace operations cannot leave a shared workspace without a valid owner membership; conflict/auth/lost-access paths return explicit errors; the frontend recovers to Personal scope without data bleed or silent destructive overwrite.

## 3. Whatnot, Sales, And Window Boundaries

= Priority

Medium

= Steps

- [45%] Continue splitting the remaining `src/app-core/methods/ui/whatnot/whatnot.ts` facade by connect, sync, CSV import, review, confirm, and discard workflows as each flow is changed, preserving local-first behavior and scope guards.
- [50%] Continue moving Whatnot parsing, normalization, duplicate detection, and conflict decisions into typed service helpers shared by `src/app-core/shared/whatnot-csv.ts` and `apps/api/src/features/whatnot`, including a shared boundary audit for CSV/API duplicate logic.
- [50%] Keep `src/components/windows/whatnot/WhatnotReviewDialog.ts` presentation-focused and extract repeated sales/window orchestration from large surfaces such as `LiveSinglesPanel`, `PortfolioWindow`, and `SinglesConfigWindow` only along real domain boundaries.
- [45%] Add regression tests around auth expiry, offline recovery, workspace ownership, duplicate/update decisions, sale refresh, and workspace/personal scope isolation.

= Acceptance

Whatnot and sales workflows are testable without mounting large windows or Azure runtime state; UI files coordinate user interactions while domain services own normalization, conflict handling, persistence, and recovery behavior.

## 4. Verification, Release, And Artifact Hygiene

= Priority

Low

= Steps

- [45%] Decide whether `npm run verify` should include API and realtime checks, or document the split command set clearly beside the existing frontend/API/realtime scripts.
- [65%] Keep release docs aligned with the current CI, API, realtime, Google Play, and generated-asset scripts.
- [70%] Keep generated output, local build artifacts, coverage output, API/realtime `dist`, and one-time migration products out of source-control review surfaces.
- [35%] Gradually group flat tests by feature area when touched so failures point to the product boundary they cover.

= Acceptance

Developers can tell which command set mirrors CI for the area they touched; release docs match the live scripts; generated artifacts do not pollute code review or refactor diffs.
