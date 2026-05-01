# Calcul8 Refactor Plan

This is the current refactor plan. This document is alive: remove finished tasks, add newly found risks, and keep the next slice small enough to verify locally.

Last repo scan: 2026-04-30.

## Current Baseline

- The app is a Vue 3 + Vuetify + TypeScript PWA with root state and methods assembled from `src/app.ts`, `src/app-core/state.ts`, `src/app-core/computed.ts`, `src/app-core/methods`, lifecycle, watchers, and window coordinators.
- The wheel feature is now a broader game feature. It supports wheel and Mystery Grid modes, shared tier odds, game-level outcome counts, spectator snapshots, reveal/reset animation, audio, fairness proof commits, and public session publishing.
- Wheel behavior is "with replacement": the same tier can land on consecutive spins according to probability.
- Mystery Grid behavior is "without replacement inside one board": a generated board has a fixed count of cells per tier, then resets when all cells are revealed.
- The wheel folder navigation target has been reached: root files are thin, and feature code is grouped under `coordinator`, `stage`, `inspector`, `dialogs`, `commands`, `services`, and `styles`.
- Core game slot/cell/spin/heat rules have started moving into pure helpers under `src/app-core/shared`: `game-domain.ts`, `game-spin.ts`, `game-heat.ts`, `wheel-odds.ts`, and config/session compatibility helpers.
- Public spectator session DTOs live in a shared `.d.ts` contract under `shared`, and frontend/API types import that contract.
- Frontend spectator payload normalization exists in `src/app-core/methods/ui/wheel-spectator-contract.ts`, and `src/spectator-main.ts` uses it for realtime payloads.
- API public-session sanitization exists separately in `apps/api/src/features/wheel/publicSessionHandler.ts`; it is intentionally a trust boundary, but it now duplicates a lot of frontend normalization behavior.
- Sync contracts are still loose for rich entities: frontend/API DTOs are mostly `Record<string, unknown>` for lots, sales, and wheel configs, so typed runtime validation for game configs and sessions remains the biggest cross-device safety gap.
- `src/app-core/methods/ui` is navigable but still physically flat across auth, entitlements, sync, workspace, realtime, spectator, Whatnot, and API helper responsibilities.
- The flat `tests/` directory has broad coverage, but discoverability is declining as game, sync/workspace, sales/Whatnot, config/singles, auth/entitlement, and calculation suites grow.

## Refactor Principles

1. Keep behavior stable while moving code. Odds, grid reveals, spectator publishing, proof commits, inventory decisions, sync, and auth flows need focused tests before extraction.
2. Move pure rules and runtime boundary validation into shared helpers first, then simplify UI/API orchestration.
3. Use one game vocabulary: game, tier, odds, outcome count, wheel spin, grid reveal, public session, spectator snapshot.
4. Keep wheel and grid differences explicit. Do not hide important semantics behind generic names if they behave differently.
5. Keep frontend and API contracts strict, normalized, and runtime-validated at boundaries.
6. Preserve local-first behavior, legacy personal mode, and workspace scope safety.
7. Do not mix file moves with behavior changes unless the behavior change is required to preserve tests.

## Priority 1 - Strengthen Sync And Entity Contracts

This is now the top safety risk. Game configs, sessions, sales, live pricing, workspace data, and sync metadata are richer than the current loose DTO layer can describe. A weak sync boundary can erase or corrupt `gameType`, tier odds, outcome counts, grid board state, spectator metadata, sale version fields, or workspace-scoped data.

To do:

1. Replace broad `SyncEntityRecord` usage with named DTOs for lots, singles purchases, sales, wheel/game configs, game sessions, live pricing, and sync metadata.
2. Add runtime parsers for those DTOs at frontend storage/import boundaries and API route boundaries.
3. Keep legacy snapshot import/export compatibility separate from current entity sync so old personal-mode migrations do not weaken current contracts.
4. Add contract tests for personal and workspace payloads that include wheel configs, grid configs, tier odds, outcome count, grid reveal state, spectator metadata, sale entity versions, and live pricing.
5. Decide which future fields are preserved. Unknown fields should be dropped by default unless the contract explicitly allows compatible future data.
6. Keep optimistic concurrency and conflict paths visible in tests for shared/cloud-authoritative entities.
7. Make `tests/sync-contracts.test.ts`, API sync tests, and workspace realtime tests the first verification gate for each sync DTO slice.

Done when:

- API handlers and frontend sync code share named DTOs instead of parallel loose records.
- A config saved in one browser keeps the same game type, odds, and grid/session state when loaded elsewhere.
- Legacy personal-mode migrations still pass without making current entity contracts permissive.

## Priority 2 - Finish The Game Domain Boundary

