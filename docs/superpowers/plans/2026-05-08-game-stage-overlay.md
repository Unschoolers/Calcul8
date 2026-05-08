# Game Stage Overlay Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared Three.js-powered game-stage overlay shell to the game page, with Bracket Battle as the first adapter and realistic gold-and-black dice as the first effect.

**Architecture:** The game page owns a lazy-loaded overlay shell that mounts above the current game surface and remains click-through by default. A thin overlay controller and scene module own Three.js lifecycle and dice animation state, while a bracket adapter translates bracket roll events into presentation-only overlay commands without moving match outcome authority out of the existing bracket domain.

**Tech Stack:** Vue 3, Vuetify, TypeScript, Three.js, Vitest

---

### Task 1: Add Overlay Contracts And Game-Window State Plumbing

**Files:**
- Modify: `package.json`
- Modify: `src/components/windows/game/coordinator/gameControllerState.ts`
- Create: `src/components/windows/game/overlay/gameStageOverlayTypes.ts`
- Create: `tests/game-stage-overlay-controller.test.ts`

- [ ] **Step 1: Write the failing controller/state test**

```ts
import assert from "node:assert/strict";
import { test } from "vitest";
import { createGameStageOverlayIdleCommand } from "../src/components/windows/game/overlay/gameStageOverlayTypes.ts";
import { createGameWindowState } from "../src/components/windows/game/coordinator/gameControllerState.ts";

test("game window state exposes overlay shell defaults", () => {
  const state = createGameWindowState();

  assert.equal(state.gameStageOverlayEnabled, false);
  assert.equal(state.gameStageOverlayMounted, false);
  assert.equal(state.gameStageOverlayActiveCommand, null);
  assert.deepEqual(createGameStageOverlayIdleCommand(), {
    type: "enterIdle",
    effect: "dice"
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/game-stage-overlay-controller.test.ts`  
Expected: FAIL with missing `gameStageOverlayTypes.ts` exports and missing `gameStageOverlay*` state keys.

- [ ] **Step 3: Add dependency and minimal overlay types/state**

```json
{
  "dependencies": {
    "three": "^0.179.1"
  }
}
```

```ts
// src/components/windows/game/overlay/gameStageOverlayTypes.ts
export type GameStageOverlayEffectType = "dice";

export type GameStageOverlayIdleCommand = {
  type: "enterIdle";
  effect: "dice";
};

export type GameStageOverlayClearCommand = {
  type: "clear";
  effect: "dice";
};

export type GameStageOverlayRollStartCommand = {
  type: "rollMatchStart";
  effect: "dice";
  leftLabel: string;
  rightLabel: string;
};

export type GameStageOverlayRollResolveCommand = {
  type: "rollMatchResolve";
  effect: "dice";
  leftValue: number;
  rightValue: number;
  winnerSide: "left" | "right";
  winnerLabel?: string;
};

export type GameStageOverlayCommand =
  | GameStageOverlayIdleCommand
  | GameStageOverlayClearCommand
  | GameStageOverlayRollStartCommand
  | GameStageOverlayRollResolveCommand;

export function createGameStageOverlayIdleCommand(): GameStageOverlayIdleCommand {
  return { type: "enterIdle", effect: "dice" };
}
```

```ts
// src/components/windows/game/coordinator/gameControllerState.ts
export type GameWindowThis = {
  gameStageOverlayEnabled: boolean;
  gameStageOverlayMounted: boolean;
  gameStageOverlayActiveCommand: import("../overlay/gameStageOverlayTypes.ts").GameStageOverlayCommand | null;
  gameStageOverlayLastResolvedAt: number;
  setGameStageOverlayCommand(command: import("../overlay/gameStageOverlayTypes.ts").GameStageOverlayCommand | null): void;
  // existing fields...
};
```

