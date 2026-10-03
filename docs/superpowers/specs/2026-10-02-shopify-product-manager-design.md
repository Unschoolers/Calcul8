# Shopify product manager and lot indicators

## Intent and approval boundary

Julien approved the compact Shopify card and focused manager direction, then requested better mobile and desktop design and a Shopify icon for linked lots. Users must be able to correct or remove a link and choose a Shopify product name and price independently of Whatnot. Reuse the app's patterns, apply DRY/SOLID, and refactor only responsibilities touched by this work. Luna agents are authorized at max reasoning for read-only assistance; root owns implementation.

This document is the reviewable architectural spec. Product implementation starts after its review and the subsequent implementation-plan handoff. Existing authorization to publish verified changes to main and the waiver of further Playwright/screenshot checks remain in effect.

## Experience

### Inventory editor

- Keep inventory name, marketplace SKU, and Whatnot category together, before Shopify.
- Replace expanded Shopify controls with one compact integration card. Unlinked: Shopify icon, "No product linked", and "Set up Shopify". Linked: product title, observed publication status, observed Shopify price, location, and "Manage". Long titles wrap; missing observations say unavailable.
- Stock comparisons and extended SKU/store metadata are available in the manager, not expanded by default in the inventory editor.
- Inventory Save saves inventory fields only. Shopify changes use explicit actions in the manager and persist immediately. Closing/canceling inventory edits does not undo a successful Shopify action; the inventory editor must communicate the success.
- Preserve unsaved inventory fields while managing Shopify. Creation uses saved lot data: when relevant inventory fields are dirty, explain "Save inventory changes before creating a product" and keep the creation entry visible but disabled.

### Shared manager

- Reuse AppDialogShell: centered dialog up to 720px on desktop, full-height mobile surface at the existing mobile breakpoint. Use one active manager view for overview, search/link, create, or confirmation. Avoid a tower of active modals; keep inventory draft state outside the manager.
- Sticky header with a concise title and close action; one scrollable body; fixed footer with one operation-specific primary action. Mobile actions remain reachable with reduced height and safe-area padding. Title/heading receives initial focus so opening does not summon the keyboard.
- Desktop may place price and location alongside each other when space permits; mobile stacks inputs. Share the same state and validation logic across layouts. Use existing theme/spacing tokens, comfortable inputs, and at least 44px touch targets.
- Manager overview shows product title/status/price/location and Open in Shopify. Product details are editable; secondary actions are Change product, Change location, and Remove link. Removal uses a focused confirmation view with an explicit Remove link button.
- Use concise helper text for ordinary consequences, reserving alerts for failures and important ownership changes. Keep stock details collapsed until requested. English/French copy and light/dark styling have parity.
- Back/cancel preserves the previous link and local inventory draft. Dismissal after editing title/price offers discard/continue editing. Pending mutations disable duplicate actions and dismissal. Closing restores focus to a visible trigger.

### Linking and correction

- Reuse variant search, results, pagination, and location controls. Make variant and location choice explicit. Selecting a result does not persist it; the manager's Link product or Replace link action does.
- Display the proposed product/location before replacement. Replacing a link changes future routing and stock observations without moving inventory or rewriting existing sales.
- Location-only changes are supported without forcing users to find their variant again. Read the new location's stock after saving; never display stock from the old binding.
- Remove link disconnects this lot from the product. Explain that the Shopify product and its inventory remain in Shopify, and existing sales remain in WhatFees.

### Creation and Shopify details

- Default new product title: "Tokyo ghoul — Booster box"; default new variant title: "Booster box". Existing provider titles are never renamed just because defaults changed. Keep the sealed-box concept for inventory calculations, with localized user-facing copy.
- Create view puts editable Product title, Shopify price with store currency, and Inventory location first. Show generated SKU and initial booster-box quantity as a compact read-only summary. One short note explains draft publication and Shopify stock ownership.
- Initial price is a suggestion from the saved lot. User-entered Shopify title/price are explicitly validated and included in the final creation request. Changing fields invalidates the old creation snapshot; server validation binds creation to the final normalized inputs, saved stock, active location, store, and connection generation.
- Keep current positive-price/currency constraints; no currency conversion or zero-price products in this change. Reject blank titles, invalid prices, inactive locations, and malformed IDs with localized field guidance.
- Primary action is Create draft. On success, return to manager overview and show the linked product and confirmation; preserve lost-response recovery without another product or resetting stock.
- Existing details load from a current matching Shopify read. Save to Shopify explicitly changes the product-level title and selected variant price; explain beside the title that other variants share the product title. It does not change WhatFees inventory name, Whatnot price, publication, SKU, or stock.
- Keep successful Shopify edits independent of later lot-name/pricing changes. Read refreshed details after success. If a combined title/price edit partly succeeds, state what is confirmed and what requires recovery; never show all-or-nothing success for an unverified partial write.
- Legacy WhatFees-managed mappings retain existing behavior unless explicitly transferred. Before editing their details or replacing their link, require confirmation that future product/stock management transfers to Shopify; persist that ownership transfer before permitting independent edits. Unlink disables future automatic recreation for either mode.

## Lot Shopify indicator

