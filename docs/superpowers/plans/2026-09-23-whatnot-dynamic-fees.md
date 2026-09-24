# Whatnot Dynamic Canadian Commission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estimate Whatnot Canadian commission for a lot from its selected vertical and the prior fixed 28-day period of tracked sales across the active scope.

**Architecture:** A pure versioned Canadian fee schedule and period calculator feeds an app-level scope-wide sales summary. `Lot.whatnotVertical` is persisted; current fee inputs are derived without replacing the stored legacy fee fields. New manually recorded Whatnot sales retain their fee at sale time, and exact imported payout remains authoritative.

**Tech Stack:** Vue 3, TypeScript, Vuetify, Vitest, shared CJS/ESM sync DTO contract, Node API.

**Spec:** `docs/superpowers/specs/2026-09-23-whatnot-dynamic-fees-design.md`

## Global Constraints

- Canada-only CAD thresholds: `[0, 10000, 20000, 35000, 50000, 65000, 85000]`; rate rows and September 21 anchor are in the spec. No other-country rate card.
- Four weeks means fixed 28-day local calendar-date periods; volume in one period sets the **next** period's locked commission.
- All new lots select a vertical; old lots remain unclassified until edited. Vertical belongs to lot, not to product autocomplete type.
- Keep fee profiles `whatnot` and `none`; leave processing estimates and `netRevenue` from imports intact.
- Count all eligible sales in active personal/workspace scope, including unclassified Whatnot lots; never limit volume by portfolio filters.
- Do not assume the cache is complete when sales are absent. Treat the calculated tier as an estimate, and avoid silently substituting a made-up vertical.
- Keep web and API strict TypeScript, English/French copy, and existing mobile/desktop/light/dark conventions.

## Review Focus

- An imported Whatnot sale in a lot later set to `none` must still count; an imported other-provider sale in a Whatnot lot must not. Pin source precedence in Task 3 tests.
- Missing cached sales for one lot must be surfaced as incomplete and trigger a scoped fetch, not produce a confident Standard tier. Pin in Task 3.
- An edited manual sale changing price or date must recompute its snapshot; descriptive edits preserve it. Pin in Task 4.
- A period crossing during an open app session must refresh the displayed tier and pricing. Pin an explicit clock/visibility refresh or equivalent in Task 4.
- USD-labelled lot revenue must use a validated CAD conversion; invalid currency/rate/date must not incorrectly advance tiers. Pin in Task 3.

---

### Task 1: Pure Canadian rate schedule and fixed periods

**Files:**
- Create: `src/domain/whatnot-fees.ts`
- Modify: `src/types/app.ts` (export the six-value `WhatnotVertical` type)
- Create: `tests/whatnot-fees.test.ts`

**Interfaces:**
- Produce `type WhatnotVertical = "sports" | "tcg" | "fashion" | "other_collectibles" | "coins" | "other"` in `src/types/app.ts`.
- Produce `getWhatnotCommissionPercent(vertical: WhatnotVertical, tier: 0 | 1 | 2 | 3 | 4 | 5 | 6): number`, `getWhatnotTier(grossCad: number): 0 | 1 | 2 | 3 | 4 | 5 | 6`, and `getWhatnotPeriod(dateOnly: string)` returning the start/end-exclusive dates of the period and preceding period, or `null` for an invalid/pre-rollout date.

- [ ] **Step 1: Write failing tests for all table cells and boundaries.** For each vertical assert `getWhatnotCommissionPercent(vertical, tier)` against the complete row in the spec; assert `getWhatnotTier(9999.99) === 0`, `getWhatnotTier(10000) === 1`, etc. Assert `getWhatnotPeriod("2026-09-21")` uses `2026-08-24` through `2026-09-20` for its prior window, and `getWhatnotPeriod("2026-10-19")` begins the next cycle. Reject invalid dates.
- [ ] **Step 2: Run red:** `npm test -- tests/whatnot-fees.test.ts` (fails on missing module).
- [ ] **Step 3: Implement one immutable table and calendar-date ordinal arithmetic** using the September 21, 2026 anchor and `Date.UTC` only for day arithmetic; never divide local epoch milliseconds by 24 hours. Return the period end as exclusive for unambiguous boundary tests.
- [ ] **Step 4: Run green:** `npm test -- tests/whatnot-fees.test.ts`; commit `feat: model Canadian Whatnot fee periods`.

### Task 2: Persist and edit the lot vertical