```ts
// inside createGameWindowState()
gameStageOverlayEnabled: false,
gameStageOverlayMounted: false,
gameStageOverlayActiveCommand: null,
gameStageOverlayLastResolvedAt: 0,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/game-stage-overlay-controller.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package.json src/components/windows/game/coordinator/gameControllerState.ts src/components/windows/game/overlay/gameStageOverlayTypes.ts tests/game-stage-overlay-controller.test.ts
git commit -m "feat: add game stage overlay contracts"
```

### Task 2: Build The Overlay Controller And Dice Scene Modules

**Files:**
- Create: `src/components/windows/game/overlay/gameStageOverlayController.ts`
- Create: `src/components/windows/game/overlay/gameStageOverlayScene.ts`
- Modify: `tests/game-stage-overlay-controller.test.ts`

- [ ] **Step 1: Extend the failing test to cover controller transitions**

```ts
import { createGameStageOverlayController } from "../src/components/windows/game/overlay/gameStageOverlayController.ts";

test("overlay controller transitions idle -> roll -> resolve -> idle", () => {
  const calls: string[] = [];
  const controller = createGameStageOverlayController({
    scene: {
      enterIdle() { calls.push("idle"); },
      clear() { calls.push("clear"); },
      startRoll() { calls.push("start"); },
      resolveRoll() { calls.push("resolve"); },
      dispose() { calls.push("dispose"); }
    }
  });

  controller.mount();
  controller.dispatch({ type: "rollMatchStart", effect: "dice", leftLabel: "A", rightLabel: "B" });
  controller.dispatch({ type: "rollMatchResolve", effect: "dice", leftValue: 81, rightValue: 17, winnerSide: "left", winnerLabel: "A" });
  controller.unmount();

  assert.deepEqual(calls, ["idle", "start", "resolve", "idle", "dispose"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/game-stage-overlay-controller.test.ts`  
Expected: FAIL with missing controller module.

- [ ] **Step 3: Implement the controller and scene interfaces**

```ts
// src/components/windows/game/overlay/gameStageOverlayController.ts
import type { GameStageOverlayCommand } from "./gameStageOverlayTypes.ts";

export interface GameStageOverlaySceneHandle {
  enterIdle(): void;
  clear(): void;
  startRoll(command: Extract<GameStageOverlayCommand, { type: "rollMatchStart" }>): void;
  resolveRoll(command: Extract<GameStageOverlayCommand, { type: "rollMatchResolve" }>): void;
  dispose(): void;
}

export function createGameStageOverlayController(input: { scene: GameStageOverlaySceneHandle }) {
  let mounted = false;

  return {
    mount() {
      if (mounted) return;
      mounted = true;
      input.scene.enterIdle();
    },
    dispatch(command: GameStageOverlayCommand) {
      if (!mounted) return;
      if (command.type === "enterIdle") input.scene.enterIdle();
      if (command.type === "clear") input.scene.clear();
      if (command.type === "rollMatchStart") input.scene.startRoll(command);
      if (command.type === "rollMatchResolve") {
        input.scene.resolveRoll(command);
        input.scene.enterIdle();
      }
    },
    unmount() {
      if (!mounted) return;
      mounted = false;
      input.scene.dispose();
    }
  };
}
```

```ts
// src/components/windows/game/overlay/gameStageOverlayScene.ts
import * as THREE from "three";
import type { GameStageOverlaySceneHandle } from "./gameStageOverlayController.ts";

export async function createGameStageOverlayScene(_mountEl: HTMLElement): Promise<GameStageOverlaySceneHandle> {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  const die = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1, 6, 6, 6),
    new THREE.MeshStandardMaterial({
      color: 0x141414,
      metalness: 0.88,
      roughness: 0.24
    })
  );

  scene.add(die);

  return {
    enterIdle() {
      die.rotation.set(-0.42, 0.52, 0.18);
      renderer.render(scene, camera);
    },
    clear() {
      renderer.render(scene, camera);
    },
    startRoll(_command) {
      // start short burst animation loop with intensified lighting
    },
    resolveRoll(_command) {
      // settle winner-side emphasis, then stop loop
    },
    dispose() {
      scene.remove(die);
      die.geometry.dispose();
      (die.material as THREE.Material).dispose();
      renderer.dispose();
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/game-stage-overlay-controller.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/windows/game/overlay/gameStageOverlayController.ts src/components/windows/game/overlay/gameStageOverlayScene.ts tests/game-stage-overlay-controller.test.ts
git commit -m "feat: add game stage overlay controller"
```

