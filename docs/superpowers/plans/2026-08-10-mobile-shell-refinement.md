# Mobile Shell Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the current lot the dominant mobile shell context, provide an accessible lot-switcher sheet, reduce persistent actions to one per screen, and refine navigation, safe areas, and mobile typography.

**Architecture:** Keep existing lot, workspace, sync, and entitlement methods authoritative. Add one focused mobile lot-switcher component backed by the existing shell capability port; add one pure navigation guard to `app-core`; keep action relocation inside the feature surface that owns the actions; centralize layout and typography measurements in design tokens.

**Tech Stack:** Vue 3 Options API, Vuetify 4, strict TypeScript, Vitest, Vue Testing Library/jsdom, CSS custom properties.

## Global Constraints

- The unified header applies at widths up to and including 600px.
- All interactive targets are at least 44x44px.
- Standard body copy remains at least 14px and form input text remains at least 16px.
- Personal mode is omitted from the permanent mobile header; shared-workspace context remains visible.
- No top-level screen exposes more than one persistent floating action.
- Existing lot selection, workspace scope, offline, sync, entitlement, and confirmation behavior remains authoritative.
- English and French copy must fit and French must use correct diacritics.
- Reuse existing components, helpers, capability ports, and methods before adding behavior.

---

### Task 1: Reusable Mobile Lot Switcher

**Files:**
- Create: `src/components/shell/MobileLotSwitcher.vue`
- Create: `src/components/shell/MobileLotSwitcher.ts`
- Create: `src/components/shell/MobileLotSwitcher.html`
- Create: `src/components/shell/MobileLotSwitcher.css`
- Modify: `src/components/shell/AppShellTopBar.ts`
- Modify: `src/components/shell/AppShellTopBar.html`
- Modify: `src/components/shell/AppShellTopBar.css`
- Modify: `src/components/shell/LotSelectorOnboardingBlock.html`
- Modify: `src/components/shell/LotSelectorOnboardingBlock.css`
- Modify: `src/app-core/i18n/locales/en/shell.json`
- Modify: `src/app-core/i18n/locales/fr/shell.json`
- Test: `tests/vue/mobile-shell.scenario.test.ts`

**Interfaces:**
- Consumes: `ShellPorts`, `LotOptionItem[]`, `filterLotOptionItems(items, query, language)`, `selectLot(lotId)`, `openRenameLotModal()`, and `showNewLotModal`.
- Produces: `MobileLotSwitcher`, which owns only `isOpen` and `searchQuery` presentation state.

- [ ] **Step 1: Write the failing mobile-shell scenarios**

Cover these observable behaviors with the real component and injected shell ports:

```ts
it("shows the current lot without a permanent personal label", () => {
  expect(screen.getByRole("button", { name: /current inventory/i })).toHaveTextContent("My Hero Academia");
  expect(screen.queryByText("Personal")).not.toBeInTheDocument();
});

it("opens, filters, and selects from the mobile lot sheet", async () => {
  await user.click(screen.getByRole("button", { name: /current inventory/i }));
  await user.type(screen.getByRole("searchbox"), "Kaiju");
  await user.click(screen.getByRole("option", { name: /Kaiju/i }));
  expect(currentLotId.value).toBe(2);
});
```

- [ ] **Step 2: Run the scenarios and verify RED**

Run: `npm run test:vue -- tests/vue/mobile-shell.scenario.test.ts`

Expected: FAIL because `MobileLotSwitcher` and its accessible mobile controls do not exist.

- [ ] **Step 3: Implement the minimal component and responsive composition**

Implement local sheet/filter state, derive the selected row from `lotItems`, call existing mutation methods, register the component in `AppShellTopBar`, and hide only the old selector card at `max-width: 600px`. Keep onboarding and no-lot recovery visible.

- [ ] **Step 4: Add localized sheet and action copy**

Add exact English/French keys for selecting, searching, creating, editing, closing, current scope, and empty results. Use `Lot` as the concise mobile navigation label.

- [ ] **Step 5: Run the scenarios and verify GREEN**

Run: `npm run test:vue -- tests/vue/mobile-shell.scenario.test.ts`

Expected: PASS.

### Task 2: Navigation Guard And Mobile Bottom Navigation

**Files:**
- Create: `src/app-core/methods/ui/common/shell-navigation.ts`
- Modify: `src/app-core/methods/ui.ts`
- Modify: `src/app-core/context/runtime.ts`
- Modify: `src/app-core/context/shell.ts`
- Modify: `src/App.html`
- Modify: `src/styles/app.css`
- Modify: `src/styles/design-tokens.css`
- Test: `tests/ui-shell-navigation.test.ts`

**Interfaces:**
- Produces: `selectPrimaryTab(tab: AppTab): void`.
- Behavior: `config` always selects; other tabs select only when `hasLotSelected`; blocked attempts call `notify(t("shellSelectLotFirstNotice"), "warning")` and preserve `currentTab`.

- [ ] **Step 1: Write failing navigation tests**

