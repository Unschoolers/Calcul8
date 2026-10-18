# Compatible minor and patch updates — verification evidence

Date: 2026-10-18

Baseline: `e0b9bb98d696c1fcbb59c657819ec3243f018072`

Integrated diff reviewed: `e0b9bb98..252a660c` in `Calcul8-quality`.

This update moves dependencies to current compatible minor/patch releases while preserving existing majors and runtime contracts. Registry metadata and `npm outdated` were checked freshly. Root, API, realtime, and CardSync now have no within-range package drift (`current == wanted`); the four audits report zero findings.

## Resolved dependency changes

Versions below are lockfile-resolved before → after values from the baseline-to-integration diff. Capacitor Core/Android and pre-1.0 Three stay on their compatible versions.

| Scope | Resolved changes |
|---|---|
| Web/root | `@vueuse/core` 14.3.0 → 14.4.0; `driver.js` 1.4.0 → 1.10.1; `vuetify` 4.0.6 → 4.2.6; `@capacitor/cli` 8.4.0 → 8.4.3; Playwright 1.61.0 → 1.64.1; Node types 25.5.2 → 25.9.9; Vue plugin 6.0.6 → 6.0.10; obfuscator 5.3.0 → 5.9.0; PWA plugin 1.2.0 → 1.3.0; `vue-tsc` 3.3.12 → 3.3.13. |
| API | Cosmos 4.9.1 → 4.9.3; Functions 4.11.2 → 4.16.5; Node types 22.19.11 → 22.20.5; rimraf 6.1.2 → 6.1.3. Vitest and coverage provider remain matched at 4.1.12; TypeScript stays 6.0.3. |
| Realtime | Node types 22.19.15 → 22.20.5; `@types/ws` 8.18.1 → 8.18.2. `ws` was already resolved at 8.22.0; its manifest lower bound was raised from 8.18.0 to 8.22.0. TypeScript stays 5.9.3. |
| CardSync | Cosmos 4.9.1 → 4.9.3; Node types 22.19.11 → 22.20.5. dotenv stays 16.6.1 and TypeScript stays 5.9.3. |

Capacitor Android and Core stay pinned at 8.5.3. Manifest changes also raise the minimum tested compatible versions; selected lockfile resolutions are recorded above.

## Deliberate compatibility exceptions

1. **Three:** keep `three@0.179.1` and `@types/three@0.179.0`. Their 0.x minor increments are breaking compatibility boundaries. The newer current line is 0.186.x.
2. **Cosmos:** API and CardSync use `~4.9.3` so a future install cannot drift into Cosmos 4.10.x, which requires Node `>=22`. Cosmos 4.9.3 supports Node `>=20`, matching the API manifest. Repository build configuration uses Node 22 for CI/build steps, but the deployed Azure Functions runtime is unproven; no production setting was read or changed. The current checker ran on Node 24.19.0, while CI is configured for Node 22.
3. **Capacitor CLI:** use 8.4.3 with Core/Android 8.5.3. CLI 8.5.0 introduces `xcode`, which brings an affected `uuid` dependency (GHSA-w5hq-g745-h8pq). No patched `xcode` release or compatible `uuid` fix was identified, so no cross-major override was added. `npx cap config` passed for the 8.4.3 / 8.5.3 combination; that is a configuration check, not a device test.

Other intentionally retained newer-major candidates include Node types 26.6.5, TypeScript 7.0.2, Vitest and coverage 5.0.5, dotenv 18.0.8, `@testing-library/jest-dom` 7.0.1, `@vueuse/core` 15.0.0, jsdom 30.1.3, Vite 8.3.4, PWA plugin 2.0.0. Existing Node types / TypeScript majors are preserved per scope, Vitest and coverage remain matched at 4.1.12, and dotenv remains on 16.x.

`apps/data-migrator/package.json` has no dependencies and was not changed.

## Validation and remaining gates

- Independent Luna review passed with no findings (review note: `quality-review/minor-review.md`).
- Independent `npm ci` passed for root/web, API, realtime, and CardSync.
- Fresh `npm audit` results: root, API, realtime, and CardSync each report 0 vulnerabilities.
- API scoped verification passed: build/shared contracts, test typecheck, 8 runtime-protocol tests, and 104 Vitest files / 743 tests. Coverage remained at statements 80.32%, branches 71.77%, functions 86.40%, and lines 84.84%.
- Realtime scoped verification passed: build and 15 tests. CardSync TypeScript build passed; CardSync has no test script or test directory.
- Web scoped checks passed: template/typechecks, Vue test suite (30 files / 227 tests), and targeted obfuscator/method tests. The Vuetify scenario adjustment was reproduced against 4.0.6/4.2.6 and preserves the asserted error text.
- Android config validation passed for target SDK 36 and Billing 8.3.0; this is configuration evidence only, with no device/emulator run claimed.
- Integrated `TZ=UTC VITEST_MAX_WORKERS=2 npm run verify:all` on `252a660c`: **passed (exit 0)**. Web: 224 files / 1,938 tests; API: 104 / 743; runtime protocol: 8; realtime: 15 — 2,704 tests total. Typechecks, 59 external Vue templates, shared-contract checks, security scan, and builds passed. Coverage: web statements 77.06%, branches 67.46%, functions 80.69%, lines 79.90%; API 80.32%, 71.77%, 86.40%, 84.84%. Existing floors were unchanged. No Vue warnings, RangeError, or PromiseRejectCallback blocks were detected. Log: `quality-review/minor-verify-all.log`.
- `npm run build:prod` on `252a660c`: **passed (exit 0)**; javascript-obfuscator 5.9 processed the expected app chunks. `node --check` passed for all 14 generated `dist/**/*.js` files. Log: `quality-review/minor-build-prod.log`.
- Both builds retain a visible Vite bundle-size warning: the Vuetify chunk is 663.02 kB / 208.99 kB gzip, above the existing 650 kB threshold; before this update it was 555.09 kB / 172.06 kB gzip. The threshold was not raised and the dependency-only change does not include bundle optimization; track this as a follow-up.

For the original quality-review findings and limitations, see [commercial quality verification](2026-10-18-commercial-quality-verification.md#real-runtime-acceptance-still-outstanding). That original evidence remains unchanged. The cited limitations around live Cosmos, authenticated production-like fixtures, and Android device access still apply.