- Show a small Shopify icon beside the metadata of each actively bound lot in the mobile inventory list, desktop selector options, and selected-lot header. Keep it separate from the existing completion badge and selected-row checkmark. No badge for an unlinked lot.
- The icon means "Linked to Shopify", not "stock matches" or "all orders synchronized". Give it a localized accessible name and desktop tooltip; the manager provides readable status on mobile. Do not turn the small icon into another row-level action.
- When the store is disconnected or the last summary is stale, retain known linkage with an unavailable/stale description and subdued styling. Show an attention modifier only for a confirmed error; scope-wide errors must be described as store-level, not invented per-lot failures.
- Use one server-owned scope/store summary request, joined by lot ID to the existing option model. Do not infer linkage from shopifyEnabled and do not fetch Shopify once per row. Preserve the summary through grouping/filtering helpers and Vuetify slot adapters.
- Clear old-scope data on account/workspace/store changes. Refresh the summary after successful link/create/replace/remove; failed mutations leave the existing indicator unchanged. An unavailable initial summary must not assert that lots are unlinked.

## Responsibilities and safety

- Presentational card/badge components render typed props; manager coordinates views and drafts. Extract a focused Shopify editor controller from config-lot-edit.ts for scoped requests, timers, mutation ownership, and recovery. Lot editing retains only inventory persistence and manager opening. Reuse error decoding, leases, repository concurrency helpers, and dialog/picker/stock primitives.
- Thin API handlers authorize personal/workspace ownership and validate input. Services implement link changes and explicit product detail updates. Cosmos repositories own durable identities, optimistic versions, and retries. Shared public contracts must remain available inside the packaged API, following the existing re-export pattern.
- Link/replace/remove/detail mutations carry the expected mapping revision and check connection generation. Serialize variant ownership using the existing scope/lot leases. One variant cannot be actively bound to two lots in the same scope/store. Stale confirmations produce refresh guidance rather than silently overwriting another user's link.
- Persist an explicit unlinked/suppressed state independently of client-synced shopifyEnabled. Scheduled reconciliation, delayed sync snapshots, creation recovery, and old in-flight writes cannot erase removal or automatically recreate the product. Explicit setup can establish a new binding against that state; older operation cleanup cannot restore an old mapping.
- Resolve existing durable order lines by scope/store/order/line identity before looking at the current variant mapping. Their original lot routing is immutable through link replacement/removal. Cancellations and paid-event retries continue to project the original sale exactly once; cancellation-before-paid tombstones remain effective. Previously unseen paid lines use only an active current binding. Missed-order backfill remains outside this scope.
- Preview/creation recovery must use the same final title/price inputs. After an ambiguous response, reconcile the recorded operation/provider identity before permitting a different creation payload. Never reset seeded stock during recovery. Explicit detail-update retries check current provider state and operation ownership rather than automatically replaying writes.
- No inventory movement on link/replace/location/remove/detail operations, no product deletion or automatic publishing, and no new global state framework or dependencies.

### Contract details from read-only review

- Persist binding lifecycle as explicit active or unlinked state. An unlinked record is a suppression tombstone, never an active order-routing entry or a linked badge. Every reconciliation/create entry point checks this lifecycle; only an explicit setup operation against the expected revision can reactivate it.
- Persist a creation attempt fingerprint over normalized title, price/currency, selected location, saved lot snapshot, scope/store, and connection generation. The existing constant draft handle/ownership hash identifies the provider product, not the attempted payload. Recover an ambiguous attempt with its recorded fingerprint; reject changed inputs until its outcome is resolved.
- Historical order lookup validates stored scope, shop, order ID, line ID, and variant ID before using its original lot. An identity mismatch is a conflict, not permission to fall back to the new binding.
- Batch summary response carries scope/store identity, connection generation, generatedAt, and active bindings keyed by lot ID. A complete successfully loaded summary may confirm an absent binding; failed/incomplete data cannot. observedAt is optional and only present for actual provider observations. Mutation responses refresh this summary; client scope changes invalidate it.
- Detail-update outcome contains per-field confirmation for title and price plus any pending/unknown result. Re-read both values after an ambiguous provider response before enabling a changed edit. Keep the original edit draft available for explicit recovery and never treat unknown as failed or fully successful.

## Validation and completion

1. API regressions: optimistic conflicts, duplicate variant ownership, location validation, scope/connection switches, durable unlink suppression with stale sync data, historical cancellation after unlink/replace/reuse, cancellation-before-paid, price/title validation, editable creation fingerprint, interrupted creation without duplication or stock reset, partial detail-update recovery, and managed ownership transfer.
2. Component/controller regressions: independent inventory/Shopify Save, unsaved inventory preservation, create eligibility, typed recovery actions, cancel/back/discard, pending dismissal, location cache reset, observed-price/status fallback, long French text, and badge projection across mobile/desktop option models and scope changes.
3. Run the required web/API verification, source/test type checks, builds, deployment-package check when shared contracts change, and code review. Do not add Playwright or screenshot work; the user's waiver continues. Native Android and live Shopify journeys remain unverified unless separately exercised.
4. Delivery phases: (1) safe link lifecycle/order routing; (2) independent product details/editable creation; (3) responsive manager and targeted controller extraction; (4) lot indicators and final verification/release. Report each phase as pending, in progress, verified, or shipped with evidence, without invented completion percentages.

## Out of scope

Refunds/order edits, missed-order fetching, stock movement ledger, Whatnot pricing changes, publication/channel management, product deletion, additional product/variant types, and a general inventory-screen redesign.

## Execution amendment (2026-10-02)
User authorized Luna implementation as junior developer and requested per-phase percentage updates. Root retains architecture and review ownership; percentages are work estimates and do not imply tests/deployment passed.
