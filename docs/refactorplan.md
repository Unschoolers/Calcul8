# Calcul8 Refactor Plan

This is the current refactor plan. This document is alive, kill done tasks and add new ones. Do not mark completed task as done.

## Current Baseline

- The app is a Vue 3 + Vuetify + TypeScript PWA with a large root app assembled from `src/app.ts`, `src/app-core/state.ts`, `src/app-core/computed.ts`, `src/app-core/methods`, lifecycle, and watchers.
- The wheel feature is now really a game feature. It supports wheel and Mystery Grid modes, shared tier odds, game-level outcome count, spectator snapshots, reveal/reset animation, audio, and public session publishing.
- Wheel behavior is "with replacement": the same tier can land on consecutive spins according to probability.
- Mystery Grid behavior is "without replacement inside one board": a generated board has a fixed count of cells per tier, then resets when all cells are revealed.
- Core game slot/cell/reveal rules have started moving into shared pure helpers under `src/app-core/shared`, with component methods kept as orchestration.
- Public spectator session DTOs now live in a shared contract under `shared`, and frontend/API types import that contract instead of maintaining separate snapshot shapes.
- Sync contracts still need tightening for richer game configs and sessions.
- The repo navigation pass is complete enough to stop blocking feature work: wheel has responsibility folders, API logic has feature folders, and the target map lives in `docs/repo-organization.md`.

## Refactor Principles

1. Keep behavior stable while moving code. Wheel odds, grid odds, spectator publishing, proof commits, and inventory decisions should be covered by tests before each extraction.
2. Move pure rules into shared helpers first, then simplify components. Do not start by rewriting component templates.
3. Use one game vocabulary: game, tier, odds, outcome count, wheel spin, grid reveal, public session, spectator snapshot.
4. Keep wheel and grid differences explicit. Do not hide important semantics behind generic names if they behave differently.
5. Keep frontend and API contracts strict, normalized, and runtime-validated at boundaries.
6. Preserve local-first behavior, legacy personal mode, and workspace scope safety.

## Priority 1 - Finish The Game Domain Boundary

The first boundary is in place, but the wheel folder still mixes session persistence, heat, pricing, spectator snapshots, fairness, inventory, and animation state.

To do:

1. Split the remaining `wheelHelpers.ts` responsibilities into focused modules: pricing, sales creation, fairness serialization, display labels, and legacy compatibility.
2. Extract wheel spin planning into a pure helper that returns target index, angles, duration, and spectator animation metadata from explicit inputs.
3. Extract grid reset planning into a pure helper that describes reset timing/state transitions without mutating Vue state directly.
4. Replace broad mutable result objects with typed command results, for example `SpinResult`, `GridRevealResult`, `GameResetResult`, and `SpectatorPublishResult`.
5. Keep wheel and grid selection separate in names and tests because wheel is with replacement and grid is a fixed board until reset.
6. Add fixture builders for game configs, slots, grid reveals, fairness entries, and spectator snapshots so tests stop recreating loose records.

Done when:

- Components call typed game helpers instead of owning probability math.
- Wheel and grid tests can explain the difference between "with replacement" and "fixed board".
- Changing odds display does not risk changing spin/reveal math.

## Priority 2 - Harden Public Session And Spectator Contracts

The shared type contract is in place. The next risk is runtime drift: API sanitization, stored snapshots, realtime payloads, and the standalone spectator page must agree on the same versioned shape.

To do:

1. Keep API sanitization as the trust boundary: unknown external values become normalized public DTOs or safe defaults.
2. Add explicit compatibility tests for old wheel-only snapshots, current wheel snapshots, current grid snapshots, reset snapshots, and malformed public payloads.
3. Add a small frontend normalization helper for spectator fetch/realtime payloads so `src/spectator-main.ts` does not cast unknown data directly.
4. Review `src/spectator-main.ts` so wheel rendering and grid rendering share connection/state plumbing but not renderer-specific assumptions.
5. Decide whether the shared contract should stay as `.d.ts` only or become a small runtime package with constants such as `CURRENT_WHEEL_PUBLIC_SESSION_SNAPSHOT_VERSION`.
6. Document the versioning rule: new required spectator fields need sanitizer defaults and compatibility tests before shipping.

Done when:

- A new spectator field is added in one shared contract and tested once at the boundary.
- Grid spectator can never silently fall back to wheel because of a missing or stale `gameType`.
- Reset/reveal animation state is deterministic across app and spectator.

