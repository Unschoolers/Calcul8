# Portfolio margin axis balance

**Goal:** Keep positive margins readable beside extreme losses, use rounded chart ticks, and let expanded Categories use their full height.

**Design:** Preserve actual margins and the linear positive scale. Choose round percentage ticks before converting their positions, and bound the compressed loss side to at most 25% of the plot when gains exist. All-loss charts use the available width; all-zero charts keep a nondegenerate axis. Keep detailed values in Categories and tooltips. Remove the Categories list's height and overflow limits.

**Scope:** Existing chart builder, its tests, and PortfolioWindow CSS. No financial formula changes or new dependencies. Follow `docs/codingstandard.md` and `docs/ui-visual-qa.md`; prefer unit/component tests, with browser geometry for the canvas and list.

## Checklist

- [x] Read repository guidance and trace the cause: an unbounded log transform still outweighed the positive range; automatically spaced transformed ticks produced −224%; Categories CSS capped the list at 12rem.
- [x] Capture the requested smaller negative area, rounded ticks, accurate detailed values, and uncapped Categories.
- [x] Obtain Terra review of the scale design and edge cases; apply rounded endpoint bounds and avoid clustered negative ticks.
- [x] Observe regression tests fail for the screenshot's gains/losses, round ticks, one-sided/zero data, and fractional/nonfinite inputs.
- [x] Implement bounded compression and explicit tick positions in `src/app-core/methods/sales-chart-config-portfolio.ts`; remove the Categories CSS cap.
- [x] Verify targeted unit/component tests and actual browser geometry on mobile/tablet/desktop in light/dark themes, including the last expanded category.
- [x] Run `npm run verify` and `npm run typecheck:tests:web`, review the final diff with Terra, and resolve findings.
- [ ] Commit and open a follow-up PR; record evidence and remaining limitations.

## Regression expectations

- With +14.8%, +11.2%, +9.9%, −15,000%, and −20,205%, gains retain their actual dataset values, zero is at most a quarter of the plot width from the left, and ticks use round whole percentages such as −30,000%, 0%, 5%, 10%, 15%.
- More-negative margins remain farther left, without clipping; tooltips keep values such as 9.9% and −20,205.0%.
- Positive-only charts start at zero; negative-only charts end at zero; zero-only charts have finite, nondegenerate bounds. Sub-1% data must not create duplicate rounded tick labels.
- Expanding Categories with 30 rows renders every row in page flow, without an inner vertical scrollbar.

## Verification evidence

- Red: three margin regressions failed before the chart fix; the finite-overflow regression also failed before its guard.
- Green: `npm test -- tests/sales-chart-config.test.ts` — 20 passed; `npm run typecheck:tests:web` passed.
- Native Chromium rendered the actual PortfolioWindow component and Chart.js with 30 fixture rows at 390px/dark, 768px/light, and 1024px/dark. Losses occupied 25% at each width; the 9.9% bar measured 101.8px, 279.4px, and 406.1px. Tick labels were −30,000%, 0%, 5%, 10%, 15%, with no measured overlap.
- Expanded Categories had 932px client/scroll height and no maximum height; the final row was reachable by normal page scrolling.
- The command-runner Chromium attempt was blocked by its socket sandbox, so browser verification used native Chromium with a temporary component fixture. This is component/browser QA, not a full end-to-end smoke pass. Temporary fixture files were removed.
- Final `npm run verify`: 1,962 web tests + 360 Vue tests passed; type checks, shared contracts, security scan, and production build passed. Existing >650kB bundle-size warnings remain. Terra reviewed the final diff and the overflow guard with no remaining findings.
