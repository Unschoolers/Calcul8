# Responsive UI Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every Calcul8 dialog and editable form consistent responsive spacing, focus, scrolling, text containment, shell positioning, and 44px touch behavior.

**Architecture:** Add a presentation-only `AppDialogShell` as the sole owner of `v-dialog`, plus an `AppFormLayout` scaffold shared by dialog, sheet, card, and page forms. Keep domain state and methods in existing feature components, centralize viewport and touch measurements in design tokens, and enforce the boundaries with DOM scenarios and source-contract tests.

**Tech Stack:** Vue 3 Options API, strict TypeScript, Vuetify 4, component templates/styles split into `.ts`/`.html`/`.css`/`.vue`, Vitest, Vue Testing Library, jsdom, Playwright visual smoke checks.

## Global Constraints

- `AppDialogShell` is the only application component allowed to render `v-dialog` directly.
- The mobile lot switcher and singles row editor remain the only intentional `v-bottom-sheet` owners.
- Editable, confirmation, report, checkout, and import dialogs become fullscreen at widths up to and including 600px; view-only media previews may remain inset.
- Every actionable control has a minimum 44 by 44 CSS-pixel hit area.
- Form input text remains at least 16px and standard body copy remains at least 14px on mobile.
- Required text must remain readable without page-level horizontal scrolling from 320px through 600px.
- English and French, including French diacritics, must be verified independently.
- Persistent screen actions remain in `.app-shell-action-zone`; overlay actions remain inside their overlay.
- Existing validation, persistence, sync, confirmation, entitlement, and desktop behavior must remain unchanged.
- Styling must use theme-aware Vuetify variables and shared application tokens.
- Use fast Vue DOM and source-contract tests while iterating; run `npm run verify` before completion.

---

## File Structure

### New shared components

- `src/components/ui/AppDialogShell.vue` — single-file entry that composes the split script, template, and style.
- `src/components/ui/AppDialogShell.ts` — typed dialog props, classes, visibility events, and focus capture/restoration.
- `src/components/ui/AppDialogShell.html` — the only direct `v-dialog`, semantic title/description, content region, and sticky actions.
- `src/components/ui/AppDialogShell.css` — responsive overlay sizing, safe areas, scrolling, title/action containment, and variants.
- `src/components/ui/AppFormLayout.vue` — single-file entry for the form scaffold.
- `src/components/ui/AppFormLayout.ts` — typed compact/responsive/sticky presentation props.
- `src/components/ui/AppFormLayout.html` — header, validation, field, helper, and action slots.
- `src/components/ui/AppFormLayout.css` — spacing, responsive field grid, stacking, and text containment.

### Shared files to modify

- `src/styles/design-tokens.css` — semantic shell, overlay, form, touch, and text-fit measurements.
- `src/styles/app.css` — global shell zones, touch-target utility, overlay frame, and mobile text utilities.
- `src/components/ui/AppActionButton.html` — opt into the touch-target class contract.
- `src/components/ui/AppConfirmDialog.ts` — register and delegate to `AppDialogShell`.
- `src/components/ui/AppConfirmDialog.html` — remove direct `v-dialog` and use the shell slots.
- `src/components/ui/AppStickyActionFooter.html` — wrap actions predictably at narrow widths.

### Migration groups

- Root/shell: `src/App.ts`, `src/App.html`, `src/components/shell/SystemConfigurationDialog.*`, `WorkspaceModals.*`, `SaleEditorModal.*`, `PortfolioReportModal.*`.
- Commerce/customer/import: `src/components/modals/AutoCalculateModal.*`, `src/components/customers/BuyerQuickViewModal.*`, `src/components/windows/whatnot/WhatnotCsvImportDialog.*`, `WhatnotReviewDialog.*`.
- Singles/Live: `src/components/windows/singles/SinglesConfigWindow.*`, `SinglesCsvImportDialog.*`, `SinglesPurchasingCard.*`, `src/components/windows/live/LiveSinglesPanel.*`.
- Game/portfolio: `src/components/windows/game/coordinator/GameWindow.*`, `dialogs/WheelCreateGameDialog.*`, `dialogs/GameSpectatorDialog.*`, `bracket/BracketBattlePanel.*`, `bracket/BracketBattleBuilder.*`, `inspector/WheelInspector.*`, `inspector/WheelTierCard.*`, `stage/WheelStageTopbar.*`, `src/components/windows/portfolio/PortfolioWindow.*`.
- Page forms: `src/components/windows/config/ConfigWindow.*`, `AdminSyncImportCard.*`, and field-containing templates listed above.

### Tests

- `tests/vue/app-dialog-shell.scenario.test.ts` — dialog semantics, responsive classes, focus, dismissal, and action layout.
- `tests/vue/app-form-layout.scenario.test.ts` — form slot structure, responsive classes, long copy, and stacked actions.
- `tests/ui-responsive-contract.test.ts` — direct-dialog allowlist, bottom-sheet allowlist, shell-offset guards, touch contract, and form migration inventory.
- `tests/vue/workflow-dialogs.scenario.test.ts` — representative migrated workflows.
- `tests/vue/mobile-shell.scenario.test.ts` — action-layer and clearance behavior.
- `tests/vue/singles-config-window-render.scenario.test.ts` — singles sheet/form/text containment.
- `tests/vue/live-price-card.scenario.test.ts` and `tests/live-singles-panel.test.ts` — Live touch targets and mobile content clearance.
- `tests/ui-visual-smoke.test.ts`, `tests/visual/visual-smoke.spec.ts`, and `tests/visual/helpers/visualSmokeState.ts` — narrow English/French dialog and form states.

---

### Task 1: Lock the responsive contracts with failing source tests

**Files:**
- Create: `tests/ui-responsive-contract.test.ts`
- Reference: `docs/superpowers/specs/2026-08-11-responsive-ui-foundation-design.md`

**Interfaces:**
- Consumes: current source tree and existing Vitest filesystem-test pattern.
- Produces: `collectSourceFiles(root: string, extensions: ReadonlySet<string>): string[]` and regression assertions used throughout the migration.

- [ ] **Step 1: Write the recursive source collector and direct-overlay assertions**

```ts
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { test } from "vitest";

const sourceRoot = "src";

function collectSourceFiles(root: string, extensions: ReadonlySet<string>): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(path, extensions);
    return extensions.has(extname(entry.name)) ? [path.replaceAll("\\", "/")] : [];
  });
}

test("only AppDialogShell owns v-dialog", () => {
  const offenders = collectSourceFiles(sourceRoot, new Set([".html", ".vue"]))
    .filter((path) => /<v-dialog\b/.test(readFileSync(path, "utf8")))
    .map((path) => relative(".", path).replaceAll("\\", "/"));
  assert.deepEqual(offenders, ["src/components/ui/AppDialogShell.html"]);
});

test("only intentional mobile editors own v-bottom-sheet", () => {
  const owners = collectSourceFiles(sourceRoot, new Set([".html", ".vue"]))
    .filter((path) => /<v-bottom-sheet\b/.test(readFileSync(path, "utf8")))
    .map((path) => relative(".", path).replaceAll("\\", "/"))
    .sort();
  assert.deepEqual(owners, [
    "src/components/shell/MobileLotSwitcher.html",
    "src/components/windows/singles/SinglesConfigWindow.html"
  ]);
});
```

