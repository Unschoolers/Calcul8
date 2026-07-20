# Buyer CRM

Updated: 2026-07-20

## Current Capability

Calcul8 combines sales-derived buyer analytics with a lightweight, seller-managed identity layer. A buyer profile stores only:

- the marketplace username;
- an optional preferred name;
- up to 10 tags;
- server-managed creation, update, audit, and version fields.

Revenue, profit, order count, recency, lot history, repeat-buyer metrics, and concentration remain derived from sales. They are not copied into buyer profile documents.

## Seller Experience

- Sales history and Portfolio customer performance show the same reusable two-line identity: preferred name first, original username second.
- Selecting a buyer opens the existing quick view with sales-derived metrics and profile editing in one place.
- Customer search matches username, preferred name, and tags without requiring exact accents or casing.
- Tag entry suggests tags already used in the active scope while still allowing new tags.
- Dense rows limit visible tags and show a stable `+N` overflow count.
- Long values truncate on mobile, tablet, and desktop while the complete identity remains available to assistive technology and in the quick view.
- English and French copy covers editing, offline pending state, errors, and conflicts.

## Scope, Storage, And Collaboration

- Personal profiles belong only to the authenticated personal scope.
- Workspace profiles are shared and editable by every active workspace member.
- The API resolves the authoritative scope; clients never supply a trusted `scopeKey`.
- Profiles are independently versioned Cosmos documents behind thin scoped API handlers and a focused repository.
- Optimistic concurrency and stable mutation IDs prevent silent last-write-wins overwrites and duplicate retry writes.
- Workspace writes publish a PII-free realtime invalidation; other clients refetch through the authenticated API.
- Personal account export and deletion include personal buyer profiles. Workspace retention follows workspace ownership semantics.

## Local-First Recovery

The web app caches profiles per personal/workspace scope and keeps pending edits in a scope-specific outbox. Cached labels remain readable offline. Offline or authentication-expired writes remain visible and retry after reconnection or session recovery. A teammate conflict preserves the local mutation and exposes explicit reload/retry choices.

Late requests from a previous workspace are ignored, and in-memory profile data is cleared at sign-out to prevent scope or identity bleed.

## Deferred Capabilities

The following remain intentionally out of scope:

- buyer notes or pronunciation;
- shipping-label, address, email, phone, or legal-name ingestion;
- provider-specific profile fields;
- username aliases, merges, or a cross-marketplace identity graph;
- messaging, campaigns, follow-up automation, or AI segmentation;
- persisted revenue/profit/history projections;
- a separate top-level CRM dashboard.

These should be added only when a concrete seller workflow justifies the extra data and privacy surface.
