# Repo-Wide AppContext Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every aggregate `AppContext`, `AppMethodImplementation`, and `AppComputedObject` dependency outside the two-file context declaration/re-export boundary.

**Architecture:** Migrate leaf modules by domain onto named capability contracts under `src/app-core/context`. Preserve runtime behavior and validate each domain with strict TypeScript, focused tests, a repository-wide source guard, and a domain commit before final composition cleanup.

**Tech Stack:** Vue 3 Options API, strict TypeScript, Vitest, Vue Testing Library, PowerShell, Git.

## Global Constraints

- Preserve runtime behavior, storage semantics, API contracts, synchronization policy, and current Vue composition.
- Do not replace aggregate dependencies with anonymous aliases, `any`, `unknown`, or aggregate casts.
- Keep authentication/profile capabilities separate from entitlement and billing capabilities.
- Keep scope-aware behavior centralized and personal/workspace data isolated.
- Run `npm run verify:all` after every completed domain.
- Commit each completed domain on `main` and continue until the final architecture guard passes.

---

### Task 1: Establish The Final Architecture Guard And Focused Implementation Utility

**Files:**
- Modify: `tests/context-contracts.test.ts`
- Modify: `src/app-core/context/runtime.ts`
- Modify: `src/app-core/context.ts`

**Interfaces:**
- Produces: `FeatureMethodImplementation<Context, Methods> = ThisType<Context> & Methods`
- Produces: source scans for `AppContext`, `AppMethodImplementation`, `AppComputedObject`, and `as AppContext`

- [ ] **Step 1: Add a failing source scan**

```ts
const allowedAppContextFiles = new Set([
  "src/app-core/context-app.ts",
  "src/app-core/context.ts"
]);
```

Recursively scan `src/**/*.ts`; fail when any other file contains an import/reference to `AppContext`, or any source file contains `AppMethodImplementation`, `AppComputedObject`, or `as AppContext` after final cleanup. Keep temporary per-domain assertions so each commit can become green before enabling the final zero-use assertions.

- [ ] **Step 2: Run the guard and capture the expected failure**

Run: `npm run test -- tests/context-contracts.test.ts`  
Expected: FAIL listing the remaining aggregate consumers.

- [ ] **Step 3: Add the focused method utility**

```ts
export type FeatureMethodImplementation<Context, Methods> =
  ThisType<Context> & Methods;
```

Export it from `src/app-core/context.ts`. Domain method objects use an exact `Methods` interface rather than `Partial<AppMethodState>`.

- [ ] **Step 4: Run strict typechecks**

Run: `npm run typecheck && npm run typecheck:tests:web`  
Expected: PASS.

### Task 2: Migrate Identity And Entitlements

**Files:**
- Modify: `src/app-core/context/auth.ts`
- Create: `src/app-core/context/entitlements.ts`
- Modify: `src/app-core/context-app.ts`
- Modify: `src/app-core/context.ts`
- Modify: `src/app-core/auth/session.ts`
- Modify: `src/app-core/methods/ui/auth/account.ts`
- Modify: `src/app-core/methods/ui/auth/auth-session.ts`
- Modify: `src/app-core/methods/ui/entitlements/*.ts`
- Test: `tests/context-contracts.test.ts`
- Test: `tests/auth-session.test.ts`
- Test: `tests/entitlements-*.test.ts`

**Interfaces:**
- Produces: `AuthSessionContext`, `AuthAccountContext`, `AuthMethodImplementation`
- Produces: `EntitlementComputedState`, `EntitlementMethodState`, focused purchase/status/cache/Stripe/Play contexts
- Consumes: `ScopedApiContext`, `RuntimeMethodState`, `FeatureMethodImplementation`

- [ ] **Step 1: Tighten the auth/entitlement architecture assertions**

Assert that all files under `methods/ui/auth`, `methods/ui/entitlements`, and `app-core/auth` do not reference `AppContext` or `AppMethodImplementation`, and that `auth.ts` contains no purchase/billing methods.

- [ ] **Step 2: Run the focused guard and verify failure**

Run: `npm run test -- tests/context-contracts.test.ts`  
Expected: FAIL on current auth and entitlement consumers.

- [ ] **Step 3: Move billing ownership and migrate leaf types**

Move purchase, verification, Stripe, Play, and Pro-access method signatures from `AuthMethodState` to `EntitlementMethodState`. Define named workflow contexts from `AppState`, runtime capabilities, and public auth/session capabilities. Replace each aggregate `Pick<AppContext, ...>` with its owning focused type and each method object with `FeatureMethodImplementation`.

- [ ] **Step 4: Run focused verification**

