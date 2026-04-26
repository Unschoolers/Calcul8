# Calcul8 Refactor Plan

This is the current refactor plan. This document is alive, kill done tasks and add new ones. Do not mark completed task as done.

## Current Baseline

- The app is a Vue 3 + Vuetify + TypeScript PWA with a large root app assembled from `src/app.ts`, `src/app-core/state.ts`, `src/app-core/computed.ts`, `src/app-core/methods`, lifecycle, and watchers.
- The wheel feature is now really a game feature. It supports wheel and Mystery Grid modes, shared tier odds, game-level outcome count, spectator snapshots, reveal/reset animation, audio, and public session publishing.
- Wheel behavior is "with replacement": the same tier can land on consecutive spins according to probability.
- Mystery Grid behavior is "without replacement inside one board": a generated board has a fixed count of cells per tier, then resets when all cells are revealed.
- The newest game logic is spread across `src/components/windows/wheel`, `src/app-core/shared`, `src/spectator-main.ts`, `src/styles/spectator.css`, frontend tests, and API public session sanitizers.
- Sync and public API contracts have improved tests, but frontend and API still duplicate some DTO-like shapes.
- The UI still contains rough translation coverage and product language left over from "wheel only", especially around spectator mode and game creation.

## Refactor Principles

1. Keep behavior stable while moving code. Wheel odds, grid odds, spectator publishing, proof commits, and inventory decisions should be covered by tests before each extraction.
2. Move pure rules into shared helpers first, then simplify components. Do not start by rewriting component templates.
3. Use one game vocabulary: game, tier, odds, outcome count, wheel spin, grid reveal, public session, spectator snapshot.
4. Keep wheel and grid differences explicit. Do not hide important semantics behind generic names if they behave differently.
5. Keep frontend and API contracts strict, normalized, and runtime-validated at boundaries.
6. Preserve local-first behavior, legacy personal mode, and workspace scope safety.

## Priority 1 - Stabilize The Game Domain Boundary

The current wheel folder works, but it mixes UI state, session persistence, probability allocation, grid board generation, heat, spectator snapshots, and animation state.

To do:

1. Create a small game domain layer under `src/app-core/shared` or `src/app-core/game` for pure logic.
2. Move odds allocation, integer percent normalization, outcome count handling, and tier probability summaries out of component method bags.
3. Move Mystery Grid board generation into a pure helper with explicit inputs: tiers, odds, outcome count, seed/source entropy, and reveal history.
4. Keep wheel selection and grid selection as separate functions because their probability semantics differ.
5. Split `wheelHelpers.ts` into focused modules: pricing, odds, grid layout, wheel segments, fairness/history helpers, and labels.
6. Replace broad mutable result objects with typed command results, for example `SpinResult`, `GridRevealResult`, `GameResetResult`, and `SpectatorPublishResult`.

Done when:

- Components call typed game helpers instead of owning probability math.
- Wheel and grid tests can explain the difference between "with replacement" and "fixed board".
- Changing odds display does not risk changing spin/reveal math.

## Priority 2 - Make Public Session And Spectator Contracts Shared

Spectator mode is now product-critical for both wheel and grid. It should not depend on parallel ad hoc shapes in frontend and API code.

To do:

1. Define shared public session DTOs for `WheelPublicSession`, `WheelSpectatorSnapshot`, grid cells, heat levels, latest result, reset animation state, and game type.
2. Use those DTOs from frontend publishing code and API sanitizer code instead of maintaining parallel type definitions.
3. Add a snapshot version field so future spectator changes can be migrated or ignored deliberately.
4. Keep API sanitization as the trust boundary: unknown external values become normalized public DTOs or safe defaults.
5. Add tests for old wheel-only snapshots, current wheel snapshots, current grid snapshots, reset snapshots, and malformed public payloads.
6. Review `src/spectator-main.ts` so wheel rendering and grid rendering share connection/state plumbing but not renderer-specific assumptions.

