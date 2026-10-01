# Shopify production polish

User approved execution on main with scoped Luna implementers, root architecture/review ownership, DRY/SOLID and targeted refactoring. Preserve Shopify inventory ownership, managed publishing and existing lost-response creation recovery.

## Experience
- Mobile first, existing Vuetify themes and AppDialogShell; English/French parity. Search/preview avoid input autofocus. Wrapped long content, touch targets, reachable sticky actions and clear focus/cancel behavior.
- Connection failures preserve the entered domain and show localized manual recovery. Pending authorization blocks duplicate requests and dismissal. Account/workspace/store changes invalidate old responses. Passive status reads cannot supersede an in-flight connect/disconnect operation in the same scope.
- Search communicates minimum input, loading, empty, error and selection. Completed unsuccessful search offers explicit creation when eligible. Picker-to-preview has only one child dialog open. Cancelling preserves pending link, query and unsaved parent metadata.
- Preview distinguishes refresh, explicit retry and reconnect/permission guidance. Never display raw provider/exception text. No automatic mutation retries.
- Creation immediately displays the binding and localized confirmation; linking an existing product uses parent Save. Shopify owns subsequent linked product and inventory edits.
- Binding card wraps product/variant/SKU/store/location and safe Shopify admin link. Product status comes only from current identity-matched provider reads: DRAFT/ACTIVE/ARCHIVED. ACTIVE is not a channel publication claim. Failed/malformed enrichment displays unavailable, never inferred/cached Draft.
- Stock prioritizes Shopify available, WhatFees sealed and signed difference. Expandable details show on-hand/committed/opened/loose packs. Unknown stays unknown; refresh/stale observations are explicit. Differences ask for review, never automatically diagnose a missing box. No stock writes.

## Architecture
One API-local pure error-code contract with frontend re-export; one typed UI error decoder with localized key and recovery action; one trimmed saved-name/SKU helper. Existing scoped methods own requests/mutations. A focused ShopifyLotIntegration component owns presentation/dialog coordination/local success with explicit grouped props and callbacks; no mutable root context prop, global store or generic framework. Optional observed status is never authoritative persisted state. No new product dependencies.

## Acceptance
TDD regressions: localized errors, duplicate requests, old/new operation ordering, auth/scope/lot/store changes, selection/cancel, empty-search creation, dirty fields, immediate success binding, current-status changes/fallback, stock receipts/imported sales counted once/opened-box difference. Browser checks: 320/390/412px and desktop, EN/FR light/dark, long text, enlarged text and reduced-height keyboard simulation. Full web/API verification and test typechecks, independent review, main push and CI/Pages/API checks. Real Android and development-store transactions must be reported separately and only performed when authorized environments are available.
