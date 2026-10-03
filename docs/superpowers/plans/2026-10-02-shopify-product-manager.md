# Shopify Product Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Let users safely correct/remove Shopify links, independently edit Shopify titles/prices, and recognize linked lots through a compact responsive manager and indicators.

**Architecture:** Keep server-owned binding lifecycle and durable operation identity separate from client inventory configuration. Thin authorized handlers delegate to focused services and versioned Cosmos repositories; a typed frontend controller owns scoped requests, while existing Vuetify primitives supply the manager presentation. Reuse current lease, error, picker, stock, and option-model helpers.

**Tech Stack:** Strict TypeScript, Vue 3, Vuetify, Azure Functions, Cosmos DB, Vitest; current dependencies only.

**Spec:** `docs/superpowers/specs/2026-10-02-shopify-product-manager-design.md` (approved).

## Global Constraints

- "Luna agents are authorized at max reasoning for read-only assistance; root owns implementation."
- "Inventory Save saves inventory fields only. Shopify changes use explicit actions in the manager and persist immediately."
- "Default new product title: \"Tokyo ghoul — Booster box\"; default new variant title: \"Booster box\"."
- "Keep current positive-price/currency constraints; no currency conversion or zero-price products in this change."
- "No inventory movement on link/replace/location/remove/detail operations, no product deletion or automatic publishing, and no new global state framework or dependencies."
- "Reuse AppDialogShell: centered dialog up to 720px on desktop, full-height mobile surface at the existing mobile breakpoint."
- "Use existing theme/spacing tokens, comfortable inputs, and at least 44px touch targets."
- "Do not add Playwright or screenshot work; the user's waiver continues."
- Follow `docs/codingstandard.md`; preserve EN/FR, light/dark, strict typing, scope isolation, and native/browser/live-store evidence limits. Run `npm run verify`, `npm run verify:api`, both test typechecks, and deployment-package verification before release.

## Review Focus

1. Old clients and legacy records: missing lifecycle means active, but old requests cannot resurrect an explicitly removed link. Task 1 pins this.
2. A lease work callback runs more than once after a dirty signal: replay must return the same mutation without another ownership change or provider write. Tasks 1–3 pin this.
3. Shopify is edited elsewhere between load and Save: do not overwrite a changed title/price silently; refresh and preserve the local draft. Task 3 pins this.
4. A lost response is followed by changed title/price/location: resolve the original creation attempt before accepting another payload or seeding stock. Task 4 pins this.
5. A failed or disconnected summary is not a complete list of unlinked lots: retain known linkage with accurate freshness and clear old scopes. Task 7 pins this.

## File responsibilities and shared interfaces

- `apps/api/src/shared/shopify-product-manager.ts`: public manager contracts and runtime input normalization, packaged with API. `shared/shopify-product-manager.ts` re-exports these for frontend use, following the existing error/status pattern.
- Existing `listingService.ts`/`shopifyListingRepository.ts`: add optional `lifecycle: 'active' | 'unlinked'`, `lastMutationId`, and `lastMutationFingerprint`; absent lifecycle means active. Tombstones retain last IDs but never participate in active routing or stock/pause mutations. Keep repository ETags as binding revisions; no client lot flag controls lifecycle.
- `bindingService.ts`/`bindingHandlers.ts`: lifecycle and explicit managed-to-linked transfer. `productDetailsService.ts`/`productDetailsHandlers.ts`: provider detail edits. `shopifyOperationRepository.ts`: durable create/detail attempts. `bindingSummaryHandlers.ts`: one scoped summary read.
- `src/app-core/methods/ui/shopify/shopify-editor.ts`: editor requests/ownership; `shopify-bindings.ts`: batched summary cache. `config-lot-edit.ts` retains inventory edit lifecycle and calls editor entry/reset methods.
- `ShopifyLotManager.vue`: active view and drafts; `ShopifyProductSelection.vue` and `ShopifyDraftForm.vue`: reusable dialog-free bodies extracted from current components. Existing picker/create-dialog wrappers remain usable. `ShopifyLinkIndicator.vue`: accessible shared badge.

Public contracts (Task 1 defines these names; later tasks extend the same module):