The folder boundary is in place, but several command/service files still mix UI orchestration with pricing, inventory, session revenue, fairness proof display, and animation timing.

To do:

1. Split the remaining `wheelHelpers.ts` responsibilities into focused modules: pricing/revenue math, default config/tier builders, sales creation, count remapping, and legacy compatibility.
2. Keep `game-spin.ts` as the pure wheel spin-planning helper and add tests for edge cases around invalid target index, zero slots, and spectator animation metadata.
3. Extract grid reset planning from `mysteryGridMethods.ts` into a pure helper that returns reset timing/state transitions without mutating Vue state directly.
4. Replace broad mutable command side effects with typed command results where practical: `SpinResult`, `GridRevealResult`, `GameResetResult`, and `SpectatorPublishResult`.
5. Keep wheel and grid selection separate in names and tests because wheel is with replacement and grid is a fixed board until reset.
6. Add or reuse fixture builders for game configs, slots, grid reveals, fairness entries, and spectator snapshots so tests stop recreating loose records.

Done when:

- Components call typed game helpers instead of owning probability math, reset rules, or revenue math.
- Wheel and grid tests clearly explain the difference between "with replacement" and "fixed board".
- Changing odds display or animation polish does not risk changing spin/reveal math.

## Priority 3 - Harden Public Session And Spectator Contracts

The shared type contract and frontend normalization are in place. The remaining risk is duplicated runtime logic: API sanitization, stored snapshots, realtime payloads, and the standalone spectator page must agree on the same versioned shape.

To do:

1. Keep API sanitization as the external trust boundary, but factor shared normalizer/parsing rules where frontend and API currently duplicate limits and defaults.
2. Add explicit compatibility tests for old wheel-only snapshots, current wheel snapshots, current grid snapshots, reset snapshots, spin-animation snapshots, and malformed public payloads.
3. Decide whether the shared contract should stay as `.d.ts` only or become a tiny runtime contract package with constants such as `CURRENT_WHEEL_PUBLIC_SESSION_SNAPSHOT_VERSION`.
4. Document the versioning rule: new required spectator fields need sanitizer defaults and compatibility tests before shipping.
5. Review `src/spectator-main.ts` after the contract pass so wheel rendering and grid rendering share connection/state plumbing but not renderer-specific assumptions.
6. Add API tests that prove malformed `gameType`, `gridCells`, `spinAnimation`, and heat values normalize exactly like frontend realtime payloads.

Done when:

- A new spectator field is added in one shared contract and tested at the boundary.
- Grid spectator can never silently fall back to wheel because of a missing or stale `gameType`.
- Reset/reveal/spin animation state is deterministic across app, API, realtime, and spectator.

## Priority 4 - Split API Wheel Fairness And Public Proof Flow

`apps/api/src/features/wheel/fairnessHandler.ts` is the largest API feature file scanned. It combines request parsing, token encryption, proof verification, layout parsing, HTML rendering, and route behavior. It works, but it is hard to review safely alongside public-session changes.

To do:

1. Extract fairness request parsers into a feature-local parser module with focused tests.
2. Extract proof math/verification into a pure service that does not know about Azure Functions.
3. Extract HTML proof rendering into a small renderer with escaping tests.
4. Keep repository calls in the handler/service boundary, not inside low-level math helpers.
5. Keep algorithm constants and maximum slot count centralized for API and frontend proof-link code.

Done when:

- Fairness parser, verifier, renderer, and route tests can fail independently.
- Adding grid proof display does not require editing one 1000+ line handler.
- The public proof page remains output-compatible with existing links.

## Priority 5 - Group Frontend UI Methods By Domain

`src/app-core/methods/ui` now has many domain-prefixed files in one flat folder. It is not the highest runtime risk, but it slows down changes to auth, entitlements, sync, workspace, realtime, Whatnot, and spectator behavior.

To do:

1. Introduce domain folders under `src/app-core/methods/ui` only when touching related files:
   - `auth/` for session, account, Google identity, and auth-expiry helpers.
   - `entitlements/` for Stripe, Play, purchase verification, cache, status, and sign-in helpers.
   - `sync/` for sync apply/pull/push/session/status/network/storage recovery and conflict policy.
   - `workspace/` for workspace API, members, membership, invite, scope, UI, config sync, and realtime.
   - `spectator/` for wheel broadcast, public-session client, contract, and spectator fetch helpers.
   - `whatnot/` for Whatnot UI/service orchestration.
2. Move one domain at a time with temporary compatibility exports only if the import churn is large.
3. Remove compatibility exports after the imports are migrated.
4. Keep app context typing intact while moving files; do not widen types to make moves easier.

Done when:

- A workspace realtime bug is found under a workspace folder, not by scanning all UI methods.
- Entitlement and auth flows are physically separated from sync and Whatnot.
- `src/app-core/methods/ui` root contains only aggregation or compatibility files.

