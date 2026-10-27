# CI security fixture correction

Base: `e9bed139cb01bc2efe3ae2b1755677fa4739f541`, PR #47.

## Scope and evidence

Run 40511766498 failed in `Validate web`: the generic assignment detector flags dummy configuration data in `apps/api/test/provider-readiness-cli.test.mjs`. Its existing fixture exception recognizes `.test.ts` but not Node's `.test.mjs` files. Local `node scripts/security-scan.mjs` reproduces that finding with exit 1.

Apply the existing generic-fixture policy consistently to `.test.mjs`; preserve all provider-specific credential/private-key detectors and forbidden tracked artifact checks. Do not change OAuth code, its tests, workflows, coverage thresholds, or production deployment. The wider CI/deployment unification remains separate work.

## Task checklist

- [x] Capture the failing run and inspect the implementation, root AGENTS.md, coding standard and repository organization guidance.
- [x] Reproduce the exact failure with the unmodified scanner (exit 1, same file and detector).
- [x] Observe the Node runtime fixture regression fail before the fix (1 failed, 7 passed), then all 8 pass afterward. Tests exercise the real scanner against isolated Git fixtures, including rejection cases.
- [x] Apply the existing generic-fixture exception to `.test.mjs` only; credential/private-key detectors and artifact checks are unchanged. Add the regression suite to strict web test typechecking.
- [x] Run the focused suite, real repository scan and required `npm run verify:all`; record aggregate-wrapper environment failures and passing direct constituent checks below.
- [x] Obtain independent senior review and inspect its findings. One Terra 6.1 reviewer inspected the exact diff and independently reran the focused suite (8/8), with no findings. Implementation delegation is N/A: one-line correction with directly owned regression work.
- [x] Review the final diff and confirm OAuth/API/realtime code, existing tests and workflows are unchanged.
- [ ] Publish the correction to PR #47's branch and observe the new PR CI result. Record remote evidence in the PR description and final response. No merge or production rollout.

## Verification

- `npm exec -- vitest run --config vitest.config.mjs tests/security-scan.test.ts`: RED 1 failed / 7 passed; GREEN 8 passed (Node 24.22.1). Independent reviewer confirmed GREEN 8/8.
- `node scripts/security-scan.mjs`: original repository failure reproduced before the change; exits 0 afterward.
- First `npm run verify:all` under Node 22.23.4 failed five provider-readiness CLI output assertions because this host enables Node's environment proxy. Even `node -e ''` emits an `UNDICI-EHPA` experimental warning on stderr. No application or test changes were made to accommodate that host warning.
- A Node 24.22.1 full run exposed three existing Whatnot `importService.test.ts` date-dependent failures: attaching a manual duplicate candidate, grouping customer/title rows against a manual sale, and suggesting a grouped sale despite title drift. The same cases failed on Node 22. The host default timezone is Asia/Jakarta, so a fixture's 18:00Z timestamp becomes the next calendar day. All 23 tests in that file pass with `TZ=UTC`, matching the GitHub runner.
- The aggregate `verify:all` wrapper starts login shells (`sh -lc`); on this host those reset `TZ` and `PATH`, reproducing the three date failures even when its parent is configured for UTC/Node 22. Required constituent checks were therefore also run directly under Node 22.23.4 and `TZ=UTC`, with the host-specific `NODE_USE_ENV_PROXY` unset for the offline suite. Web checks ran in dependency order: `npm run typecheck && npm run shared:check && npm run security:scan && npm run typecheck:tests:web && npm run test:coverage && npm run build` (exit 0, 249 files / 2,284 tests). API `npm run verify:ci` exited 0 with 882 tests and 35 runtime checks; realtime `npm run verify:realtime` exited 0 with 25 tests. No warnings or test errors were suppressed and no existing assertions were changed. The aggregate wrapper was not verified green locally; hosted Node 22 CI remains a separate publication gate.
- Web coverage: statements 79.74%, branches 70.85%, functions 84.76%, lines 82.55%. API coverage: statements 80.80%, branches 72.91%, functions 86.83%, lines 85.21%; all existing thresholds passed unchanged.
- Final `git diff --check` passed; `git diff --exit-code HEAD -- apps/api apps/realtime .github/workflows` confirmed those areas unchanged. The build retains its existing chunk-size warning; no bundle-size policy changes were made.