## Priority 3 - Extract The Heat Engine

Heat should be based only on business outcome and statistics: whether the operator is making or losing money for each tier, plus how long the favorable outcomes have been absent versus expectation.

Status: done.

What changed:

1. Heat calculation now lives in `src/app-core/shared/game-heat.ts` as a pure helper.
2. The engine ranks all available tiers, not a single hard-coded chase tier.
3. Profitable tiers stay at very low heat unless no client-favorable tier is available.
4. Inputs are explicit: tier chance, total chance, total plays, actual hits, spins since hit, profit per play, and remaining hits.
5. The result includes the public heat level plus diagnostic fields for expected hits, under-hit gap, due probability, recent-hit state, and client-favorable state.
6. The spectator UI still shows the public heat label only; an odds board remains a separate product decision.

Done when:

- Unit tests cover very low, low, medium, high, and very high.
- Heat comes down after favorable hits and rises when favorable outcomes are statistically overdue.
- Wheel and grid can reuse the same heat engine with their own history inputs.

## Priority 4 - Clean Up I18n And Product Language

The product has outgrown "wheel" as the only game. Translation and wording should be cleaned before more UI is added.

Status: done for the shared game UI and public spectator copy. Remaining cleanup should be treated as normal feature copy polish, not a blocker for the next refactor step.

What changed:

1. Shared EN/FR game copy now uses game/play/result wording where the UI applies to both wheel and grid.
2. Wheel-specific copy remains explicit for wheel-only actions such as spinning the visual wheel.
3. Odds copy avoids user-facing "slots" language.
4. Spectator empty/loading/error and board copy now use game/prize/result wording instead of defaulting to wheel/chase.
5. Grid spectator status now says revealing while an animation is running.
6. I18n tests now lock the most important shared game labels in both languages.

Done when:

- French and English tell the same product story.
- Spectator mode does not say "Live Wheel Spectator" when watching a grid.
- Shared game UI text can be added without hardcoding strings in component files.

## Priority 5 - Decompose WheelWindow Into Coordinator Plus Panels

`src/components/windows/wheel` has too many responsibilities in one flat folder. The issue is not just file count: UI components, HTML templates, CSS, Vue coordinators, command modules, canvas rendering, session persistence, spectator publishing, pricing, inventory, and game-mode logic are all siblings. That makes the folder look larger and less intentional than it really is.

The first target is folder organization by responsibility. Behavior refactors should follow after the module boundaries are visible.

To do:

1. Create a clear folder layout before moving logic:
   - `coordinator/` for `WheelWindow.definition.ts`, coordinator-only lifecycle, watchers, local state wiring, and route/tab bridge.
   - `stage/` for stage UI: wheel canvas surface, mystery grid surface, topbar, summary, action rail, celebration overlay.
   - `inspector/` for builder/session/history panels, tier card, odds editor, and inspector-specific computeds.
   - `commands/` for imperative flows: config editing, session lifecycle, wheel spin execution, grid reveal/reset, spectator publishing.
   - `services/` for non-UI helpers that still belong to the feature: canvas rendering, audio, fairness layout, sale/inventory support.
   - `styles/` for all wheel/game CSS files, grouped by stage, inspector, session, grid, history, and mobile.
2. Move files in thin compatibility steps. Prefer barrel exports or temporary re-export shims so tests and imports can be migrated gradually.
3. Keep `WheelWindow` as the state coordinator for selected config, current session, active game type, and panel routing.
4. After the move, split coordinator-only concerns from command concerns: canvas refresh, compact inspector state, autospin scheduling, celebration timing, and mode switching should not live beside business commands forever.
5. Reduce `wheelCtx` and bridge usage where ordinary props/events are enough, starting with leaf display components like `WheelStageSummary`, `WheelActionRail`, and `MysteryGridSurface`.
6. Add component tests only where templates contain meaningful behavior. Keep pure helper tests for rules.

Done when:

- A bug in grid reveal usually touches grid command code and one UI component, not the whole wheel folder.
- `WheelWindow` mostly wires state, commands, and panels together.
- The folder tree itself explains the feature: coordinator, stage, inspector, commands, services, styles.

## Priority 6 - Strengthen Cloud Sync And Entity Contracts

This remains important because game configs and sessions are now richer. Loose sync contracts can erase or corrupt fields like `gameType`, odds, outcome count, reveal state, or public session metadata.

To do:

