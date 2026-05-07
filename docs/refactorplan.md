# Calcul8 Refactor TODO

This is the active refactor backlog. Keep it as a TODO list: remove completed work, add newly found risks, and avoid preserving historical closeout notes here.

Last cleaned: 2026-05-04.

## Refactor Rules

1. Keep behavior stable while moving code. Odds, grid reveals, spectator publishing, proof commits, inventory decisions, sync, and auth flows need focused tests before extraction.
2. Move pure rules and runtime boundary validation into shared helpers first, then simplify UI/API orchestration.
3. Use one game vocabulary: game, tier, odds, outcome count, wheel spin, grid reveal, public session, spectator snapshot.
4. Keep wheel and grid differences explicit. Do not hide important semantics behind generic names if they behave differently.
5. Keep frontend and API contracts strict, normalized, and runtime-validated at boundaries.
6. Preserve local-first behavior and workspace scope safety; old local storage contracts may be removed only by an explicit breaking cleanup.
7. Do not mix file moves with behavior changes unless the behavior change is required to preserve tests.

## Priority 1 - Realtime And Spectator Reliability

Realtime and public session behavior should be predictable across local dev, workspace sessions, and public spectator pages.

TODO:

- [ ] Consolidate realtime endpoint configuration for frontend, API publisher, and websocket gateway.
- [ ] Keep environment variable names documented and tested, including dev unauthenticated subscribe behavior.
- [ ] Make spectator reconnect behavior consistent with app realtime behavior where possible.
- [ ] Keep generic game public-session v2 contracts and legacy wheel snapshot readers covered while third-game work starts.
- [ ] Add the next tier-prize game only through the game adapter registry and generic spectator snapshot fields.
- [ ] Add tests for public session publish failures, stale public sessions, reset events, missing realtime connection, and websocket close/reconnect behavior.
- [ ] Document the local no-login/dev flow for app, API, realtime, spectator, and public links.

Acceptance:

- [ ] Local testing of app plus spectator has a clear script path.
- [ ] Public spectator state survives refresh/reconnect without wrong game rendering.
- [ ] A publish failure does not silently mutate local game state in a misleading way.

## Priority 2 - Whatnot And Sales Boundary Cleanup

Whatnot and authoritative sales flows cover OAuth, CSV import, duplicate detection, review decisions, lot refreshes, sale entities, and optimistic concurrency. The remaining risk is large orchestration surfaces.

TODO:

- [ ] Keep API route handlers thin by pushing Whatnot import/review decisions into feature services with explicit input/output types.
- [ ] Split frontend Whatnot UI orchestration into status, OAuth, CSV import, review confirmation, and affected-sales refresh modules.
- [ ] Normalize sale DTO parsing once for manual sales, Whatnot imports, and wheel-created sales.
- [ ] Keep conflict handling, mutation ids, and stale sales refresh paths tested together.
- [ ] Avoid real Whatnot/Azure state in tests; mock API, repository, and auth boundaries.

Acceptance:

- [ ] Whatnot review changes do not require reading OAuth connection code.
- [ ] Sale entity parsing is shared between manual, Whatnot, and wheel sale paths.
- [ ] A conflict path can be tested without a browser or Azure runtime.

## Priority 3 - UI And Animation Polish Without Logic Drift

Visual polish should remain separate from probability, inventory, proof, and session rules.

TODO:

- [ ] Keep wheel aura, pointer, notch, and animation changes inside rendering/CSS modules.
- [ ] Keep grid reveal, shuffle sound, reset wipe, and zoom animation inside grid UI modules.
- [ ] Keep sound and reduced-motion controls wired through one state path for app and spectator where appropriate.
- [ ] Verify mobile performance for wheel canvas, grid layout, spectator page, and drag odds editor.
- [ ] Keep light and dark mode theme-aware using Vuetify theme variables.
- [ ] Decide whether spectators should see tier chances, remaining grid cells, recent result history, heat only, or no odds panel.

Acceptance:

- [ ] Visual changes can ship without changing odds, proof, inventory, or public session rules.
- [ ] Mobile UI remains touch-friendly and does not require desktop-only drag precision.

## Priority 4 - Test And Repo Organization

Tests are still mostly flat and several large files make ownership harder to see.

TODO:

- [ ] Move tests by feature only when the related source file is already being edited:
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
- [ ] Keep `tests/helpers/fixtures.ts` as the shared fixture entry point.
- [ ] Add feature-specific fixture builders as needed.
- [ ] Update Vitest config or package scripts only when the first test move requires it.
- [ ] Keep generated screenshots, coverage, `dist`, and local smoke artifacts out of committed source unless they are intentional docs assets.
- [ ] Keep `docs/repo-organization.md` in sync when another folder reaches its target shape.

Acceptance:

- [ ] A developer can run a focused feature suite without remembering one-off flat filenames.
- [ ] Test moves are behavior-neutral and verified by the smallest relevant suite.
- [ ] The folder tree explains source ownership and test ownership.

## Priority 5 - Developer Tooling And Local Workflow

Local workflow still depends on knowing the right app/API/realtime/spectator sequence.

TODO:

- [ ] Keep `npm run backend:kill` documented for stale Azure Functions or local backend processes.
- [ ] Add a short local dev checklist for app, API, realtime, spectator, no-login mode, and Chrome DevTools MCP.
- [ ] Consider one `dev:full` or documented multi-terminal setup if the current workflow remains repetitive.
- [ ] Include realtime and API typecheck commands in the workflow docs.
- [ ] Keep generated smoke artifacts and screenshots out of normal source diffs unless committed intentionally.

Acceptance:

- [ ] A new contributor can run the app, API, realtime gateway, spectator page, and focused tests without local tribal knowledge.
- [ ] Stale backend/realtime processes are easy to stop safely.

## Merge Gates

For sync/entity contract changes:

- `npm run test -- tests/shared-sync-contracts.test.ts`
- `npm run test -- tests/lot-selector-display.test.ts`
- `npm run test -- tests/sync-contracts.test.ts tests/sync-service.test.ts tests/workspace-config-sync.test.ts tests/workspace-realtime.test.ts`
- `npm --prefix apps/api run test -- src/lib/syncShape.test.ts src/functions/syncPush.test.ts src/functions/syncPull.test.ts src/lib/cosmos/syncSnapshotRepository.test.ts`
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
