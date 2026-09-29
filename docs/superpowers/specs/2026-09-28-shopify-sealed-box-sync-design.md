# Shopify sealed-box sync design

## Seller outcome

A seller connects a Shopify store once and chooses which bulk lots to publish as sealed boxes. A pack sale automatically commits one box to packs when needed, so Shopify's sellable box count falls without a manual opening action. A Shopify box sale is recorded once in WhatFees. Sellers can see when a listing needs attention and can keep using WhatFees while Shopify is unavailable.

## Inventory rule

For a bulk lot with `B` boxes purchased and `P > 0` packs per box, count recorded box sales as `S` boxes and all non-box sales that consume packs as `D` packs. The number of boxes committed to packs is `ceil(D / P)`. Sellable sealed boxes are `B - S - ceil(D / P)`, provided that value is nonnegative. The first pack-consuming sale automatically commits a box; another box is committed only after the previous box's packs are exhausted. The result is derived from the current saved sales so retries and sale edits cannot double-open a box. It does not claim to record the physical opening time.

Pack-consuming sales include ordinary packs, RTYH, wheel settlements, and imported sales with a positive pack count. A box sale is counted in `S` and must not also be counted in `D`. If the data is inconsistent (missing packs-per-box or demand exceeds purchased stock), surface a reconciliation error and do not publish an invented quantity. Existing lots derive their current count from historical sales; the app does not invent historical opening timestamps.

## Connection and linking

Use the Shopify Admin GraphQL API with a pinned stable version. WhatFees is a standalone app for merchant stores, so the seller connects with Shopify OAuth. App client credentials are deployment configuration; a seller should not paste an API key. Store per-shop offline credentials encrypted on the API and scope them to the signed-in personal or workspace account. Only an authorized owner can connect or disconnect a workspace store.

Marketplace SKU can prefill the Shopify variant SKU or help a seller identify a product. It is editable and may be duplicated, so it is not the link key. Store Shopify shop domain, product/variant/inventory-item IDs, selected location ID, and the WhatFees lot ID in a provider-specific server record. One bulk lot maps to one sealed-box variant; singles and packs are not published in this release.

## Seller experience

The account menu has one **Integrations** entry that opens a small integrations view. The Shopify card shows Connect, connected shop, and connection health; it also provides Disconnect. In Edit Lot, a bulk lot has a **Sell sealed boxes on Shopify** option and an explicit first-time product link or publish choice. Show the box quantity that will be listed, Marketplace SKU if present, last successful sync, and a short actionable error. Turning the option off stops future updates; do not silently delete a Shopify product. Existing products require an explicit selection so an identical SKU cannot accidentally bind the wrong item. English and French copy share the same workflow.

## Sync and recovery

The API owns Shopify writes. The opt-in mapping and the latest accepted lot/sale state produce a desired sealed-box quantity. Product publication and inventory updates use stable IDs, idempotency/compare checks where the API supports them, and a durable retry record so closing the browser does not drop an update. Do not overwrite a quantity changed concurrently by a Shopify order with a stale value. Shopify order notifications are verified, deduplicated, and reconciled into box sales; missed events are repaired by a periodic read. Paused/disconnected mappings are never written. Keep existing local-first sales usable when Shopify is unavailable, while displaying that the listing is awaiting sync.

## Acceptance

- A pack sale on a lot of three 10-pack boxes leaves two sealed boxes and nine loose packs; the eleventh pack sale leaves one sealed box.
- A box sale reduces sealed boxes once; editing or retrying a sale recalculates the same result.
- Only opted-in bulk lots can create or change Shopify listings, and packs/singles are never published.
- Each mapping uses Shopify IDs, not Marketplace SKU, for later updates.
- A seller can connect, see status, publish/link, pause, and diagnose sync errors in both languages.
- Shopify sales and retries do not create duplicate WhatFees sales or increase Shopify availability.

## Boundaries

No physical box-opening button, pack listings, singles listings, automated product matching by SKU, or general multi-marketplace inventory engine. Shopify app credentials and live store access are supplied through deployment configuration and a merchant install, never committed to source control.