Run: `npm run typecheck && npm run typecheck:tests:web && npm run test -- tests/auth-session.test.ts tests/entitlements-signin-service.test.ts tests/entitlements-signin-methods.test.ts tests/entitlements-status-sync-service.test.ts tests/entitlements-purchase-service.test.ts tests/entitlements-purchase-methods.test.ts tests/entitlements-stripe-service.test.ts tests/context-contracts.test.ts`  
Expected: PASS.

- [ ] **Step 5: Run the broad gate and commit**

Run: `npm run verify:all`  
Expected: PASS.  
Commit: `refactor(web): scope auth and entitlement contexts`.

### Task 3: Migrate Workspace And Sync

**Files:**
- Modify: `src/app-core/context/workspace.ts`
- Create: `src/app-core/context/sync.ts`
- Modify: `src/app-core/context-app.ts`
- Modify: `src/app-core/context.ts`
- Modify: `src/app-core/methods/ui/workspace/*.ts`
- Modify: `src/app-core/methods/ui/sync/*.ts`
- Test: `tests/context-contracts.test.ts`
- Test: `tests/ui-workspaces.test.ts`
- Test: `tests/ui-sync.test.ts`
- Test: `tests/sync-service.test.ts`

**Interfaces:**
- Produces: workspace API, membership, invite, realtime, scope, and UI contexts
- Produces: `SyncMethodState`, `SyncServiceContext`, `SyncApplyContext`, `SyncPayloadContext`, `SyncStatusContext`
- Consumes: neutral auth/session and scoped API capabilities from Task 2

- [ ] **Step 1: Add failing workspace/sync directory assertions**

Recursively assert that `methods/ui/workspace` and `methods/ui/sync` contain no aggregate context imports, helpers, or casts.

- [ ] **Step 2: Run the guard and verify failure**

Run: `npm run test -- tests/context-contracts.test.ts`  
Expected: FAIL listing workspace and sync consumers.

- [ ] **Step 3: Define workflow contexts and migrate workspace leaves**

Keep scope resolution in shared helpers. Give workspace API, membership, invites, realtime, and scope transitions named contexts that expose only their state and public capabilities. Replace aggregate casts passed to authenticated API helpers with structurally compatible focused contracts.

- [ ] **Step 4: Migrate sync leaves without changing recovery behavior**

Define separate payload-building, snapshot-apply, status, polling, and service contexts. Preserve debounce, in-flight guards, conflict handling, local-reset recovery, and personal/workspace migrations exactly.

- [ ] **Step 5: Run focused verification**

Run: `npm run typecheck && npm run typecheck:tests:web && npm run test -- tests/ui-workspaces.test.ts tests/workspace-members.test.ts tests/workspace-realtime.test.ts tests/workspace-scope.test.ts tests/ui-sync.test.ts tests/sync-service.test.ts tests/sync-contracts.test.ts tests/context-contracts.test.ts`  
Expected: PASS.

- [ ] **Step 6: Run the broad gate and commit**

Run: `npm run verify:all`  
Expected: PASS.  
Commit: `refactor(web): scope workspace and sync contexts`.

### Task 4: Migrate Commerce, Configuration, Sales, And Portfolio

**Files:**
- Modify: `src/app-core/context/commerce.ts`
- Modify: `src/app-core/context/portfolio.ts`
- Modify: `src/app-core/methods/config*.ts`
- Modify: `src/app-core/methods/live-singles.ts`
- Modify: `src/app-core/methods/lot-live-pricing-api.ts`
- Modify: `src/app-core/methods/sales*.ts`
- Modify: `src/app-core/methods/config.ts`
- Modify: `src/app-core/methods/sales.ts`
- Test: `tests/context-contracts.test.ts`
- Test: existing config, pricing, sales, live-pricing, and portfolio suites

**Interfaces:**
- Produces: focused lot configuration, pricing, storage, live-pricing, sale persistence, freshness, chart, and portfolio contexts
- Consumes: `ScopedApiContext`, runtime formatting/notification capabilities, focused sync/workspace public contracts

- [ ] **Step 1: Add failing commerce directory assertions**

Assert that root config, live-pricing, sales, and portfolio leaf modules do not reference aggregate context types or casts.

- [ ] **Step 2: Run the guard and verify failure**

Run: `npm run test -- tests/context-contracts.test.ts`  
Expected: FAIL listing commerce consumers.

- [ ] **Step 3: Migrate configuration and live pricing**

Define named contexts for lot IO, lot hydration, storage, price calculation, and queued authoritative live-pricing writes. Preserve state coercion, local-first saves, scope keys, cancellation, and optimistic version handling.

- [ ] **Step 4: Migrate sales persistence, charts, and freshness**

Separate authoritative API capabilities from local cache capabilities. Type chart scheduling with its exact Vue refs and next-tick needs. Keep stale-response protection and chart retry behavior unchanged.

