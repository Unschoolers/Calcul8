# Whatnot Integration

## Summary
- Whatnot should be framed as an **import-first sales ingestion feature**, not an OAuth-first promise.
- Because seller API applications are closed, **CSV import is the V1 path**.
- OAuth work stays in the repo as **future-ready plumbing**, but it should not drive V1 scope or UX.
- V1 should optimize for:
  - sparse CSVs with **optional SKU**
  - **remembered mappings** for repeat imports
  - clear **duplicate avoidance**
  - explicit handling for **RTYH**, which maps to items but is not a normal product

## Current Snapshot

### Backend
- Whatnot integration scaffolding exists end to end:
  - routes in [apps/api/src/functions/whatnot.ts](/f:/Sources/Calcul8/apps/api/src/functions/whatnot.ts)
  - service layer in [apps/api/src/functions/whatnot-services.ts](/f:/Sources/Calcul8/apps/api/src/functions/whatnot-services.ts)
  - provider client and token handling in [apps/api/src/lib/whatnot.ts](/f:/Sources/Calcul8/apps/api/src/lib/whatnot.ts)
  - Cosmos helpers in [apps/api/src/lib/cosmos/whatnotRepository.ts](/f:/Sources/Calcul8/apps/api/src/lib/cosmos/whatnotRepository.ts)
- The backend already supports:
  - OAuth connect / callback / disconnect
  - sync/status flows
  - review batch creation and confirmation
  - dedupe and remembered mapping documents
  - CSV staging without requiring an active OAuth connection
  - optional `batchId` lookup for review retrieval

### Frontend
- Whatnot state and methods are already wired through:
  - [src/types/app.ts](/f:/Sources/Calcul8/src/types/app.ts)
  - [src/app-core/state.ts](/f:/Sources/Calcul8/src/app-core/state.ts)
  - [src/app-core/context.ts](/f:/Sources/Calcul8/src/app-core/context.ts)
  - [src/app-core/methods/ui/whatnot.ts](/f:/Sources/Calcul8/src/app-core/methods/ui/whatnot.ts)
- The current CSV/review flow exists in:
  - [src/app-core/shared/whatnot-csv.ts](/f:/Sources/Calcul8/src/app-core/shared/whatnot-csv.ts)
  - [src/components/windows/whatnot/WhatnotCsvImportDialog.ts](/f:/Sources/Calcul8/src/components/windows/whatnot/WhatnotCsvImportDialog.ts)
  - [src/components/windows/whatnot/WhatnotReviewDialog.ts](/f:/Sources/Calcul8/src/components/windows/whatnot/WhatnotReviewDialog.ts)
- The CSV mapper state now lives in app state instead of only inside the dialog component.
- The account menu can reopen pending CSV review work even when OAuth is not configured.

## Remaining V1 Work
- **Make RTYH review more explicit.**
  - Keep RTYH as a special mapping mode.
  - Make the extra quantity / packs input impossible to miss during review.

- **Decide the final pending-batch UX.**
  - The backend can now fetch a specific batch by `batchId`.
  - The frontend still needs a final opinion on whether V1 should stay “latest pending batch only” in the menu or expose a small pending-batch picker.

- **Add focused Whatnot flow tests.**
  - Backend tests for CSV staging/review/confirm behavior.
  - Frontend tests for the dialog/review handoff and permission-sensitive states.

- **Tighten ambiguous first-time matching.**
  - Keep remembered mappings as the main path.
  - Improve the fallback suggestions for titles that vary between weekly exports and app lot names.

## Product Rules
- CSV import is the primary V1 path.
- OAuth is optional future plumbing.
- SKU is optional.
- RTYH maps to items, but is not itself a normal product.
- The same CSV should be safe to re-import without duplicating sales.

## Edge Cases Still Worth Calling Out
- blank-title rows should be skipped or flagged clearly
- multi-item orders need a predictable merge/split rule
- missing `orderItemId` or `orderId` should not break review
- date handling should stay stable across timezones
- imported sales should land in the normal sales and portfolio math path
