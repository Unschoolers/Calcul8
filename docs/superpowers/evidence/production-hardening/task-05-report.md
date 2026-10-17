# Task 5: Atomic sale inventory validation

## Result

Sale upserts and deletes now acquire a scope-and-lot inventory guard before reading authoritative metadata, presets, snapshots, or sale rows. Each mutation validates the complete effective sale set and commits the sale write, guard ETag advance, and captured sync metadata ETag check in one Cosmos transactional batch. A 409/412 causes a bounded full reread and revalidation. Incomplete or failed resolved batch responses fail closed.

The validator overlays sale entity rows by sale ID over legacy snapshot rows, removes tombstones, and ignores embedded legacy sales when `salesMode` is `entity`. Deletes of snapshot-only rows materialize entity tombstones. It checks linked singles references, per-purchase and aggregate singles counts, safe integer pack consumption, and sealed/open box availability. Unlinked singles sales count toward aggregate capacity. A wheel sale is exempt only when it carries zero physical consumption and no singles reference; wheel wins that consume packs or singles count normally.

Only server-created Shopify and Whatnot writes set the trusted external flag. Those writes and their deletion projections still advance the same lot guard and participate in metadata CAS while bypassing inventory rejection for the external order itself.

## Focused regressions

- Two concurrent sale IDs competing for the last singles unit produce exactly one committed batch.
- A concurrent metadata/purchase change causes a reread and revalidation; the stale sale is rejected without a commit.
- Snapshot/entity overlay, entity-mode legacy suppression, and snapshot-only deletion tombstones.
- Unlinked, linked, duplicate-line, forged-reference, wheel, and unknown sale-type behavior.
- Trusted Shopify writes/deletes advance the guard; ordinary writes still reject oversell.
- Bulk safe-integer, positive pack/RTYH consumption, sealed-box and opened-pack constraints.
- Normalized public IDs, stale base versions, missing/already-deleted rows, and ETag-guarded updates/deletes.
- Malformed resolved batch output fails closed without persisting the sale.

## Verification

From `apps/api`:

```text
TZ=UTC VITEST_MAX_WORKERS=1 npx vitest run --config vitest.config.mjs src/lib/cosmos/salesInventoryRepository.test.ts src/lib/cosmos/salesRepository.test.ts src/features/whatnot/importService.test.ts src/features/shopify/saleProjection.test.ts src/functions/salesLive.test.ts
5 files passed, 61 tests passed

npm run typecheck:tests
passed

npm run build
passed; 48 shared contract artifacts checked
```
