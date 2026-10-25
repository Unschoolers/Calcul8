# Portfolio and Preorders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox syntax. Julien explicitly authorized four parallel Luna workers and immediate execution after this plan; no additional plan approval checkpoint.

**Goal:** Deliver the approved portfolio structure and a single receipt-date model that supports preparing prices and safely recording preorders.
**Architecture:** A small pure receipt helper and shared state contracts are established first. Four independent workers then own receipt persistence/editor, sale confirmation, analytics/data, and portfolio UI. Integrate in dependency order and validate as one feature branch.
**Tech Stack:** Existing strict TypeScript, Vue, Vuetify, Chart.js, Vitest and shared generated contracts; no new runtime dependency.
**Spec:** `docs/superpowers/specs/2026-10-24-portfolio-preorders-design.md`.

## Global Constraints

- Mobile-first; mobile 360×740 / 390×844, tablet 768×1024, desktop 1280×800 / 1440×900; FR/EN, light/dark and keyboard.
- SOLID through focused responsibilities and typed props/ports; reuse current mechanisms, no speculative workflow engine, payment ledger, reservation system or new dependencies.
- One optional `expectedReceiptDate?: string` on LotSetup (inherited by Lot and AppState). Present nonempty date means awaiting; past dates remain awaiting. Blank/absent means received.
- Dates are real YYYY-MM-DD calendar dates. Invalid input must report an error, never silently clear a previous awaiting state.
- Preorders are fully paid. Purchase cost/date remain unchanged. Receipt changes no prices, quantities, games or sales.
- Pricing/calculation and game setup remain accessible before receipt; existing Pro rules remain.
- Interactive preorder sales need confirmation before consumption; cancellation has no sale/inventory/game effect. Actual sales never mark received. Automated imports keep working.
- Portfolio: Overview / Analytics / Details, subdued internal navigation; shared receipt/type/lot/preset filters. Realized profit and capital to recover side by side.
- All-history analysis, including sales by person. Same sales data for total/person grouping; count means transactions.
- Visually separate received stock and preorders. No duplicate investment, no fake loss or stalled-sale recommendation due solely to awaiting receipt.
- Preserve current attribution to last modifier and its note, reports/Pro, buyer drilldown, local-first data and workspace isolation.
- Tests assert behavior, observe RED before changes and GREEN afterward. Do not weaken unrelated tests or hide errors.
- Each worker commits only its assigned files. No subagents. Controller integrates/reviews; do not push or merge from worker branches.
- User authorization overrides the skill's sequential-worker default: four workers execute in isolated git worktrees, not a shared index. Cross-owner changes are requests to the controller.
- Focused tests during work; controller runs final web/shared/API/realtime verification. Each report names any unverified item.

## Task Checklist

- [x] Read approved design, current source and repository guidance.
- [x] Establish and test shared contracts — d336f0a; receipt helper regression and 48 generated contracts.
- [x] Run four Luna implementations concurrently with disjoint ownership — receipt, sales, analytics and portfolio UI worktrees; scoped senior validation.
- [x] Review each diff for spec and quality; fix meaningful findings — original task reviews plus final recovered-delta senior review PASS at 155b5e6.
- [x] Integrate, run required verification and visual geometry checks — evidence below.
- [x] Verify every approved product outcome locally; preserve the main branch.
- [ ] Blocked: publish feature branch and PR — automatic approval review requires explicit authorization to upload code to Unschoolers/Calcul8. No remote mutation succeeded.

## Review Focus

1. Zero matching lots must remain empty in customers, summaries, charts and report; Task 3 + Task 4 test.
2. Dismissing a preorder confirmation or changing lot/workspace before acceptance must not commit stale writes; Task 2 tests.
3. Saving/clearing receipt must round-trip local and cloud, and a new lot must not inherit another lot's date; Task 1 tests.
4. Overview/Details must hydrate without a canvas, then charts appear correctly after switching views; Task 3 + Task 4 tests.
5. USD/CAD and fully paid preorders must reconcile to investment 1500, realized profit 80 and net capital 1100 in the design example; Task 3 + Task 4 tests.

## Parallel File Ownership

