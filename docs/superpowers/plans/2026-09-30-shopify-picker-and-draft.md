# Shopify Picker and Draft Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Readable Shopify product selection and deliberate draft creation from Edit inventory.
**Architecture:** Reuse parent search/session guards in a dedicated picker. Add a scoped server preview/create flow that initializes a draft once and stores a linked mapping; provider recovery uses deterministic identity rather than repeated stock writes.
**Tech Stack:** Vue 3, Vuetify, TypeScript, Azure Functions, Cosmos, Shopify Admin GraphQL 2026-07, Vitest.
**Spec:** ../specs/2026-09-30-shopify-picker-and-draft-design.md

## Global Constraints
- Work on main with two separately reviewable feature commits, picker then creation.
- Existing linked products remain Shopify-owned; newly created products receive a linked mapping.
- Create only explicitly confirmed drafts; never publish or blindly retry a mutation.
- Preserve existing managed behavior, search debounce, paging and auth/scope/lot/shop guards.
- No new dependency; reuse AppDialogShell and scoped API helpers. No automatic input focus.
- EN/FR labels, mobile full-screen, desktop and light/dark themes.

## Review Focus
- Keyboard visible and long titles: scrollable readable results, sticky accessible actions.
- Closing or cancelling picker: no persistence and no silently retained new selection.
- Preview after sales/price/store change: server rejects stale values before mutation.
- Remote creation succeeded but response/mapping failed: recover same product without stock reset.
- Another scope or existing product identity: no cross-scope adoption, relinking or takeover.

### Task 1: Product picker (Luna implements, root reviews)
**Files:** Create src/components/windows/shopify/ShopifyProductPicker.vue (and compact selector if useful); modify src/App.html, src/app.ts and EN/FR config locale files; update tests/vue/shopify-product-autocomplete.scenario.test.ts to exercise production picker.
**Interfaces:** Consume ShopifyVariantSearchResult and parent query/results/loading/completed/hasMore/selected IDs plus existing query/select/location/loadMore callbacks. Produce an explicit confirmed variant/location selection for parent Save; component-local open/draft state handles cancel.
- [ ] Write scenario tests proving wrapping multiline title/variant/SKU/price, min-two-character search, paging, location selection, cancel preserving previous parent selection, confirm without API link call, and no input autofocus.
- [ ] Run npm run test:vue -- tests/vue/shopify-product-autocomplete.scenario.test.ts; confirm failures reflect missing picker behavior.
- [ ] Implement dedicated picker in AppDialogShell using non-input initial focus; reuse existing guarded remote methods. Replace long inline search section with compact entry and selected summary.
- [ ] Run focused tests and frontend verify/typechecks. Review diff with root and Luna.
- [ ] Commit picker alone: fix(shopify): use a readable mobile product picker.

### Task 2: Draft preview/create backend (Luna implements, root reviews)
**Files:** Create apps/api/src/features/shopify/draftHandlers.ts and draftService.ts plus focused tests; add draft provider methods/types alongside adminClient; modify functions/shopify.ts and route tests; optional creationHandle/locationName in listingService type.
**Interfaces:** Exact preview/create routes and DTOs in spec. Keep draft-client methods separate from existing required ShopifyCatalogClient methods to preserve current consumers. Use listing store, authoritative snapshot/sales/live pricing, connection and lease helpers.
- [ ] Write service/handler/provider tests for authoritative preview, initial sealed quantity, draft-only creation, owner/scope, currency mismatch, active location, stale token, duplicate/mapped identity, provider timeout recovery and mapping-failure recovery without another mutation or stock reset.
- [ ] Run focused API tests; confirm meaningful red behavior before implementation.
- [ ] Implement preview derivation, fingerprint and validation, draft provider exact-handle/ownership lookup, guarded creation and linked mapping persistence. Scope0+lot lease ordering; recheck generation before mutation/persist. No activate/setAvailable calls on this path.
- [ ] Run npm run verify:api and API test typecheck; root review provider payload and recovery tests.

### Task 3: Creation preview UI and final integration (Luna implements, root reviews)
**Files:** Create src/components/windows/shopify/ShopifyCreateDraftDialog.vue; modify compact selector, config-lot-edit.ts/context method composition as needed, EN/FR locales, typed DTOs; add method and Vue scenarios; update docs/shopify-setup.md.
**Interfaces:** Consume parent scoped load-preview/create callbacks and spec DTOs. Successful create sets current shopifyEditListing immediately; selected existing variant state is cleared. Use parent session/auth/scope/lot/shop guards and saving state; disable duplicate submissions and parent dismissal while creating.
- [ ] Write failing UI/method tests: separate explicit create action, disabled for unsaved name/SKU, authoritative preview, selected location required, confirm create once, retryable error/stale preview, stale session discarded, successful binding displayed without parent Save.
- [ ] Run targeted tests to verify red; implement preview dialog and scoped callbacks without changing managed toggle or linked-stock behavior.
- [ ] Run full VITE_API_BASE_URL=https://api.whatfees.ca/api npm run verify; npm run verify:api; both test typechecks. Review all changes with Luna and root.
- [ ] Commit backend+UI creation: feat(shopify): create and link a Shopify-owned draft.
- [ ] Push commits to main and check CI, Pages and API deployments. Report verified behavior and live-store testing limitation.
