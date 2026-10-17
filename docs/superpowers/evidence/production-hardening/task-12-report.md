# Task 12: CAD portfolio aggregation

Portfolio calculations now keep each lot's native currency through cost, fee, sale-profit, and forecast calculations, then convert each final monetary result to CAD once. A shared rate normalizer rejects non-finite and non-positive USD-to-CAD rates before native cross-currency calculations, while leaving the configured native amounts and currencies unchanged.

Portfolio totals, per-lot profit and forecast rows, mode projections, customer gross spend, buyer quick views, seller charts and drilldowns, and history charts now use CAD. CAD is shown in chart labels and tooltips, portfolio/customer KPIs, desktop and mobile portfolio reports, and copied or saved TSV monetary column names. The sale editor continues to use its lot's native currency.

Regression coverage includes a mixed CAD/USD portfolio with Whatnot fees, native fee-based seller profit, mixed-currency forecasts, buyer/customer spending, chart and drilldown values, and invalid exchange rates (`Infinity`, `-1`, `0`, `NaN`) exercised through the portfolio calculation pipeline. The invalid-rate roundtrip verifies that a CAD 100 cost sold in USD returns to CAD 100 after native cost and final conversion.

Verification completed with:

- `TZ=UTC npx vitest run --config vitest.config.mjs tests/computed.test.ts tests/calculations.test.ts tests/customer-performance.test.ts tests/buyer-quick-view.test.ts tests/config-io-methods.test.ts tests/portfolio-window.test.ts tests/sales-chart-config.test.ts --pool=threads --maxWorkers=1 --minWorkers=1` — 7 files, 217 tests passed.
- `TZ=UTC npx vitest run --config vitest.vue.config.mjs tests/vue/workflow-dialogs.scenario.test.ts --pool=threads --maxWorkers=1 --minWorkers=1` — 1 file, 27 tests passed.
- `npx tsc --noEmit` — passed.
- `npm run typecheck:tests:web` — passed.