Done when:

- A new spectator field is added in one shared contract and tested once at the boundary.
- Grid spectator can never silently fall back to wheel because of a missing or stale `gameType`.
- Reset/reveal animation state is deterministic across app and spectator.

## Priority 3 - Extract The Heat Engine

Heat should be based only on business outcome and statistics: whether the operator is making or losing money for each tier, plus how long the favorable outcomes have been absent versus expectation.

To do:

1. Move heat calculation out of `wheelSpectator.ts` into a pure helper, for example `src/app-core/shared/game-heat.ts`.
2. Model all tiers, not just one chase tier. Multiple client-favorable tiers must contribute to heat.
3. Keep profitable tiers from raising heat unless the product explicitly wants a different signal.
4. Use tested inputs: tier chance, expected hits, actual hits, spins/reveals since favorable hit, price per play, and tier value.
5. Return both the public level and a non-public explanation object useful for tests and debugging.
6. Decide whether the spectator UI should show only the heat label or also an odds board. If shown, it must be product language, not internal margin math.

Done when:

- Unit tests cover very low, low, medium, high, and very high.
- Heat comes down after favorable hits and rises when favorable outcomes are statistically overdue.
- Wheel and grid can reuse the same heat engine with their own history inputs.

## Priority 4 - Clean Up I18n And Product Language

The product has outgrown "wheel" as the only game. Translation and wording should be cleaned before more UI is added.

To do:

1. Audit visible English and French strings in the game tab, spectator page, sign-in/no-login state, modals, buttons, toasts, and empty states.
2. Replace "wheel" labels with "game" where the UI applies to both modes.
3. Keep "wheel" and "grid" only where the distinction matters.
4. Remove any remaining user-facing "slots" language from odds editing.
5. Add missing i18n keys for Mystery Grid, spectator grid, reset, audio, odds, and heat.
6. Add or extend tests that fail on missing locale keys and obvious wheel-only strings in shared game UI.

Done when:

- French and English tell the same product story.
- Spectator mode does not say "Live Wheel Spectator" when watching a grid.
- New game UI text can be added without hardcoding strings in component files.

## Priority 5 - Decompose WheelWindow Into Coordinator Plus Panels

`WheelWindow.definition.ts` and the method modules are doing too much coordination. The target is a thin coordinator with typed services and panels.

To do:

1. Keep `WheelWindow` as the state coordinator for selected config, current session, active game type, and panel routing.
2. Move game commands into small modules: config editing, session lifecycle, spin execution, grid reveal/reset, spectator publishing, and sale/inventory support.
3. Give each command module explicit dependencies instead of reading arbitrary component state.
4. Keep `MysteryGridSurface`, `WheelOddsEditor`, inspector, history, action rail, and session panel as UI components with typed props/events.
5. Reduce `wheelCtx` and bridge usage where ordinary props/events are enough.
6. Add component tests only where templates contain meaningful behavior. Keep pure helper tests for rules.

Done when:

- A bug in grid reveal usually touches grid command code and one UI component, not the whole wheel folder.
- `WheelWindow` mostly wires state, commands, and panels together.

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

Start with a small slice that directly reduces current risk:

1. Extract `game-heat` as a pure helper and move the current tests to it.
2. Create shared spectator/public DTOs and make frontend plus API import them.
3. Extract grid board generation and reveal selection into pure helpers.
4. Audit game/spectator i18n keys and fix wheel-only labels.
5. Add sync contract tests for game config fields: `gameType`, tier odds, outcome count, grid board state, and spectator metadata.

This slice should not change UX except for corrected copy or bug fixes found by the tests.

## Merge Gates

For frontend/game changes:

- `npm run test -- tests/mystery-grid.test.ts tests/wheel-spectator.test.ts tests/wheel-spin.test.ts tests/wheel-spin-methods.test.ts`
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