- [ ] **Step 2: Add failing token, offset, and migration assertions**

```ts
test("responsive layout tokens distinguish navigation and action clearance", () => {
  const tokens = readFileSync("src/styles/design-tokens.css", "utf8");
  for (const name of [
    "--app-shell-content-clearance-nav",
    "--app-shell-content-clearance-actions",
    "--app-sticky-content-top",
    "--app-form-mobile-inline-padding",
    "--app-touch-target-min"
  ]) assert.match(tokens, new RegExp(name));
});

test("feature styles do not encode shell chrome measurements", () => {
  const guarded = [
    "src/components/windows/game/styles/wheel-stage.css",
    "src/components/windows/game/styles/wheel-mobile.css",
    "src/components/windows/singles/SinglesConfigWindow.css",
    "src/components/windows/live/LiveSinglesPanel.css"
  ].map((path) => readFileSync(path, "utf8")).join("\n");
  assert.doesNotMatch(guarded, /calc\((?:72px|108px|7rem|2\.7rem|8\.5rem)\s*\+/);
});
```

- [ ] **Step 3: Run the contract file and confirm it fails for the intended legacy markup**

Run: `npm run test -- tests/ui-responsive-contract.test.ts`

Expected: FAIL because direct dialogs, old offsets, and the new semantic tokens still do not satisfy the contract.

- [ ] **Step 4: Commit the red contract test**

```powershell
git add tests/ui-responsive-contract.test.ts
git commit -m "test: define responsive ui contracts"
```

---

### Task 2: Add semantic tokens and the shared dialog shell

**Files:**
- Create: `src/components/ui/AppDialogShell.vue`
- Create: `src/components/ui/AppDialogShell.ts`
- Create: `src/components/ui/AppDialogShell.html`
- Create: `src/components/ui/AppDialogShell.css`
- Create: `tests/vue/app-dialog-shell.scenario.test.ts`
- Modify: `src/styles/design-tokens.css`
- Modify: `src/styles/app.css`

**Interfaces:**
- Consumes: Vue `defineComponent`, Vuetify `v-dialog`, `AppStickyActionFooter`, safe-area tokens, and existing `v-model` conventions.
- Produces: `AppDialogVariant`, `AppDialogShell` props `modelValue`, `title`, `description`, `maxWidth`, `persistent`, `scrollable`, `variant`, `initialFocusSelector`; emits `update:modelValue`.

- [ ] **Step 1: Write failing dialog-shell DOM scenarios**

```ts
import { fireEvent, screen } from "@testing-library/vue";
import { describe, expect, test, vi } from "vitest";
import AppDialogShell from "../../src/components/ui/AppDialogShell.vue";
import { renderWithApp } from "./render.ts";

describe("AppDialogShell", () => {
  test("connects a visible title and description to the dialog", async () => {
    renderWithApp(AppDialogShell, {
      props: { modelValue: true, title: "Créer un espace", description: "Invitez votre équipe." },
      slots: { default: "<button>Premier champ</button>", actions: "<button>Confirmer</button>" }
    });
    expect(await screen.findByRole("dialog", { name: "Créer un espace" })).toHaveAccessibleDescription("Invitez votre équipe.");
  });

  test("restores focus to the opener after closing", async () => {
    const view = renderWithApp({
      components: { AppDialogShell },
      data: () => ({ open: false }),
      template: `<button @click="open = true">Open</button><app-dialog-shell v-model="open" title="Form"><button>Field</button></app-dialog-shell>`
    });
    await fireEvent.click(screen.getByRole("button", { name: "Open" }));
    await view.rerender({});
    await fireEvent.keyDown(await screen.findByRole("dialog"), { key: "Escape" });
    expect(screen.getByRole("button", { name: "Open" })).toHaveFocus();
  });

  test("does not dismiss a persistent dialog with Escape", async () => {
    const update = vi.fn();
    renderWithApp(AppDialogShell, {
      props: { modelValue: true, title: "Paiement", persistent: true, "onUpdate:modelValue": update }
    });
    await fireEvent.keyDown(await screen.findByRole("dialog", { name: "Paiement" }), { key: "Escape" });
    expect(update).not.toHaveBeenCalledWith(false);
  });
});
```

- [ ] **Step 2: Run the dialog scenarios and verify the missing component failure**

Run: `npm run test:vue -- tests/vue/app-dialog-shell.scenario.test.ts`

Expected: FAIL because `AppDialogShell.vue` does not exist.

- [ ] **Step 3: Add the semantic tokens**

```css
--app-touch-target-min: var(--app-action-size-min);
--app-shell-content-clearance-nav: calc(var(--app-bottom-nav-height) + var(--app-safe-area-bottom) + var(--app-space-3));
--app-shell-content-clearance-actions: calc(var(--app-shell-content-clearance-nav) + var(--app-context-action-size) + var(--app-space-4));
--app-sticky-content-top: var(--app-shell-top-inset);
--app-overlay-mobile-top: var(--app-safe-area-top);
--app-overlay-mobile-height: calc(100dvh - var(--app-overlay-mobile-top) - var(--app-safe-area-bottom));
--app-form-mobile-inline-padding: var(--app-space-4);
--app-form-section-gap: var(--app-space-4);
```

Do not manufacture a mobile safe-area floor. In the responsive web app this
resolves to `0px` when the browser reports no inset; native Android receives
the actual CSS inset through `SystemBars.insetsHandling: "css"`.

Keep the existing token names as aliases during migration where removing them immediately would create unrelated churn.

- [ ] **Step 4: Implement the typed dialog state and focus contract**

```ts
import { defineComponent, nextTick, type PropType } from "vue";
import AppStickyActionFooter from "./AppStickyActionFooter.vue";

export type AppDialogVariant = "standard" | "report" | "checkout" | "media";
let dialogSequence = 0;

export const AppDialogShell = defineComponent({
  name: "AppDialogShell",
  components: { AppStickyActionFooter },
  props: {
    modelValue: { type: Boolean, default: false },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    maxWidth: { type: [String, Number], default: 560 },
    persistent: { type: Boolean, default: false },
    scrollable: { type: Boolean, default: true },
    variant: { type: String as PropType<AppDialogVariant>, default: "standard" },
    initialFocusSelector: { type: String, default: "" }
  },
  emits: ["update:modelValue"],
  data() {
    dialogSequence += 1;
    return { titleId: `app-dialog-title-${dialogSequence}`, descriptionId: `app-dialog-description-${dialogSequence}`, returnFocusTarget: null as HTMLElement | null };
  },
  mounted(): void {
    if (this.modelValue) void nextTick(() => this.focusInitialTarget());
  },
  watch: {
    modelValue(open: boolean, wasOpen: boolean): void {
      if (open) {
        this.returnFocusTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        void nextTick(() => this.focusInitialTarget());
      } else if (wasOpen) {
        void nextTick(() => this.restoreFocus());
      }
    }
  },
  methods: {
    updateModelValue(value: boolean): void { this.$emit("update:modelValue", value); },
    focusInitialTarget(): void {
      const root = this.$refs.surface as HTMLElement | undefined;
      const selector = this.initialFocusSelector || "[autofocus], input:not([disabled]), button:not([disabled]), [tabindex='0']";
      root?.querySelector<HTMLElement>(selector)?.focus();
    },
    restoreFocus(): void {
      if (this.returnFocusTarget?.isConnected) {
        this.returnFocusTarget.focus();
        return;
      }
      document.querySelector<HTMLElement>(".app-shell-content-zone")?.focus({ preventScroll: true });
    }
  }
});
```

