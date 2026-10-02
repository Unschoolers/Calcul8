# Shopify production polish implementation plan

**Goal:** clear, recoverable and visually verified Shopify integration.
**Spec:** ../specs/2026-10-01-shopify-production-polish-design.md
**Architecture:** existing scoped methods own API state; focused presentation components, shared typed errors and current provider status.

## Global Constraints
- Work on main with Luna as scoped implementers; root owns architecture, review and release.
- Preserve existing stock ownership and managed publishing behavior.
- Mobile first, existing Vuetify themes and AppDialogShell. English/French parity.
- No new product dependencies. No automatic external mutation retry is introduced.
- Raw provider or exception text never becomes user copy.
- Product status badge comes only from a current provider read. ACTIVE is not a sales-channel publication claim.
- Connection operations belong to auth/scope/requested store; lot-specific requests also check lot identity. Passive status reads cannot supersede pending connection mutations.

### Task 1: Localized error contract and eligibility
**Files:** apps/api/src/shared/shopify-errors.ts, shared/shopify-errors.ts (re-export only), src/domain/shopify-ui-error.ts, draftService.ts/draftHandlers.ts and tests, config-lot-edit.ts and tests, ShopifyLinkedStock.vue/ShopifyCreateDraftDialog.vue safe errors, state/types/context, EN/FR config locales.
**Interfaces:** ShopifyErrorCode constants PREVIEW_STALE, PRICE_REQUIRED, CURRENCY_MISMATCH, INVENTORY_INVALID, LOCATION_REQUIRED, LOT_UNAVAILABLE, ALREADY_LINKED, CONNECTION_CHANGED. ShopifyUiError extends Error carrying code, recovery retry|refresh|reconnect|none and untranslated messageKey. shopifyResponseUiError(response,t,fallbackKey,conflictKey?), shopifyUiErrorMessage(error,t,fallbackKey), shopifyUiErrorRecovery(error), shopifySavedLotFieldsMatch(saved:{name:string;externalSku?:string},draft:{name:string;externalSku:string}). Stable server codes through existing HttpError.code. String shopifyEditError remains compatible with added shopifyEditRecovery. All listing/search/link/draft/stock HTTP errors use shared decoding; local stale/unavailable errors preserve typed recovery. Unknown text uses safe fallback; 401/403/429/5xx localized guidance. API runtime imports stay inside deployed apps/api package.
- [ ] Add RED tests all codes/statuses, non-JSON/null/unknown/network failures, French real translations, trim equality, method errors and stale guards; validation tests fail if nothing is thrown.
- [ ] Implement shared contract/decoder and complete scoped-method integration without changing request ownership.
- [ ] Focused web/Vue/API tests, relevant types, API build and isolated staged entrypoint import/relative-require scan; report and commit.

### Task 2: Connection recovery
**Files:** ui/shopify/shopify.ts, shellPorts.ts, ShopifyConnectDialog.html/ts if needed, AppShellTopBar.html, EN/FR shell locales, method and Vue scenarios.
**Interfaces:** reuse existing connection state; expose refreshShopifyStatus in shell ports. Small internal capture/ownership helper; no new global state. Preserve known shop/time/error only for same auth/scope; clear on scope/account change. Exact requested-shop HTTPS redirect validation. In-flight same-scope mutation owns pending lifetime until settled, passive reads cannot supersede it; new auth/scope invalidates old operation.
- [ ] RED tests duplicate connect, failed domain preservation, pending dismissal blocked, stale response/redirect rejected, older status after connect/disconnect and newer status during pending mutation, status retry, different-shop redirect and workspace-failure isolation.
- [ ] Implement inline localized error/manual retry, disabled pending actions/inputs, store/sync visibility, safe sync-attention copy, mutation/read guards and unchanged disconnect semantics.
- [ ] Focused tests, web/Vue suites and source/test types; report and commit.

