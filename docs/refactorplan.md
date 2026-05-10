# Calcul8 Refactor TODO

## 1. Public Spectator And Realtime Contract

= Priority

Critical

= Steps

- Extract generic `game` public-session helpers around the existing wheel-compatible route surface.
- Start from `src/components/windows/game/services/wheelSpectator.ts`, `apps/api/src/features/wheel/publicSessionHandler.ts`, `apps/api/src/lib/realtime.ts`, and `apps/realtime/src/workspace-realtime-rooms.ts`.
- Make `gameType` dispatch explicit at storage, API, websocket, and spectator-render boundaries.
- Add contract tests for wheel, grid, and bracket publish, reset, restart, reconnect refresh, stale snapshot ordering, and config/live behavior.
- Split `src/spectator-main.ts` into small game renderers.
- Update `docs/superpowers/specs/2026-05-08-bracket-battle-design.md`, which still describes public spectator and realtime support as future work.

= Acceptance

Spectator sessions for wheel, grid, and bracket update live for rolls/spins/resets/restarts through one tested realtime path.

## 2. Bracket Battle Host Flow

= Priority

High

= Steps

- Move bracket session loading/saving, live snapshot construction, and host state resolution out of `src/components/windows/game/bracket/BracketBattlePanel.ts`.
- Keep `src/components/windows/game/coordinator/GameWindow.definition.ts` as the host bridge instead of pushing more parent synchronization into the panel.
- Keep `resolveBracketBattleMatchRoll` as the domain outcome source.
- Keep dice animation visual-only and separate from roll outcomes.
- Split the UI into current duel, compact bracket tree, recent awards, and reset dialog sections.
- Add mobile and fullscreen checks for dice overlay placement at 360px, 390px, tablet, desktop, and fullscreen sizes.

= Acceptance

Bracket host state is testable without mounting the whole panel, and normal/fullscreen/mobile layouts share one reliable flow.

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