- [ ] **Step 5: Implement the sole `v-dialog` template and responsive surface**

```html
<v-dialog
  :model-value="modelValue"
  :max-width="maxWidth"
  :persistent="persistent"
  :scrollable="scrollable"
  :fullscreen="$vuetify.display.xs && variant !== 'media'"
  :content-class="['app-dialog-overlay', `app-dialog-overlay--${variant}`]"
  :aria-labelledby="titleId"
  :aria-describedby="description ? descriptionId : undefined"
  @update:model-value="updateModelValue"
>
  <v-card ref="surface" class="app-dialog-card app-overlay-frame">
    <v-card-title :id="titleId" class="app-dialog-title app-text-wrap"><slot name="title">{{ title }}</slot></v-card-title>
    <p v-if="description" :id="descriptionId" class="app-dialog-description app-text-wrap">{{ description }}</p>
    <v-card-text class="app-dialog-content"><slot></slot></v-card-text>
    <app-sticky-action-footer v-if="$slots.actions"><slot name="actions"></slot></app-sticky-action-footer>
  </v-card>
</v-dialog>
```

Add `AppDialogShell.css` rules for one flex-column surface, one `overflow-y: auto` content region, safe-area-aware mobile height, sticky title/actions, report/checkout width treatment, and inset media bounds. Use `rgb(var(--v-theme-surface))` and `rgb(var(--v-theme-on-surface))` for theme-aware colors. Under `@media (prefers-reduced-motion: reduce)`, remove shell-owned transitions. Do not apply page-level `overflow-x: hidden`.

- [ ] **Step 6: Run the focused component and type tests**

Run: `npm run test:vue -- tests/vue/app-dialog-shell.scenario.test.ts`

Run: `npm run typecheck`

Expected: both PASS.

- [ ] **Step 7: Commit the dialog foundation**

```powershell
git add src/components/ui/AppDialogShell.vue src/components/ui/AppDialogShell.ts src/components/ui/AppDialogShell.html src/components/ui/AppDialogShell.css src/styles/design-tokens.css src/styles/app.css tests/vue/app-dialog-shell.scenario.test.ts
git commit -m "feat: add responsive dialog shell"
```

---

### Task 3: Add the shared form layout and upgrade common actions

**Files:**
- Create: `src/components/ui/AppFormLayout.vue`
- Create: `src/components/ui/AppFormLayout.ts`
- Create: `src/components/ui/AppFormLayout.html`
- Create: `src/components/ui/AppFormLayout.css`
- Create: `tests/vue/app-form-layout.scenario.test.ts`
- Modify: `src/components/ui/AppActionButton.html`
- Modify: `src/components/ui/AppConfirmDialog.ts`
- Modify: `src/components/ui/AppConfirmDialog.html`
- Modify: `src/components/ui/AppStickyActionFooter.html`
- Modify: `src/styles/app.css`

**Interfaces:**
- Consumes: `AppDialogShell`, `AppStickyActionFooter`, `--app-touch-target-min`, and named Vue slots.
- Produces: `AppFormLayout` props `compact`, `responsive`, `stickyActions`; slots `header`, `validation`, default, `helper`, `actions`. `AppConfirmDialog` retains its current public props and emits.

- [ ] **Step 1: Write failing form-layout and confirmation scenarios**

```ts
test("wraps long localized copy and stacks form actions", () => {
  renderWithApp(AppFormLayout, {
    props: { responsive: true, stickyActions: true },
    slots: {
      default: `<label>Identifiant de synchronisation particulièrement long<input aria-label="Identifiant" /></label>`,
      actions: `<button>Importer depuis l’identifiant utilisateur</button><button>Annuler</button>`
    }
  });
  expect(screen.getByText(/Identifiant de synchronisation/).closest("label")).toHaveClass("app-text-wrap");
  expect(screen.getByRole("button", { name: /Importer/ }).closest(".app-form-actions")).toHaveClass("app-form-actions--sticky");
});

test("AppConfirmDialog keeps its existing cancel and confirm events", async () => {
  const cancel = vi.fn();
  const confirm = vi.fn();
  renderWithApp(AppConfirmDialog, { props: { modelValue: true, title: "Supprimer", cancelText: "Annuler", confirmText: "Supprimer", onCancel: cancel, onConfirm: confirm } });
  await fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
  expect(cancel).toHaveBeenCalledOnce();
  expect(confirm).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the scenarios and verify they fail before the scaffold exists**

Run: `npm run test:vue -- tests/vue/app-form-layout.scenario.test.ts`

Expected: FAIL because `AppFormLayout` and the delegated confirmation markup do not exist.

- [ ] **Step 3: Implement the form scaffold**

```ts
import { defineComponent } from "vue";

export const AppFormLayout = defineComponent({
  name: "AppFormLayout",
  props: {
    compact: { type: Boolean, default: false },
    responsive: { type: Boolean, default: true },
    stickyActions: { type: Boolean, default: false }
  },
  computed: {
    layoutClasses(): Record<string, boolean> {
      return {
        "app-form-layout--compact": this.compact,
        "app-form-layout--responsive": this.responsive
      };
    }
  }
});
```

```html
<div class="app-form-layout" :class="layoutClasses">
  <div v-if="$slots.header" class="app-form-header app-text-wrap"><slot name="header"></slot></div>
  <div v-if="$slots.validation" class="app-form-validation app-text-wrap" aria-live="polite"><slot name="validation"></slot></div>
  <div class="app-form-fields"><slot></slot></div>
  <div v-if="$slots.helper" class="app-form-helper app-text-wrap"><slot name="helper"></slot></div>
  <div v-if="$slots.actions" class="app-form-actions" :class="{ 'app-form-actions--sticky': stickyActions }"><slot name="actions"></slot></div>
</div>
```

Style responsive forms as one column by default, opt into multi-column layout above 600px, set `min-width: 0` on fields and labels, wrap action copy, and stack actions below 360px or when the row cannot fit.

- [ ] **Step 4: Delegate confirmation dialogs and common action sizing**

Replace the outer `v-dialog` in `AppConfirmDialog.html` with:

```html
<app-dialog-shell
  :model-value="modelValue"
  :title="title"
  :max-width="maxWidth"
  :persistent="persistent"
  @update:model-value="updateModelValue"
>
  <p v-if="body" class="text-body-2 text-medium-emphasis app-text-wrap">{{ body }}</p>
  <slot></slot>
  <template #actions>
    <v-btn class="app-touch-target" variant="text" @click="cancel">{{ cancelText }}</v-btn>
    <v-btn class="app-touch-target" :color="confirmColor" :loading="confirmLoading" :disabled="confirmDisabled" @click="confirm">{{ confirmText }}</v-btn>
  </template>