```ts
test("selectPrimaryTab explains lot-required destinations without navigating", () => {
  const context = createContext({ currentTab: "config", hasLotSelected: false });
  uiShellNavigationMethods.selectPrimaryTab.call(context, "sales");
  assert.equal(context.currentTab, "config");
  assert.deepEqual(context.notice, ["Select inventory first.", "warning"]);
});

test("selectPrimaryTab navigates when the destination is available", () => {
  const context = createContext({ currentTab: "config", hasLotSelected: true });
  uiShellNavigationMethods.selectPrimaryTab.call(context, "live");
  assert.equal(context.currentTab, "live");
});
```

- [ ] **Step 2: Run the navigation test and verify RED**

Run: `npm run test -- tests/ui-shell-navigation.test.ts`

Expected: FAIL because the navigation method does not exist.

- [ ] **Step 3: Implement and connect the navigation guard**

Replace direct bottom-navigation `v-model` writes with `:model-value` plus `@update:model-value="selectPrimaryTab"`. Use `aria-disabled` styling rather than native disabled controls so blocked destinations can explain themselves.

- [ ] **Step 4: Apply the compact active indicator**

Set the shared navigation height to `4rem`, keep targets at least 44px, place the selected surface on `.v-btn__content`, and use the mobile `Lot` label without changing the `config` tab value.

- [ ] **Step 5: Run navigation and shell tests and verify GREEN**

Run: `npm run test -- tests/ui-shell-navigation.test.ts tests/ui-shell-contract.test.ts`

Expected: PASS.

### Task 3: Single Contextual Action Contract

**Files:**
- Modify: `src/App.html`
- Modify: `src/components/windows/live/LiveWindow.html`
- Modify: `src/components/windows/live/LiveWindow.css`
- Modify: `src/components/windows/live/LiveWindow.definition.ts`
- Modify: `src/components/windows/live/liveWindowPorts.ts`
- Test: `tests/vue/mobile-shell.scenario.test.ts`
- Test: `tests/game-window-facade.test.ts`

**Interfaces:**
- Live owns a labeled overflow menu calling existing `resetLivePrices`, `applyLivePricesToDefaults`, and confirmed `clearLiveSinglesSelection` methods.
- Game's single Controls FAB calls `openWheelInspector(wheelMode === "live" ? "session" : "config")`; history and end-session remain available inside the inspector.

- [ ] **Step 1: Add failing scenarios for action count and relocated Live actions**

Assert that each tab/type fixture exposes no more than one persistent `.app-context-action`, and that the Live overflow invokes the real capability boundary while destructive clear still requests confirmation.

- [ ] **Step 2: Run the focused scenarios and verify RED**

Run: `npm run test:vue -- tests/vue/mobile-shell.scenario.test.ts`

Expected: FAIL because Live and Game still expose multiple persistent actions and Live has no owned overflow.

- [ ] **Step 3: Remove duplicate persistent actions and add the Live menu**

Keep Config singles add, Live calculator, Sales add, Game Controls, and Portfolio report as the only persistent actions. Delete unused multi-slot wrappers and preserve Pro/disabled guards.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm run test:vue -- tests/vue/mobile-shell.scenario.test.ts`

Run: `npm run test -- tests/game-window-facade.test.ts`

Expected: PASS.

### Task 4: Shared Clearance And Mobile Typography

**Files:**
- Modify: `src/styles/design-tokens.css`
- Modify: `src/styles/app.css`
- Modify: `src/components/shell/MobileLotSwitcher.css`
- Modify: `src/components/shell/AppShellTopBar.css`
- Modify: `docs/UIrefinement.md`
- Test: `tests/ui-shell-contract.test.ts`
- Test: `tests/ui-dense-card-legibility.test.ts`

**Interfaces:**
- Produces mobile semantic tokens for 11px navigation labels, 12px metadata/captions, 13px helper text, 14px body copy, a 64px navigation height, and content clearance for one 56px floating action.

- [ ] **Step 1: Update the shell contract tests to describe the new token contract**

Assert one action slot, `--app-bottom-nav-height: 4rem`, a single-action content-clearance token, 44px targets, and mobile typography overrides.

- [ ] **Step 2: Run the shell contract tests and verify RED**

Run: `npm run test -- tests/ui-shell-contract.test.ts tests/ui-dense-card-legibility.test.ts`

Expected: FAIL against the legacy three-slot/72px shell contract.

- [ ] **Step 3: Implement centralized tokens and remove superseded slot CSS**

Use token overrides at `max-width: 600px`; do not shrink form inputs or primary metric values. Update the active UI backlog only for completed mobile shell overlay work, preserving remaining visual QA follow-up.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm run test -- tests/ui-shell-contract.test.ts tests/ui-dense-card-legibility.test.ts`

Expected: PASS.

- [ ] **Step 5: Run final web verification**

Run: `npm run test:vue`

Run: `npm run verify`

Run: `git diff --check`

Expected: all commands exit 0.

