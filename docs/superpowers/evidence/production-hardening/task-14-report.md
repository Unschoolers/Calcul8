# Task 14: realtime catch-up ownership

## Behavior

Workspace catch-up captures its central scope guard, selected lot and `lotHydrationRevision`, plus a per-app revision advanced by workspace data events. The authoritative sales and live-pricing reads use the captured scope and ownership predicate. Sales catch-up reads opt out of cache writes while ordinary `fetchAuthoritativeSales` calls keep their existing caching behavior.

Full sync catch-up requests carry the same predicate and the expected payload signature through a separate coordinator queue. Guarded pulls retain their predicate instead of joining an ordinary coalesced pull. `performCloudSyncPull` checks ownership after the response and JSON body and immediately before applying a full snapshot. Explicit `forceApply` remains honored for requests without an ownership predicate; it does not bypass a supplied predicate.

Sale upsert/delete, live-pricing, lot-config and wheel-session WebSocket messages advance the revision. Responses from earlier catch-ups and child reads are discarded even if the user returns to the same scope or lot. Dirty live pricing is excluded from broad snapshot recovery and continues through the existing baseline reconciliation path. A changed scope, lot visit, or realtime revision queues at most one follow-up catch-up after the active request settles. Stale live-pricing hydration returns to `idle` when the same lot visit remains active, allowing a later hydration attempt.

## Regression evidence

- A real `runCloudSyncPull` coordinator/pull integration test defers the full-sync HTTP response, applies a WebSocket sale, then releases a stale snapshot. The local sale and lot remain unchanged and catch-up reports stale.
- A full snapshot apply invokes the real `configLotMethods.loadLot`, dispatching both deferred sales and live-pricing GETs. A later WebSocket event wins in the active UI and sales cache after both stale child responses are released.
- Deferred sales/pricing responses are rejected after scope A→B→A and lot A→B→A, with no cache write or active-state change. A deferred authoritative sales API test also verifies a scope A→B→A response returns `null` without changing UI/cache state.
- A coordinator regression proves a guarded pull does not coalesce into an ordinary active pull and its predicate remains effective before snapshot apply. A realtime event during catch-up queues one bounded follow-up.
- A confirmed full snapshot remains recovered when its real `loadLot` advances the intentional hydration revision. A metadata edit during a full snapshot, and already-dirty live pricing, prevent broad cloud apply.
- A queued local live-pricing save remains dispatchable after an unrelated WebSocket sale event; a stale hydration cannot overwrite realtime pricing or leave the lot marked `loading`.
- Existing default sales-fetch cache behavior, ordinary pull coalescing, and Task 8 force-apply recovery tests remain covered.

## Verification

- `TZ=UTC VITEST_MAX_WORKERS=1 npx vitest run --config vitest.config.mjs tests/workspace-realtime.test.ts tests/sales-live-api.test.ts tests/config-live-pricing-queue.test.ts tests/sync-service.test.ts` passed: 107 tests.
- `npm run typecheck` passed.
- `npm run typecheck:tests:web` passed.
- `git diff --check` passed.
- `TZ=UTC VITEST_MAX_WORKERS=1 npm test -- --reporter=dot` ran 195 files: 1,733 of 1,734 tests passed. The sole failure is the existing `tests/config-lots-methods.test.ts` CSV expectation (expected quantity 4, actual 8); the root integration branch has a separate fix for this fixture.

No production deployment or push was performed.