1. Define shared DTOs for current lots, singles, sales, wheel/game configs, game sessions, live pricing, and sync metadata.
2. Keep runtime parsing at API and storage boundaries, then return typed normalized shapes internally.
3. Separate legacy snapshot import/export compatibility from current entity sync.
4. Add contract tests for personal and workspace payloads that include wheel configs, grid configs, tier odds, outcome count, and session/public state.
5. Ensure sync writes preserve unknown-but-compatible future fields only where explicitly intended.
6. Keep optimistic concurrency and conflict paths visible in tests.

Done when:

- API handlers and frontend sync code share named DTOs instead of parallel loose records.
- A config saved in one browser keeps the same game type and odds when loaded elsewhere.
- Legacy migrations still pass without weakening current entity contracts.

## Priority 7 - Realtime And Spectator Reliability

Realtime and public session behavior should be predictable across local dev, workspace sessions, and public spectator pages.

To do:

1. Consolidate realtime endpoint configuration for frontend, API publisher, and websocket gateway.
2. Keep environment variable names documented and tested.
3. Make spectator reconnect behavior consistent with app realtime behavior where possible.
4. Add tests for public session publish failures, stale public sessions, reset events, and missing realtime connection.
5. Document the local no-login/dev flow so testing spectator mode does not depend on fighting auth expiry.

Done when:

- Local testing of app plus spectator has a clear script path.
- Public spectator state survives refresh/reconnect without wrong game rendering.
- A publish failure does not silently mutate local game state in a misleading way.

## Priority 8 - UI And Animation Polish Without Logic Drift

The game UI is now usable, but visual polish should remain separate from probability and session rules.

To do:

1. Keep wheel aura, pointer, notch, and animation changes inside rendering/CSS modules.
2. Keep grid reveal, shuffle sound, reset wipe, and zoom animation inside grid UI modules.
3. Add user controls for sound and reduced motion if the audio/animation stays enabled by default.
4. Verify mobile performance for wheel canvas, grid layout, and drag odds editor.
5. Keep light and dark mode theme-aware using Vuetify theme variables.
6. Consider a spectator odds panel only after deciding what spectators should know: tier chances, remaining grid cells, recent result history, or just heat.

Done when:

- Visual changes can be shipped without changing odds, proof, inventory, or public session rules.
- Mobile UI remains touch-friendly and does not require desktop-only drag precision.

## Priority 9 - Developer Tooling And Local Workflow

Recent work added local convenience needs. These should be documented and kept boring.

To do:

1. Keep `npm run backend:kill` documented for stale Azure Functions or local backend processes.
2. Add a short local dev checklist for app, API, realtime, spectator, no-login mode, and Chrome DevTools MCP.
3. Consider one `dev:full` or documented multi-terminal setup if the current workflow remains repetitive.
4. Keep generated screenshots and smoke artifacts out of committed source unless they are intentional docs assets.

Done when:

- A new contributor can run the app, API, spectator, and tests without knowing local tribal steps.
- Stale backend processes are easy to stop safely.

## First Refactor Slice

The next slice should reduce risk without changing UX:

1. Extract `game-heat` as a pure helper and move the current tests to it.
2. Add frontend spectator payload normalization for fetch and realtime events.
3. Audit game/spectator i18n keys and fix wheel-only labels.
4. Add sync contract tests for game config fields: `gameType`, tier odds, outcome count, grid board state, and spectator metadata.
5. Split `wheelHelpers.ts` pricing/sales/fairness responsibilities into focused modules.

This slice should not change UX except for corrected copy or bug fixes found by the tests.

## Merge Gates

For frontend/game changes:

- `npm run test -- tests/mystery-grid.test.ts tests/wheel-spectator.test.ts tests/wheel-spin.test.ts tests/wheel-spin-methods.test.ts`
- `npm run test -- tests/game-domain.test.ts tests/wheel-spectator-client-state.test.ts tests/wheel-spectator-methods.test.ts`
- `npm run test -- tests/i18n.test.ts`
- `npx tsc -p . --noEmit --strict`
- `npm run build`

For API/public session/sync changes:

- `npm --prefix apps/api run test`
- `npm --prefix apps/api run typecheck`

For broad refactors:

- `npm run verify`

## Explicitly Deferred

- Workspace billing and admin layers.
- Large visual redesigns outside the game/spectator surfaces.
- Removing legacy personal-mode migrations.
- Production data migrations for Mystery Grid unless the grid has already shipped to real users.
- New luck games before the shared game contracts are solid.