```ts
type BindingAction = 'link' | 'replace' | 'location' | 'unlink' | 'transfer';
type BindingMutation = {
  lotId: number; mutationId: string; expectedVersion: string | null;
  generation: number; action: BindingAction;
  variantId?: string; locationId?: string; confirmTransfer?: boolean;
};
type BindingResult = { listing: ShopifyEditListing | null; bindingVersion: string | null };
type ProductDetailsDraft = { title: string; price: string };
type FieldOutcome = 'confirmed' | 'pending' | 'unknown';
type ProductDetailsResult = BindingResult & {
  outcome: { title: FieldOutcome; price: FieldOutcome };
};
type BindingSummary = {
  scopeKey: string; shop: string | null; generation: number;
  generatedAt: string; complete: boolean;
  bindings: Array<{ lotId: number; mode: 'linked' | 'managed'; version: string }>;
};
```

`ShopifyEditListing` is extended with returned `version`, optional observed `price`, `currency`, and `observedAt`; public shared DTO has the same shape without importing frontend types. Responses include store identity. Observed fields are removed on failed provider enrichment rather than inferred from creation history. Public input normalizers bound title length to 255, normalize trimmed nonempty strings and positive two-decimal money strings, validate IDs/version/mutation ID/generation, and reject unexpected operation shapes.

---

## Phase 1 — Safe link lifecycle and historical orders

### Task 1: Versioned binding lifecycle and corrections

**Files:** Create public contract/re-export, `bindingService.ts`, `bindingHandlers.ts`, and `bindingService.test.ts`/`bindingHandlers.test.ts` beside the service. Modify `listingService.ts`, `catalogService.ts`, `catalogHandlers.ts`, `reconcileService.ts`, `pauseService.ts`, `stockHandlers.ts`, `draftHandlers.ts`, `apps/api/src/lib/cosmos/shopifyListingRepository.ts`, `apps/api/src/functions/shopify.ts`, API-local `shopify-errors.ts`, and their existing tests.

**Interfaces:** `isActiveShopifyListing(listing: ShopifyListing | null): boolean` in `listingService.ts`; `mutateShopifyBinding(input: BindingServiceInput): Promise<ShopifyListing>` in `bindingService.ts`, where input carries resolved scope/shop, `BindingMutation`, store, catalog client, and `assertCurrent: () => Promise<void>`. Add POST `/integrations/shopify/products/binding`; return `BindingResult`. Initial legacy `/products/link` remains supported only for safe initial linking/current-identical replay; it cannot override a tombstone or replace a binding.

- [x] Write failing service/handler tests for replace, location-only change, remove, expected-version conflicts, duplicate active variant ownership, invalid location, owner authorization, generation switches, explicit transfer, and replay of the same `mutationId` on a dirty lease pass. Assert no stock/product mutation calls for lifecycle changes.
- [x] Add legacy/tombstone tests: no lifecycle still reconciles; an unlinked enabled lot remains suppressed after delayed sync/reconcile, pause/disconnect, preview/create recovery, and legacy initial-link calls; explicit version-matched setup can reactivate it. Assert same-product retries do not clear a newer unlink.

```ts
expect(unlinked.lifecycle).toBe('unlinked');
expect(isActiveShopifyListing(unlinked)).toBe(false);
expect(client.upsertBoxProduct).not.toHaveBeenCalled();
expect(client.setAvailable).not.toHaveBeenCalled();
```
- [x] Run `npm --prefix apps/api run test -- src/features/shopify/bindingService.test.ts src/features/shopify/bindingHandlers.test.ts src/features/shopify/listingService.test.ts src/features/shopify/catalogService.test.ts src/features/shopify/draftHandlers.test.ts src/features/shopify/pauseService.test.ts src/features/shopify/stockHandlers.test.ts`; confirm new cases fail for the missing behavior.
- [x] Implement lifecycle filtering everywhere and persisted tombstones under scope-then-lot leases. Compare expected version and connection generation before save. Record mutation ID/result identity for idempotent replay; repeated ID with different input is a conflict. Only transfer changes managed ownership; require `confirmTransfer` before replacing a managed link. Listing read returns `bindingVersion` even for a tombstone and rechecks mapping identity after enrichment.
- [x] Rerun the focused tests plus `npm --prefix apps/api run typecheck:tests`; confirm green. Commit `feat(shopify): support safe versioned link corrections` with only this task's files.

### Task 2: Preserve historical sale routing after link changes

**Files:** Modify `apps/api/src/features/shopify/orderWebhook.ts`, `orderWebhook.process.test.ts`, `saleProjection.test.ts`, and `apps/api/src/lib/cosmos/shopifyOrderRepository.ts`; add `shopifyOrderRepository.test.ts` beside the repository.

