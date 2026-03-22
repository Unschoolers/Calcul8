# Whatnot Integration

## Summary
- Treat Whatnot as an **import-first sales ingestion feature**, not an OAuth-first product promise.
- Because Whatnot Seller API applications are currently closed to new applicants, **CSV import should be the primary V1 path**.
- The existing OAuth work should be kept as **future-ready infrastructure** for sellers who already have access, but V1 should not depend on it.
- The most important V1 outcomes are:
  - avoid duplicate imports
  - map sparse Whatnot rows to the right lot / sale type
  - make repeat imports faster with remembered mappings
  - support RTYH without pretending it is a normal product SKU

## Current Snapshot

### Backend
- Whatnot backend scaffolding exists end to end:
  - routes in [apps/api/src/functions/whatnot.ts](/f:/Sources/Calcul8/apps/api/src/functions/whatnot.ts)
  - service layer in [apps/api/src/functions/whatnot-services.ts](/f:/Sources/Calcul8/apps/api/src/functions/whatnot-services.ts)
  - provider client + token handling in [apps/api/src/lib/whatnot.ts](/f:/Sources/Calcul8/apps/api/src/lib/whatnot.ts)
  - Cosmos helpers in [apps/api/src/lib/cosmos/whatnotRepository.ts](/f:/Sources/Calcul8/apps/api/src/lib/cosmos/whatnotRepository.ts)
  - document/config types in [apps/api/src/types.ts](/f:/Sources/Calcul8/apps/api/src/types.ts) and [apps/api/src/lib/config.ts](/f:/Sources/Calcul8/apps/api/src/lib/config.ts)
- Implemented backend capabilities:
  - OAuth connect start / callback / disconnect
  - encrypted token storage + refresh-token rotation
  - scope-aware status for personal and workspace
  - manual sync-now path
  - pending review batch creation
  - review confirmation into normal internal sales
  - dedupe docs and remembered target mapping docs
- Current required Whatnot env values are intentionally minimal:
  - `WHATNOT_CLIENT_ID`
  - `WHATNOT_CLIENT_SECRET`
  - `WHATNOT_REDIRECT_URI`
  - `WHATNOT_TOKEN_ENCRYPTION_SECRET`
- Standard Whatnot URLs now default in code; they are not part of the normal setup burden.

### Frontend
- Core Whatnot state is already in:
  - [src/types/app.ts](/f:/Sources/Calcul8/src/types/app.ts)
  - [src/app-core/state.ts](/f:/Sources/Calcul8/src/app-core/state.ts)
  - [src/app-core/context.ts](/f:/Sources/Calcul8/src/app-core/context.ts)
- Frontend Whatnot methods already exist in [src/app-core/methods/ui/whatnot.ts](/f:/Sources/Calcul8/src/app-core/methods/ui/whatnot.ts):
  - `refreshWhatnotStatus`
  - `connectWhatnot`
  - `disconnectWhatnot`
  - `syncWhatnotSales`
  - `openWhatnotReviewDialog`
  - `closeWhatnotReviewDialog`
  - `confirmWhatnotImportBatch`
- Lifecycle/watch integration is already present in:
  - [src/app-core/lifecycle.ts](/f:/Sources/Calcul8/src/app-core/lifecycle.ts)
  - [src/app-core/watch.ts](/f:/Sources/Calcul8/src/app-core/watch.ts)
- The account menu and review dialog are currently mounted in [index.html](/f:/Sources/Calcul8/index.html).
- The Whatnot menu section is hidden when the backend is not configured, so users do not see a dead integration surface.

## Key Product Decisions
- **CSV import is the primary V1 path.**
- **OAuth stays in the repo as optional future-ready plumbing**, not as the thing V1 depends on.
- **SKU is optional.**
- Matching strategy should be:
  - remembered mapping first
  - optional SKU hint second
  - normalized title suggestion next
  - manual mapping fallback last
- **RTYH remains a special-case sale mapping**, not a normal catalog product.
- For singles lots, V1 can import as **unlinked singles sales** when exact item allocation is unclear.

## Current Caveats
- The current OAuth-connected sync path is technically present, but it should not be treated as the core delivery path while Seller API access is closed.
- The current Whatnot order normalization in [apps/api/src/lib/whatnot.ts](/f:/Sources/Calcul8/apps/api/src/lib/whatnot.ts) is still sparse:
  - title matching is weak
  - multi-item order handling is not yet where it needs to be
- The current review/import flow is enough for experimentation, but not yet the polished mapper UX we want clients to rely on.
- The existing singles CSV import flow is the best UX reference:
  - [src/app-core/methods/config-lots-import.ts](/f:/Sources/Calcul8/src/app-core/methods/config-lots-import.ts)
  - [src/components/windows/singles/SinglesCsvImportDialog.ts](/f:/Sources/Calcul8/src/components/windows/singles/SinglesCsvImportDialog.ts)
  - [src/components/windows/singles/useSinglesImport.ts](/f:/Sources/Calcul8/src/components/windows/singles/useSinglesImport.ts)

## Next 5 Steps
- **1. Define the Whatnot CSV normalization contract.**
  - Decide the exact V1 input fields we accept.
  - Make SKU optional.
  - Normalize sparse rows into the same internal review shape already used by the Whatnot review flow.

- **2. Build the real mapper/review UI on top of the CSV import pattern.**
  - Reuse the singles CSV importer structure.
  - Add lot selection, sale type selection, RTYH packs/items input, duplicate state, and remembered mapping display.

- **3. Move dedupe + remembered mapping to the center of the CSV flow.**
  - Keep `provider + external account + external sale identity` as the dedupe source of truth.
  - Reuse the Whatnot mapping documents already introduced on the backend so repeat imports stay idempotent.

- **4. Add proper RTYH-specific mapping behavior.**
  - Do not auto-import RTYH blindly.
  - Require the mapper to collect the extra quantity/packs information needed to create a valid RTYH sale.

- **5. Keep OAuth on a separate future track.**
  - Leave the current connect/sync plumbing in place for accounts that already have access.
  - Do not let OAuth determine V1 scope, UX, or launch readiness.

## Done Means
- A seller can import a Whatnot CSV without being forced to use SKU.
- The same CSV can be re-imported without duplicating sales.
- Ambiguous rows are reviewable instead of silently guessed.
- RTYH rows are supported through explicit review decisions.
- Imported sales flow through the normal sales + portfolio math, not a parallel reporting path.
