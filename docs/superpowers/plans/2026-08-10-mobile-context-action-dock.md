# Mobile Context Action Dock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore one-tap mobile access to Game Session and bulk Live price saving while keeping secondary actions discoverable in one reusable dock.

**Architecture:** Add a presentation-only `ContextActionDock` component that renders one direct FAB plus one secondary-actions FAB and emits typed action ids. Live and Game own their action descriptors and route emitted ids to existing capability methods; the root shell stops owning their feature-specific actions.

**Tech Stack:** Vue 3 Options API, Vuetify 4, strict TypeScript, Vitest, Vue Testing Library/jsdom, CSS custom properties.

## Global Constraints

- Game Session is directly accessible in config/preview and live modes.
- Bulk Live Save prices remains a direct one-tap action.
- Existing confirmations, Pro access, inspector state, and persistence methods remain authoritative.
- The dock has at most two persistent controls and uses the shared safe-area offset.
- English and French labels use the existing translation system and correct French diacritics.

---

### Task 1: Reusable Context Action Dock

**Files:**
- Create: `src/components/shell/ContextActionDock.vue`
- Create: `src/components/shell/ContextActionDock.ts`
- Create: `src/components/shell/ContextActionDock.html`
- Create: `src/components/shell/ContextActionDock.css`
- Test: `tests/vue/context-action-dock.scenario.test.ts`

**Interfaces:**
- Produces: `ContextActionDockAction = { id: string; icon: string; color: string; label: string; disabled?: boolean }`.
- Props: `primaryAction: ContextActionDockAction`, `secondaryActions: ContextActionDockAction[]`, `secondaryLabel: string`, and optional `badgeLabel: string`.
- Emits: `activate(actionId: string)`.

- [x] **Step 1: Write a failing DOM test** proving the component renders exactly two persistent controls, opens labeled secondary rows, emits primary and secondary ids, and respects disabled actions.
- [x] **Step 2: Run `npm run test:vue -- tests/vue/context-action-dock.scenario.test.ts`** and verify failure because the component does not exist.
- [x] **Step 3: Implement the minimal component** with a direct primary FAB and a secondary `v-menu` FAB; keep all business behavior outside it.
- [x] **Step 4: Rerun the focused Vue test** and verify it passes.

### Task 2: Live Action Ownership

**Files:**
- Modify: `src/components/windows/live/LiveWindow.ts`
- Modify: `src/components/windows/live/LiveWindow.definition.ts`
- Modify: `src/components/windows/live/LiveWindow.html`
- Modify: `src/components/windows/live/LiveWindow.css`
- Modify: `src/components/windows/live/liveWindowPorts.ts`
- Modify: `src/app-core/i18n/locales/en/shell.json`
- Modify: `src/app-core/i18n/locales/fr/shell.json`
- Modify: `src/App.html`
- Test: `tests/live-window-actions.test.ts`

**Interfaces:**
- Bulk primary id `save` calls `applyLivePricesToDefaults()`.
- Singles primary id `calculator` calls `accessProFeature("autoCalculate")`.
- Secondary ids `calculator`, `reset`, and `clear` call the existing capability paths; `clear` calls `confirmClearLiveSingles()`.

- [x] **Step 1: Add failing tests** for bulk direct Save, bulk Calculator/Reset secondary actions, Singles direct Calculator, and Singles Reset/Clear secondary actions.
- [x] **Step 2: Run `npm run test -- tests/live-window-actions.test.ts`** and verify the new action contract is missing.
- [x] **Step 3: Implement typed Live descriptors and routing**, register the shared dock, add `accessProFeature` to the Live capability port, and remove the old top toolbar plus root Live FAB.
- [x] **Step 4: Rerun the focused Live tests** and verify they pass.

### Task 3: Always-Accessible Game Session

**Files:**
- Modify: `src/components/windows/game/GameWindow.ts`
- Modify: `src/components/windows/game/coordinator/GameWindow.definition.ts`
- Modify: `src/components/windows/game/coordinator/GameWindow.html`
- Modify: `src/components/windows/game/inspector/wheelInspectorComputeds.ts`
- Modify: `src/App.html`
- Test: `tests/game-window-facade.test.ts`

**Interfaces:**
- `wheelContextPrimaryAction` always targets `session`.
- `wheelContextSecondaryActions` contains Builder plus History in config mode, and History plus End Game in live mode.
- `activateWheelContextAction(id)` delegates to `openWheelInspector(targetTab)` or `requestWheelSessionEnd()`.

- [x] **Step 1: Add failing tests** proving Session is primary in both modes and secondary action ids preserve Builder, History, and End Game.
- [x] **Step 2: Run `npm run test -- tests/game-window-facade.test.ts`** and verify failure against the single Controls FAB.
- [x] **Step 3: Register and render the shared dock inside GameWindow**, route its ids through existing methods, and remove the root Game FAB.
- [x] **Step 4: Rerun the focused Game tests** and verify they pass.

### Task 4: Shell Contract And Verification

**Files:**
- Modify: `src/styles/app.css`
- Modify: `tests/ui-shell-contract.test.ts`
- Test: `tests/vue/context-action-dock.scenario.test.ts`

**Interfaces:**
- Root persistent actions remain for Config, Sales, and Portfolio only.
- Live and Game use `.app-context-action-dock` with `--app-context-action-bottom-1` and the existing inline safe-area offset.

- [x] **Step 1: Update the shell regression contract** to reject root-owned Live/Game FABs and require the reusable two-control dock without retired vertical action rails.
- [x] **Step 2: Run focused unit and Vue tests** and fix only contract integration issues.
- [x] **Step 3: Run `npm run verify`**, the mobile visual smoke path, and `git diff --check`.
- [x] **Step 4: Inspect the mobile Live and Game screenshots** for nav clearance, menu readability, and one-tap Session/Save access.