</app-dialog-shell>
```

Register `AppDialogShell` in `AppConfirmDialog.ts`. Add `app-touch-target` to `AppActionButton.html` and make `AppStickyActionFooter` use `app-form-actions` so all shared actions wrap consistently.

- [ ] **Step 5: Run focused shared-component tests**

Run: `npm run test:vue -- tests/vue/app-dialog-shell.scenario.test.ts tests/vue/app-form-layout.scenario.test.ts`

Run: `npm run test -- tests/ui-responsive-contract.test.ts`

Expected: component scenarios PASS; the source contract still FAILS only for unmigrated dialogs and offsets.

- [ ] **Step 6: Commit the shared form and action foundation**

```powershell
git add src/components/ui/AppFormLayout.vue src/components/ui/AppFormLayout.ts src/components/ui/AppFormLayout.html src/components/ui/AppFormLayout.css src/components/ui/AppActionButton.html src/components/ui/AppConfirmDialog.ts src/components/ui/AppConfirmDialog.html src/components/ui/AppStickyActionFooter.html src/styles/app.css tests/vue/app-form-layout.scenario.test.ts
git commit -m "feat: standardize responsive form layout"
```

---

### Task 4: Migrate root and shell dialogs without changing workflows

**Files:**
- Modify: `src/App.ts`
- Modify: `src/App.html`
- Modify: `src/components/shell/SystemConfigurationDialog.ts`
- Modify: `src/components/shell/SystemConfigurationDialog.html`
- Modify: `src/components/shell/SystemConfigurationDialog.css`
- Modify: `src/components/shell/WorkspaceModals.ts`
- Modify: `src/components/shell/WorkspaceModals.html`
- Modify: `src/components/shell/WorkspaceModals.css`
- Modify: `src/components/shell/SaleEditorModal.ts`
- Modify: `src/components/shell/SaleEditorModal.html`
- Modify: `src/components/shell/SaleEditorModal.css`
- Modify: `src/components/shell/PortfolioReportModal.ts`
- Modify: `src/components/shell/PortfolioReportModal.html`
- Modify: `src/components/shell/PortfolioReportModal.css`
- Modify: `tests/vue/workflow-dialogs.scenario.test.ts`

**Interfaces:**
- Consumes: `AppDialogShell`, `AppFormLayout`, existing capability ports and root methods.
- Produces: migrated new-lot, rename-lot, purchase verification, checkout, generic confirmation, system configuration, workspace, sale editor, and portfolio report overlays.

- [ ] **Step 1: Extend workflow tests before migration**

Add a source contract for the five root overlays, then retain the existing rendered workflow scenarios for the extracted shell components:

```ts
test("root dialogs delegate to AppDialogShell with their current state", () => {
  const template = readFileSync("src/App.html", "utf8");
  for (const model of [
    "showNewLotModal",
    "showRenameLotModal",
    "showVerifyPurchaseModal",
    "showStripeCheckoutModal",
    "confirmDialog"
  ]) {
    assert.match(template, new RegExp(`<app-dialog-shell[^>]*v-model="${model}"`));
  }
  assert.doesNotMatch(template, /<v-dialog\b/);
});
```

Add explicit assertions for Workspace cancel/create, Sale Editor sale-type selection and save/cancel, System Configuration close, and Portfolio Report close/print behavior using the existing injected capability objects.

- [ ] **Step 2: Run the workflow suite and record the passing behavioral baseline**

Run: `npm run test:vue -- tests/vue/workflow-dialogs.scenario.test.ts`

Expected: existing scenarios PASS; newly added accessible-name assertions FAIL where legacy dialogs are not correctly named.

- [ ] **Step 3: Migrate the five root dialogs**

Register `AppDialogShell` and `AppFormLayout` in `src/App.ts`. For each root dialog, replace only the overlay/card/title/content/actions frame:

```html
<app-dialog-shell v-model="showNewLotModal" :title="t('newLotTitle')" :max-width="400">
  <app-form-layout>
    <v-text-field
      id="guided-onboarding-lot-name-field"
      v-model="lotNameDraft"
      :label="t('lotNameLabel')"
      variant="outlined"
      @keyup.enter="createNewLot"
    ></v-text-field>
    <v-btn-toggle v-model="newLotType" mandatory divided density="compact" variant="outlined" class="segment-toggle app-form-row">
      <v-btn class="app-touch-target" value="bulk" size="small">{{ t('commonBulk') }}</v-btn>
      <v-btn class="app-touch-target" value="singles" size="small">{{ t('commonSingles') }}</v-btn>
    </v-btn-toggle>
    <template #actions>
      <v-btn class="app-touch-target" variant="text" @click="showNewLotModal = false">{{ t('commonCancel') }}</v-btn>
      <v-btn id="guided-onboarding-create-lot-btn" class="app-touch-target" color="primary" @click="createNewLot">{{ t('commonCreate') }}</v-btn>
    </template>
  </app-form-layout>
</app-dialog-shell>
```

Move the existing Singles catalog-source block between the toggle and actions without changing `newLotCatalogSource` or its translation keys. Apply the same frame-only migration to rename, purchase verification, checkout, and generic confirmation.

Use `variant="checkout"` for Stripe checkout. Keep manual-purchase conditions, generic-confirm callbacks, disabled expressions, and loading flags unchanged.

- [ ] **Step 4: Migrate the shell component dialogs**

Import/register `AppDialogShell` in each owning `.ts` file. Use:

- `standard` for System Configuration, Workspace create/members/join, and Sale Editor;
- `report` for Portfolio Report;
- `AppConfirmDialog` for the existing leave-workspace confirmation;
- `AppFormLayout` around editable content only, not around report output.

Preserve every existing `v-model`, method call, capability guard, and footer action. Remove obsolete `app-mobile-fullscreen-dialog` classes after their behavior is owned by the shell.

- [ ] **Step 5: Add long-copy assertions to the migrated shell flows**

Use realistic copy such as `Importer depuis l’identifiant utilisateur` and `Supprimer définitivement cet espace de travail partagé` and assert the full visible/accessibility text remains present. Assert action containers carry `app-form-actions` and inputs remain present by their full labels.

- [ ] **Step 6: Run root/shell workflow and contract tests**

Run: `npm run test:vue -- tests/vue/workflow-dialogs.scenario.test.ts`

Run: `npm run test -- tests/ui-responsive-contract.test.ts`

Expected: workflow scenarios PASS; contract failures are limited to feature dialogs not covered by this task and legacy offsets.

- [ ] **Step 7: Commit the root and shell migration**

```powershell
git add src/App.ts src/App.html src/components/shell/SystemConfigurationDialog.* src/components/shell/WorkspaceModals.* src/components/shell/SaleEditorModal.* src/components/shell/PortfolioReportModal.* tests/vue/workflow-dialogs.scenario.test.ts
git commit -m "refactor: migrate shell dialogs to shared layout"
```

---

### Task 5: Migrate commerce, customer, import, Singles, and Live dialogs

**Files:**
- Modify: `src/components/modals/AutoCalculateModal.*`
- Modify: `src/components/customers/BuyerQuickViewModal.*`
- Modify: `src/components/windows/whatnot/WhatnotCsvImportDialog.*`
- Modify: `src/components/windows/whatnot/WhatnotReviewDialog.*`
- Modify: `src/components/windows/singles/SinglesCsvImportDialog.*`
- Modify: `src/components/windows/singles/SinglesConfigWindow.*`
- Modify: `src/components/windows/live/LiveSinglesPanel.*`
- Modify: `tests/vue/workflow-dialogs.scenario.test.ts`
- Modify: `tests/vue/singles-config-window-render.scenario.test.ts`
- Modify: `tests/live-singles-panel.test.ts`

**Interfaces:**
- Consumes: `AppDialogShell`, `AppFormLayout`, `AppStickyActionFooter`, current commerce/Whatnot/singles capability ports.
- Produces: responsive profit calculator, buyer quick view, CSV import/review, image preview, and Live image preview overlays.

- [ ] **Step 1: Add failing representative scenarios**

```ts
test("keeps a long French Whatnot validation message readable", async () => {
  renderWithCapabilities(WhatnotCsvImportDialog, whatnotDialogPortsKey, whatnotContext(false));
  const dialog = await screen.findByRole("dialog", { name: "Import Whatnot CSV" });
  expect(dialog.querySelector(".app-dialog-content")).not.toBeNull();
  expect(screen.getByText("Map your fields.")).toHaveClass("app-text-wrap");
});

