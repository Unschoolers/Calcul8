# Inventory Intake

Updated: 2026-06-09

## Seller Problem

Sellers need fast mobile intake while sourcing or preparing a show. Calcul8 already supports bulk lot setup and singles inventory, but intake should become faster and more show-oriented: scan or search, add image, cost, quantity, SKU/bin, market value, target pricing, and readiness state.

## Current Repo Capabilities

- `Lot` already supports bulk and singles lots, costs, quantities, purchase date, shipping/tax, currency, fee profile, external SKU, target profit, and system pricing defaults.
- `SinglesPurchaseEntry` already supports item, card number, external SKU, image, condition, language, cost, currency, quantity, market value, and market value currency.
- Singles CSV import, row editor, catalog search, image upload/compression, live singles selection, and wheel singles deduction already exist.
- Live pricing already uses cost/market value to suggest profitable prices.
- Workspace sync already handles lot and singles purchase changes.

## V1 Behavior

Inventory intake v1 should make adding items fast on mobile:

- Start intake from Config/Singles and from the future Command Center pre-show checklist.
- Choose bulk lot or singles intake.
- For singles: search catalog or manually enter item, card number, condition, language, quantity, cost, currency, market value, image, and external SKU.
- For bulk: enter product name, boxes/packs/spots, total or per-box cost, purchase shipping/tax, sell currency, and default pricing profile.
- Add optional bin/location and intake notes as planned fields if implementation also feeds fulfillment.
- Show target sale price, break-even price, expected margin, and "safe max cost" feedback before saving.
- Save locally first and queue sync in workspace mode.
- Keep CSV import as a bulk intake path, not a separate competing workflow.

## Data Model Implications

Existing `Lot` and `SinglesPurchaseEntry` cover most v1 intake fields. Likely additions:

- location/bin field for lots and singles entries if fulfillment v1 depends on it;
- intake status such as draft, ready, listed, or sold-out if the command center needs readiness filters;
- optional source/vendor and purchase note fields if tax/reporting needs are accepted for v1.

Do not introduce barcode/camera persistence fields until the implementation selects the scanning provider and retention policy.

## Frontend Surfaces

- Extend existing Config/Singles surfaces instead of building an unrelated inventory app.
- Add a mobile-first intake wizard or compact drawer with repeat-add behavior.
- Keep image upload behavior consistent with existing singles image upload.
- Use existing CSV import patterns for mapped previews.
- Show pricing feedback near the input that changes it.

## API, Storage, And Sync Implications

- Local-first lot/singles persistence remains the immediate source of truth.
- Workspace mode should debounce repeated inventory edits and push via existing sync behavior.
- If catalog lookup remains API-backed, validate search inputs at the route boundary.
- If barcode scanning is added later, camera permission errors must be user-visible and non-blocking.

## Edge Cases

- Seller enters cost in CAD and expects sale prices in USD.
- Duplicate SKU or duplicate card entry in the same lot.
- Image upload is too large, unsupported, or interrupted.
- Catalog search unavailable while offline.
- Quantity reaches zero because of sales/game deductions while intake is open.
- CSV import contains partial rows or conflicting quantities.

## Tests

- Unit tests for price guidance, break-even, currency conversion, and safe max cost calculations.
- UI tests for mobile singles intake, image failure, repeated add, and CSV path preservation.
- Sync tests for workspace-scoped inventory edits and debounce behavior.
- Regression tests that existing bulk lot setup and singles CSV import still work.
- i18n tests for new intake labels and French diacritics.

## C4 Updates Needed

Usually not required for v1 because this extends existing local-first lot/singles workflows. Required only if:

- barcode/camera scanning adds a new external provider boundary;
- cloud catalog enrichment changes API components;
- bin/location becomes a durable fulfillment entity shared with API storage.

## Out Of Scope For V1

- Full warehouse management.
- Automatic marketplace listing creation.
- Direct purchase receipt OCR.
- Multi-provider price scraping.
- Required camera/barcode flow; manual entry must remain first-class.