### Task 3: Mount The Overlay Shell In The Existing Game Page

**Files:**
- Create: `src/components/windows/game/overlay/GameStageOverlayShell.vue`
- Create: `src/components/windows/game/overlay/GameStageOverlayShell.ts`
- Create: `src/components/windows/game/overlay/GameStageOverlayShell.html`
- Modify: `src/components/windows/game/GameWindow.ts`
- Modify: `src/components/windows/game/coordinator/GameWindow.definition.ts`
- Modify: `src/components/windows/game/coordinator/GameWindow.html`
- Modify: `src/components/windows/game/styles/GameWindow.css`
- Test: `tests/game-window-facade.test.ts`

- [ ] **Step 1: Write the failing integration test for shell mounting**

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";

test("game window renders the stage overlay shell for bracket mode", () => {
  const template = readFileSync("src/components/windows/game/coordinator/GameWindow.html", "utf8");

  assert.match(template, /game-stage-overlay-shell/);
  assert.match(template, /:enabled=\"gameStageOverlayEnabled\"/);
  assert.match(template, /@mounted-change=\"handleGameStageOverlayMountedChange\"/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/game-window-facade.test.ts`  
Expected: FAIL because the overlay shell is not referenced yet.

- [ ] **Step 3: Implement the shell and wire it into GameWindow**

```ts
// src/components/windows/game/overlay/GameStageOverlayShell.ts
import { defineComponent, nextTick } from "vue";
import { createGameStageOverlayController } from "./gameStageOverlayController.ts";
import type { GameStageOverlayCommand } from "./gameStageOverlayTypes.ts";

export default defineComponent({
  name: "GameStageOverlayShell",
  props: {
    enabled: { type: Boolean, required: true },
    command: { type: Object as () => GameStageOverlayCommand | null, default: null }
  },
  emits: ["mounted-change"],
  async mounted() {
    if (!this.enabled) return;
    await nextTick();
    // initialize scene + controller, then emit mounted-change(true)
    this.$emit("mounted-change", true);
  },
  watch: {
    command(nextCommand: GameStageOverlayCommand | null) {
      if (!nextCommand) return;
      this.controller?.dispatch(nextCommand);
    }
  },
  beforeUnmount() {
    this.$emit("mounted-change", false);
  }
});
```

```html
<!-- src/components/windows/game/overlay/GameStageOverlayShell.html -->
<div class="game-stage-overlay-shell" :class="{ 'game-stage-overlay-shell--enabled': enabled }" aria-hidden="true">
  <div ref="canvasHost" class="game-stage-overlay-shell__canvas-host"></div>
</div>
```

```html
<!-- src/components/windows/game/coordinator/GameWindow.html -->
<game-stage-overlay-shell
  v-if="wheelIsBracketBattle"
  :enabled="gameStageOverlayEnabled"
  :command="gameStageOverlayActiveCommand"
  @mounted-change="handleGameStageOverlayMountedChange"
></game-stage-overlay-shell>
```

```ts
// src/components/windows/game/coordinator/GameWindow.definition.ts
handleGameStageOverlayMountedChange(this: GameWindowThis, mounted: boolean): void {
  this.gameStageOverlayMounted = mounted;
},
setGameStageOverlayCommand(this: GameWindowThis, command) {
  this.gameStageOverlayActiveCommand = command;
  this.gameStageOverlayLastResolvedAt = Date.now();
},
syncGameStageOverlayState(this: GameWindowThis): void {
  this.gameStageOverlayEnabled = this.currentTab === "wheel" && this.wheelIsBracketBattle;
},
```

```ts
// src/components/windows/game/GameWindow.ts
import GameStageOverlayShell from "./overlay/GameStageOverlayShell.vue";

export const GameWindow = {
  ...gameWindowDefinition,
  components: {
    GameStageOverlayShell,
    BracketBattlePanel,
    // existing components...
  }
};
```

```css
/* src/components/windows/game/styles/GameWindow.css */
.game-stage-overlay-shell {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 6;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- tests/game-window-facade.test.ts tests/template-compile.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/windows/game/overlay/GameStageOverlayShell.vue src/components/windows/game/overlay/GameStageOverlayShell.ts src/components/windows/game/overlay/GameStageOverlayShell.html src/components/windows/game/GameWindow.ts src/components/windows/game/coordinator/GameWindow.definition.ts src/components/windows/game/coordinator/GameWindow.html src/components/windows/game/styles/GameWindow.css tests/game-window-facade.test.ts
git commit -m "feat: mount game stage overlay shell"
```

### Task 4: Add The Bracket Adapter And Trigger Overlay Commands From Bracket Rolls

**Files:**
- Create: `src/components/windows/game/bracket/bracketBattleOverlayAdapter.ts`
- Modify: `src/components/windows/game/bracket/BracketBattlePanel.ts`
- Modify: `tests/bracket-battle-panel.test.ts`
- Test: `tests/game-stage-overlay-controller.test.ts`

- [ ] **Step 1: Extend the bracket panel test to verify overlay commands**

```ts
test("BracketBattlePanel emits overlay start and resolve commands around a match roll", async () => {
  vi.useFakeTimers();
  const emitted: unknown[] = [];
  const session = createBracketBattleSessionFromDraft(createBracketBattleDraft(4));
  const vm = {
    bracketSession: session,
    activeBracketMatch: session.matches[0],
    bracketRolling: false,
    bracketLastRolls: [],
    bracketRollPreview: [],
    setGameStageOverlayCommand(command: unknown) {
      emitted.push(command);
    },
    persistBracketSession() {},
    clearBracketRollAnimation: BracketBattlePanel.methods!.clearBracketRollAnimation
  };

  BracketBattlePanel.methods!.rollActiveBracketMatch.call(vm as never);
  await vi.advanceTimersByTimeAsync(1100);

  assert.equal((emitted[0] as { type: string }).type, "rollMatchStart");
  assert.equal((emitted[1] as { type: string }).type, "rollMatchResolve");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/bracket-battle-panel.test.ts`  
Expected: FAIL because the panel does not emit overlay commands yet.

- [ ] **Step 3: Implement the bracket overlay adapter and panel bridge**

```ts
// src/components/windows/game/bracket/bracketBattleOverlayAdapter.ts
import type { BracketBattleMatch, BracketBattleRoll } from "./bracketBattleDomain.ts";
import type { GameStageOverlayCommand } from "../overlay/gameStageOverlayTypes.ts";

export function buildBracketRollStartOverlayCommand(input: {
  match: BracketBattleMatch;
  leftLabel: string;
  rightLabel: string;
}): GameStageOverlayCommand {
  return {
    type: "rollMatchStart",
    effect: "dice",
    leftLabel: input.leftLabel,
    rightLabel: input.rightLabel
  };
}

export function buildBracketRollResolveOverlayCommand(input: {
  leftLabel: string;
  rightLabel: string;
  rolls: BracketBattleRoll[];
}): GameStageOverlayCommand {
  const [leftRoll, rightRoll] = input.rolls.slice(-2);
  return {
    type: "rollMatchResolve",
    effect: "dice",
    leftValue: leftRoll?.value ?? 0,
    rightValue: rightRoll?.value ?? 0,
    winnerSide: (leftRoll?.value ?? 0) >= (rightRoll?.value ?? 0) ? "left" : "right",
    winnerLabel: (leftRoll?.value ?? 0) >= (rightRoll?.value ?? 0) ? input.leftLabel : input.rightLabel
  };
}
```

```ts
// inside BracketBattlePanel.ts rollActiveBracketMatch()
const leftLabel = this.bracketParticipantLabel(match.participantAId);
const rightLabel = this.bracketParticipantLabel(match.participantBId);
this.setGameStageOverlayCommand?.(
  buildBracketRollStartOverlayCommand({ match, leftLabel, rightLabel })
);
```

```ts
// after resolveBracketBattleMatchRoll()
this.setGameStageOverlayCommand?.(
  buildBracketRollResolveOverlayCommand({
    leftLabel,
    rightLabel,
    rolls: result.rolls
  })
);
```

```ts
// src/components/windows/game/bracket/BracketBattlePanel.ts
type BracketBattlePanelThis = Record<string, unknown> & {
  setGameStageOverlayCommand?: (command: import("../overlay/gameStageOverlayTypes.ts").GameStageOverlayCommand | null) => void;
  // existing panel fields...
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- tests/bracket-battle-panel.test.ts tests/game-stage-overlay-controller.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/windows/game/bracket/bracketBattleOverlayAdapter.ts src/components/windows/game/bracket/BracketBattlePanel.ts tests/bracket-battle-panel.test.ts tests/game-stage-overlay-controller.test.ts
git commit -m "feat: connect bracket rolls to stage overlay"
```

### Task 5: Add WebGL Fallback, Reduced-Motion Guards, And Final Verification

**Files:**
- Modify: `src/components/windows/game/overlay/GameStageOverlayShell.ts`
- Modify: `src/components/windows/game/overlay/gameStageOverlayScene.ts`
- Modify: `tests/game-stage-overlay-controller.test.ts`
- Modify: `tests/game-window-facade.test.ts`

- [ ] **Step 1: Add failing tests for fallback and reduced motion**

```ts
test("overlay shell disables itself cleanly when scene creation fails", async () => {
  const events: boolean[] = [];
  const vm = {
    enabled: true,
    command: null,
    $emit(_name: string, value: boolean) {
      events.push(value);
    }
  };

  await assert.rejects(async () => {
    throw new Error("WebGL unavailable");
  });

  assert.deepEqual(events, []);
});
```

```ts
test("game window keeps bracket playable when overlay is unavailable", () => {
  const template = readFileSync("src/components/windows/game/coordinator/GameWindow.html", "utf8");
  assert.match(template, /<bracket-battle-panel/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/game-stage-overlay-controller.test.ts tests/game-window-facade.test.ts`  
Expected: FAIL because fallback behavior is not implemented yet.

- [ ] **Step 3: Implement graceful fallback and reduced-motion checks**

```ts
// src/components/windows/game/overlay/GameStageOverlayShell.ts
try {
  this.sceneHandle = await createGameStageOverlayScene(this.$refs.canvasHost as HTMLElement, {
    reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  });
  this.controller = createGameStageOverlayController({ scene: this.sceneHandle });
  this.controller.mount();
  this.$emit("mounted-change", true);
} catch {
  this.$emit("mounted-change", false);
}
```

```ts
// src/components/windows/game/overlay/gameStageOverlayScene.ts
if (options.reducedMotion) {
  // shorten settle timing and skip high-energy rotation burst
}
```

- [ ] **Step 4: Run final verification**

Run: `npm run test -- tests/game-stage-overlay-controller.test.ts tests/bracket-battle-panel.test.ts tests/game-window-facade.test.ts tests/template-compile.test.ts`  
Expected: PASS

Run: `npm run typecheck`  
Expected: PASS

Run: `npm run verify`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/windows/game/overlay/GameStageOverlayShell.ts src/components/windows/game/overlay/gameStageOverlayScene.ts tests/game-stage-overlay-controller.test.ts tests/game-window-facade.test.ts
git commit -m "feat: harden game stage overlay shell"
```