test("uses an inset media dialog for the singles image preview", async () => {
  const template = readFileSync("src/components/windows/singles/SinglesConfigWindow.html", "utf8");
  assert.match(template, /<app-dialog-shell[\s\S]*v-model="showSinglesImagePreview"[\s\S]*variant="media"/);
  assert.doesNotMatch(template, /<v-dialog\b/);
});
```

Add an assertion that Live preview close remains named and that the Singles row editor remains a bottom sheet.

- [ ] **Step 2: Run the targeted suites and verify the new shell assertions fail**

Run: `npm run test:vue -- tests/vue/workflow-dialogs.scenario.test.ts tests/vue/singles-config-window-render.scenario.test.ts`

Run: `npm run test -- tests/live-singles-panel.test.ts`

Expected: FAIL on missing shared-shell and text-wrap markers.

- [ ] **Step 3: Migrate standard form dialogs**

Use `AppDialogShell` plus `AppFormLayout` for:

- Auto Calculate;
- Whatnot CSV Import;
- Whatnot Review;
- Singles CSV Import.

Use `AppDialogShell` without a form wrapper for Buyer Quick View unless editable buyer fields are currently visible. Keep every import mapping, preview, confirmation, entitlement, loading, and close handler unchanged.

- [ ] **Step 4: Migrate view-only image previews**

Use the explicit media treatment:

```html
<app-dialog-shell
  v-model="showSinglesImagePreview"
  :title="t('singlesImagePreviewTitle')"
  variant="media"
  :max-width="420"
>
  <button type="button" class="singles-image-preview-close app-touch-target" :aria-label="t('singlesEditorCloseImagePreviewAction')" @click="closeSinglesImagePreview">
    <v-icon size="18">mdi-close</v-icon>
  </button>
  <img
    v-if="singlesImagePreviewSrc"
    :src="singlesImagePreviewSrc"
    :alt="singlesImagePreviewTitle || t('singlesEditorPreviewEyebrow')"
    class="singles-image-preview-img"
    @click="closeSinglesImagePreview"
  >
  <div v-if="singlesImagePreviewTitle" class="singles-image-preview-title app-text-wrap">{{ singlesImagePreviewTitle }}</div>
</app-dialog-shell>
```

Apply the same frame to the Live Singles preview. Ensure a localized close control remains at least 44px and the image uses `max-inline-size: 100%` and `max-block-size` derived from the overlay viewport.

- [ ] **Step 5: Align the Singles editor bottom sheet**

Keep `v-bottom-sheet` in `SinglesConfigWindow.html`, add `app-overlay-frame`, wrap its editable fields in `AppFormLayout`, and use `AppStickyActionFooter`. Retain selection, save, delete, and dismissal logic.

- [ ] **Step 6: Run focused migration tests**

Run: `npm run test:vue -- tests/vue/workflow-dialogs.scenario.test.ts tests/vue/singles-config-window-render.scenario.test.ts`

Run: `npm run test -- tests/live-singles-panel.test.ts tests/ui-responsive-contract.test.ts`

Expected: migrated scenarios PASS; remaining direct-dialog failures are only Game/Portfolio.

- [ ] **Step 7: Commit the commerce and Singles/Live migration**

```powershell
git add src/components/modals/AutoCalculateModal.* src/components/customers/BuyerQuickViewModal.* src/components/windows/whatnot/WhatnotCsvImportDialog.* src/components/windows/whatnot/WhatnotReviewDialog.* src/components/windows/singles/SinglesCsvImportDialog.* src/components/windows/singles/SinglesConfigWindow.* src/components/windows/live/LiveSinglesPanel.* tests/vue/workflow-dialogs.scenario.test.ts tests/vue/singles-config-window-render.scenario.test.ts tests/live-singles-panel.test.ts
git commit -m "refactor: migrate commerce and singles dialogs"
```

---

### Task 6: Migrate Game and Portfolio dialogs and finish overlay ownership

**Files:**
- Modify: `src/components/windows/game/coordinator/GameWindow.*`
- Modify: `src/components/windows/game/dialogs/WheelCreateGameDialog.*`
- Modify: `src/components/windows/game/dialogs/GameSpectatorDialog.*`
- Modify: `src/components/windows/game/bracket/BracketBattlePanel.*`
- Modify: `src/components/windows/game/inspector/WheelTierCard.*`
- Modify: `src/components/windows/portfolio/PortfolioWindow.*`
- Modify: `tests/vue/game-inspector.scenario.test.ts`
- Modify: `tests/vue/game-window-realtime.scenario.test.ts`
- Modify: `tests/ui-responsive-contract.test.ts`

**Interfaces:**
- Consumes: shared dialog/form components and current Game/Portfolio contexts.
- Produces: zero direct `v-dialog` owners outside `AppDialogShell` and unchanged Game/Portfolio actions.

- [ ] **Step 1: Add failing dialog behavior scenarios**

Add structural ownership checks for every Game dialog and keep the existing rendered Game tests for decisive actions:

```ts
test("Game overlays use the shared dialog shell", () => {
  const paths = [
    "src/components/windows/game/coordinator/GameWindow.html",
    "src/components/windows/game/dialogs/WheelCreateGameDialog.html",
    "src/components/windows/game/dialogs/GameSpectatorDialog.html",
    "src/components/windows/game/bracket/BracketBattlePanel.html",
    "src/components/windows/game/inspector/WheelTierCard.html"
  ];
  for (const path of paths) {
    const template = readFileSync(path, "utf8");
    assert.doesNotMatch(template, /<v-dialog\b/);
    assert.match(template, /<app-dialog-shell\b/);
  }
});
```

Add a Portfolio drilldown assertion that closing the overlay does not change the active portfolio filter.

- [ ] **Step 2: Run Game/Portfolio scenarios and verify shared-shell assertions fail**

Run: `npm run test:vue -- tests/vue/game-inspector.scenario.test.ts tests/vue/game-window-realtime.scenario.test.ts`

Run: `npm run test -- tests/portfolio-window.test.ts`

Expected: existing domain checks PASS; new shell ownership/name assertions FAIL.

- [ ] **Step 3: Replace all Game direct dialogs**

Import/register `AppDialogShell` and `AppFormLayout` in the owning components. Migrate:

- GameWindow's four dialog blocks;
- Wheel Create Game;
- Game Spectator;
- Bracket reset;
- Wheel tier editor.

Use `AppConfirmDialog` for bracket reset when its existing content is only warning plus cancel/confirm. Keep Game session, history, statistics, spectator, end-game, Pro checks, and inspector state wired to their existing methods.

- [ ] **Step 4: Replace the Portfolio drilldown dialog**

Use `AppDialogShell variant="report"` for the Portfolio drilldown. Keep the selected metric, filters, close behavior, and report/table controls unchanged.

- [ ] **Step 5: Run the overlay source contract**

Run: `npm run test -- tests/ui-responsive-contract.test.ts`

Expected: the direct-dialog and bottom-sheet ownership assertions PASS. Offset assertions may still fail until Task 8.

- [ ] **Step 6: Run Game/Portfolio tests**

Run: `npm run test:vue -- tests/vue/game-inspector.scenario.test.ts tests/vue/game-window-realtime.scenario.test.ts`

Run: `npm run test -- tests/wheel-spin-methods.test.ts tests/wheel-spectator.test.ts tests/portfolio-window.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the final overlay migration**

