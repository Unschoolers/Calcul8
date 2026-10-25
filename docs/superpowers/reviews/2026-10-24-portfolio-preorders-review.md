# Recovered final delta review

## Scope and checklist

Independent source/control-flow review of recovered Task 2 range `d26cc57..d75c81d`, integrated as `9e61bcb` after `5b7cea3`. Prior original findings in `task-2-review.md` are context; this is not another full review of the already-reviewed base `8041d24`.

- [x] Read AGENTS.md, coding standards, organization and visual-QA guidance, binding design/plan and Task 2 brief, original six findings, exact recovered diff and recovery report.
- [x] Inspect recovered game cache/source restoration, caller/context identities, synchronous received-only startup, pending/cached cancellation and duplicate protection, live-grid guard and preview compatibility.
- [x] Inspect localized affected-lot/date text and Whatnot affected transaction counts, skipped decisions, cancellation/frozen retry behavior and receipt preservation.
- [x] Inspect focused regression tests rather than rerun controller-owned suites; independently execute `git diff --check` (pass).
- [x] Review recovered UI range `8041d24..164b31e`, integrated as `b8f2197`, against the five known Important findings and two requested closures, plus related regressions.
- [x] Controller-owned final web/shared/API/realtime and rendered visual validation completed; see controller closure below. The reviewer did not rerun those suites or publish.
- [ ] N/A: implementation/RED execution, commits and PR creation are outside this read-only review assignment. Delegation is explicitly prohibited by the assignment.

## Interim Task 2 verdict

**Spec PASS for the recovered Task 2 delta. Quality PASS. No Critical or Important finding in this recovered range.**

The helper now retains exactly the current approval plus source IDs and receipt snapshot. The synchronous deep `GameWindow.lots` watcher compares relevant approved IDs/dates, including missing-lot changes, and clears approval on an approved source transition. Unrelated lots do not invalidate consent. Each live wheel/grid/bracket call invokes the helper even for received-only configured sources, so a received-only draw clears a mismatched cached approval synchronously before any await. Only awaiting sources await the returned promise; received-only startup remains synchronous.

Wheel and grid methods run on the GameWindow public context; bracket resolves that same parent context via `getGameContextSource`, consistent with `getWindowComponentContext()` and the parent watcher/reset path. Wheel reserves operation ownership before confirmation. Grid reserves its operation ID before confirmation. Bracket reserves its child command gate and captures parent outcome/session guards before confirmation. Reset invalidates pending helper revisions and settles cancellation; stale configuration/scope/mode snapshots prevent continuation. Existing shared-dialog dismissal routes through cancellation, and the manual imported-sale quantity-increase fix remains present.

The grid preview change bypasses the broad outcome snapshot only when `shouldRecordLiveSession` is false. Live grids still capture the outcome guard before the confirmation and recheck it before draw/reveal planning, after awaited selection/hash/animation work, and before/after recording. Command ownership remains in preview and live paths. The unchanged mounted-grid assertion is meaningful regression coverage for baseline preview initialization; the recovery does not weaken that assertion or its timeout.

The shared confirmation lists unique affected awaiting lot names with localized long civil dates. It excludes received and unrelated lots. Whatnot derives both affected IDs and transaction count from the decisions actually submitted, including frozen retry decisions, excludes either skip representation, and counts rows rather than item quantity. A fresh payload is frozen only after acceptance immediately before request; cancellation retains editable fresh decisions, while a genuine existing retry remains frozen. No recovered code writes receipt state or changes automated-import behavior.

Reviewed test coverage includes EN/FR names/dates, duplicate affected IDs, skip flag/action exclusion, quantity-versus-row count, frozen decisions versus changed visible review, actual live-wheel received/date restoration and synchronous startup, relevant-only watcher invalidation, pending reset/config/mode cancellation, duplicate command locks and unchanged mounted grid preview behavior. The worker reports 124 focused tests, one filtered mounted test and test TypeScript passing; those reported executions were not repeated or relabeled as independently run here. Controller validation remains required before release.

## UI and final integration

Reviewed exact recovered UI range `8041d24..164b31e` and integrated root `b8f2197`. **Final recovered-delta spec verdict: PASS. Final recovered-delta quality verdict: PASS. No remaining Critical or Important finding identified in either recovered range.** This is one staged recovery review; the already-reviewed base implementation was not re-reviewed wholesale.

The five known Important UI findings are closed by inspection and meaningful regression coverage:

