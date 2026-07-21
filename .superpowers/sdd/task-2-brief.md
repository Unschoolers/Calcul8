# Task 2: Migrate Identity And Entitlements

This is the first behavior-bearing domain in the repo-wide AppContext migration. Task 1 is committed at `a889c16533181570bf4c6b10566ac7c9d82d95ec` and provides `FeatureMethodImplementation<Context, Methods>` plus shrinking architecture allow-lists. Work directly in `F:\Sources\Calcul8` on `main` and commit this domain when green.

## Global constraints

- Preserve login, logout, cached entitlement, purchase routing, Stripe, Play, profile, account-export, and account-deletion runtime behavior exactly.
- Keep identity/session/profile ownership separate from entitlement/billing/Pro-access ownership.
- Do not replace aggregate dependencies with anonymous aliases, `any`, `unknown`, `as AppContext`, or broader casts.
- Use named focused workflow types; reuse existing service-level types when they are already coherent and make them depend on focused state/capability contracts.
- Follow TDD: tighten the architecture test first, run it, and capture the expected RED failures before production edits.
- Do not modify workspace, sync, commerce, Whatnot, buyer, game, watcher, or lifecycle files.

## Required files

- Modify `tests/context-contracts.test.ts`.
- Modify `src/app-core/context/auth.ts`.
- Create `src/app-core/context/entitlements.ts`.
- Modify `src/app-core/context-app.ts` and `src/app-core/context.ts`.
- Modify `src/app-core/auth/session.ts`.
- Modify aggregate-using files under `src/app-core/methods/ui/auth` and `src/app-core/methods/ui/entitlements`.
- Leave already-focused entitlement helper files unchanged unless their exported contracts must move to the owning context.

## Required ownership

`AuthMethodState` owns identity/session/account methods only:

```ts
initGoogleAutoLogin(): void;
renderGoogleSignInButton(): void;
promptGoogleSignIn(): void;
logoutCurrentSession(): Promise<void>;
clearPersonalAccountData(): Promise<void>;
```

`EntitlementMethodState` owns Pro-access and purchase methods:

```ts
accessProFeature(target: "autoCalculate" | "portfolioReport" | "salesTracking" | "expertMode"): Promise<void>;
requestPurchaseUiMode(mode: "simple" | "expert"): Promise<void>;
openVerifyPurchaseModal(): void;
startProPurchase(): Promise<void>;
verifyProPurchase(): Promise<void>;
closeStripeCheckoutModal(): Promise<void>;
startPlayPurchase(): Promise<void>;
verifyPlayPurchase(): Promise<void>;
debugLogEntitlement(forceRefresh?: boolean): Promise<void>;
```

`AppMethodState` must extend both interfaces, preserving the exact aggregate surface. Focused method objects must use `FeatureMethodImplementation` with exact implemented-method subsets.

Define named state/capability contexts from `AppState`, `AppVueContext`, `RuntimeMethodState`, `AuthMethodState`, and `EntitlementMethodState` as appropriate. Low-level `handleExpiredAuthState` must use a focused session/entitlement mutation capability instead of `Pick<AppContext, ...>`.

## Architecture test cycle

1. Remove auth/session/account/entitlement files from every temporary aggregate allow-list and add a directory assertion covering `src/app-core/auth`, `src/app-core/methods/ui/auth`, and `src/app-core/methods/ui/entitlements`.
2. Run `npm run test -- tests/context-contracts.test.ts` and capture RED listing the current aggregate consumers.
3. Migrate the domain until the guard is GREEN. Do not weaken or re-add migrated files to an allow-list.

## Verification

Run:

```text
npm run test -- tests/context-contracts.test.ts tests/auth-session.test.ts tests/account-actions.test.ts tests/entitlements-signin-service.test.ts tests/entitlements-signin-methods.test.ts tests/entitlements-status-sync-service.test.ts tests/entitlements-status-methods.test.ts tests/entitlements-purchase-service.test.ts tests/entitlements-purchase-methods.test.ts tests/entitlements-stripe-service.test.ts tests/entitlement-cache.test.ts
npm run typecheck
npm run typecheck:tests:web
npm run verify:all
git diff --check
```

All must pass. Self-review for behavior changes, moved-but-duplicated ownership, import cycles, casts, and missing method signatures.

Commit only this domain with message `refactor(web): scope auth and entitlement contexts`.

## Report

Write `.superpowers/sdd/task-2-report.md` with files changed, RED evidence, focused/full verification evidence, commit hash, and concerns. Return only status, commit hash, one-line test summary, and concerns.