```powershell
git add src/components/windows/game/coordinator/GameWindow.* src/components/windows/game/dialogs/WheelCreateGameDialog.* src/components/windows/game/dialogs/GameSpectatorDialog.* src/components/windows/game/bracket/BracketBattlePanel.* src/components/windows/game/inspector/WheelTierCard.* src/components/windows/portfolio/PortfolioWindow.* tests/vue/game-inspector.scenario.test.ts tests/vue/game-window-realtime.scenario.test.ts tests/ui-responsive-contract.test.ts
git commit -m "refactor: centralize game and portfolio dialogs"
```

---

### Task 7: Migrate every editable page form and remove accidental spacing

**Files:**
- Modify: `src/components/windows/config/ConfigWindow.*`
- Modify: `src/components/windows/config/AdminSyncImportCard.*`
- Modify: `src/components/shell/LotSelectorOnboardingBlock.*`
- Modify: `src/components/shell/MobileLotSwitcher.*`
- Modify: `src/components/windows/singles/SinglesPurchasingCard.*`
- Modify: `src/components/windows/game/bracket/BracketBattleBuilder.*`
- Modify: `src/components/windows/game/inspector/WheelInspector.*`
- Modify: `src/components/windows/game/stage/WheelStageTopbar.*`
- Modify: field-containing templates already migrated in Tasks 4–6
- Modify: `tests/config-lots-entity.test.ts`
- Modify: `tests/config-io-methods.test.ts`
- Modify: `tests/vue/singles-config-window-render.scenario.test.ts`
- Modify: `tests/vue/game-inspector.scenario.test.ts`
- Modify: `tests/vue/mobile-shell.scenario.test.ts`
- Modify: `tests/ui-responsive-contract.test.ts`

**Interfaces:**
- Consumes: `AppFormLayout` and shared inline classes `app-form-row`, `app-form-field`, `app-text-wrap`, `app-long-token`.
- Produces: consistent form spacing and containment without adding validation or state logic.

- [ ] **Step 1: Add source inventory and Admin Sync spacing regressions**

```ts
test("editable feature forms use the shared form contract", () => {
  const required = [
    "src/App.html",
    "src/components/customers/BuyerQuickViewModal.html",
    "src/components/modals/AutoCalculateModal.html",
    "src/components/shell/LotSelectorOnboardingBlock.html",
    "src/components/shell/MobileLotSwitcher.html",
    "src/components/shell/SaleEditorModal.html",
    "src/components/shell/SystemConfigurationDialog.html",
    "src/components/shell/WorkspaceModals.html",
    "src/components/windows/config/ConfigWindow.html",
    "src/components/windows/config/AdminSyncImportCard.html",
    "src/components/windows/game/coordinator/GameWindow.html",
    "src/components/windows/singles/SinglesConfigWindow.html",
    "src/components/windows/singles/SinglesCsvImportDialog.html",
    "src/components/windows/singles/SinglesPurchasingCard.html",
    "src/components/windows/game/bracket/BracketBattleBuilder.html",
    "src/components/windows/game/inspector/WheelInspector.html",
    "src/components/windows/game/inspector/WheelTierCard.html",
    "src/components/windows/game/stage/WheelStageTopbar.html",
    "src/components/windows/live/LiveSinglesPanel.html",
    "src/components/windows/portfolio/PortfolioWindow.html",
    "src/components/windows/whatnot/WhatnotCsvImportDialog.html",
    "src/components/windows/whatnot/WhatnotReviewDialog.html"
  ];
  for (const path of required) {
    assert.match(readFileSync(path, "utf8"), /<app-form-layout\b|app-form-row/);
  }
});

test("configuration forms do not create viewport-filling gaps", () => {
  const styles = readFileSync("src/components/windows/config/ConfigWindow.css", "utf8");
  assert.doesNotMatch(styles, /min-height:\s*(?:100vh|calc\(100vh)/);
  assert.doesNotMatch(styles, /flex-grow:\s*1[^}]*admin/i);
});
```

- [ ] **Step 2: Run the contract and config tests to verify failure**

Run: `npm run test -- tests/ui-responsive-contract.test.ts tests/config-lots-entity.test.ts tests/config-io-methods.test.ts`

Expected: FAIL on missing form-layout markers and the legacy spacer/gap rule.

- [ ] **Step 3: Migrate Config and Admin Sync forms**

Wrap Purchasing Setup and Admin Sync Import fields in separate compact `AppFormLayout` instances. Keep the two cards adjacent in normal document flow:

```html
<app-form-layout compact>
  <div class="app-form-row">
    <v-text-field v-model="adminImportSourceUserId" label="Source userId" variant="outlined" density="compact" hide-details autocomplete="off"></v-text-field>
  </div>
  <div class="app-form-row">
    <v-text-field v-model="adminImportSourceWorkspaceId" label="Source workspaceId" placeholder="Leave empty for personal source" variant="outlined" density="compact" hide-details autocomplete="off"></v-text-field>
  </div>
  <template #actions>
    <v-btn class="app-touch-target" block color="warning" prepend-icon="mdi-database-sync" :loading="isAdminImportInProgress" @click="importLotsFromUserId">
      Import from userId
    </v-btn>
  </template>
</app-form-layout>
```

Remove the empty flex growth, minimum viewport height, or spacer responsible for pushing Admin Sync toward the bottom. Preserve the existing section-card padding and use `--app-form-section-gap` between sections.

- [ ] **Step 4: Migrate the remaining page and inline forms**

Use one `AppFormLayout` per cohesive form in Lot Selector onboarding, Singles Purchasing, Bracket Builder, Wheel Inspector, and editable Wheel Stage topbar. Keep the Mobile Lot Switcher's `v-bottom-sheet`, add `app-overlay-frame` to its sheet content, apply `app-form-row` to its search control, and retain focus restoration plus its safe-area footer. Use `app-form-row` for other small inline editors inside an already-scaffolded surface. Do not nest form scaffolds solely for styling.

