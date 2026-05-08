# Game Stage Overlay Shell Design

## Summary

Calcul8 should gain a shared 3D stage overlay shell for the game page. The shell renders above the existing game UI, keeps the app visible underneath, and is click-through by default. Bracket Battle is the first consumer and uses realistic gold-and-black dice with a restrained idle state plus a short full-screen roll event.

The first version is intentionally dice-only. The shell must be reusable by future game modes, but v1 should not introduce a generic effect marketplace or broad app-level scene manager.

## Goals

- Add a premium fullscreen-above-app stage overlay to the game page.
- Keep Three.js ownership out of Bracket Battle logic and UI components.
- Make the overlay reusable by other game modes without forcing them to adopt dice behavior immediately.
- Keep idle presentation visually rich but operationally quiet.
- Preserve current game outcome authority in existing domain logic.
- Keep the overlay safe for desktop, tablet, mobile, and reduced-motion cases.

## Non-Goals For V1

- No app-wide overlay manager outside the game surface.
- No 3D conversion of wheel, grid, or inspector UI.
- No effect-type abstraction beyond dice.
- No game-outcome randomness inside the overlay layer.
- No heavy post-processing stack as a requirement for the baseline experience.
- No constant high-motion background scene.

## Selected Direction

The chosen direction is a `game stage overlay shell + Bracket adapter`.

The shell belongs to the existing game page and owns the WebGL lifecycle. Bracket Battle only emits presentation commands into that shell. This gives the right reuse boundary without over-designing for hypothetical future effects.

The approved presentation envelope is:

- idle state: one realistic die resting in view;
- no camera drift and no continuous object motion;
- optional very subtle lighting shimmer only;
- roll state: short full-screen event over the app UI;
- settle state: brief result emphasis, then return to idle.

## Ownership And Placement

The overlay should mount with the game page, not with Bracket Battle directly and not at the application root.

This means:

- the overlay is available only while the game page is active;
- the game page owns shell mounting and teardown;
- the shell is visually above the stage and inspector surfaces;
- the app remains visible underneath the overlay during effects;
- pointer events pass through the overlay by default.

This avoids coupling overlay behavior to the app shell while still letting multiple game modes reuse the same stage layer later.

## Component Boundaries

Suggested file split:

- `src/components/windows/game/overlay/GameStageOverlayShell.vue`
- `src/components/windows/game/overlay/gameStageOverlayScene.ts`
- `src/components/windows/game/overlay/gameStageOverlayController.ts`
- `src/components/windows/game/overlay/gameStageOverlayTypes.ts`
- `src/components/windows/game/bracket/bracketBattleOverlayAdapter.ts`

Responsibilities:

- `GameStageOverlayShell.vue`
  - hosts the fixed/absolute overlay layer;
  - owns the renderer mount target;
  - connects the game page to the controller;
  - applies click-through and accessibility/presence behavior.

- `gameStageOverlayScene.ts`
  - builds the Three.js scene;
  - creates dice meshes, materials, camera, lights, and renderer;
  - runs idle, roll, and settle animation sequences;
  - owns disposal of GPU resources.

- `gameStageOverlayController.ts`
  - exposes a thin command API to the current game mode;
  - manages overlay state transitions;
  - chooses when to start or stop the active render loop.

- `gameStageOverlayTypes.ts`
  - defines the dice-only command and state shapes for v1.

- `bracketBattleOverlayAdapter.ts`
  - observes bracket UI/session state;
  - translates bracket actions into overlay commands;
  - contains no Three.js code.

Important rule: the shell must not contain bracket rules, and Bracket Battle must not contain rendering internals.

## Overlay Command Model

V1 can stay narrow. A small command model is enough:

- `enterIdle`
- `clear`
- `rollMatchStart`
- `rollMatchResolve`

`rollMatchStart` should carry only the presentation context needed for the dice event, such as left/right participant labels.

`rollMatchResolve` should carry the already-computed result, such as:

- left/right values;
- winning side;
- optional winner label for result emphasis.

The overlay must never derive or decide match outcomes itself.

## Bracket Battle Event Flow

1. Game page mounts the overlay shell.
2. Shell initializes and enters idle.
3. Bracket Battle panel triggers a roll.
4. Bracket adapter sends `rollMatchStart`.
5. Existing bracket domain resolves the real outcome.
6. Bracket adapter sends `rollMatchResolve`.
7. Overlay plays a short result beat and returns to idle.
8. Leaving the game page disposes the shell and scene.

This preserves current outcome authority while giving the overlay enough information to feel responsive and synchronized.

## Visual Direction

The approved visual direction is:

- realistic dice;
- black body material with gold detailing;
- richer lighting than the current flat UI;
- visible app context behind the overlay;
- no blank fullscreen canvas separation from the app.
- synthwave retro futuristic look and feel

Idle should feel premium but restrained. It should not read as a permanent animated attract mode.

Roll presentation should feel like a short event:

- dice wake up from rest;
- lighting intensifies;
- motion peaks during the roll;
- winner-side emphasis lands briefly;
- scene settles back to the resting die state.

The overlay should complement the existing app palette rather than invent a separate neon theme for the whole surface.

## Performance And Safety Rules

Performance rules for v1:

- lazy-load Three.js and overlay modules only for the game page;
- use a single renderer and canvas owned by the shell;
- keep pointer events disabled on the overlay by default;
- avoid always-on high-frequency animation in idle;
- run a full animation loop only during active roll/settle windows;
- reduce DPR, shadow quality, and material complexity on weaker devices before degrading the effect itself;
- respect reduced-motion by shortening or simplifying animation beats.

Idle rendering should be cheap. If subtle light shimmer is used, it must stay low-intensity and not create visual fatigue.

## Integration Constraints

- Existing wheel and mystery grid logic must keep working unchanged unless they explicitly opt into the overlay later.
- The overlay shell should attach to the current game coordinator/page rather than forcing a new top-level page structure.
- Bracket Battle should continue to function when the overlay is unavailable, disabled, or reduced by platform constraints.
- A failed WebGL initialization should fall back cleanly to the existing 2D/live UI with no blocked gameplay.

## Testing

Focused coverage should include:

- controller state transitions between idle, roll, settle, and clear;
- bracket adapter command emission order;
- shell mount/unmount lifecycle and disposal paths;
- reduced-motion and disabled/fallback behavior;
- game-page integration so the shell mounts only on the game surface;
- Bracket Battle flow remaining outcome-authoritative without overlay involvement.

Verification should include targeted frontend tests, `npm run typecheck`, and repo-level verification once implementation is complete.

## Follow-Up Work

- Let Wheel and future modes opt into the shell with their own adapters.
- Add additional stage effect types only after the dice shell proves stable.
- Revisit whether idle should gain minor environmental motion after the base experience is validated.