**Interfaces:** Existing `getShopifyOrderLine(config, scopeKey, shop, orderId, lineId)` is the first lookup. Add `assertShopifyOrderIdentity(line: ShopifyOrderLine, identity: {scopeKey:string; shop:string; orderId:string; lineId:string; variantId:string}): void` in `orderWebhook.ts`; keep `projectShopifyBoxSale` and durable line lot ID unchanged.

- [x] Write failing process tests: paid line for lot A, unlink/replace/reuse variant for lot B, then cancellation and paid replay still affect A exactly once. Assert unknown paid lines route only to an active mapping; cancellation-before-paid preserves the tombstone. Mismatched stored identity rejects rather than choosing B.

```ts
expect(persistedLine.lotId).toBe(lotA.id);
expect(projectedSalesForLotA).toHaveLength(0); // After cancellation.
expect(projectedSalesForLotB).toHaveLength(0);
```
- [x] Run `npm --prefix apps/api run test -- src/features/shopify/orderWebhook.process.test.ts src/features/shopify/saleProjection.test.ts src/lib/cosmos/shopifyOrderRepository.test.ts`; inspect the expected red results.
- [x] Implement lookup-first routing, validate immutable identity, use the persisted original lot for cancellation/projection/affected-lot reconciliation, and preserve existing deduplication/concurrency semantics. Leave unrelated refund/backfill behavior untouched.
- [x] Rerun the focused tests and API test typecheck; commit `fix(shopify): preserve historical order routing after relinking`.

## Phase 2 — Independent Shopify details and editable creation

### Task 3: Explicit title and variant-price edits with recoverable outcomes

**Files:** Create `productDetailsService.ts`, `productDetailsHandlers.ts`, their tests, and `apps/api/src/lib/cosmos/shopifyOperationRepository.ts`/`.test.ts`. Modify public manager contracts, `adminClient.ts`/`.test.ts`, `catalogHandlers.ts`/`.test.ts`, and function routes.

**Interfaces:** Extend client with `updateProductTitle(productId: string, title: string, beforeMutation?: () => Promise<void>): Promise<void>` and `updateVariantPrice(productId: string, variantId: string, price: string, beforeMutation?: () => Promise<void>): Promise<void>`. Add `updateShopifyProductDetails(input: ProductDetailsServiceInput): Promise<ProductDetailsResult>` with binding expectations, `operationId`, desired `ProductDetailsDraft`, and expected observed title/price. Add POST `/products/details`. Operation repository exposes versioned `get(scopeKey, lotId, operationId)` and `put(record)`; record includes kind, input fingerprint, provider IDs, connection generation, confirmed/pending/unknown fields, and version.

- [x] Write failing tests for observed-price enrichment/fallback, blank/overlong titles, invalid money/currency, title-only and price-only edits, provider IDs mismatching binding, managed transfer required, external edits since load, two mutation orders, title success/price failure, lost response plus read failure, same-operation replay, and unchanged stock/SKU/status/Whatnot values.

```ts
expect(partial.outcome).toEqual({ title: 'confirmed', price: 'pending' });
expect(ambiguous.outcome.price).toBe('unknown');
expect(client.setAvailable).not.toHaveBeenCalled();
```
- [x] Run `npm --prefix apps/api run test -- src/features/shopify/productDetailsService.test.ts src/features/shopify/productDetailsHandlers.test.ts src/features/shopify/adminClient.test.ts src/features/shopify/catalogHandlers.test.ts src/lib/cosmos/shopifyOperationRepository.test.ts`; confirm the new tests are red.
- [x] Verify the narrow title/variant-price mutation schemas against official Shopify documentation for the client's pinned `2026-07` API before implementing requests. Do not use productSet to edit an existing catalog product. Implement read-before-write conflict checks, durable operation claims before provider calls, same-binding/generation guards before each call, and readback-based field outcomes after ambiguous results. A transferred mapping must be durable before edits; reconciliation cannot overwrite them.
- [x] Rerun the focused tests and API typechecks/build; commit `feat(shopify): edit independent product titles and prices`.

### Task 4: Editable creation with exact attempt recovery

**Files:** Modify `draftService.ts`/`.test.ts`, `draftHandlers.ts`/`.test.ts`, `adminClient.ts`/`.test.ts`, operation repository/tests, public contracts, and `src/domain/shopify-draft.ts`; add `tests/shopify-draft-contract.test.ts`.

