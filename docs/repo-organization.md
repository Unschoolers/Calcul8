# Repo Organization Target

This repo should be organized so the folder tree explains the product before opening files. The current code mostly works, but several areas mix UI, orchestration, domain rules, persistence, API boundaries, and tests at the same level.

## Current Pain

- `src/components/windows/wheel` has many good extracted pieces, but they are all flat siblings.
- `src/components/windows` still has older large windows directly at the top level: sales, portfolio, config, singles, live.
- `src/app-core/methods/ui` mixes auth, entitlements, sync, workspace, realtime, Whatnot, spectator, and API helpers.
- `apps/api/src/functions` mixes route handlers, service helpers, and tests in one directory.
- `tests` is mostly flat, so large workflow tests are hard to discover by feature.
- Generated or local-output folders exist in the working tree and add visual noise even when ignored by git.

## Top-Level Rule

Use folders by responsibility, not by historical feature name alone.

Recommended shape:

```text
src/
  app-core/
    features/
    platform/
    shared/
    i18n/
  components/
    windows/
  domain/
  styles/
  types/

apps/
  api/
    src/
      functions/
      features/
      lib/
      test-support/
  realtime/
    src/

shared/
  contracts/
```

This does not need to happen in one move. Use compatibility exports when a move would touch too many imports at once.

## Frontend Feature Layout

Each large window should move toward this shape:

```text
src/components/windows/<feature>/
  <Feature>Window.vue
  <Feature>Window.ts
  coordinator/
  panels/
  components/
  commands/
  services/
  styles/
```

Guidelines:

- `coordinator/` owns Vue lifecycle, local window state wiring, watchers, mode routing, and bridge setup.
- `panels/` owns major UI panels like builder, session, history, review, search, and settings.
- `components/` owns leaf UI with props/events and little knowledge of the parent window.
- `commands/` owns imperative flows that mutate feature state.
- `services/` owns non-UI helpers that still belong to the feature.
- `styles/` owns feature CSS, grouped by panel or surface.

## Wheel Target Layout

```text
src/components/windows/wheel/
  WheelWindow.vue
  WheelWindow.ts
  coordinator/
    WheelWindow.definition.ts
    wheelControllerState.ts
    wheelLayoutPolicy.ts
    wheelComputedShared.ts
  stage/
    WheelStageTopbar.*
    WheelStageSummary.*
    WheelActionRail.*
    MysteryGridSurface.*
    wheelCanvasRender.ts
  inspector/
    WheelInspector.*
    WheelOddsEditor.*
    WheelTierCard.*
    WheelSessionPanel.*
    WheelHistoryPanel.*
  commands/
    wheelConfigMethods.ts
    wheelSessionMethods.ts
    wheelSpinMethods.ts
    mysteryGridMethods.ts
    wheelSpectatorMethods.ts
  services/
    wheelAudio.ts
    wheelFairnessLayout.ts
    wheelSpinFairness.ts
    wheelSaleSupport.ts
    wheelSpinState.ts
    wheelSessionState.ts
  styles/
    wheel-core.css
    wheel-stage.css
    wheel-inspector.css
    wheel-session.css
    wheel-history.css
    mystery-grid.css
    wheel-mobile.css
    wheel-tier-editor.css
```

After that move, reduce `wheelCtx` gradually. Start with leaf components that can use props/events without reading the whole window context.

## API Target Layout

`apps/api/src/functions` should keep HTTP route entry points thin. Larger feature logic should move under `apps/api/src/features`.

Recommended shape:

```text
apps/api/src/
  functions/
    wheelFairness.ts
    wheelPublicSession.ts
    salesLive.ts
    whatnot.ts
  features/
    wheel/
    sales/
    whatnot/
    workspaces/
    billing/
  lib/
    auth/
    cosmos/
    http/
    telemetry/
```

Tests can stay beside route handlers only when they test route wiring. Feature/service tests should move beside or under the feature they cover.

## Test Target Layout

The flat `tests/` directory should be grouped by feature over time:

```text
tests/
  wheel/
  sales/
  singles/
  portfolio/
  sync/
  workspace/
  api/
  i18n/
  helpers/
```

Do not move all tests at once. Move tests when the related source files move or when a test file is already being edited.

## Move Rules

1. Move files by one responsibility at a time.
2. Keep compatibility re-exports for one or two steps when many imports depend on old paths.
3. Run the smallest test suite after each move.
4. Do not mix file moves with behavior changes unless the behavior change is needed to keep tests passing.
5. Update this document when a folder reaches its target shape.