| Worker | Owns | Must not edit |
| --- | --- | --- |
| 1 Receipt | shared sync contracts and generated outputs; config create/edit/load/normalize; config context; App.html create/edit fields; lot selectors; receipt/config/lots translations | Portfolio files, sales.ts, game commands, common types/state after bootstrap |
| 2 Sales | sales.ts and receipt confirmation helper; interactive Whatnot review; game consumption-entry commands; sale/whatnot/wheel translations; focused tests | Receipt editor/persistence, common app types/state, portfolio |
| 3 Analytics | app-core portfolio computed/context, sales-charts, history/config builders, watch/context-watch; portfolio receipt summary module; relevant unit tests | Portfolio components/styles/locales, App.html and config context |
| 4 Portfolio UI | components/windows/portfolio/**, portfolio locales, report component display, Vue scenarios | app-core portfolio computed/context, state/types, sales/config and shared contracts |
| Controller | Plan/spec/ledger, shared bootstrap, integration fixes, final validation | No concurrent edits in worker-owned worktrees |

Worker 3 and 4 communicate through the frozen contracts below. File ownership permits no simultaneous edits to one checkout; workers run separate branches and commits are cherry-picked.

## Frozen Interfaces

Controller bootstrap:
- `src/shared/lot-receipt.ts`: `normalizeExpectedReceiptDate(value: unknown): string` returns "" for absent/blank and throws RangeError for invalid/non-date input; `isLotAwaitingReceipt(lot: { expectedReceiptDate?: string | null }): boolean` uses nonempty presence, not today's date.
- `PortfolioSection = "overview" | "analytics" | "details"`; `PortfolioReceiptFilter = "all" | "received" | "awaiting"`; `PortfolioSalesGrouping = "total" | "person"`.
- AppState `portfolioSection`, `portfolioReceiptFilter`, `portfolioSalesGrouping`; defaults overview/all/total. Existing `portfolioSalesByUserPeriod` defaults "all".
- AppState `newLotExpectedReceiptDate`, `renameLotExpectedReceiptDate`: strings, defaults "". `expectedReceiptDate` defaults "" as active-lot edit state.
- Worker 3 adds `"sales"` to PortfolioChartViewMode and adjusts chart-related type consumers; default remains trend for compatibility until UI explicitly selects an analysis. This extension is implemented in the analytics branch so bootstrap remains type-correct.

Worker 3 produces:
- `PortfolioComputedState.portfolioReceiptSummary`: `PortfolioReceiptSummary`.
- `PortfolioReceiptSummary` exported from `src/app-core/computed/portfolio-receipt.ts`:
  `{ received: { lotCount: number; totalCost: number }; awaiting: { lotCount: number; totalCost: number }; nextExpectedReceiptDate: string | null; realizedProfit: number; capitalToRecover: number }`.
- Each allLotPerformance row carries optional `expectedReceiptDate?: string`; totals/summary use the same selected IDs. Existing portfolioTotals fields retain definitions.
- Chart canvas refs remain directly on PortfolioWindow: `portfolioChartCanvas` (overview trend or selected non-person analysis) and `portfolioSalesByUserChartCanvas` (sales analysis). UI must not nest those refs in child components without coordinating lifecycle.
- `initPortfolioChart` remains callable independent of a rendered canvas; hydration always runs. Sales chart builder accepts optional `grouping?: PortfolioSalesGrouping`, summing same weekly series for total. No hidden eight-week restriction in portfolio computed.
- Worker 4 exposes `portfolioSection`, `portfolioReceiptFilter`, `portfolioSalesGrouping`, `portfolioReceiptSummary` and `initPortfolioChart` through existing narrow capability ports. Changes schedule chart refresh after Vue rendering.

### Task 0: Controller bootstrap and clean baseline

**Files:** Create `src/shared/lot-receipt.ts`, `tests/lot-receipt.test.ts`; modify `src/types/app.ts`, `src/app-core/state.ts` only for the frozen interface fields.
**Interfaces:** Produces all bootstrap interfaces above; no persistence/UI behavior yet.

- [x] Run clean baseline `npm test -- --maxWorkers=2`; record any failures before changes.
- [x] Write tests: absent/blank -> ""; valid leap date preserved; 2026-02-30 and wrong format throw; old valid date remains awaiting; blank absent received.
- [x] Run `npm test -- tests/lot-receipt.test.ts --maxWorkers=2`; observe missing behavior.
- [x] Implement the helper and state/types; run focused tests then typecheck. Commit bootstrap.
- [x] Create four isolated worktrees from this commit, sharing installed dependencies through symlinks; launch four Luna workers with task briefs.

### Task 1: Receipt persistence, editing and lot context

**Files:** `shared/contracts/sync-contracts.ts` and its generator outputs; `src/app-core/methods/config-lot-crud.ts`, `config-lots.ts`, `config-lot-loading.ts`, `config-lot-edit.ts`; `src/app-core/shared/normalize-lot.ts`, `lot-option-items.ts`; `src/app-core/context/commerce.ts`; `src/App.html`; lot selector components; receipt display component if useful; config/lots locales.
**Tests:** Existing config CRUD/loading/edit/storage and sync contracts/API syncShape suites plus `tests/lot-receipt-persistence.test.ts`; focused Vue create/edit scenario.

**Interfaces:** Consumes bootstrap. Persists expectedReceiptDate, uses new/rename draft fields, and adds date/badge metadata to LotOptionItem without changing option identity. No extra status flag.
- [x] RED: create awaiting lot; load/edit it; clear receipt; verify reloading/DTO roundtrip stays cleared; legacy lot received; next lot gets blank; invalid date reports error and leaves current lot unchanged.
- [x] Run focused config/sync tests and record expected RED output.
- [x] Implement explicit contract field and date validation at API/editor boundaries; generate via `npm run shared:generate`. Ensure authoritative lot write routes preserve the field, not only snapshots.
- [x] Add one optional date control to create/edit, with translated help explaining blank=received and a clear-date receipt action. Preserve existing save guard, dirty detection and cloud/workspace queue on date-only changes.
- [x] Add preorders to global selector context with a badge/date; preserve prices/calculator, current quantity behavior, and permissions. Include field in getCurrentSetup/load without copying it from current lot at creation.
- [x] GREEN targeted tests, template compile/typecheck as applicable; report changed files, RED/GREEN commands and any dependency on integration; commit.

### Task 2: Confirmation before preorder consumption

**Files:** Create focused helper `src/app-core/methods/sales-preorder-confirmation.ts`; modify `src/app-core/methods/sales.ts`, interactive Whatnot confirm flow, game command entry points before irreversible draws/consumption, and their narrow context types if needed. Own sales/whatnot/wheel locales; use existing askConfirmation.
**Tests:** `tests/sales-preorder-confirmation.test.ts`, relevant sales, Whatnot and game tests; Vue sale confirmation scenario if needed.
**Interfaces:** Consumes receipt helper. Confirmation helper takes structural ports with askConfirmation and affected lots; no app-global permission setting. Reuse captureWorkspaceScopeGuard and operation snapshots.

- [x] RED: manual new sale awaiting pauses before persistence; cancel leaves sales/date/stock intact; accept persists once; received lot unchanged; pure price changes never prompt.
- [x] RED: editing sale prompts only for increased inventory consumption; stale lot/scope after acceptance cannot commit stale write.
- [x] RED: interactive Whatnot batch confirms affected awaiting lots once before apply; cancellation sends no request; existing frozen retries and automatic imports remain functional.
- [x] RED: live game draw/consumption of awaiting sources confirms before random result is engaged; preview/setup does not prompt; cancellation has no spin/stock effect. Use a session-scoped current-source approval snapshot invalidated on scope/session/source changes rather than a permanent flag. Cover wheel/grid/bracket entry paths actually present in code.
- [x] Implement minimal reusable confirmation and caller hooks. Copy FR title "Vendre avant réception ?" and actions "Annuler" / "Enregistrer la vente"; localized text explains receipt remains pending. Use appropriate existing translated action for batch/game context.
- [x] GREEN targeted tests, no swallowed errors, no duplicate write or permission weakening; commit/report. Ask controller for common type additions rather than editing Task 1's config context.

### Task 3: Portfolio data and chart lifecycle

**Files:** `src/app-core/computed/portfolio.ts`, new `portfolio-receipt.ts`, `src/app-core/context/portfolio.ts`, `watch.ts`, `context/watch.ts`, `methods/sales-charts.ts`, chart builders/history if necessary; existing related tests.
**Interfaces:** Produces summary and row metadata exactly as Frozen Interfaces. Owns data/charts; UI owned by Task 4.
- [x] RED: receipt all/received/awaiting filters combine with selected IDs/type/preset; no matches yields empty data, including customer scope.
- [x] RED: design money example reconciles costs 1000+500, revenue400, realized80, capital1100; USD conversion uses existing functions; receipt doesn't change realized sales.
- [x] RED: all-history person chart includes old sales; total grouping weekly values exactly sum person series; count remains transactions.
- [x] RED: hydration starts without any canvas; absent primary canvas does not block sales chart; no chart on hidden/detached view; switching filters/section/language refreshes safely.
- [x] Implement summary from selected rows and lot metadata. Exclude awaiting lots from at-risk/needs-first-sale/profit-winner prompts where they imply available stock; forecasts remain available.
- [x] Refactor chart initialization into independent lifecycle paths with hydration separate from canvas rendering. Keep initPortfolioChart public; build only the chart relevant to current section/analysis. Preserve overview compact trend.
- [x] Add section/receipt/grouping watchers using $nextTick, refresh for cache updates and receipt changes; maintain narrow types.
- [x] GREEN focused portfolio/volume/chart/hydration tests; update tests whose eight-week assumptions are deliberately replaced with all-history; do not weaken unrelated assertions. Commit/report.

### Task 4: Portfolio views, KPI and explicit stock separation

**Files:** `src/components/windows/portfolio/**`, portfolio locales, report presentation; `tests/vue/portfolio-*.scenario.test.ts`, existing portfolio UI/source-contract tests.
**Interfaces:** Consumes Frozen Interfaces; data may be test-fixtured until Task 3 is integrated. Do not implement finance calculations a second time.
- [x] RED Vue scenario: initial Aperçu, accessible subdued Aperçu/Analyses/Détails switch with keyboard; global filters remain across sections.
- [x] RED: display realized profit and capital-to-recover side by side, separate Stock reçu / Précommandes blocks with their counts/costs, total without duplication, including empty/date-passed cases.
- [x] RED: Analyses exposes explicit analysis selector; sales exposes measure + total/person; no person-only period. Preserve week drilldown, attribution note, accessible legends.
- [x] RED: Détails shows grouped received/awaiting rows with date badges; Lots/Clients local selector; no-matching-lots customer list stays empty; searching/sorting/quick-view preserved.
- [x] Implement lean panels using existing metric/card/table primitives and theme tokens; keep chart canvas refs on window. Split focused panels where it reduces large template complexity; no generic dashboard framework.
- [x] Fix portfolioPerformanceLots empty-selection fallback using actual selected IDs, not a fallback to all lots. Summary and report preserve selected scope and identify receipt category.
- [x] Ensure investment curve copy says investment recovery rather than realized profit; forecast values labeled. Fit primary KPI at phone width and large-text fallback.
- [x] GREEN component/unit/template tests; update old template-shape assertions for intentional structure changes with behavior coverage. Commit/report.

### Task 5: Controller integration, review and release preparation

**Files:** Shared integration only, spec/plan evidence and actual narrow fixes required by reviews.
- [x] Review all four commit ranges with fresh reviewers; fix Important/Critical findings in owner branches. Integrate receipt, sales, analytics, UI commits without overwriting work.
- [x] Run `npm run verify`, install API/realtime dependencies as needed, then `npm run verify:all` because shared contracts changed. Record exact outcomes and any baseline failures separately.
- [x] Attempt native visual smoke; environment HTTP/browser-download interception prevented that path. Verify the actual compiled app through local Playwright route fulfillment instead: all three sections, report, keyboard, canvas dimensions, money/text fit, scope, no runtime errors or horizontal overflow at the full required matrix. Component tests remain primary.
- [x] Broad final review of the whole feature branch by a senior reviewer. Resolve meaningful findings; inspect diff and approved requirement checklist.
- [x] Commit integration fixes and prepare the complete patch against main 29e76f1.
- [ ] Blocked: publish feature branch and open reviewable PR after explicit upload authorization. Main remains unchanged.

## Final integration evidence

The feature is complete and committed locally on `feat/portfolio-preorders`. Publication is the sole authorization gate. Four isolated Luna implementation tracks were validated by independent senior reviews. A broad Astra review found five integration gaps; their cohesive correction and the final sales recovery were independently reviewed by Sol after Astra became unavailable due to its usage limit. Final recovered spec and quality verdicts are PASS, including the two label expectations and the shorter mobile no-sales copy. No Critical or Important finding remains open.

| Requirement | Implementation and regression evidence |
| --- | --- |
| Single receipt datum, explicit reception, full paid investment | `lot-receipt.ts`, lot creation/edit/load, shared sync DTO and API validation; blank clears round-trip and malformed inputs fail explicitly. Existing prices, dates, quantities and games remain intact. |
| Safe interactive consumption | Shared confirmation before manual increases, interactive Whatnot and live wheel/grid/bracket; cancel, stale scope/config/reset, duplicate draw and frozen-retry regressions. Confirmations list affected lots/dates and relevant transaction count. |
| Consistent portfolio scope and all-history sales | Shared receipt/type/lot/preset scope, candidate hydration independent of canvas, empty scope stays empty; total/person sums reconcile and counts mean transactions. |
| Finance and receipt UX | Realized profit and net capital recovery; separate received/preorder paid costs, secondary net revenues and investment; future receipt selection and overdue confirmation copy. Details/report distinguish realized results from neutral investment balance. |
| Details and import preview | Actual financial rows grouped by receipt, chosen sort within each group; customer search/drilldown/report retained. Mapped Whatnot preview follows selected lot receipt metadata. |
| Lean implementation | Existing Vue/Vuetify/Chart.js and finance calculations reused, no new runtime dependencies or payment/reservation engine; orphaned Pulse presentation removed while active insights remain. |

| Verification | Result |
| --- | --- |
| `npm run verify` | Exit 0: 205 unit files / 1941 tests, 45 Vue files / 358 tests; strict application checks, 58 external templates, shared checks, security scan and production build passed. |
| `npm run verify:all` | Exit 0: web coverage 248 files / 2260 tests; API 104 files / 744 tests plus 8 runtime protocol checks; realtime build plus 25 tests. Required coverage thresholds passed. |
| `npm run coverage:hotpaths` | Exit 0; frontend and API coverage summaries loaded. |
| Final copy follow-up | Two no-sale placeholder translations only; existing mounted report/import suite 4/4 passed and static senior review PASS. |
| Real-browser visual and keyboard matrix | 20/20 PASS after final copy: actual compiled app, exact local MDI font assets, native keyboard and collapsed-report text/value clearance; no application/source bypass. |

The canonical verification commands ran with `VITEST_MAX_WORKERS=2` in UTC, matching CI. This host's login shells reset an inherited `TZ=UTC` to Australia/Sydney; a QA-only Node preload containing `process.env.TZ = "UTC"` restored UTC for nested Node processes. Before that correction, five unchanged API date fixtures failed because a March 1 UTC timestamp became March 2 in Sydney; the same 46 focused tests then passed in UTC. No application behavior or test assertion was changed for this environment issue. Interrupted checks also left generated `*.template-check-*.vue` files; only untracked generated files were removed before clean sequential checks. The pre-existing Vite chunk-size warning remains unchanged.

Responsive coverage: 360×740, 390×844, 768×1024, 1280×800 and 1440×900, each EN/FR and light/dark. Checks include paired primary KPIs, full money text, receipt separation, actual chart dimensions/lifecycle, internal Enter/Space navigation, Details/customer scope, collapsed report receipt and label/value fit, bottom navigation clearance after a real user scroll, no page errors and no horizontal overflow. Native HTTP smoke was replaced only at the environment transport boundary by serving the real built resources through Playwright routes.

Independent review and controller closure: [final review](../reviews/2026-10-24-portfolio-preorders-review.md).
