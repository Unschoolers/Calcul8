# Fulfillment And Bin Packing

Updated: 2026-06-09

## Seller Problem

After a show, sellers need to pack buyer orders quickly and avoid missing items. Calcul8 currently records sales and imports Whatnot rows with buyer names and order ids, but it does not yet provide a fulfillment queue, buyer bins, pick lists, packing status, or unresolved-item checks.

## Current Repo Capabilities

- `Sale` already stores customer/buyer, memo, sale type, quantity, price, buyer shipping, date, mutation id, and optional linked wheel fields.
- Whatnot import review rows already include buyer name, external order/order item ids, SKU, product category, quantity, price, shipping, and order status.
- Portfolio has sales-by-person data and drilldown rows.
- Wheel/game flows already detect pending inventory issues and can require lot selection before recording outcomes.
- Workspace sync and realtime already move sales and live updates across active workspace state.

## V1 Behavior

Fulfillment v1 should add a post-show packing workflow:

- Group recorded/imported sales by buyer and external order when available.
- Show buyer bins with item count, sale count, total value, unresolved inventory links, and packed status.
- Let the seller assign or edit a bin/location for each buyer.
- Provide a pick list by lot/source and a pack list by buyer.
- Allow statuses: not started, picking, packed, needs review, and ignored.
- Keep unresolved rows visible when a sale lacks buyer, lot, SKU, or inventory source.
- Export or print a compact packing checklist.
- Preserve original sale data; fulfillment adds status and grouping metadata.

## Data Model Implications

V1 likely needs fulfillment records separate from sales:

- fulfillment batch/show id, date range, source lots, and status;
- buyer package records with buyer label, external order ids, bin/location, status, and notes;
- package line records linking to sale ids or Whatnot row ids with quantity and source lot/singles metadata;
- audit fields for packedBy, packedAt, updatedAt, and version.

If v1 starts local-only, choose ids that can survive later cloud sync. If workspace-backed, use scoped storage and optimistic concurrency from the start.

## Frontend Surfaces

- Add fulfillment entry points from Sales, Whatnot review completion, and the future Command Center post-show checklist.
- Use mobile cards for buyer bins and tablet/desktop split view for buyer list plus package detail.
- Keep packed/needs-review actions obvious and thumb-friendly.
- Show unresolved inventory issues as one blocking review surface, not duplicate warnings.
- Support English and French labels.

## API, Storage, And Sync Implications

- Derived grouping can be local initially, but durable packing status needs storage.
- Workspace teams likely need shared fulfillment state; use existing workspace scope patterns.
- If stored in API/Cosmos, repositories should own ids, partition keys, retries, and conflict translation.
- Account export/delete must include personal fulfillment data if it stores buyer/order information.

## Edge Cases

- Same buyer has several Whatnot orders in one show.
- A buyer name differs between manual sale and Whatnot import.
- A sale is deleted or edited after being packed.
- One sale contains multiple singles lines from different source entries.
- A wheel outcome was recorded without a resolved lot.
- Seller packs offline and syncs later.
- Two workspace members edit the same buyer package.

## Tests

- Grouping tests for buyer/order aggregation, manual sales, Whatnot-imported sales, and mixed buyers.
- UI tests for mobile buyer-bin cards, status changes, unresolved row blocking, and checklist export.
- Sync/API tests for optimistic concurrency if packing state is stored in cloud.
- Regression tests that fulfillment status does not alter sale totals or portfolio profit.
- i18n tests for new labels and status copy.

## C4 Updates Needed

Required if fulfillment records become durable API/Cosmos entities:

- Update Web and API components for fulfillment services.
- Add a dynamic fulfillment flow from sales/import rows to packing batches.
- Add an ADR if workspace members can co-own packing state.

Not required for a first derived-only checklist that does not persist new state.

## Out Of Scope For V1

- Shipping label purchase.
- Carrier tracking integration.
- Warehouse-scale picking optimization.
- Barcode-required packing verification.
- Customer messaging.