1. **Next receipt:** `buildPortfolioReceiptSummary` accepts an explicit current civil date, supplied through existing `getTodayDate()`. Date comparison selects the earliest today/future estimate; overdue entries remain fully paid awaiting lots. An all-overdue scope yields null and the visible localized receipt-to-confirm fallback. Empty/received-only cases retain zero/null behavior; mixed-date tests include today.
2. **Commercial result versus investment:** Details gain/loss totals sum `realizedProfit` and use explicitly realized EN/FR labels. A paid unsold preorder contributes zero commercial gain/loss; actual positive and negative preorder sales remain counted. Report cash balance retains the original `totalProfit` value, is renamed investment recovery balance and rendered neutral on desktop and mobile. Actual realized result coloring is retained. Mobile report receipt metadata is in the card header, outside the expansion condition, so it is visible while collapsed.
3. **Actual grouped rows:** received/awaiting groups contain the existing financial rows rather than a second list of lot names. Rows are sorted through the existing sorter before partitioning, preserving relative order inside each group and both sort directions. Group membership uses receipt presence, never today's date. Existing customer mode, search, grid columns, mobile sortbar and empty-state paths remain intact. New wrappers do not defeat the grid's descendant row selectors.
4. **Secondary revenue:** Overview shows `portfolioTotals.totalRevenue` using the existing currency primitive and neutral tone. Existing investment/preorder breakdowns remain, with no added duplicate investment or alternate finance calculation. Rendered EN/FR scenarios cover the design's all/received/awaiting/empty-scope amounts.
5. **Interactive Whatnot preview:** receipt metadata is shown beneath the selected mapping and resolves from `row.selectedLotId`, using the same `LotOptionItem` metadata source as the existing selector. Changing from awaiting to received changes the visible metadata and removes the old date. EN/FR rendered scenarios cover this selection transition.

The two requested closures are also present: sell-through subtitle now explicitly describes sold share of purchased quantities in selected lots, including preorders, in both languages and fallback text; only the unused Pulse presentation files/registration and their exclusive model/stat helpers were removed. `portfolioPulseInsights`, its shared insight builder, and `lotPerformanceHighlights` remain connected and tested. Removed tests concern the deleted orphan presentation; relevant active insight and new behavior assertions remain.

Independent checks: exact range/source/test inspection, call-site search for the changed receipt-summary signature, stale Pulse reference search, and `git diff --check` all completed. No application source edits or test-suite reruns were performed by this reviewer. The worker report was still being written during review, so findings rely on actual code/tests, not its summary.

Controller final web/shared/API/realtime verification and compiled real-browser matrix/keyboard checks were still in progress at this review point. These are release-validation gates, not established passing evidence in this report. This review grants no publication permission; the controller's explicit user-approval constraint remains in force.

## Test-only follow-up closure

Reviewed `b8f2197..5cbb5b3` statically. **PASS: spec and quality verdicts remain PASS.** The entire commit changes exactly two label expectations in `tests/vue/workflow-dialogs.scenario.test.ts`, aligning desktop FR/EN and mobile FR report expectations with the approved recovery-balance labels. The `+$6.00` display checks and underlying `realizedCost === 14` / `totalProfit === 6` assertions remain unchanged, along with every other assertion. No application source or test behavior was weakened, and no suite was rerun by this reviewer.

Controller reported 42 workflow tests passing. That is controller-reported execution evidence, distinct from this independently inspected diff. Controller also reported cleaning 58 untracked generated template-check artifacts after their process ended; the observed working-tree status contains only the ongoing plan/spec edits. Fresh required final verification remains controller-owned and must establish its own passing evidence.

## Compact report copy closure

Reviewed exact `5cbb5b3..155b5e6` diff. **PASS; final spec/quality verdicts remain PASS.** Exactly two JSON string values change: `portfolioReportNoRealizedProfitShort` becomes “No sales” / “Aucune vente”. This matches its existing `row.salesCount > 0` conditional: the placeholder is used only when there are no sales. The longer `Yet` message, financial values, condition, styles and all other source remain unchanged. The concise replacement addresses the reported narrow French report fit without hiding a realized gain/loss. `git diff --check` passes; no other review or tests were run for this bounded follow-up.

Controller reports the existing four Vue scenarios passing, full `verify:all` exit 0 (web 2260, API 744, realtime 25, runtime 8 with coverage gates), and compiled 20/20 matrix plus keyboard/report checks. These remain attributed controller execution evidence; final rebuilt-copy browser validation is controller-owned. No remote publication is authorized or performed.


## Controller verification closure

After the independent static review, the controller observed clean exits from `npm run verify`, `npm run verify:all`, and `npm run coverage:hotpaths` in the CI UTC environment. Web: 1941 unit and 358 mounted tests; combined coverage suite: 2260. API: 744 plus 8 runtime checks. Realtime: 25. Required coverage thresholds, 48 shared generated artifacts, 58 external Vue templates, test TypeScript, security scan and builds passed.

Final actual-built-app Playwright matrix: 20/20 PASS across five required dimensions × EN/FR × light/dark, including Enter/Space navigation, primary money, report labels/values and collapsed receipt, real chart dimensions, empty customer scope, runtime errors, horizontal overflow and bottom-nav clearance. The final placeholder microcopy also passed the existing mounted suite (4/4) and static review.

The initial native HTTP/browser-download path was unavailable; the real bundle was served to Chromium through local route fulfillment. The host login-shell timezone and generated-template residue were corrected at the QA environment boundary; no date assertion or production logic was weakened. The existing Vite chunk-size warning is unchanged.

Product acceptance is complete. Julien subsequently authorized publication, and [PR #41](https://github.com/Unschoolers/Calcul8/pull/41) is open in Unschoolers/Calcul8. The uploaded implementation tree exactly matches the validated local tree. Main remains unchanged; GitHub Actions results are visible in the PR.