**Files:**
- Modify: `src/types/app.ts`, `src/app-core/state.ts`, `src/app-core/context/commerce.ts`, `src/app-core/context/shell.ts`, `src/app-core/methods/config-lot-crud.ts`, `src/app-core/methods/config-lots.ts`, `src/app-core/methods/config-lot-loading.ts`, `src/app-core/shared/normalize-lot.ts`, `src/App.html`, `src/components/shell/SystemConfigurationDialog.html`, `src/components/shell/shellPorts.ts`, `src/components/shell/workspaceDialogPorts.ts` as required by actual ports.
- Modify: `shared/sync-contracts.cjs`, `shared/sync-contracts.d.ts`, `src/app-core/i18n/locales/en/config.json`, `src/app-core/i18n/locales/fr/config.json` (and required modal locale files).
- Test: `tests/config-lot-crud.test.ts`, `tests/config-lot-loading.test.ts`, `tests/config-storage-methods.test.ts`, `tests/sync-service.test.ts`, `apps/api/src/lib/syncShape.test.ts`, relevant Vue scenario.

**Interfaces:**
- `LotSetup.whatnotVertical?: WhatnotVertical | null` and `Lot.whatnotVertical` inherit that optional field; `AppState.newLotWhatnotVertical: WhatnotVertical | null`; `normalizeWhatnotVertical(unknown): WhatnotVertical | null` in a single shared helper or the fee module.
- New lots require a validated explicit vertical in `configLotMethods.createNewLot()` and the pure factory. Old lots normalize invalid/missing values to `null` and allow the seller to set them from System Configuration regardless of the defaults switch.

- [ ] **Step 1: Add red tests** for creating both lot types with a vertical, rejecting an empty new-lot selection, preserving an unclassified legacy lot, changing its vertical, and `normalizeSyncLotDto` / `toSyncLotDtos` round trips. Include a rejected invalid value that does not turn into `other`.
- [ ] **Step 2: Run red:** `npm test -- tests/config-lot-crud.test.ts tests/config-lot-loading.test.ts tests/config-storage-methods.test.ts tests/sync-service.test.ts` and `npm --prefix apps/api test -- src/lib/syncShape.test.ts` (where applicable).
- [ ] **Step 3: Implement the field in each storage and hydration boundary.** Example: `lot.whatnotVertical = normalizeWhatnotVertical(value.whatnotVertical)` when reading stored lots; only emit valid non-null values from sync. Add a required, initially blank `v-select` in the new-lot modal and an always-editable current-lot selector in System Configuration with translated category labels and an unclassified legacy hint.
- [ ] **Step 4: Run green focused web/API tests and `npm run typecheck && npm run typecheck:tests:web`;** commit `feat: classify Whatnot lots by vertical`.

### Task 3: Scope-wide sales volume and current/next-tier estimate

**Files:**
- Create: `src/app-core/shared/whatnot-fee-summary.ts`
- Modify: `src/types/app.ts`, `shared/sync-contracts.cjs`, `shared/sync-contracts.d.ts`, `src/app-core/methods/lot-sales-api.ts`, `src/app-core/methods/sales.ts`, `src/app-core/methods/sales-portfolio-hydration.ts` or a dedicated scoped batch fetch hook, `src/app-core/state.ts`, `src/app-core/context/commerce.ts` / `src/app-core/computed/*` as required.
- Test: `tests/whatnot-fee-summary.test.ts`, `tests/sales-live-api.test.ts`, `tests/sales-portfolio-hydration.test.ts`, `apps/api/src/lib/syncShape.test.ts`.

**Interfaces:**
- `Sale.wasWhatnotSale?: boolean` is persisted for newly recorded manual Whatnot sales; imported `Sale.externalProvider === "whatnot"` takes precedence. A current Whatnot lot is the migration fallback for old manual sales without a flag.
- `summarizeWhatnotFeePeriod({ lots, salesByLotId, dateOnly, missingLotIds })` consumes all lots in the current scope, not a selected portfolio subset, and returns `currentTier`, `previousPeriodGrossCad`, `currentPeriodGrossCad`, `nextThresholdCad`, `isEstimate`, and period dates. Pure tests inject `dateOnly` rather than relying on the real clock.

