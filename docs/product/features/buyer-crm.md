# Buyer CRM

Updated: 2026-06-09

## Seller Problem

Sellers need to know who buys repeatedly, who drives margin, who responds to certain categories, and where revenue is concentrated. Calcul8 already records customer/buyer names and has portfolio sales-by-person analytics, but it does not yet provide buyer profiles, notes, tags, or CRM-style follow-up memory.

## Current Repo Capabilities

- `Sale` already has an optional customer field.
- Whatnot import rows already preserve buyer name.
- Portfolio already has sales-by-person chart data, seller labels, week buckets, totals, and drilldown rows.
- Sales and Portfolio already calculate revenue, profit, margin, sell-through, and lot performance.
- Workspace presence/member concepts exist, but they represent app users/team members, not buyers.

## V1 Behavior

Buyer CRM v1 should be deterministic and derived from existing sales first:

- Create buyer profiles from normalized customer/buyer names.
- Show total revenue, total profit, order count, last purchase date, average order value, favorite lots/categories when available, and recent items.
- Let the seller add local notes and tags such as VIP, bundle buyer, payment issue, prefers singles, or giveaway winner.
- Show buyer concentration warnings in Portfolio: top buyer share, top five share, and repeat buyer rate.
- Link from Sales history and Fulfillment buyer bins into the buyer profile.
- Keep buyers scoped by personal/workspace state; buyers from one workspace must not bleed into another.

## Data Model Implications

V1 can derive metrics from sales and persist only seller-authored CRM metadata:

- buyer profile key from normalized buyer name plus scope;
- display name;
- notes;
- tags;
- optional manual aliases for merged buyer names;
- audit/version metadata if stored in cloud.

Do not duplicate derived revenue/profit totals into storage unless a later performance issue requires cached projections.

## Frontend Surfaces

- Add buyer profile access from Portfolio sales-by-person, Sales history, and Fulfillment.
- Add a Buyer CRM section or filter inside Portfolio before adding a new top-level tab.
- Use compact buyer cards on mobile and richer tables/charts on desktop.
- Make notes/tags editable with clear save/cancel states and offline-safe behavior.
- Add French/English i18n for CRM labels and empty states.

## API, Storage, And Sync Implications

- Derived buyer metrics can run in the browser from loaded sales.
- Persisted notes/tags need scoped storage and account export/delete coverage.
- Workspace-backed buyer metadata needs conflict handling when two members edit notes/tags.
- If cloud-backed, API handlers should be thin and repository code should own ids/partition keys.

## Edge Cases

- Buyer name is missing on manual sales.
- Same buyer appears with capitalization, spacing, or username changes.
- Two buyers share a similar display name.
- Seller wants to merge aliases but later undo the merge.
- Buyer asks for deletion/export coverage.
- Sales are imported after notes already exist for the buyer.

## Tests

- Normalization tests for buyer keys, blank buyers, casing, spacing, and aliases.
- Derived metric tests for revenue, profit, order count, average order value, repeat rate, and top buyer share.
- UI tests for buyer profile opening from Portfolio and Sales.
- Persistence tests for notes/tags across personal/workspace scopes.
- Conflict tests if notes/tags are cloud-backed.
- i18n tests for new buyer CRM copy.

## C4 Updates Needed

Required only if buyer metadata becomes durable cloud state:

- Update Web/API components with buyer CRM responsibilities.
- Add an ADR for buyer identity, aliases, and deletion/export semantics.
- Add a dynamic flow for buyer profile update if the API boundary is introduced.

Not required for derived-only buyer analytics.

## Out Of Scope For V1

- Messaging buyers.
- Scraping Whatnot followers or chat.
- Automated marketing campaigns.
- Cross-marketplace identity graph.
- AI buyer segmentation.