- [ ] **Step 5: Run focused verification**

Run strict typechecks plus all `config-*`, `sales-*`, `live-*`, `portfolio-*`, `computed`, and `context-contracts` suites.  
Expected: PASS.

- [ ] **Step 6: Run the broad gate and commit**

Run: `npm run verify:all`  
Expected: PASS.  
Commit: `refactor(web): scope commerce and portfolio contexts`.

### Task 5: Migrate Buyer Profiles, Whatnot, Games, And Spectator Workflows

**Files:**
- Create: `src/app-core/context/buyers.ts`
- Modify: `src/app-core/context/whatnot.ts`
- Modify: `src/app-core/context/game.ts`
- Modify: `src/app-core/methods/ui/buyers/*.ts`
- Modify: `src/app-core/methods/ui/whatnot/*.ts`
- Modify: `src/app-core/methods/ui/spectator/*.ts`
- Modify: `src/components/windows/game/coordinator/gameControllerState.ts`
- Test: `tests/context-contracts.test.ts`
- Test: buyer-profile, Whatnot, game, wheel, and spectator suites

**Interfaces:**
- Produces: buyer profile cache/API/mutation contexts
- Produces: Whatnot HTTP/review/connection contexts
- Produces: game public-session, broadcast, and coordinator contexts
- Consumes: neutral scoped API, workspace ownership, auth/session, and runtime notification capabilities

- [ ] **Step 1: Add failing feature directory assertions**

Assert that buyer, Whatnot, spectator, and game coordinator modules contain no aggregate references or casts.

- [ ] **Step 2: Run the guard and verify failure**

Run: `npm run test -- tests/context-contracts.test.ts`  
Expected: FAIL listing feature consumers.

- [ ] **Step 3: Migrate each feature onto its own public contract**

Use buyer-specific cache/mutation state, Whatnot-specific provider state, and game-specific public-session/broadcast state. Do not move provider or game capabilities into shared runtime or commerce contracts.

- [ ] **Step 4: Run focused verification**

Run strict typechecks plus buyer-profile, Whatnot, game, wheel, spectator, and context-contract suites.  
Expected: PASS.

- [ ] **Step 5: Run the broad gate and commit**

Run: `npm run verify:all`  
Expected: PASS.  
Commit: `refactor(web): scope provider and game contexts`.

### Task 6: Migrate Runtime Composition And Remove Aggregate Helpers

**Files:**
- Modify: `src/app-core/context-contracts.ts`
- Modify: `src/app-core/computed.ts`
- Modify: `src/app-core/watch.ts`
- Modify: `src/app-core/lifecycle.ts`
- Modify: `src/app-core/methods/pwa.ts`
- Modify: `src/app-core/methods/ui/common/*.ts`
- Modify: `src/app-core/methods/ui.ts`
- Modify: `src/app-core/methods/index.ts`
- Modify: `src/app-core/context-app.ts`
- Modify: `src/app-core/context.ts`
- Modify: `tests/context-contracts.test.ts`
- Modify: `docs/refactorplan.md`
- Modify: `docs/c4/model/components/web.dsl`

**Interfaces:**
- Produces: focused shell computed, watcher, lifecycle, PWA, onboarding, and base UI contracts
- Removes: `AppMethodImplementation`, `AppComputedObject`, aggregate casts, and all non-allow-listed `AppContext` references

- [ ] **Step 1: Migrate remaining runtime leaves**

Type PWA, base UI, API client, onboarding, watcher groups, and lifecycle helpers with exact focused contracts. Keep the complete root method/computed objects validated against `AppMethodState` and `AppComputedState` without exposing `AppContext` to leaves.

- [ ] **Step 2: Enable the final repository-wide zero-use assertions**

Allow `AppContext` only in `src/app-core/context-app.ts` and `src/app-core/context.ts`. Assert zero occurrences of `AppMethodImplementation`, `AppComputedObject`, and `as AppContext` across frontend source.

- [ ] **Step 3: Run the final guard and strict typechecks**

Run: `npm run test -- tests/context-contracts.test.ts && npm run typecheck && npm run typecheck:tests:web`  
Expected: PASS with no aggregate consumer list.

- [ ] **Step 4: Update architecture documentation**

Remove the active migration item from `docs/refactorplan.md`. Update the C4 web component to state the exact two-file declaration/re-export boundary and focused feature consumption rule.

- [ ] **Step 5: Run complete verification**

Run: `npm run verify:all`  
Run: `git diff --check`  
Run: `npm run docs:c4:validate` when Docker is available.  
Expected: all repository gates pass; Docker unavailability is reported as an environment constraint.

- [ ] **Step 6: Commit final cleanup**

Commit: `refactor(web): complete AppContext migration`.