**Interfaces:** Define `DraftOverrides = {title: string; price: string; locationId: string}`. Extend preview request to accept optional overrides and create request to require final overrides, `previewToken`, expected binding version, generation, and `operationId`. `buildShopifyDraftPreview(input: DraftPreviewInput & {overrides?: DraftOverrides})` normalizes final values and fingerprints them with authoritative lot data. Persist a `CreateAttempt` (operation kind `create`) containing final payload/fingerprint, handle, ownership hash, generation, binding revision, and recovered IDs before the first provider mutation.

- [x] Write failing tests for suggested `Set X — Booster box`/`Booster box`, custom title/price, currency mismatch, changed stock/location invalidating preview, changed payload after an ambiguous response, provider creation followed by failed mapping save, tombstone revision changes, dirty lease replay, and final stock seeding exactly once. Preserve recovery of older `Sealed box` products without silently renaming them.

```ts
expect(suggestion.preview.title).toBe('Set X — Booster box');
expect(suggestion.preview.variantTitle).toBe('Booster box');
expect(recovered.variantId).toBe(original.variantId);
expect(client.createLinkedDraft).toHaveBeenCalledTimes(1);
```
- [x] Run `npm --prefix apps/api run test -- src/features/shopify/draftService.test.ts src/features/shopify/draftHandlers.test.ts src/features/shopify/adminClient.test.ts src/lib/cosmos/shopifyOperationRepository.test.ts` and `npm run test -- tests/shopify-draft-contract.test.ts`; confirm red.
- [x] Implement initial suggestion preview and final validated preview using the overrides. Stable attempt identity owns the provider handle and payload; replay of a completed same-payload attempt returns its result, different payload must resolve the old outcome first. New explicit setup after removal uses a new durable setup generation/handle so it cannot reseed an older product; legacy recovery retains legacy identity. Recovery validates recorded IDs/fingerprint/location and reads current stock without another productSet/inventory mutation.
- [x] Rerun focused tests plus web/API typechecks; commit `feat(shopify): customize draft details with durable recovery`.

## Phase 3 — Focused controller and responsive manager

### Task 5: Separate Shopify actions from inventory Save

**Files:** Create `src/app-core/methods/ui/shopify/shopify-editor.ts` and `tests/shopify-editor-controller.test.ts`. Modify `config-lot-edit.ts`, `src/app-core/context/commerce.ts`, `context/shopify.ts`, `src/types/app.ts`, `src/app-core/state.ts`, `src/app-core/methods/config-lots.ts`, `src/domain/shopify-lot-integration.ts`, and existing editor/stock method tests.

**Interfaces:** Export `shopifyEditorMethods` with existing preview/search/listing/stock methods and new `saveShopifyBinding(request: BindingMutation): Promise<BindingResult>`, `saveShopifyProductDetails(draft: ProductDetailsDraft): Promise<ProductDetailsResult>`, and `resetShopifyEditor(): void`. Controller context supplies narrow typed scope/auth/API/lot/session ports; preserve existing methods through delegates while moving their implementation. New editor state has mapping revision, observed data, operation ID, loading/saving, error operation (`binding`/`details` added), and typed recovery.

- [x] Write failing root-method regressions: inventory Save makes no Shopify mutation; successful manager action survives inventory Cancel; unsaved name/SKU/category survive opening/back; account/workspace/lot/store switch during async error decoding discards response; older cleanup cannot unlock newer mutation. Search cancel/debounce and stale-stock guards retain current behavior.

```ts
expect(requestPaths).not.toContain('/integrations/shopify/products/binding');
expect(context.renameLotName).toBe('Unsaved inventory name');
expect(context.shopifyEditSaving).toBe(true); // Older cleanup, newer write pending.
```
- [x] Run `npm run test -- tests/shopify-editor-controller.test.ts tests/shopify-lot-editor.test.ts tests/shopify-stock-editor.test.ts`; verify failure is behavior-related.
- [x] Extract helpers/timers/request ownership without introducing a store/framework. Add explicit binding/details requests using Tasks 1–4 contracts, preserve local drafts during read refresh, and route errors by operation. Remove link writes from `renameCurrentLot`; maintain normal local-first inventory persistence. Guard dirty creation fields and independent pending operations.
- [x] Rerun focused tests plus source/web-test typechecks; commit `refactor(shopify): isolate editor operations from inventory save`.

