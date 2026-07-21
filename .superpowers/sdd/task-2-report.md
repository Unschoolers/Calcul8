# Task 2 Report: Identity And Entitlements

## Status

Complete. Identity/session/account capabilities are separated from entitlement,
billing, purchase, and Pro-access capabilities. All migrated leaf modules use
named focused contexts and exact `FeatureMethodImplementation` method subsets.

## Commit

`eb20e29f031c582e9a19a7f947b6513b8429af3a` — `refactor(web): scope auth and entitlement contexts`

## Files Changed

- Context composition: `src/app-core/context-app.ts`, `src/app-core/context.ts`,
  `src/app-core/context/auth.ts`, and new `src/app-core/context/entitlements.ts`.
- Auth boundaries: `src/app-core/auth/session.ts` and the account/session modules
  under `src/app-core/methods/ui/auth`.
- Entitlement boundaries: aggregate-using files under
  `src/app-core/methods/ui/entitlements`, plus new
  `entitlements-access.ts` for the Pro feature-routing methods.
- Ownership cleanup: `src/app-core/methods/ui/common/base.ts` no longer owns
  `accessProFeature` or `requestPurchaseUiMode`; shared type re-exports in
  `src/app-core/methods/ui/common/shared.ts` now point at focused contracts.
- Tests: `tests/context-contracts.test.ts` and `tests/calculations.test.ts`.

## RED Evidence

The first architecture run failed as expected with ten aggregate `AppContext`
consumers:

- `src/app-core/auth/session.ts`
- `src/app-core/methods/ui/auth/account.ts`
- `src/app-core/methods/ui/auth/auth-session.ts`
- `src/app-core/methods/ui/entitlements/entitlement-access-defaults.ts`
- `src/app-core/methods/ui/entitlements/entitlement-cache.ts`
- `src/app-core/methods/ui/entitlements/entitlements-purchase-types.ts`
- `src/app-core/methods/ui/entitlements/entitlements-signin-service.ts`
- `src/app-core/methods/ui/entitlements/entitlements-status-service.ts`
- `src/app-core/methods/ui/entitlements/entitlements-stripe.ts`
- `src/app-core/methods/ui/entitlements/purchase-verification.ts`

The guard also failed because `context/entitlements.ts` did not yet exist.
After review, a second focused RED proved that `accessProFeature` and
`requestPurchaseUiMode` still lived in `uiBaseMethods`; both were then moved to
an entitlement-owned exact implementation object.

## Verification Evidence

- Required focused matrix: 11 test files, 77 tests passed.
- Pro-access behavior and architecture follow-up: 2 files, 122 tests passed
  (`context-contracts` 9 and `calculations` 113).
- `npm run typecheck`: passed.
- `npm run typecheck:tests:web`: passed.
- Final `npm run verify:all`: passed — web 1,309 tests, Vue 77 tests, API 498
  tests, realtime 11 tests, security scan, strict typechecks, and production
  build.
- `git diff --check` and staged `git diff --cached --check`: passed.

The first broad run exposed repeated AST parsing in the architecture scanner
under parallel load. The test helper now tokenizes each source once without
weakening coverage. A later broad attempt hit one unrelated transient API test
timeout; that test passed independently (6/6), and the final full gate passed.

## Review

Self-review found no runtime statement changes in login, logout, entitlement
cache, Stripe, Play, profile, account export, or account deletion flows. No
aggregate casts, `any`, or widened `unknown` substitutions were introduced.
Independent review found the common-base Pro-access ownership gap described
above; it was corrected and all gates were rerun.

## Concerns

None.
