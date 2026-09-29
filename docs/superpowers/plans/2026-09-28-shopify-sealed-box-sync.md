# Shopify Sealed-Box Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a seller opt selected bulk lots into a Shopify sealed-box listing with automatic box allocation on pack sales and reliable stock reconciliation.

**Architecture:** Derive sealed inventory from saved sales rather than mutating a separate opened-box counter. Keep Shopify credentials and provider IDs on the API, with an explicit per-lot opt-in, durable desired-state updates, verified inbound order events, and a compact integration UI.

**Tech Stack:** Vue 3, TypeScript, Vitest, Azure Functions, Cosmos DB, Shopify Admin GraphQL API.

**Spec:** `docs/superpowers/specs/2026-09-28-shopify-sealed-box-sync-design.md`

## Global Constraints

- Shopify listings represent sealed bulk boxes only; no pack or singles listings.
- Existing Marketplace SKU is a SKU, not a provider identity key.
- Do not store credentials in browser state or sync snapshots.
- Preserve local-first sales and bilingual EN/FR UI.
- Commit and push each independently reviewable phase on `feat/shopify-sealed-box-sync`; open a PR against `main` after verification.

## Review Focus

- A box sale with `packsCount` must not also open a box.
- A sale edit/retry must not consume another box.
- Invalid or oversold historical data must stop inventory publication and show an actionable status.
- A Shopify order and concurrent pack sale must not allow a stale absolute stock write to increase availability.
- A repeated webhook must not create another sale.

---

### Phase 1: Sealed-box inventory rule

**Files:** `src/domain/box-inventory.ts`, `tests/box-inventory.test.ts`, plus the smallest consumer needed to display the computed count.

- [ ] Write focused failing tests for first pack sale, exactly one whole box of packs, the next pack sale, box sales, wheel/RTYH pack demand, sale edit/retry, and invalid/oversold inputs.
- [ ] Run the focused tests and confirm the expected failures.
- [ ] Add `calculateSealedBoxInventory(lot, sales)` returning sealed boxes, loose packs, opened boxes, and a validity/error state. Keep existing profit/pack-equivalent calculations intact.
- [ ] Run the focused suite, frontend typecheck, and relevant sales tests. Commit and push Phase 1.

### Phase 2: Shopify connection and mapping

**Files:** `apps/api/src/features/shopify/*`, `apps/api/src/functions/shopify.ts`, `apps/api/src/lib/cosmos/shopifyRepository.ts`, API config/types, focused API tests.

- [ ] Write failing API tests for OAuth state/HMAC/shop validation, owner scope, encrypted token storage, status without secrets, and disconnect.
- [ ] Implement the standalone OAuth install/callback and scoped Cosmos connection; configure client ID/secret and Shopify API version from deployment settings.
- [ ] Write failing mapping tests for opt-in bulk lot, stable product/variant/inventory/location IDs, pause/disconnect, duplicate SKU, and invalid lot.
- [ ] Implement a provider-specific mapping record and safe product create/link flow; do not infer provider IDs from SKU.
- [ ] Run API tests/typecheck. Commit and push Phase 2.

### Phase 3: Publication and quantity delivery

**Files:** Shopify service/repository and the server-side sale/snapshot update seam, with focused tests.

- [ ] Write failing tests for product publication, initial sealed quantity, auto-open after pack/RTYH/wheel/imported sales, retries, throttling, and concurrent Shopify stock changes.
- [ ] Implement desired-state inventory updates with persistent retry state, stable Shopify IDs, compare/re-read handling, and a repair/reconciliation path.
- [ ] Ensure paused lots and invalid inventory never publish; expose last successful sync and actionable error status.
- [ ] Run API and cross-boundary sales tests. Commit and push Phase 3.

### Phase 4: Shopify sales and seller UX

**Files:** Shopify webhook handler, idempotent order import, `src/components/shell/*`, Edit Lot UI, EN/FR locale files, UI tests.

- [ ] Write failing webhook tests for raw-body HMAC, duplicate order, paid/cancelled order policy, and a Shopify sale racing with a pack sale.
- [ ] Implement idempotent order-to-box-sale handling and a periodic reconciliation path.
- [ ] Write failing UI tests for connection status, bulk-only opt-in, product link/publish confirmation, sealed count, pause, and sync errors in EN/FR.
- [ ] Add a single Integrations menu entry and compact Shopify connection card; put per-lot publication controls in Edit Lot.
- [ ] Run `npm run verify:all`, inspect the diff and security-sensitive paths, commit/push Phase 4, and open the PR.