### Task 6: Compact card and one responsive manager surface

**Files:** Create `ShopifyLotManager.vue`, `ShopifyProductSelection.vue`, and `ShopifyDraftForm.vue` under `src/components/windows/shopify/`, plus `tests/vue/shopify-manager.scenario.test.ts`. Modify `ShopifyLotIntegration.vue`, `ShopifyBindingDetails.vue`, `ShopifyProductPicker.vue`, `ShopifyCreateDraftDialog.vue`, `src/App.html`, existing component registrations, and EN/FR `config.json`; update existing affected Vue scenarios.

**Interfaces:** `ShopifyLotManager` consumes typed integration/controller props and callbacks; local `ManagerView = 'overview' | 'selection' | 'location' | 'create' | 'unlink' | 'transfer' | 'discard'`. Selection body emits candidates without writes; draft body owns normalized `ProductDetailsDraft` plus location, and invokes final preview/create callbacks. Existing standalone wrappers compose extracted bodies for compatibility. Compact integration card opens manager and renders confirmation after successful actions.

- [x] Write failing mounted scenarios for unlinked/linked cards; explicit Link/Replace/Save to Shopify actions; location-only changes; transfer/remove confirmations; create with edited title/price; cancel/back/discard preservation; partial field recovery; observed-price/status unavailable; stock reset on binding identity; member/offline restrictions; visible disabled dirty-field creation; pending buttons/close disabled; focus heading/return; and long EN/FR text.

```ts
expect(screen.getByRole('button', { name: 'Create draft' })).toBeDisabled();
expect(screen.getByRole('button', { name: 'Save to Shopify' })).toBeEnabled();
expect(inventorySave).not.toHaveBeenCalled();
```
- [x] Run `npm run test:vue -- tests/vue/shopify-manager.scenario.test.ts tests/vue/shopify-lot-integration.scenario.test.ts tests/vue/shopify-create-draft.scenario.test.ts tests/vue/shopify-binding-details.scenario.test.ts`; confirm red before UI implementation.
- [x] Implement one AppDialogShell at max width 720 with one active view, full-height existing mobile behavior, fixed footer, wrapped content, responsive stacked/two-column fields, and theme tokens. Hide the underlying inventory dialog while the manager is active without discarding its draft; don't stack active search/create shells. Put inventory fields before the compact card, make title/price/location the primary creation inputs, and replace routine info alerts with one concise helper note. Use localized shared-title warning and create/save/link-specific success copy.
- [x] Rerun affected component scenarios, full Vue suite, source/test typechecks; inspect production template wiring through tests. Commit `feat(shopify): add responsive product manager`.

## Phase 4 — Lot indicators and release

### Task 7: Batched binding summaries and accessible lot indicators

**Files:** Create `bindingSummaryHandlers.ts`/`.test.ts`, `src/app-core/methods/ui/shopify/shopify-bindings.ts`, `src/components/windows/shopify/ShopifyLinkIndicator.vue`, `tests/shopify-binding-summary.test.ts`, and `tests/vue/shopify-lot-indicator.scenario.test.ts`. Modify function routes, `src/app-core/shared/lot-option-items.ts`, `src/app-core/computed/singles.ts`, `src/components/shell/{MobileLotSwitcher.html,LotSelectorOnboardingBlock.html,lotSelectorDisplay.ts,shellPorts.ts}`, relevant state/context/watch integration, `tests/lot-selector-display.test.ts`, and EN/FR `shell.json`.

**Interfaces:** POST `/integrations/shopify/products/bindings` returns `BindingSummary` without per-row provider calls. `refreshShopifyBindings(): Promise<void>` populates scoped cache `{summary: BindingSummary|null; status: 'idle'|'loading'|'loaded'|'error'; stale: boolean}`; mutation success triggers refresh. Extend `LotOptionItem`/slot display shape with optional `shopifyLink: {mode:'linked'|'managed'; stale:boolean; disconnected:boolean; attention:boolean}`. Server summary remains independent of locally synced lot DTOs.

- [x] Write failing API tests for active-only complete summaries, legacy active mappings, tombstone absence, version/store/generation identity, disconnected known bindings, access rules, and connection changes during read. Assert zero Shopify provider reads per lot. Write frontend tests for filtering/grouping/slot propagation, mobile list/header and desktop option/selection markers, failed summary retaining known link, no false absence from failed/incomplete summary, scope clearing, success-only refresh, and a confirmed scope-level error description.

