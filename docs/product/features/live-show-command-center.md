# Live Show Command Center

Updated: 2026-06-09

## Seller Problem

During a live show, sellers need a single operational surface. Calcul8 currently has strong pieces across Config, Live, Sales, Portfolio, and Game/Wheel, but a seller still has to mentally stitch together setup state, pricing, sale entry, inventory warnings, game status, and post-show totals.

## Current Repo Capabilities

- `src/types/app.ts` defines app tabs for config, live, sales, portfolio, and wheel.
- Live pricing, live singles, sale entry, sales freshness, portfolio summaries, workspace realtime, wheel/game sessions, and spectator/public game state already exist.
- Wheel/game code already tracks live mode, session profit, buyer shipping, inventory warnings, pending inventory issues, fairness history, and public verification links.
- Portfolio already exposes pulse/insight style summaries and charts; Sales already supports chart/history workflows.
- Workspace realtime already applies incoming sales/live pricing events and recovery behavior.

## V1 Behavior

The command center should be a seller-facing show mode that composes current workflows:

- Pre-show checklist: selected lot, pricing sanity, inventory completeness, Whatnot connection/import status, game readiness, and sync/realtime health.
- Live queue: next item or bundle, target sale price, expected margin, quantity available, and action to record sale.
- One-tap sale capture for pack, box, RTYH, singles, and wheel/game outcomes using the existing sale model.
- Current show totals: gross, estimated net, profit, margin, sold count, top buyer, unresolved inventory issues, and sync state.
- Game block: current wheel/grid/bracket status, fairness proof link, pending resolver, and spectator publish state.
- Post-show checklist: import Whatnot sales, reconcile payout when available, review unresolved sales, and export/report.
- Local-first operation: if network/auth/realtime fails, the seller can keep recording sales and sees recovery state plainly.

## Data Model Implications

V1 should avoid a second sale model. It can introduce a show-session view model first:

- active show id or local session id;
- started/ended timestamps;
- included lot ids and game ids;
- local command-center preferences such as compact/expanded sections;
- optional post-show checklist state.

Persist durable show-session records only when the first implementation proves a reporting need that cannot be derived from sales and lots.

## Frontend Surfaces

- Prefer adding a command-center screen or mode that reuses existing Live, Sales, Portfolio, Whatnot, and Game components.
- Keep controls thumb-friendly at 390px width and dense but scannable on tablet/desktop.
- Use theme-aware shared UI primitives; avoid a decorative dashboard that slows live work.
- Keep destructive/session-ending actions explicit and modal-confirmed.
- Provide French and English labels from the shared i18n catalog.

## API, Storage, And Sync Implications

- Use existing sales-live APIs and sync behavior for sale persistence.
- Use existing workspace realtime rooms for live pricing, sales, wheel, and presence where possible.
- If durable show sessions are added, scope them by personal/workspace and use optimistic concurrency.
- Do not make the command center depend on realtime delivery for correctness; API/local state remains authoritative.

## Edge Cases

- Seller loses auth during a show.
- Browser local storage is reset while in-memory sales exist.
- Workspace access is lost mid-show.
- Realtime reconnects after missed sale or game events.
- A game outcome requires lot selection before sale recording.
- Same buyer has multiple orders during the show.
- Seller switches lots during a show.

## Tests

- UI tests for mobile command-center layout, checklist states, and primary sale actions.
- Unit tests for derived show totals from existing sales/lots.
- Regression tests that sale capture writes through existing sales methods and updates sync metadata.
- Realtime/recovery tests for command-center health labels after reconnect/stale state.
- i18n tests for new English/French strings.

## C4 Updates Needed

Required if command center becomes a new top-level web component or introduces durable show-session storage:

- Update Web PWA component docs.
- Add a dynamic `LiveShowCommandCenterFlow` if it changes the seller workflow materially.
- Add an ADR only if show-session records become cloud-authoritative.

Not required if the first slice is a UI composition of existing workflows.

## Out Of Scope For V1

- OBS overlay controls.
- AI show ordering.
- Direct control of Whatnot livestream state.
- Replacing the existing individual tabs.
- New marketplace integrations.