For every field row, preserve the current `v-model`, label, validation, disabled, loading, and event expressions exactly.

- [ ] **Step 5: Add long English/French form-copy assertions**

Assert full labels remain present for `Importer depuis l’identifiant utilisateur`, a long workspace name, the Singles purchase field labels, and Game tier labels. Check `.app-text-wrap` on labels/helpers and `.app-long-token` on read-only identifiers.

- [ ] **Step 6: Run focused form tests**

Run: `npm run test -- tests/ui-responsive-contract.test.ts tests/config-lots-entity.test.ts tests/config-io-methods.test.ts`

Run: `npm run test:vue -- tests/vue/singles-config-window-render.scenario.test.ts tests/vue/game-inspector.scenario.test.ts tests/vue/mobile-shell.scenario.test.ts`

Expected: form inventory, gap regression, and feature behavior PASS; only legacy positioning/touch assertions may remain red.

- [ ] **Step 7: Commit the page-form migration**

```powershell
git add src/components/windows/config/ConfigWindow.* src/components/windows/config/AdminSyncImportCard.* src/components/shell/LotSelectorOnboardingBlock.* src/components/shell/MobileLotSwitcher.* src/components/windows/singles/SinglesPurchasingCard.* src/components/windows/game/bracket/BracketBattleBuilder.* src/components/windows/game/inspector/WheelInspector.* src/components/windows/game/stage/WheelStageTopbar.* tests/ui-responsive-contract.test.ts tests/config-lots-entity.test.ts tests/config-io-methods.test.ts tests/vue/singles-config-window-render.scenario.test.ts tests/vue/game-inspector.scenario.test.ts tests/vue/mobile-shell.scenario.test.ts
git commit -m "refactor: standardize editable form layouts"
```

---

### Task 8: Remove shell-positioning debt and enforce touch/text fitting

**Files:**
- Modify: `src/App.html`
- Modify: `src/styles/design-tokens.css`
- Modify: `src/styles/app.css`
- Modify: `src/components/shell/ContextActionDock.css`
- Modify: `src/components/shell/AppShellTopBar.css`
- Modify: `src/components/shell/LotSelectorOnboardingBlock.css`
- Modify: `src/components/windows/game/styles/wheel-stage.css`
- Modify: `src/components/windows/game/styles/wheel-mobile.css`
- Modify: `src/components/windows/game/styles/wheel-inspector.css`
- Modify: `src/components/windows/game/styles/wheel-tier-editor.css`
- Modify: `src/components/windows/singles/SinglesConfigWindow.css`
- Modify: `src/components/windows/live/LiveSinglesPanel.css`
- Modify: `src/components/windows/sales/SalesWindow.css`
- Modify: `src/components/windows/portfolio/PortfolioWindow.css`
- Modify: `src/components/windows/portfolio/PortfolioPulsePanel.css`
- Modify: `src/components/windows/portfolio/PortfolioPerformanceSheet.css`
- Modify: `src/components/windows/game/styles/bracket-battle.css`
- Modify: `src/styles/spectator.css`
- Modify: relevant `.html` files for accessible labels and touch classes
- Modify: `tests/ui-shell-contract.test.ts`
- Modify: `tests/ui-responsive-contract.test.ts`
- Modify: `tests/vue/mobile-shell.scenario.test.ts`
- Modify: `tests/live-singles-panel.test.ts`

**Interfaces:**
- Consumes: `--app-shell-content-clearance-nav`, `--app-shell-content-clearance-actions`, `--app-sticky-content-top`, `--app-touch-target-min`, and `.app-shell-action-zone`.
- Produces: shell-owned clearance selected through `data-has-context-actions`, plus shared `.app-touch-target`, `.app-text-wrap`, `.app-text-ellipsis`, and `.app-long-token` behavior.

Safe-area contract: `src/styles/design-tokens.css` is the only source that may read `env(safe-area-inset-*)`. All surfaces consume the `--app-safe-area-*` tokens. Never manufacture a `24px` safe-area fallback: responsive web/PWA receives `0px` when no real inset exists, while Android receives the native SystemBars CSS inset.

- [ ] **Step 1: Add failing shell-clearance and touch assertions**

```ts
test("shell clearance follows rendered contextual actions", () => {
  const template = readFileSync("src/App.html", "utf8");
  const styles = readFileSync("src/styles/app.css", "utf8");
  assert.match(template, /class="app-shell-root"[\s\S]*:data-has-context-actions=/);
  assert.match(styles, /\[data-has-context-actions="true"\][\s\S]*--app-shell-content-clearance-actions/);
  assert.match(styles, /\[data-has-context-actions="false"\][\s\S]*--app-shell-content-clearance-nav/);
});

test("shared touch targets use the 44px token", () => {
  const styles = readFileSync("src/styles/app.css", "utf8");
  assert.match(styles, /\.app-touch-target[\s\S]*min-inline-size:\s*var\(--app-touch-target-min\)/);
  assert.match(styles, /\.app-touch-target[\s\S]*min-block-size:\s*var\(--app-touch-target-min\)/);
});
```

- [ ] **Step 2: Run shell and responsive contracts to confirm failure**

Run: `npm run test -- tests/ui-shell-contract.test.ts tests/ui-responsive-contract.test.ts`

Expected: FAIL on action-dependent clearance, legacy offsets, and incomplete touch utility adoption.

- [ ] **Step 3: Make shell action presence authoritative**

Expose one root attribute from the same computed state that controls the rendered contextual action dock:

```html
<v-app class="app-shell-root" :data-has-context-actions="hasVisibleContextActions ? 'true' : 'false'">
```

If the existing shell context already exposes the boolean under another name, reuse it instead of adding duplicate tab mapping. Add `tabindex="-1"` to the existing `.app-shell-content-zone` element so dialog focus restoration has a stable fallback. Set `--app-shell-current-bottom-clearance` from the attribute and make the content zone, snackbar, and sticky surfaces consume that token.

- [ ] **Step 4: Replace legacy feature offsets**

Replace Game's `72px` app-bar/nav variables with shell tokens, Singles sticky `2.7rem`/`8.5rem` positions with `--app-sticky-content-top` plus feature-local stacked-header tokens, Singles `108px` bottom padding and Live `7rem` padding with `--app-shell-current-bottom-clearance`. Remove negative safe-area compensation from Live sticky controls.

Retain genuine component geometry such as image dimensions or grid cell widths; the regression only forbids values used as shell-chrome calculations.

- [ ] **Step 5: Apply the 44px interaction contract**

Add `.app-touch-target` or `AppActionButton` to interactive controls currently sized below 44px in:

- App shell and lot selector account/edit actions;
- Live Singles mini steppers, remove actions, and mobile steppers;
- Singles search, editor, and row actions;
- Sales delete, sort, and carousel actions;
- Portfolio drilldown/pulse/sheet controls;
- Game bracket, wheel inspector, tier, session, stage, and spectator controls.

Keep icon glyph sizes compact. Replace fixed hit-box sizes with:

```css
min-inline-size: var(--app-touch-target-min);
min-block-size: var(--app-touch-target-min);
```