- [ ] **Step 1: Add red tests** for CAD boundaries across different verticals/lots, no mid-period rate change, imported Whatnot after lot profile changes, other-provider exclusion, `priceIsTotal`, unclassified legacy lot contribution, USD conversion and malformed date/rate, missing cache status, and isolated scope changes. Include a sale provenance sync round trip.
- [ ] **Step 2: Run red:** `npm test -- tests/whatnot-fee-summary.test.ts tests/sales-live-api.test.ts tests/sales-portfolio-hydration.test.ts`; run the focused API sync test.
- [ ] **Step 3: Implement pure aggregation plus scoped hydration** using existing `getAllSalesByLotId` / `getSalesCacheEntry` and `fetchAuthoritativeAllSales`. Fetch missing lot data once per scope, reuse scope guards, refresh dependent computed results after cache fill, and do not treat a missing cache as an empty confirmed lot. For a profile switched away from Whatnot, count explicitly imported/marked Whatnot sales; reject explicitly other providers.
- [ ] **Step 4: Run green focused tests and both web/API typechecks;** commit `feat: derive Whatnot tier from scoped sales`.

### Task 4: Apply effective rates to pricing, preserve history, and show status

**Files:**
- Modify: `src/app-core/shared/whatnot-fee-summary.ts` (effective fee input helper), `src/app-core/methods/config-pricing.ts`, `src/app-core/methods/config-storage.ts`, `src/app-core/computed/forecast.ts`, `src/app-core/computed/portfolio.ts`, `src/app-core/computed/portfolio-forecast.ts`, `src/app-core/methods/sales.ts`, `src/app-core/methods/sales-core.ts`, `src/components/windows/game/services/wheelPricing.ts`, and other `calculateNetFromGross` / `calculatePriceForUnits` call sites found by `rg`. Keep the pure domain fee functions backward-compatible for existing callers.
- Modify: `src/components/shell/SystemConfigurationDialog.html`, `src/components/shell/workspaceDialogPorts.ts` (if needed), `src/app-core/i18n/locales/en/config.json`, `src/app-core/i18n/locales/fr/config.json`; test: `tests/calculations.test.ts`, `tests/computed.test.ts`, `tests/config-pricing-methods.test.ts`, `tests/sales-core.test.ts`, `tests/vue/system-configuration-menu.scenario.test.ts` or equivalent real menu/dialog scenario.

**Interfaces:**
- `resolveEffectiveWhatnotFeeInput(lotOrSetup, summary)` returns the legacy input unchanged for `none` or unclassified legacy lots, otherwise copies the input with `platformFeePercent` set from `getWhatnotCommissionPercent` and preserves processing fields. The stored lot fields remain stable.
- Newly saved manual Whatnot sales get `wasWhatnotSale: true` and estimated `netRevenue` using the tier for the sale date; keep exact imported `netRevenue`. Edits that change price/quantity/shipping or a manual sale's date recalculate it, while descriptive edits retain it.

- [ ] **Step 1: Add red tests** for `none` at 0% and unclassified legacy defaults, coins at 4% Standard, tiered TCG/fashion in current lot, portfolio and wheel forecasts, manual snapshot after tier rollover, edit semantics, an imported exact net amount, and an open-session date rollover.
- [ ] **Step 2: Run red:** `npm test -- tests/calculations.test.ts tests/computed.test.ts tests/config-pricing-methods.test.ts tests/sales-core.test.ts` and `npm run test:vue -- tests/vue/system-configuration-menu.scenario.test.ts`.
- [ ] **Step 3: Implement one effective-fee helper and pass its result to all affected fee calculations.** Check all call sites with `rg -n 'calculateNetFromGross|calculatePriceForUnits|calculateTotalRevenue|resolveFeePolicy' src`. Apply dynamic fees to new/prospective sales, not existing unsnapshotted history. Refresh the date dependency at local midnight and on app resume so a long-lived app changes periods without reload. Put a compact translated tier/rate/progress summary near the current lot's vertical selector with an estimate qualifier.
- [ ] **Step 4: Run focused tests, then `npm run verify:all` and `git diff --check`;** commit `feat: apply and explain Whatnot dynamic commission`.

## Integration and review

Review each task's diff and tests before moving to the next. Final review must verify that every source, current-lot, portfolio, live, and wheel calculation that uses Whatnot rates receives the same effective input; that legacy lots remain editable; that shared DTO normalization does not erase the vertical or sale provenance; and that the rate display is honest about incomplete tracked sales. Pull/rebase on the latest `main` before integration, use a non-force fast-forward, and inspect CI and deployment after pushing.
