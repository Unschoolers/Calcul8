# Task 1 report: versioned Shopify binding lifecycle

Implemented the API binding contract, versioned link/replace/location/unlink/transfer service, owner-only handler, and tombstone filtering across reconcile, listing, legacy link, stock, pause, and draft recovery paths. Exact `mutationId` replays return the stored result; changed inputs, stale revisions, store/scope identity mismatches, and connection-generation changes fail with refreshable conflicts. Explicit setup is the only path that reactivates an unlink tombstone. Location correction preserves the provider variant/product identity and reads the selected location's current quantity without making stock or product mutations.

The public contract is API-local and re-exported for frontend callers. Modern listing reads return current store/generation metadata, expose only the binding revision for foreign-store mappings, return an unlinked tombstone as `listing: null`, and recheck the persisted mapping after provider enrichment. The binding route registration is present in the shared functions file and is being integrated by the parent with the other manager routes.

## TDD evidence

The initial RED output in `task1-red.log` showed the missing `bindingService` module, a delayed enabled-lot reconcile publishing instead of skipping an unlinked lot, and legacy linking resolving instead of rejecting a tombstone. I also ran the new handler test before adding its implementation; it failed because `bindingHandlers` did not exist. Added pause, stock, and draft-recovery tombstone cases and watched all three fail for the expected behavior before implementing the lifecycle guards. The explicit-active legacy setup and location-identity regressions were also observed RED before their fixes.

Focused GREEN command:

```sh
TZ=UTC npm --prefix apps/api run test -- src/features/shopify/bindingService.test.ts src/features/shopify/catalogService.test.ts src/features/shopify/catalogHandlers.test.ts src/features/shopify/listingService.test.ts src/features/shopify/pauseService.test.ts src/features/shopify/stockHandlers.test.ts src/features/shopify/draftHandlers.test.ts src/features/shopify/bindingHandlers.test.ts
```

Result: 8 test files passed, 67 tests passed.

## Verification

- `TZ=UTC npm --prefix apps/api run typecheck` — passed.
- `TZ=UTC npm --prefix apps/api run typecheck:tests` — passed.
- `TZ=UTC npm --prefix apps/api run build` — passed.
- `npm run test -- tests/shopify-ui-error.test.ts` — 1 file and 19 tests passed.
- `npm run typecheck` — passed.
- Full API suite — 98 files and 669 tests passed in the parent’s latest run after the concurrent manager work was integrated.

## Concerns and commit

Tests use mocked Cosmos, lease, and Shopify boundaries; no live store or provider calls were exercised. The shared `functions/shopify.ts` route file is deliberately left for the parent’s integration commit so the binding, detail, and summary routes land together. The feature commit is `87ee9aec` (`feat(shopify): support safe versioned link corrections`).
