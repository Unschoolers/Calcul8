# Shopify sealed-box sync

Shopify is optional and configured from **Integrations**. A workspace owner connects the store for a workspace; a personal scope uses its own connection. Use **Edit inventory** to search for an existing Shopify product by name or SKU, choose its variant and active inventory location, then Save to link it to a bulk lot. SKU is edited in the same dialog; System configuration contains pricing overrides only.

**Edit inventory** shows the bound Shopify product, variant, SKU, inventory location, and an admin product link for both WhatFees-managed and externally linked listings. Names are read from Shopify when available; stored provider IDs remain visible if that read fails. Viewing these details does not change the binding or Shopify stock.

The Shopify selector loads suggestions as you type at least two characters. Search input is treated as literal prefix terms, not Shopify filter syntax. If Shopify finds matching variants that cannot be linked because inventory tracking or an active location is missing, the selector explains that requirement.

Search and selection are read-only. Saving a link stores the Shopify product, variant, inventory item, and location IDs. Shopify keeps ownership of the linked product: its title, options, price, SKU, publication status, and stock are never overwritten by WhatFees, including on lot edits or disconnect. The marketplace SKU field remains WhatFees metadata. This phase does not push WhatFees stock changes to linked products or import the full catalog automatically. Only tracked variants with an active stock location can be linked. A variant can belong to one lot per scope; changing or removing an existing link is deferred.

Existing WhatFees-managed listings keep their sealed-box synchronization and publish toggle in Edit inventory. They cannot be converted to an existing-product link in this phase. New lots offer search and link only; opened boxes and loose packs are never newly listed.

## Linked inventory observation

Opening **Edit inventory** for a linked lot reads current stock at its selected Shopify location. **Refresh stock** reads it again. The panel shows available, on-hand and committed Shopify quantities, the observation time, WhatFees-derived sealed boxes, boxes opened for pack sales, remaining loose packs, and the signed difference between Shopify availability and the WhatFees sealed-box estimate. A failed refresh preserves the last observation and marks it stale.

A Shopify receipt changes the observed stock without changing WhatFees purchase history or costs. A Shopify box order is represented once by its imported sale; the panel never subtracts that order again from Shopify's current availability. The first pack sale that consumes a sealed box lowers the WhatFees sealed count and appears in the opened-box count, while the Shopify observation remains unchanged until refreshed. Differences are informational: purchase history, other locations, outstanding sync, and opened boxes may explain them. This comparison assumes the linked variant represents the lot's sealed boxes. It does not write stock to linked products.

## Shopify app and API settings

Create a Shopify app with these Admin API scopes: `read_products`, `write_products`, `read_inventory`, `write_inventory`, `read_locations`, `read_publications`, `write_publications`, and `read_orders`. Register the exact OAuth callback URL for the API environment:

`https://<api-host>/api/integrations/shopify/connect/callback`

Set these API environment variables in each environment, including local settings when developing:

| Setting | Purpose |
| --- | --- |
| `SHOPIFY_CLIENT_ID` | Shopify app client ID |
| `SHOPIFY_CLIENT_SECRET` | Shopify app client secret; also verifies webhook signatures |
| `SHOPIFY_REDIRECT_URI` | Exact registered callback URL above |
| `SHOPIFY_TOKEN_ENCRYPTION_SECRET` | Long random secret for stored offline tokens |

Keep all four values on the API server. Never commit them or put them in frontend settings. The API uses Shopify Admin API version `2026-07`. It registers the paid and cancelled order webhook subscriptions at `/api/integrations/shopify/webhooks/orders` when reconciliation runs; that URL is derived from `SHOPIFY_REDIRECT_URI`.

## Existing managed-listing inventory behavior

The app computes sealed boxes as purchased boxes minus box sales minus boxes consumed by non-box pack sales. The first non-box pack sale that needs a sealed box records an opening event at the sale's immutable creation time. Older sales without a creation timestamp appear with date-only precision. The lot screen shows the count based on app sales before Shopify orders; the Shopify publication also subtracts known Shopify box orders. Inventory writes use Shopify's compare quantity to avoid increasing stock over an unimported store sale. A timed reconciliation checks opted-in lots every five minutes, while app writes request a scoped reconciliation.

Shopify order webhooks match both managed and linked variants by their stable provider ID. They are signed and idempotent. The integration counts paid box lines and reverses cancelled lines. Refunds and later order edits are not yet reflected, so in those cases stock can remain conservatively low until the affected order is cancelled or adjusted outside this integration. Disconnect pauses WhatFees-managed products before credentials are removed and leaves externally linked products unchanged. Reconnect the same store to continue, or disconnect before connecting a different store.

No live store credentials are included in the repository. Validate OAuth, publication, inventory location, paid/cancelled webhook delivery, and disconnect against a development store before enabling a production store.
