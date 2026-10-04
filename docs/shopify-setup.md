# Shopify product links and booster-box drafts

Shopify is optional and configured from **Integrations**. A workspace owner connects the store for a workspace; a personal scope uses its own connection. In **Edit inventory**, the compact Shopify card opens a product manager. Inventory **Save** persists inventory name, marketplace SKU, category and the existing managed-listing setting. Shopify actions have their own explicit confirmation and persist immediately, so cancelling inventory edits does not undo a successful Shopify change.

For an unlinked bulk lot, **Set up Shopify** offers linking an existing tracked variant or creating a new draft. Product selection is read-only until **Link product**. Choose an active inventory location; a variant can belong to one active lot per scope. The manager supports replacing a linked product, correcting its location, and removing the link. These actions do not move stock, delete products or change publication. Removal also suppresses automatic recreation from delayed inventory sync; explicit setup against the current binding revision can establish another link.

The manager reads current Shopify title, price, currency, publication status and location when available. Provider IDs remain useful when a read fails; unavailable observations are not inferred from stored creation data. **Save to Shopify** edits the product title and the selected variant price independently of inventory names and Whatnot prices. Other variants share the product title. A partial or uncertain write keeps a field-specific outcome for explicit recovery; recover that operation before submitting changed details.

Existing WhatFees-managed listings retain their publish toggle and stock synchronization. To edit them as a Shopify-owned product, explicitly confirm the management transfer first. After transfer, WhatFees no longer overwrites their title, price or stock. Marketplace SKU remains inventory metadata; changing it does not edit a linked Shopify SKU.

**Create draft** suggests a title such as **Tokyo ghoul — Booster box** and the variant label **Booster box**. Edit the Shopify title and positive price, then choose an inventory location. Store currency must match the saved lot currency. The final preview includes the generated SKU and authoritative initial sealed-box quantity. Save inventory name/SKU changes before creating; unsaved fields disable creation with a save-first hint. The product stays a draft until published in Shopify, and Shopify owns future product and stock management.

Creation records its exact final payload before calling Shopify and seeds stock once. If a response or mapping save fails, retry the original attempt to recover its provider identity and current stock. An unknown attempt must be resolved before a different payload is accepted. Recovery never reseeds stock or silently renames older **Sealed box** products.

Reopening Edit inventory after a page reload reads unresolved creation and detail attempts from the server for the current store and lot. Recover the original request before making a different Shopify change. If Shopify has since changed a title or price to another value, refresh the observed details and submit a new explicit edit against those values.

A Shopify icon marks a known active binding in mobile and desktop inventory navigation, including the current selection. Completion and selection checkmarks have separate meanings. Disconnection or an unavailable refresh retains known links with stale-link text; a scope or store change clears the previous information. The icon indicates linkage, not matching stock or fully synchronized orders.

## Linked inventory observation

Opening **Edit inventory** for a linked lot reads current stock at its selected Shopify location. **Refresh stock** reads it again. The panel shows available, on-hand and committed Shopify quantities, the observation time, WhatFees-derived sealed boxes, boxes opened for pack sales, remaining loose packs, and the signed difference between Shopify availability and the WhatFees sealed-box estimate. A failed refresh preserves the last observation and marks it stale.

A Shopify receipt changes the observed stock without changing WhatFees purchase history or costs. A Shopify box order is represented once by its imported sale; the panel never subtracts that order again from Shopify's current availability. The first pack sale that consumes a sealed box lowers the WhatFees sealed count and appears in the opened-box count, while the Shopify observation remains unchanged until refreshed. Differences are informational: purchase history, other locations, outstanding sync, and opened boxes may explain them. This comparison assumes the linked variant represents the lot's sealed boxes. It does not write stock to linked products.

## Shopify app and API settings

Create a Shopify app with these Admin API scopes: `read_products`, `write_products`, `write_files`, `read_inventory`, `write_inventory`, `read_locations`, `read_publications`, `write_publications`, and `read_orders`. Register the exact OAuth callback URL for the API environment:

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

Shopify order webhooks match new lines to active managed or linked variants by their stable provider ID. Existing paid/cancelled lines retain the original lot when a binding is removed, replaced, or its variant is reused by another lot. They are signed and idempotent. The integration counts paid box lines and reverses cancelled lines. Refunds and later order edits are not yet reflected, so in those cases stock can remain conservatively low until the affected order is cancelled or adjusted outside this integration. Disconnect pauses WhatFees-managed products before credentials are removed and leaves externally linked products unchanged. Reconnect the same store to continue, or disconnect before connecting a different store.

No live store credentials are included in the repository. Validate OAuth, publication, inventory location, paid/cancelled webhook delivery, and disconnect against a development store before enabling a production store.

Lot images are optional inventory metadata and do not require Shopify. Draft creation copies a saved image to Shopify using staged product media uploads. Add `write_files` to the app’s configured scopes and reconnect existing connections to grant the new permission before creating drafts with images. Drafts without images and existing product links continue to work with existing permissions.
