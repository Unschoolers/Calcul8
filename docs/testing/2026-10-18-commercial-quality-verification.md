# Commercial quality verification — 2026-10-18

Base: `fba908fb4f3872abba9f79eb49e88010c7e8cff7`.
Verified implementation: `d0a7aeb3`; subsequent changes only add this evidence document.

## Result

`TZ=UTC VITEST_MAX_WORKERS=2 npm run verify:all` exited **0** on the integrated branch.

| Check | Result |
| --- | --- |
| Combined Node and mounted Vue coverage suite | 224 files, 1,938 tests passed |
| API coverage suite | 104 files, 743 tests passed |
| Local runtime-probe protocol tests | 8 passed |
| Realtime tests | 15 passed |
| Total in the comprehensive gate | **2,704 passed** |
| Application and test TypeScript checks | Passed |
| External Vue template typechecking | 59 templates checked |
| Shared contracts and secret scan | Passed |
| Web, API and realtime builds | Passed |
| Separate fast suite on the same implementation | 194 files, 1,711 tests passed |
| Fresh npm audits: root / API / realtime | 0 / 0 / 0 findings |
| Android configuration compliance | Passed: target SDK 36, Billing 8.3.0 |

The comprehensive log contained no Vue warnings, `RangeError` or `PromiseRejectCallback` blocks. Expected negative-path test logging and upstream build annotation notices were not suppressed.

## Coverage

Measured with Vitest and the V8 coverage provider **4.1.12**. The web report includes all `src/**/*.ts` and `src/**/*.vue` product files; the API includes all `src/**/*.ts` product files. Tests, declarations, dependencies and build output are excluded. Untested included product files remain in the denominator.

| Scope | Statements | Branches | Functions | Lines | Blocking floors: S / B / F / L |
| --- | ---: | ---: | ---: | ---: | --- |
| Web | 77.04% | 67.46% | 80.69% | 79.89% | 76 / 66 / 80 / 79 |
| API | 80.32% | 71.77% | 86.40% | 84.84% | 80 / 71 / 86 / 84 |

These are initial regression gates with some headroom, not complete-coverage targets. Vitest 4 changed V8 remapping, so percentages were remeasured rather than copied from Vitest 3. An intentionally impossible line threshold was also verified to fail.

V8 does **not** attribute compiled render branches to the external `.html` templates in this setup. Mounted scenarios verify their interactions, and the template checker verifies bindings, but the percentages above do not measure every template branch.

## Changes and review

- Context bridges retain their canonical source in a private WeakMap, avoiding undefined-property warnings on Vue instance proxies. Mounted wheel, grid and bracket checks assert that all Vue warning/error collections stay empty; the grid scenario also reveals a real cell.
- Animation test callbacks use timestamps relative to the monotonic start clock. A deterministic 20,000 ms start reproduced the former stack overflow before correction. Global RAF stubs are restored after every test.
- CI runs test typechecks and combined coverage gates. The fast Node suite excludes mounted Vue scenarios while compiling imported SFCs correctly.
- Dependency updates clear the current audits, including the same-major Capacitor/Vue/ws updates and the Vitest 4 migration. The API directly declares its own coverage provider. See [dependency details](2026-10-18-dependency-review.md).
- The loopback-only runtime probe rejects redirects, bounds requests, enforces fixture counts and reports unverifiable cleanup. Its eight local protocol tests run in API verification.

Five Luna implementers handled the scoped work, with separate Luna task reviews and an integrated review. All blocking findings were corrected and reviewed. The final integrated review found no P1/P2 defects.

Two implementation decisions carry practical costs: Vitest 4 required narrow test-hook and mock-type migrations; the comprehensive `verify:all` now runs the same coverage-based web/API checks as CI and therefore costs more than the ordinary focused `verify` or test commands. Both are covered by the successful comprehensive run.

The legacy `test:coverage:frontend:hotpaths` alias now invokes comprehensive web coverage, including mounted Vue scenarios and the configured floors. Use `test:fast` for the lighter Node test suite.

## Real-runtime acceptance still outstanding

Live Cosmos concurrency/transaction behavior, a 100-user application load test and Android device smoke were **not run**. This environment lacks the isolated local Functions/Cosmos setup, authenticated fixture accounts and Android SDK/device prerequisites. The protocol fixtures and in-memory repository tests do not establish those results.

The opt-in commands, isolation requirements and expected outcomes are in [the runtime validation runbook](commercial-runtime-validation.md). No production endpoint or production data was used.