## Priority 6 - Realtime And Spectator Reliability

Realtime and public session behavior should be predictable across local dev, workspace sessions, and public spectator pages. The gateway exists and supports signed subscriptions, workspace presence, public-session publish, room counts, and reconnects, but the config/test story still needs to be boring.

To do:

1. Consolidate realtime endpoint configuration for frontend, API publisher, and websocket gateway.
2. Keep environment variable names documented and tested, including dev unauthenticated subscribe behavior.
3. Make spectator reconnect behavior consistent with app realtime behavior where possible.
4. Add tests for public session publish failures, stale public sessions, reset events, missing realtime connection, and websocket close/reconnect behavior.
5. Document the local no-login/dev flow for app, API, realtime, spectator, and public links.

Done when:

- Local testing of app plus spectator has a clear script path.
- Public spectator state survives refresh/reconnect without wrong game rendering.
- A publish failure does not silently mutate local game state in a misleading way.

## Priority 7 - Whatnot And Sales Boundary Cleanup

Whatnot and authoritative sales flows now cover OAuth, CSV import, duplicate detection, review decisions, lot refreshes, sale entities, and optimistic concurrency. The code is well-covered but still has large orchestration surfaces.

To do:

1. Keep API route handlers thin by pushing Whatnot import/review decisions into feature services with explicit input/output types.
2. Split frontend `src/app-core/methods/ui/whatnot.ts` into status, OAuth, CSV import, review confirmation, and affected-sales refresh modules.
3. Normalize sale DTO parsing once for manual sales, Whatnot imports, and wheel-created sales.
4. Keep conflict handling, mutation ids, and stale sales refresh paths tested together.
5. Avoid real Whatnot/Azure state in tests; mock API, repository, and auth boundaries.

Done when:

- Whatnot review changes do not require reading OAuth connection code.
- Sale entity parsing is shared between manual, Whatnot, and wheel sale paths.
- A conflict path can be tested without a browser or Azure runtime.

## Priority 8 - UI And Animation Polish Without Logic Drift

The game UI is usable, and the wheel folder now has a stage/inspector split. Visual polish should remain separate from probability, inventory, proof, and session rules.

To do:

1. Keep wheel aura, pointer, notch, and animation changes inside rendering/CSS modules.
2. Keep grid reveal, shuffle sound, reset wipe, and zoom animation inside grid UI modules.
3. Keep sound and reduced-motion controls wired through one state path for app and spectator where appropriate.
4. Verify mobile performance for wheel canvas, grid layout, spectator page, and drag odds editor.
5. Keep light and dark mode theme-aware using Vuetify theme variables.
6. Consider a spectator odds panel only after deciding what spectators should know: tier chances, remaining grid cells, recent result history, or just heat.

Done when:

- Visual changes can be shipped without changing odds, proof, inventory, or public session rules.
- Mobile UI remains touch-friendly and does not require desktop-only drag precision.

## Priority 9 - Test And Repo Organization

The wheel source folder reached the target layout, but tests are still mostly flat and several large files make ownership harder to see.

To do:

1. Move tests by feature only when the related source file is already being edited:
   - `tests/game/`
   - `tests/sync/`
   - `tests/workspace/`
   - `tests/sales/`
   - `tests/whatnot/`
   - `tests/config/`
   - `tests/singles/`
   - `tests/auth/`
   - `tests/entitlements/`
   - `tests/i18n/`
2. Keep `tests/helpers/fixtures.ts` as the shared fixture entry point, then add feature-specific fixture builders as needed.
3. Update Vitest config or package scripts only when the first test move requires it.
4. Keep generated screenshots, coverage, `dist`, and local smoke artifacts out of committed source unless they are intentional docs assets.
5. Keep `docs/repo-organization.md` in sync when another folder reaches its target shape.

Done when:

- A developer can run a focused feature suite without remembering one-off flat filenames.
- Test moves are behavior-neutral and verified by the smallest relevant suite.
- The folder tree explains source ownership and test ownership.

## Priority 10 - Developer Tooling And Local Workflow

Local workflow has improved but still depends on knowing the right app/API/realtime/spectator sequence.

To do:

1. Keep `npm run backend:kill` documented for stale Azure Functions or local backend processes.
2. Add a short local dev checklist for app, API, realtime, spectator, no-login mode, and Chrome DevTools MCP.
3. Consider one `dev:full` or documented multi-terminal setup if the current workflow remains repetitive.
4. Include realtime and API typecheck commands in the workflow docs.
5. Keep generated smoke artifacts and screenshots out of normal source diffs unless committed intentionally.

Done when:

