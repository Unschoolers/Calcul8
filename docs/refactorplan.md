# Calcul8 Refactor TODO

## 1. Spectator Render Modules And Realtime Edge Cases

= Priority

Done

= Steps

- Split `src/spectator-main.ts` into small shared, wheel/grid, bracket, and realtime modules.
- Added spectator render tests for bracket dice tiles/tree, grid reset state, and wheel canvas/proof output.
- Added realtime client tests for malformed websocket payload refresh, reconnect refresh, session filtering, unknown events, and both `game.public-session.updated` and `wheel.public-session.updated`.
- Verified existing coverage for stale `updatedAt`, queued publishes, ended-session restart, grid reset snapshots, and bracket public snapshots.
- Kept generic game public-session helpers as the main path while preserving wheel route and `wheel-public:*` room compatibility.

= Acceptance

Done when `npm run test -- tests/spectator-render.test.ts tests/spectator-realtime-client.test.ts tests/bracket-spectator-page.test.ts`, `npm run test -- tests/wheel-spectator.test.ts tests/wheel-spectator-client-state.test.ts tests/wheel-spectator-methods.test.ts tests/shared-game-public-session-contracts.test.ts`, `npx tsc -p . --noEmit --strict`, and `npm run build` passed.

## 2. Bracket Battle Host Flow

= Priority

Done

= Steps

- Moved bracket session loading/saving, storage key resolution, host payload building, and host state application into `src/components/windows/game/bracket/bracketBattleHostFlow.ts`.
- Moved bracket live spectator snapshot construction into `src/components/windows/game/bracket/bracketBattleSpectatorSnapshot.ts`.
- Keep `src/components/windows/game/coordinator/GameWindow.definition.ts` as the host bridge instead of pushing more parent synchronization into the panel.
- Kept `resolveBracketBattleMatchRoll` as the domain outcome source.
- Keep dice animation visual-only and separate from roll outcomes.
- Kept the panel organized around current duel, compact bracket tree, recent awards, and reset dialog sections.
- Added host-flow tests for scoped preview/live storage, loaded-session focus, stale storage recovery, showcased match resolution, and live publish intent.
- Added bracket spectator snapshot tests, GameWindow overlay state tests, and an anchor-update path so presentation/mobile layout changes can re-anchor visible dice without replaying animations.

= Acceptance

Done when `npm run test -- tests/bracket-battle-host-flow.test.ts tests/bracket-battle-spectator-snapshot.test.ts tests/bracket-battle-panel.test.ts tests/game-window-facade.test.ts tests/game-stage-overlay-controller.test.ts tests/game-stage-overlay-dice.test.ts tests/bracket-battle-overlay-anchors.test.ts tests/wheel-spectator.test.ts`, `npx tsc -p . --noEmit --strict`, and `npm run build` passed.

## 3. Wheel-Named Game Orchestration

= Priority

High

= Steps

- Move shared tier-prize session, config, prize-board, and public-session logic out of `wheelConfigMethods.ts`, `wheelSessionMethods.ts`, `wheelSpinMethods.ts`, and `wheelSpectatorMethods.ts`.
- Keep wheel-only probability, proof, and spin behavior in wheel-named modules.
- Remove compatibility entrypoints such as the game controller alias map after imports and tests prove no callers remain.
- Split tests by game contract versus wheel-specific behavior.

= Acceptance

Changing bracket or grid behavior no longer requires editing wheel-specific modules unless the behavior is genuinely wheel-only.

## 4. Whatnot, Sales, And UI Method Boundaries

= Priority

Medium

= Steps

- Move parsing, normalization, and conflict handling from `src/app-core/shared/whatnot-csv.ts` and Whatnot UI flows to typed service helpers with focused tests.
- Keep API handlers thin and backed by `apps/api/src/lib` or feature services.
- Split large UI method files such as `src/app-core/methods/ui/whatnot/whatnot.ts` by workflow while preserving local-first behavior and scope guards.
- Keep `src/components/windows/whatnot/WhatnotReviewDialog.ts` presentation-focused.
- Add regression tests around auth expiry, offline recovery, and workspace/personal bleed prevention where touched.

= Acceptance

Whatnot and sales behavior has smaller tested units with explicit scope, auth, and error boundaries.

## 5. Dev, Docs, And Test Workflow

= Priority

Low

= Steps

- Decide whether `npm run verify` should include API/realtime checks or document the split clearly in package scripts and docs.
- Keep `docs/repo-organization.md` and bracket/game specs aligned with current code after each refactor slice.
- Gradually group flat tests by feature area when touched.
- Keep generated and local output noise, including API/realtime build output, out of source-control review surfaces.

= Acceptance

Developers can tell which command set mirrors CI for the area they touched, and planning docs no longer contradict implemented behavior.
