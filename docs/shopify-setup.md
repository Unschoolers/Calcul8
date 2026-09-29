# Shopify sealed-box sync

Shopify is optional and configured from **Integrations**. A workspace owner connects the store for a workspace; a personal scope uses its own connection. Each eligible bulk lot can opt in from its lot settings. The app publishes one sealed-box variant per opted-in lot; opened boxes and loose packs are never listed.

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

## Inventory behavior

The app computes sealed boxes as purchased boxes minus box sales minus boxes consumed by non-box pack sales. The first non-box pack sale that needs a sealed box records an opening event at the sale's immutable creation time. Older sales without a creation timestamp appear with date-only precision. The lot screen shows the count based on app sales before Shopify orders; the Shopify publication also subtracts known Shopify box orders. Inventory writes use Shopify's compare quantity to avoid increasing stock over an unimported store sale. A timed reconciliation checks opted-in lots every five minutes, while app writes request a scoped reconciliation.

Shopify order webhooks are signed and idempotent. The integration counts paid box lines and reverses cancelled lines. Refunds and later order edits are not yet reflected, so in those cases stock can remain conservatively low until the affected order is cancelled or adjusted outside this integration. Disconnect pauses linked products before credentials are removed. Reconnect the same store to continue, or disconnect before connecting a different store.

No live store credentials are included in the repository. Validate OAuth, publication, inventory location, paid/cancelled webhook delivery, and disconnect against a development store before enabling a production store.