### Task 3: Observed product status
**Files:** apps/api/src/shared/shopify-product-status.ts, shared/shopify-product-status.ts re-export, catalogTypes.ts/catalogService.ts/catalogHandlers.ts/tests, src/types/app.ts.
**Interfaces:** canonical ShopifyProductStatus DRAFT|ACTIVE|ARCHIVED plus isShopifyProductStatus(unknown) guard. Optional productStatus in normalized variant/listing response. Query product { id title status }. Strip stored status before enrichment; apply only valid current identity-matched status. Never persist/infer status on create/link.
- [ ] RED tests Draft-to-Active reads and failed/malformed/identity-mismatch/stored-status fallback.
- [ ] Add optional current provider contract preserving search/link eligibility and existing names/IDs fallback.
- [ ] Focused/full API suite and source/test types; report and commit.

### Task 4: Product journey and presentation boundary
**Files:** ShopifyLotIntegration.vue, src/domain/shopify-lot-integration.ts (presentation types), picker/create dialog, App.html/app.ts, EN/FR config locales, method/Vue scenarios.
**Interfaces:** grouped typed props state:{listing,listingStatus,error,recovery,saving,search:{query,results,loading,completed,hasMore,selectedVariantId,selectedLocationId}}, lot:{type,saved?:{name,externalSku?},draftName,draftSku,boxesPurchased,packsPerBox,sales}, connection:{status,shop,offline,canManage}, language,t; callbacks loadPreview/createDraft/refreshListing/loadStock. Emits query-change/load-more/confirm/cancel; targeted retry-search permitted. Existing request ownership stays in root methods. Shared saved-fields helper used by section/method. One child dialog at a time; cancel retains pending selection/query/parent drafts. Unmapped workspace members get owner guidance and disabled links. Section stable lifetime owns success, including if creation updates listing and unmounts picker mid-await; wrap create callback in stable section, emit created from draft dialog too. Refresh current status via guarded listing callback after create, keep immediate mapping visible. Scope key unmounts section/local notices.
- [ ] RED tests empty-search Create, one child dialog, cancel preservation, dirty-field disable, translated retry/refresh/reconnect, duplicate create/pending-close, immediate card/success and member guidance.
- [ ] Extract composition, improve selection/preview hierarchy and formatting, preserve parent Save semantics.
- [ ] Relevant method/Vue tests, web/Vue suites and source/test types; report and commit.

### Task 5: Binding card and stock clarity
**Files:** ShopifyBindingDetails.vue, ShopifyLinkedStock.vue, EN/FR config locales and Vue scenarios.
**Interfaces:** retain listing/stock props, shared safe error mapper and existing inventory calculations; no writes. Observed status only; unavailable fallback. Wrapped metadata, safe admin link, accessible card hierarchy. Three primary quantities Shopify available/WhatFees sealed/signed difference; expandable on-hand/committed/opened/loose packs. Unknown not zero, freshness/refresh/stale retention and localized announcements; difference informational review copy.
- [ ] RED tests live status/unavailable, summary/difference, unavailable vs zero, refresh announcement/stale retention, expandable details and existing no-double-deduction receipt/sale/open flow.
- [ ] Implement theme-aware readable mobile cards/details using existing Vuetify primitives and touch/focus patterns.
- [ ] Focused/full Vue/web checks and source/test types; report and commit.

### Task 6: Browser and release evidence
**Files:** tests/visual Shopify fixtures/scenarios/config and docs evidence. No production-only test hooks.
**Interfaces:** deterministic actual public Vue component fixtures served by Vite; no authentication or merchant store writes. Isolated development browser executable permitted without product dependency change.
- [ ] Browser 320/390/412/mobile and desktop, EN/FR light/dark long text/enlarged text and reduced-height keyboard simulation; no overflow, reachable sticky actions, focus/cancel and immediate success. Capture screenshots; record real Android/store limitations separately.
- [ ] Full VITE_API_BASE_URL=https://api.whatfees.ca/api npm run verify; npm run verify:api; web/API test typechecks. Final independent review and fixes.
- [ ] Commit evidence, push reviewed commits main and verify CI/Pages/API.


## Task 6 closure scope amendment (2026-10-02)
The user explicitly waived remaining Playwright, UI, and screenshot checks. Close Task 6 with code review and root-owned fresh component/type verification. Preserve the completed historical 19-case run and four screenshots as historical evidence; mark final title/catalog/config edits as not browser-reverified. Make no native-device or live-store claims. This amendment changes remaining verification scope only; it does not rewrite prior acceptance history.
