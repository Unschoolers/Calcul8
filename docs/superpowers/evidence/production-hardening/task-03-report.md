# Task 3: live pricing request ownership

## Result

Queued live-price snapshots and lot hydration now carry the lot ID, scope type and workspace ID, auth epoch, and `lotHydrationRevision`. Ownership is checked before queue dispatch and before each network attempt, then checked again after save, hydration, conflict fetch, and retry awaits. The revision check rejects an earlier visit even when the user returns to the same numeric lot ID.

Conflict recovery performs one retry with the original price values and captured scope using the version from the recovery GET. A newer edit queued while the request is in flight keeps its prices and receives the updated base version. A second 409 leaves that edit queued, stops automatic draining, and notifies the user that manual review is needed.

## Additive interfaces

`lot-live-pricing-api.ts` exports:

```ts
export type LivePricingRequestOptions = {
  scope?: {
    scopeType: WorkspaceScopeType;
    workspaceId: string | null;
  };
  isRequestCurrent?: () => boolean;
};

fetchAuthoritativeLivePricing(
  app: ScopedApiApp,
  lotId: number,
  options?: LivePricingRequestOptions
): Promise<LotLivePricingRecord | null>

saveAuthoritativeLivePricing(
  app: ScopedApiApp,
  lotId: number,
  pricing: LivePricingPayload,
  options?: LivePricingRequestOptions
): Promise<LotLivePricingRecord>
```

When provided, `scope` binds the GET query or POST body to the captured workspace. `app` remains the original app object so the shared auth client applies effects to the real owner. `isRequestCurrent` is optional and is checked by `fetchAuthenticatedApiResponse` / `fetchWithRetry` before dispatches, auth refresh or bootstrap, replay, and expiry effects. The pricing queue supplies a predicate that compares current lot ID, scope, auth epoch, and lot hydration revision against its captured snapshot.

`FetchRetryOptions` now has the optional `isRequestCurrent?: () => boolean` request-ownership predicate. `fetchAuthenticatedApiResponse` accepts the same optional field in its options object.

## Regression coverage

- A queued save and an in-flight hydration are discarded after an A→B→A lot visit.
- A stale 409 does not dispatch its recovery GET.
- A first 409 retries the original values once and updates a newer queued edit's base version without replacing its prices.
- A second 409 warns and does not auto-dispatch the queued edit.
- Live-pricing API tests verify captured workspace query/body scope while asserting the original app identity is passed to the auth client.
- A delayed 401 from auth epoch 1 cannot refresh, replay, or expire the session after the app reaches epoch 2.

## Verification

- `npm run typecheck` — passed.
- `npm run typecheck:tests:web` — passed.
- Full frontend suite, one worker — 195 files and 1,692 tests passed.
- Focused live-pricing/API regression suites — 62 tests passed.

## Follow-up: central workspace visit guard

The queue and hydration snapshots also capture `captureWorkspaceScopeGuard(context)` from `workspace-scope.ts`. Ownership checks invoke that guard in addition to checking the captured lot ID and hydration revision. This detects a scope A→B→A transition recorded by `setActiveWorkspaceScope` even when the numeric lot, raw scope values, auth epoch, and hydration revision match again.

Added regressions use the real `setActiveWorkspaceScope` setter to cover stale queued dispatch, hydration completion, and an in-flight save completion after workspace A→B→A, without changing the lot ID, auth epoch, or lot hydration revision. All three failed before adding the central guard and pass with it.

- `TZ=UTC npm run typecheck` — passed.
- `TZ=UTC npm run typecheck:tests:web` — passed.
- Focused queue/API suites — 65 tests passed.
