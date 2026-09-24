# Whatnot Dynamic Canadian Commission Design

## Goal and scope

When a lot uses the Whatnot fee profile, estimate the Canadian selling commission from that lot's Whatnot vertical and the seller's tracked completed sales in the preceding fixed four-week period. New lots require a vertical; existing lots remain unclassified until the seller chooses one. Keep the existing payment-processing fee fields separate from the changing commission. Support personal and workspace scopes without mixing their sales.

This follows the seller's requested simple first version: no new sale-date editor, no configurable fee-cycle dates, no separate marketplace selector, and no automatic category inference from the card catalog. The existing `Sale.date` is the date available to the calculator. A scope is treated as one Whatnot seller account; multiple accounts in one scope and orders outside WhatFees make the result an estimate.

## Published rules and schedule

Whatnot's Canadian table and cycle rules are published at https://help.whatnot.com/hc/en-us/articles/4847069165965-Whatnot-seller-fees (checked 2026-09-23). Sales across categories count toward the same tier. A period lasts 28 calendar days; its completed sales determine the **next** period's tier, whose rate stays fixed throughout that next period. The published start for existing sellers is 2026-09-21 in their local market; the initial tier uses 2026-08-24 through 2026-09-20. These dates and the fee schedule belong in one versioned Canada-specific module, not in UI templates or persisted lot fee percentages. Sale dates are interpreted as local calendar dates with a 28-day date-only cadence to avoid DST shifts. Rates before rollout retain the existing flat-fee behavior.

| Vertical | Standard | Tier 1 | Tier 2 | Tier 3 | Tier 4 | Tier 5 | Tier 6 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Sales in CAD | <10,000 | 10,000 | 20,000 | 35,000 | 50,000 | 65,000 | 85,000 |
| Sports | 8 | 7.75 | 7.5 | 7.25 | 7 | 6.75 | 6.5 |
| TCG | 8 | 7.75 | 7.5 | 7.25 | 7 | 6.75 | 6.5 |
| Fashion | 8 | 7 | 6.5 | 5.5 | 5 | 4.5 | 4.5 |
| Other Collectibles | 8 | 7.25 | 6.5 | 6 | 5 | 5 | 5 |
| Coins | 4 | 3.9 | 3.8 | 3.7 | 3.6 | 3.55 | 3.5 |
| Other | 8 | 7 | 6.5 | 5.5 | 4 | 4 | 4 |

The table values are percentages; threshold comparisons use the sale price before shipping and tax. USD-labeled lot prices are converted to CAD using the lot's existing USD-to-CAD exchange rate, and the result remains labelled an estimate. Promotional discounts, Premier Shop discounts, high-value item caps, order refunds, private shows, and local pickup cannot be inferred reliably from the present Sale model and are not calculated in this increment. Processing remains the app's existing 2.9% and C$0.30 estimate.

## Data and boundaries

- Add a validated `whatnotVertical` union to the lot, keep it optional for legacy lots, and persist it through setup save/load, local cache, sync DTOs, cloud/workspace sync, and import/export paths. Invalid persisted values become unclassified, never `other` silently. A new lot must explicitly select one of the six values in its creation modal; both bulk and singles lots use the same field. The current lot can be classified or changed from System Configuration even when it inherits system pricing defaults.
- Keep `platformFeePercent` as a persisted legacy/default estimate rather than writing the changing rate into every lot. Derive an effective fee input at calculation time for Whatnot lots with a classified vertical. The `none` profile continues to resolve to zero platform and processing fees. For an unclassified legacy lot, retain its existing stored fee input and show that its category still needs a choice.
- Read all sales for the active scope across **all** lots, regardless of portfolio filters. Qualifying imported sales identify Whatnot by `externalProvider`; qualifying manual sales use their Whatnot profile at creation. Persist provenance on newly created manual sales, so later edits to a lot's profile cannot change their tier contribution. Other-provider sales never count. Use `getGrossRevenueForSale` so bundled and total-price singles contribute once. The actual dated imported `netRevenue`, when present, remains authoritative.
- Existing cross-lot caches may be missing. Reuse the scoped batch sales endpoint/cache to fill missing entries; guard against changing workspace or stale requests. While sales are missing or history may be incomplete, show an estimated tier from the tracked data and never present it as an exact Seller Hub rate. Do not fetch sales repeatedly for every reactive calculation.
- Snapshot the commission used for newly recorded manual Whatnot sales so later tier changes do not reprice their historical net amounts. Respect existing imported `netRevenue`; financial edits to a manual sale recalculate its estimated net with the rate for the sale's own period. Legacy unsnapshotted sales retain their existing flat estimate instead of being retroactively assigned today's tier. A date-only change to a manual sale re-evaluates its period; descriptive edits keep the snapshot.

## Presentation and validation

System Configuration displays the current lot's vertical selector, current estimated tier and commission, sales counted in the previous period, and progress toward the next tier. Distinguish the locked current rate from projected next-period progress. Show a concise estimate qualifier, especially when the local sales cache is incomplete. Translate new copy in English and French and keep the existing mobile/desktop and light/dark layout conventions.

Cover all CAD thresholds, six rows, 28-day boundaries, tier lock, category-independent volume, source filtering, missing or malformed dates, currency conversion, old unclassified lots, both profiles, manual sale snapshot behavior, and local/cloud sync round trips. Run the web and API verification gates because the sync contract is shared.
