# Calcul8 Refactor TODO

## 1. Auth Session And Entitlement Boundary

= Priority

Critical

= Steps

- Finish the session-first auth path across `src/app-core/auth`, `src/app-core/methods/ui/auth`, and `apps/api/src/lib/auth`: bearer tokens are bootstrap-only, CSRF is required for unsafe cookie-authenticated requests, and auth expiration has one recovery path.
- Collapse Pro access and entitlement caching around `src/app-core/methods/ui/entitlements/entitlement-cache.ts`, `apps/api/src/features/entitlements`, and `apps/api/src/features/billing` so billing state cannot drift from identity/profile state.
- Retire legacy browser-secret storage migrations only with explicit tests for sign-in, sign-out, refresh, local storage reset, offline retry, and expired session recovery.
- Keep Play and Stripe verification provider-neutral, idempotent, and normalized at both frontend and API boundaries.

= Acceptance

No auth/session secret is persisted to browser storage after bootstrap; unsafe cookie-authenticated writes fail without CSRF; Pro access fails closed and recovers cleanly after refresh, offline retry, and expired auth.

## 2. Game Public Session And Realtime Naming

= Priority

High

= Steps

- Finish replacing wheel-named spectator helpers, events, and contracts in `src/app-core/methods/ui/spectator`, `src/components/windows/game`, `src/spectator-main.ts`, `shared`, `apps/api`, and `apps/realtime`.
- Keep `/wheel/public-session` and `wheel-public:*` as compatibility adapters only until public URLs and realtime rooms have a deliberate migration path.
- Move `wheelSpectator*`, `wheelController` aliasing, `wheelCtx`, `activeWheelSlots`, and `wheelPreviewSlots` bridges behind named legacy adapter files, then delete them after tests prove no live callers remain.
- Add contract and realtime tests for wheel, mystery grid, bracket, stale snapshots, reconnect refresh, room counts, and compatibility events.

= Acceptance

Game and spectator internals use game-named APIs; legacy wheel route and room names are isolated at adapter boundaries; all game types publish and receive realtime updates through one tested public-session contract.

## 3. Workspace Sync, Access, And Conflict Semantics

= Priority

High

= Steps

- Audit `apps/api/src/features/workspaces`, `apps/api/src/lib/cosmos/workspaceRepository.ts`, frontend workspace methods, and sync services for partial writes, broad upserts, stale access, and workspace/personal bleed risks.
- Make workspace create, owner transfer, join, leave, and member update flows deterministic with optimistic concurrency or compensating cleanup where Cosmos cannot make the write atomic across partitions.
- Align workspace-scoped sync, presence, billing/access checks, and lost-access recovery across API handlers, frontend workspace state, and realtime subscriptions.
- Add tests for create conflicts, owner-membership failure, owner-only actions, stale member state, realtime reconnect, lost access, and local storage reset recovery.

= Acceptance

Workspace operations cannot leave a shared workspace without a valid owner membership; conflict/auth/lost-access paths return explicit errors; the frontend recovers to Personal scope without data bleed or silent destructive overwrite.

## 4. Whatnot, Sales, And Window Boundaries

= Priority

Medium

= Steps

- Split `src/app-core/methods/ui/whatnot/whatnot.ts` by status, connect, sync, CSV import, review, confirm, and discard workflows while preserving local-first behavior and scope guards.
- Move Whatnot parsing, normalization, duplicate detection, and conflict decisions into typed service helpers shared by `src/app-core/shared/whatnot-csv.ts` and `apps/api/src/features/whatnot`.
- Keep `src/components/windows/whatnot/WhatnotReviewDialog.ts` presentation-focused and extract repeated sales/window orchestration from large surfaces such as `LiveSinglesPanel`, `PortfolioWindow`, and `SinglesConfigWindow` only along real domain boundaries.
- Add regression tests around auth expiry, offline recovery, workspace ownership, duplicate decisions, sale refresh, and workspace/personal scope isolation.

= Acceptance

Whatnot and sales workflows are testable without mounting large windows or Azure runtime state; UI files coordinate user interactions while domain services own normalization, conflict handling, persistence, and recovery behavior.

## 5. Verification, Release, And Artifact Hygiene

= Priority

Low

= Steps

- Decide whether `npm run verify` should include API and realtime checks, or document the split command set clearly beside the existing frontend/API/realtime scripts.
- Keep release docs aligned with the current CI, API, realtime, Google Play, and generated-asset scripts.
- Keep generated output, local build artifacts, coverage output, API/realtime `dist`, and one-time migration products out of source-control review surfaces.
- Gradually group flat tests by feature area when touched so failures point to the product boundary they cover.

= Acceptance

Developers can tell which command set mirrors CI for the area they touched; release docs match the live scripts; generated artifacts do not pollute code review or refactor diffs.