Add localized `aria-label` values at each icon-only call site; do not rely on tooltip text alone.

- [ ] **Step 6: Apply the mobile text-fit utilities**

Use:

```css
.app-text-wrap { min-inline-size: 0; overflow-wrap: anywhere; white-space: normal; }
.app-text-ellipsis { min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.app-long-token { min-inline-size: 0; overflow-wrap: anywhere; word-break: break-word; }
@media (max-width: 600px) {
  .app-form-fields :is(input, textarea) { font-size: max(1rem, var(--app-font-size-body)); }
  .app-mobile-body { font-size: max(0.875rem, var(--app-font-size-mobile-body)); }
}
```

Apply wrapping to labels, validation, helpers, warnings, titles, actions, and empty states. Limit ellipsis to compact app-bar summaries, selectors, list rows, and chips where the full accessible value remains available. Add `min-width: 0` to flex/grid text children and stack form actions when they cannot fit.

- [ ] **Step 7: Run shell, Live, and responsive tests**

Run: `npm run test -- tests/ui-shell-contract.test.ts tests/ui-responsive-contract.test.ts tests/live-singles-panel.test.ts`

Run: `npm run test:vue -- tests/vue/mobile-shell.scenario.test.ts tests/vue/singles-config-window-render.scenario.test.ts`

Expected: PASS, including legacy-offset guards and action-layer placement.

- [ ] **Step 8: Commit positioning, touch, and text-fit changes**

```powershell
git add src/App.html src/styles/design-tokens.css src/styles/app.css src/components/shell/ContextActionDock.css src/components/shell/AppShellTopBar.css src/components/shell/LotSelectorOnboardingBlock.css src/components/windows/game/styles src/components/windows/singles/SinglesConfigWindow.css src/components/windows/live/LiveSinglesPanel.css src/components/windows/sales/SalesWindow.css src/components/windows/portfolio src/styles/spectator.css tests/ui-shell-contract.test.ts tests/ui-responsive-contract.test.ts tests/vue/mobile-shell.scenario.test.ts tests/live-singles-panel.test.ts
git commit -m "fix: enforce responsive positioning and touch contracts"
```

---

### Task 9: Add multilingual narrow-screen coverage and run final verification

**Files:**
- Modify: `tests/vue/app-dialog-shell.scenario.test.ts`
- Modify: `tests/vue/app-form-layout.scenario.test.ts`
- Modify: `tests/vue/workflow-dialogs.scenario.test.ts`
- Modify: `tests/ui-visual-smoke.test.ts`
- Modify: `tests/visual/visual-smoke.spec.ts`
- Modify: `tests/visual/helpers/visualSmokeState.ts`
- Modify: `tests/ui-responsive-contract.test.ts`

**Interfaces:**
- Consumes: completed dialog/form/touch/positioning contracts and existing visual-smoke state setup.
- Produces: final regression coverage for 320px containment and required 360/390/412 English/French theme states.

- [ ] **Step 1: Add the 320px DOM containment fixture**

```ts
test("preserves required French copy in a 320px dialog fixture", async () => {
  const previousWidth = window.innerWidth;
  try {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 320 });
    window.dispatchEvent(new Event("resize"));
    renderWithApp({
      components: { AppDialogShell, AppFormLayout },
      data: () => ({ open: true }),
      template: `
        <app-dialog-shell v-model="open" title="Configuration de la synchronisation administrative">
          <app-form-layout>
            <label class="app-text-wrap">Identifiant de synchronisation particulièrement long<input aria-label="Identifiant" /></label>
            <template #actions><button class="app-touch-target">Importer depuis l’identifiant utilisateur</button></template>
          </app-form-layout>
        </app-dialog-shell>`
    });
    const dialog = await screen.findByRole("dialog", { name: "Configuration de la synchronisation administrative" });
    expect(dialog).toHaveTextContent("Importer depuis l’identifiant utilisateur");
    expect(dialog.querySelectorAll(".app-text-wrap").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Importer depuis l’identifiant utilisateur" })).toHaveClass("app-touch-target");
  } finally {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: previousWidth });
    window.dispatchEvent(new Event("resize"));
  }
});
```

- [ ] **Step 2: Add visual smoke states**

Create deterministic states for:

- 320px French dark System Configuration or Admin Sync form;
- 360x740 French dark Sale Editor with long labels and validation;
- 390x844 English light Whatnot Import with sticky actions;
- 412x915 French dark Game tier editor;
- mobile lot and Singles bottom sheets;
- desktop dialog comparison proving max-width behavior remains intact.
- a 200% text reflow state with the dialog actions and final field still reachable.

Each state must disable animation, wait for the dialog/sheet role, and assert `document.documentElement.scrollWidth <= document.documentElement.clientWidth` before capture.

- [ ] **Step 3: Run all focused responsive suites**

Run: `npm run test -- tests/ui-responsive-contract.test.ts tests/ui-shell-contract.test.ts tests/live-singles-panel.test.ts tests/portfolio-window.test.ts tests/wheel-spectator.test.ts`

Run: `npm run test:vue -- tests/vue/app-dialog-shell.scenario.test.ts tests/vue/app-form-layout.scenario.test.ts tests/vue/workflow-dialogs.scenario.test.ts tests/vue/mobile-shell.scenario.test.ts tests/vue/singles-config-window-render.scenario.test.ts tests/vue/game-inspector.scenario.test.ts tests/vue/game-window-realtime.scenario.test.ts`

Expected: PASS.

- [ ] **Step 4: Run the responsive visual smoke suite**

Run: `npm run test:visual -- --grep @visual-smoke`

Expected: PASS with no horizontal document overflow, clipped required copy, obscured final field, overlapping fixed control, or action-layer movement.

- [ ] **Step 5: Run the complete web gate**

Run: `npm run verify`

Expected: security scan, unit tests, Vue tests, strict typecheck, and production build all PASS.

- [ ] **Step 6: Check formatting and repository state**

Run: `git diff --check`

Run: `git status --short`

Expected: no whitespace errors; only intentional implementation/test files are modified.

- [ ] **Step 7: Commit final responsive coverage**

```powershell
git add tests/vue/app-dialog-shell.scenario.test.ts tests/vue/app-form-layout.scenario.test.ts tests/vue/workflow-dialogs.scenario.test.ts tests/ui-visual-smoke.test.ts tests/visual/visual-smoke.spec.ts tests/visual/helpers/visualSmokeState.ts tests/ui-responsive-contract.test.ts
git commit -m "test: cover responsive dialogs and forms"
```

---

## Completion Checklist

- No direct `v-dialog` exists outside `AppDialogShell.html`.
- Only the two approved bottom-sheet owners remain.
- Every identified editable form uses `AppFormLayout` or an explicit shared form-row utility.
- Admin Sync follows Purchasing Setup in normal flow without an artificial gap.
- Live, Game, Singles, and Portfolio consume shell tokens rather than local chrome offsets.
- Interactive controls in migrated surfaces meet the 44px hit-area requirement.
- Long English and French text fits at 320px without hiding required copy.
- Dialog focus, scroll, safe-area, keyboard, and action behavior is consistent.
- Dark and light theme visual states pass.
- `npm run verify` and `git diff --check` pass.