```ts
expect(summary.bindings.map(binding => binding.lotId)).not.toContain(unlinkedLotId);
expect(client.getVariant).not.toHaveBeenCalled();
expect(screen.getAllByLabelText('Linked to Shopify')).toHaveLength(2);
```
- [x] Run `npm --prefix apps/api run test -- src/features/shopify/bindingSummaryHandlers.test.ts`; run `npm run test -- tests/shopify-binding-summary.test.ts tests/lot-selector-display.test.ts` and `npm run test:vue -- tests/vue/shopify-lot-indicator.scenario.test.ts`; confirm red.
- [x] Implement one authorized Cosmos summary read, preserve its store identity when disconnected, and invalidate frontend cache at the existing scope/auth/store watcher boundaries. Refresh on first connected scope load, explicit connection-status refresh, and successful binding mutations. Disconnect retains known bindings as stale; switching to another non-null store clears them. Join active mapping summaries into option items without changing completion/selection semantics. Use the existing Shopify icon asset if present; otherwise the bundled `mdi-shopify` glyph, with localized accessible label/tooltip. Place it beside metadata without adding a tiny clickable action; use subdued known-stale styling and confirmed attention only.
- [x] Rerun focused tests/typechecks; commit `feat(shopify): identify linked lots in inventory navigation`.

### Task 8: Whole-change verification, review, and release

**Files:** Update the approved spec/this plan with factual completion evidence and `docs/shopify-setup.md` for explicit ownership/save/removal semantics. Fix only blocking findings in affected source/tests.

**Interfaces:** No new product interfaces. Preserve the four-phase progress report and main publication authorization.

- [ ] Run fresh `npm run verify`, `npm run typecheck:tests:web`, `npm run verify:api`, and `npm --prefix apps/api run typecheck:tests`. Confirm exit 0 and capture test totals. No browser/Playwright/screenshot runs.
- [ ] Build/load API from an isolated copy containing only deployed `dist`, package metadata, and runtime dependencies; use the existing workflow's packaging layout. Ensure API-local shared manager contract and operation modules resolve without files outside the package.
- [ ] Perform whole-change code review of lifecycle, order identity, attempt recovery, partial outcomes, UI wiring, and badge freshness. Read-only Luna assistance uses `gpt-6-luna` at `max`; root assesses every finding and implements corrections. Rerun affected checks after fixes; do not expand scope into other priorities.
- [ ] Update task checkboxes and evidence, inspect `git diff --check`/status, commit closure documentation. Push approved verified commits to main, respecting normal release automation. Confirm CI, Pages, and API deployment for the resulting relevant commits; report any pending/failed job accurately.
- [ ] Deliver a four-phase status table with commit link, actual checks passed, and the retained native Android/live-store verification limits. Do not claim visual verification or guaranteed stock accuracy from the lot icon.

## Self-review

Spec coverage: Task 1 covers lifecycle/ownership/versioning; Task 2 covers sales history; Tasks 3–4 cover independent fields and interrupted operations; Tasks 5–6 cover controller boundaries and all manager interactions; Task 7 covers summary truth and both selectors; Task 8 covers required verification/release. Each Review Focus item has regression cases in its owning task. No browser work, new dependency, unrelated refactor, or extra Shopify feature was added. Shared signatures and DTO names are defined above; tests must use them rather than inventing parallel shapes.

## Execution handoff

Root implements inline using `superpowers:executing-plans`. Luna is restricted to max-reasoning read-only audits/reviews. The user reviews this written plan before implementation, as required by the planning workflow; no additional execution-method choice is needed.

## Execution amendment (2026-10-02)
Julien subsequently authorized Luna as junior developer to save tokens and requested percentage updates for each phase. Luna may implement scoped tasks at max reasoning; root owns architecture, integration, review, and publication. Report estimated work progress separately from verification status. This supersedes earlier read-only and no-percentage restrictions.

## Verification evidence (2026-10-03)

Tasks 1–7 are implemented. Final local verification: 1,616 web tests, 208 Vue tests, 676 API tests; source and test typechecks, web/API builds, security scan, and isolated API package load pass. Further Playwright and screenshots remain waived. Whole-change review found three important recovery gaps; cancellation tombstones, server-backed attempt restoration after reload, and terminal detail conflicts now have focused regressions and green suites. Publication and CI/deployment confirmation remain the last Task 8 gate.
