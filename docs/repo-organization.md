# Repo Organization Target

This repo should be organized so the folder tree explains the product before opening files. The current code mostly works, but several areas still mix UI, orchestration, domain rules, persistence, API boundaries, and tests at the same level.

## Current Progress

- `src/components/windows` is organized by view/window.
- `src/components/windows/wheel` reached the target responsibility layout. The root contains only `WheelWindow.ts`, `WheelWindow.vue`, and responsibility folders.
- `apps/api/src/functions` is route-entry oriented. Larger API logic lives under `apps/api/src/features`, with shared support under `apps/api/src/lib`.
- Compatibility re-export shims from the old flat wheel folder were removed after imports moved to the real subfolders.

## Current Pain

- `src/app-core/methods/ui` still has many domain-prefixed files for auth, entitlements, sync, workspace, realtime, Whatnot, spectator, and API helpers. It is navigable, but not yet physically grouped by domain.
- `tests` is mostly flat, so large workflow tests are hard to discover by feature.
- Generated or local-output folders can add visual noise even when ignored by git.

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

This does not need to happen in one move. Use compatibility exports only when a move would touch too many imports at once, then remove them after imports are migrated.

## Frontend Feature Layout

Each large window should move toward this shape when it is actively edited:

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

## Wheel Layout

Status: reached for folder navigation. Further wheel cleanup should reduce `wheelCtx` usage and split domain responsibilities, but the folder tree now has the intended shape.

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
  dialogs/
    WheelCreateGameDialog.*
    WheelSpectatorDialog.*
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

## API Layout

`apps/api/src/functions` should keep HTTP route entry points thin. Larger feature logic belongs under `apps/api/src/features`.

Current shape:

```text
apps/api/src/
  functions/
  features/
    account/
    auth/
    billing/
    cards/
    entitlements/
    migrations/
    sales/
    sync/
    whatnot/
    wheel/
    workspaces/
  lib/
```

Tests can stay beside route handlers only when they test route wiring. Feature/service tests should move beside or under the feature they cover when those source files are already being moved.

## Test Target Layout

The flat `tests/` directory can be grouped by feature over time:

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
2. Keep compatibility re-exports only for one or two steps when many imports depend on old paths.
3. Remove compatibility re-exports after imports are migrated.
4. Run the smallest test suite after each move.
5. Do not mix file moves with behavior changes unless the behavior change is needed to keep tests passing.
6. Update this document when a folder reaches its target shape.
