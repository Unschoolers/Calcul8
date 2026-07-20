# Calcul8 Product Roadmap

Updated: 2026-06-09

Calcul8 should become the Whatnot seller operating system: the mobile-first place a seller uses before a show, during a show, after payout, and at tax/reporting time. This roadmap is intentionally separate from `docs/refactorplan.md`, which remains the active technical/security backlog. The C4 model under `docs/c4` stays factual and should be updated only when one roadmap slice becomes approved architecture work.

## Roadmap Rules

- Verify current code before turning any roadmap item into an implementation plan.
- Keep seller workflows local-first unless cloud authority is required for sync, credentials, billing, Whatnot integration, or public/session state.
- Preserve one logic path across mobile, tablet, and desktop; optimize layouts without creating separate behavior.
- Add C4 changes only for selected implementation slices, not for speculative roadmap ideas.
- Each feature must define the seller outcome, success metric, current Calcul8 foundation, and implementation risk before code starts.

## 12-Week Goal

By the end of 12 weeks, a Whatnot seller should be able to:

- prepare inventory and show targets in Calcul8;
- run a live show from a focused command surface;
- import Whatnot sales and reconcile expected profit against payout evidence;
- pack orders with buyer/bin visibility;
- understand buyer value, seller/team performance, and portfolio health from mobile-friendly reports.

## Ranked Feature Sequence

| Rank | Feature | Phase | Status | Success metric |
| --- | --- | --- | --- | --- |
| 1 | [Payout Reconciliation](product/features/payout-reconciliation.md) | Weeks 1-2 | Detail ready | A seller can explain every difference between expected Calcul8 profit and imported payout totals. |
| 2 | [Live Show Command Center](product/features/live-show-command-center.md) | Weeks 3-6 | Detail ready | A seller can run a show from one screen without switching between setup, live pricing, sales, and game tools. |
| 3 | [Inventory Intake](product/features/inventory-intake.md) | Weeks 7-8 | Detail ready | A seller can add sourced singles or bulk lots quickly on mobile with cost, SKU, image, and target pricing captured. |
| 4 | [Fulfillment And Bin Packing](product/features/fulfillment-bin-packing.md) | Weeks 8-9 | Detail ready | A seller can move from imported/recorded sales to a buyer-level packing checklist with unresolved items visible. |
| 5 | [Buyer CRM](product/features/buyer-crm.md) | Weeks 10-12 | Identity v1 implemented | A seller can recognize buyers by preferred name and tags while retaining the marketplace username and sales-derived history. |
| 6 | AI Show Planner | Future | Future detail file needed | Calcul8 suggests a show order and target actions from inventory and prior sales. |
| 7 | Stream Overlay And Spectator Toolkit | Future | Future detail file needed | Sellers can publish buyer-facing proof, game state, and show stats to a stream/browser source. |
| 8 | Tax And Accountant Reports | Future | Future detail file needed | Sellers can export monthly/yearly revenue, COGS, fees, shipping, refunds, and remaining inventory. |
| 9 | Advanced Analytics | Future | Future detail file needed | Sellers can compare shows, categories, sale formats, and team performance over time. |
| 10 | Sourcing Assistant | Future | Future detail file needed | Sellers can decide a safe max buy price before purchasing inventory. |

## Phase Plan

### Weeks 1-2: Trust And Payout Foundation

Build payout reconciliation first because it turns Calcul8 from a calculator into a ledger sellers trust. This phase should extend the existing Whatnot import and sales persistence foundations without changing the C4 model until the first implementation plan chooses the API/storage boundary.

Dependencies:

- Existing Whatnot OAuth/CSV import and review flows.
- Existing `Sale` fields for buyer, shipping, memo, date, net revenue, mutation id, and versions.
- Existing sales-live API and sync snapshot behavior for authoritative sales.

### Weeks 3-6: Live Show Command Center

Unify the current Config, Live, Sales, Portfolio, and Game workflows into one show-running surface. The first version should orchestrate existing capabilities rather than creating a second sales model.

Dependencies:

- Existing tabs: `config`, `live`, `sales`, `portfolio`, and `wheel`.
- Existing live singles pricing, wheel/game session, sales entry, sales freshness, workspace realtime, and portfolio summaries.
- Payout reconciliation may feed post-show status, but it does not block the live command center.

### Weeks 7-9: Inventory And Fulfillment

Speed up mobile intake, then turn sales into a packing workflow. Inventory intake extends existing lot/singles data; fulfillment adds buyer/order grouping that is currently only implicit in sale rows and Whatnot import rows.

Dependencies:

- Existing bulk lot setup, singles purchases, singles image upload, CSV import, catalog search, live singles, and wheel inventory deduction.
- Existing buyer/customer capture on `Sale` and Whatnot review rows.

### Weeks 10-12: Buyer Intelligence And Retention

Buyer CRM identity v1 now adds shared preferred names and tags on top of recorded/imported sales. Buyer totals, repeat behavior, recency, and concentration stay deterministic and sales-derived; notes and other sensitive profile fields are intentionally deferred.

Dependencies:

- Existing portfolio sales-by-person chart data.
- Existing sales customer/buyer fields.
- Existing scoped API, local-first outbox, and workspace realtime foundations for shared profile metadata.

## Future Feature File Backlog

Create these only after the first five are either implemented or explicitly reprioritized:

- `docs/product/features/ai-show-planner.md`
- `docs/product/features/stream-overlay-spectator-toolkit.md`
- `docs/product/features/tax-accountant-reports.md`
- `docs/product/features/advanced-analytics.md`
- `docs/product/features/sourcing-assistant.md`

## C4 Update Policy

The current C4 overview describes Calcul8 as a local-first PWA with API authority for workspace sync snapshots, billing facts, Whatnot credentials, sales persistence, and public game-session state. That remains accurate for this roadmap.

Update C4 only when a selected feature changes architecture, for example:

- payout reconciliation introduces a new cloud-authoritative reconciliation batch or payout import flow;
- fulfillment creates durable package/bin entities;
- buyer CRM introduces a durable buyer profile aggregate instead of derived-only analytics;
- live command center introduces a new top-level app component or dynamic show-session flow;
- stream overlays add a new public view or realtime room contract.

## Implementation Handoff

When the team picks the next build slice:

1. Re-scan the linked feature file against current code.
2. Create a focused implementation plan under `docs/superpowers/plans/`.
3. Keep the first slice small enough to test independently.
4. Update C4 only if the selected slice changes the factual architecture.
5. Run the relevant verification gates listed in the feature file.