- A new contributor can run the app, API, realtime gateway, spectator page, and focused tests without local tribal knowledge.
- Stale backend/realtime processes are easy to stop safely.

## Completed Refactor Items

### Heat Engine

Status: done.

What changed:

1. Heat calculation now lives in `src/app-core/shared/game-heat.ts` as a pure helper.
2. The engine ranks all available tiers, not a single hard-coded chase tier.
3. Profitable tiers stay at very low heat unless no client-favorable tier is available.
4. Inputs are explicit: tier chance, total chance, total plays, actual hits, spins since hit, profit per play, and remaining hits.
5. The result includes the public heat level plus diagnostic fields for expected hits, under-hit gap, due probability, recent-hit state, and client-favorable state.
6. The spectator UI still shows the public heat label only; an odds board remains a separate product decision.

### I18n And Product Language

Status: done for the shared game UI and public spectator copy. Remaining cleanup should be treated as normal feature copy polish, not a blocker for the next refactor step.

What changed:

1. Shared EN/FR game copy now uses game/play/result wording where the UI applies to both wheel and grid.
2. Wheel-specific copy remains explicit for wheel-only actions such as spinning the visual wheel.
3. Odds copy avoids user-facing "slots" language.
4. Spectator empty/loading/error and board copy now use game/prize/result wording instead of defaulting to wheel/chase.
5. Grid spectator status now says revealing while an animation is running.
6. I18n tests now lock the most important shared game labels in both languages.

### Wheel Folder Navigation

Status: done for folder organization.

What changed:

1. `src/components/windows/wheel` now has `coordinator`, `stage`, `inspector`, `dialogs`, `commands`, `services`, and `styles`.
2. Root wheel files are limited to `WheelWindow.ts` and `WheelWindow.vue`.
3. Compatibility re-export shims from the old flat folder were removed.
4. Remaining wheel work is behavioral/domain cleanup, not folder navigation.

### First Slice From Previous Plan

Status:

1. Extract `game-heat` as a pure helper: done.
2. Add frontend spectator payload normalization for fetch and realtime events: done.
3. Audit game/spectator i18n keys and fix wheel-only labels: done for shared game/spectator copy.
4. Add sync contract tests for rich game config fields: still open; now part of Priority 1.
5. Split `wheelHelpers.ts` pricing/sales/fairness responsibilities: partially done for fairness and inventory support; pricing, default config, sales creation, and revenue math remain.

## Next Refactor Slice

The next slice should reduce data-loss and logic-drift risk without changing UX:

1. Add typed runtime parsing for synced wheel/game configs, including `gameType`, tier odds, outcome count, grid cell count, and grid reveal/session fields.
2. Add personal/workspace sync contract tests that prove those fields survive push/pull and malformed payloads are normalized or rejected intentionally.
3. Split `wheelHelpers.ts` into pricing/revenue, default builders, sales creation, and count remapping modules with existing tests moved to the new imports.
4. Extract grid reset planning from `mysteryGridMethods.ts` into a pure helper and test reduced-motion/default timing.
5. Factor shared spectator snapshot sanitizer rules so API and frontend normalization do not drift on `gameType`, `gridCells`, `spinAnimation`, and heat.

This slice should not change UX except for bug fixes found by the tests.

## Merge Gates

For sync/entity contract changes:

- `npm run test -- tests/sync-contracts.test.ts tests/sync-service.test.ts tests/workspace-config-sync.test.ts tests/workspace-realtime.test.ts`
- `npm --prefix apps/api run test`
- `npm --prefix apps/api run typecheck`
- `npx tsc -p . --noEmit --strict`

For frontend/game changes:

- `npm run test -- tests/mystery-grid.test.ts tests/wheel-spectator.test.ts tests/wheel-spin.test.ts tests/wheel-spin-methods.test.ts`
- `npm run test -- tests/game-domain.test.ts tests/game-spin.test.ts tests/game-heat.test.ts tests/wheel-spectator-client-state.test.ts tests/wheel-spectator-methods.test.ts`
- `npm run test -- tests/i18n.test.ts`
- `npx tsc -p . --noEmit --strict`
- `npm run build`

For API/public session/fairness changes:

- `npm --prefix apps/api run test`
- `npm --prefix apps/api run typecheck`

For realtime gateway changes:

- `npm --prefix apps/realtime run typecheck`
- `npm --prefix apps/realtime run build`
- Focused frontend/API realtime tests covering the changed behavior.

For broad refactors:

- `npm run verify`

## Explicitly Deferred

- Workspace billing and admin layers beyond contract/safety work required by touched code.
- Large visual redesigns outside the game/spectator surfaces.
- Removing legacy personal-mode migrations.
- Production data migrations for Mystery Grid unless the grid has already shipped to real users.
- New luck games before the shared game contracts are solid.
