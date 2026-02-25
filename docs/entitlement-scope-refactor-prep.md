# Entitlement Scope Refactor: Impact + Pre-Refactor Step

## Intent
Prepare for scope-based entitlements (user + workspace/team) with minimal risk and no immediate behavior change.

## Target model (post-refactor)
- Entitlement ids:
  - `entitlement:user:<googleSub>`
  - `entitlement:ws:<workspaceId>`
- Effective access resolution:
  - personal mode: user scope entitlement
  - workspace mode: workspace entitlement (with membership authz)
- Sync scope key in existing sync container partition path (`/userId`):
  - `u:<googleSub>`
  - `ws:<workspaceId>`

## Impact scan

### Frontend impact
- Auth + entitlement cache currently assumes one user entitlement.
  - `src/app-core/methods/ui/entitlements-status.ts`
  - `src/app-core/methods/ui/entitlements-signin.ts`
  - `src/app-core/methods/ui/shared.ts`
- Sync payload has no workspace scope.
  - `src/app-core/methods/ui/sync.ts`
- Global state has no workspace context.
  - `src/types/app.ts`
  - `src/app-core/state.ts`
  - `src/app-core/context.ts`
- Account UI has no workspace selector.
  - `index.html`

### API impact
- Entitlements are keyed by user-only ids.
  - `apps/api/src/functions/entitlementsMe.ts`
  - `apps/api/src/functions/entitlementsVerifyPlay.ts`
  - `apps/api/src/lib/cosmos.ts`
  - `apps/api/src/types.ts`
- Sync read/write paths are user-only.
  - `apps/api/src/functions/syncPull.ts`
  - `apps/api/src/functions/syncPush.ts`
  - `apps/api/src/lib/cosmos.ts`
- Account export/delete are user-only and would need scope-aware behavior for team data boundaries.
  - `apps/api/src/functions/accountExport.ts`
  - `apps/api/src/functions/accountDelete.ts`

### Test impact
- API tests:
  - `apps/api/src/functions/syncPush.test.ts`
  - `apps/api/src/functions/syncPull.test.ts`
  - `apps/api/src/functions/entitlementsVerifyPlay.test.ts`
  - `apps/api/src/lib/auth.test.ts`
- Frontend tests:
  - `tests/ui-sync.test.ts`
  - `tests/entitlement-cache.test.ts`
  - `tests/entitlement-purchase-sync.test.ts`
  - `tests/entitlements-purchase-methods.test.ts`

## Step 0 (Pre-refactor, no behavior change)
This step should ship first.

1. Add neutral scope types only (no runtime behavior changes).
   - Frontend: add optional `workspaceId` and scope type definitions.
   - API: add `EntitlementScopeType`, `ScopeKey`, and typed helpers.
2. Add centralized key helpers in API and frontend.
   - Entitlement id helper
   - Sync partition key helper
   - Scope resolver helper from request/context
3. Keep all call sites on current default behavior.
   - Default scope remains personal user scope.
   - No new endpoint contract required in Step 0.
4. Add guard tests for helper behavior.
   - `u:<id>` and `ws:<id>` key generation
   - input normalization and invalid input rejection
5. Add observability fields in logs (non-breaking).
   - log `scopeType` and resolved scope key in sync/entitlement routes
6. Add migration safety notes to account export/delete behavior.
   - Explicitly document that workspace-shared data is not user-deletable by default.

## Step 0 acceptance criteria
- No UI changes.
- No API contract changes.
- Existing tests pass unchanged plus new helper tests.
- Build and current sync/entitlement behavior remain identical.
- All new scope logic is behind helper functions (no duplicated string composition).

## After Step 0 (actual refactor sequence)
1. Add optional `workspaceId` to sync push/pull payload.
2. Add membership authz checks for workspace scope.
3. Add workspace entitlement read path in `entitlements/me`.
4. Introduce workspace/team UI selector and context propagation.
5. Add product rules for personal license vs team license precedence.

## Rollback plan
- Because Step 0 is no-behavior-change, rollback is low risk:
  - remove helper usages
  - keep existing user-only paths untouched.
