# Buyer Identity CRM Design

**Date:** 2026-07-20
**Status:** Approved

## Summary

Calcul8 will extend its existing read-only buyer analytics with a lightweight, seller-managed identity layer. A seller can associate a preferred name and tags with an existing customer username. Personal profiles remain private to the personal scope; profiles created in a workspace are shared and editable by every active workspace member.

The profile stores identity metadata only. Spending, purchases, recency, lot history, and concentration metrics continue to be derived from sales so the feature does not duplicate or stale existing financial data.

## Goals

- Let a seller recognize a returning buyer by name during a live interaction.
- Preserve the marketplace/customer username as the stable visible identity anchor.
- Let sellers organize buyers with lightweight tags.
- Show the same shared buyer identity to every member of a workspace.
- Keep personal and workspace buyer data strictly isolated.
- Make edits immediate, offline-safe, conflict-aware, and recoverable.
- Render buyer identities clearly on mobile, tablet, and desktop without allowing long names or usernames to break layouts.

## Non-Goals

- Buyer notes or pronunciation fields.
- Shipping-label, legal-name, address, email, or phone ingestion.
- Provider-specific identity fields.
- Username aliases, profile merging, or a cross-marketplace identity graph.
- Messaging, marketing automation, or AI segmentation.
- Persisting buyer revenue, profit, purchase history, or other sales-derived analytics.

## Current Foundation

Calcul8 already has:

- normalized buyer keys derived from `Sale.customer`;
- a buyer quick-view modal reachable from Sales and Portfolio;
- total spend, purchase count, last purchase date, and per-lot history;
- customer-performance rows, repeat-buyer totals, and concentration metrics;
- English and French buyer UI copy;
- focused domain, UI-contract, and Vue scenario tests.

The new feature extends these paths instead of introducing a separate CRM dashboard in v1.

## Domain Model

### Public Shape

The frontend and API share an explicit public shape:

```ts
interface BuyerProfileDto {
  username: string;
  preferredName?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  version: number;
}
```

Only `username`, `preferredName`, and `tags` are seller-visible fields. The API manages timestamps and versioning.

### Storage Shape

The repository owns the Cosmos document shape and cross-cutting identifiers:

- deterministic document ID derived from a hash of the normalized username;
- `scopeKey` as the partition and ownership boundary;
- canonical display `username`;
- optional `preferredName`;
- normalized, display-preserving `tags`;
- `createdAt`, `updatedAt`, `updatedBy`, and `version`;
- the latest mutation identity required for idempotent retry.

`scopeKey` is infrastructure metadata. It is resolved from the authenticated personal/workspace context and is never editable or supplied as trusted authority by the client.

The unique logical identity is:

```text
(scopeKey, normalizeBuyerKey(username))
```

The same username can therefore have different metadata in a personal scope and a workspace without data bleed.

### Validation And Normalization

- Username is required, trimmed, internal whitespace is collapsed, and its normalized key uses the existing buyer-key normalization.
- The preferred name is optional, trimmed, whitespace-collapsed, and limited to 80 characters.
- A profile can contain at most 10 tags.
- Tags are trimmed, whitespace-collapsed, limited to 32 characters each, and deduplicated case-insensitively while preserving display casing.
- Clearing the preferred name and every tag deletes the otherwise-empty profile.
- Unknown fields and invalid external input are rejected at the API boundary.

## Scope And Permissions

### Personal Scope

The authenticated user owns personal buyer profiles. Other users cannot read or mutate them.

### Workspace Scope

There is one shared buyer profile per normalized username within a workspace. Every active workspace member can read, create, edit, and delete workspace buyer profiles. Updates are visible to the whole workspace.

Workspace membership and scope resolution reuse the existing centralized authorization helpers. Route handlers do not accept a client-supplied scope key as authority.

Account export and deletion include personal buyer profiles. Workspace profile retention follows workspace ownership and deletion semantics rather than an individual member's account deletion.

## API And Repository Architecture

Buyer profiles use a focused cloud-authoritative entity boundary instead of joining the existing whole-scope sync snapshot. This prevents a preferred-name edit from conflicting with unrelated lot, sale, or game changes and provides per-record optimistic concurrency.

Thin handlers expose scoped operations to:

- list buyer profiles for the active scope;
- create or update a profile using an expected version and mutation ID;
- delete a profile using an expected version and mutation ID.

Username-bearing mutations use request bodies instead of URL segments so customer identities are not unnecessarily copied into access paths and logs.

The Cosmos repository owns deterministic IDs, partition keys, timestamps, version increments, mutation deduplication, conditional writes, and conflict translation. A stale expected version returns a stable `409` conflict response; it never performs a last-write-wins overwrite.

Telemetry may include scope type, operation, outcome, version, latency, and conflict state. It must not include usernames, preferred names, tags, raw request bodies, or document contents.

## Frontend Architecture

### Focused Responsibilities

- A buyer-profile domain module owns validation, tag normalization, identity formatting, and composition with derived analytics.
- A buyer-profile client owns API DTO normalization and scoped requests.
- A scoped buyer-profile store owns the in-memory index, local cache, loading state, pending mutations, and conflict state.
- The existing buyer quick-view modal owns profile display and editing through focused child components or composables rather than accumulating API and persistence logic.
- Sales and Portfolio consume one shared buyer-identity display helper/component so formatting rules do not diverge.

The existing `BuyerQuickViewSummary` remains a derived analytics model. A view model composes it with an optional `BuyerProfileDto`; the profile never copies derived totals.

### Display Rules

When a preferred name exists, the conceptual full identity is:

```text
Marc (@cardking27)
```

When it does not exist, the username is shown by itself:

```text
@cardking27
```

The UI must not assume the conceptual full identity fits on one line.

#### Compact Mobile Surfaces

- Preferred name is the primary line and username is a separate secondary line.
- Each line uses a single-line ellipsis within a shrinking flex/grid child (`min-width: 0`).
- The UI does not concatenate preferred name and username into one unbreakable row.
- Dense lists show only the tags that fit, followed by a `+N` overflow indicator.
- Selecting the buyer opens the quick view, where the complete preferred name, username, and tags are available.
- Accessible labels contain the complete identity even when visible text is truncated.
- Touch users do not depend on hover tooltips to discover the full value.

#### Modal, Tablet, And Desktop Surfaces

- The buyer quick view may show preferred name and username on separate lines and allow safe wrapping where space permits.
- Desktop tables can use the compact two-line identity cell rather than widening the entire table for long values.
- Tags wrap inside the profile detail surface but do not increase the height of dense sales rows without a defined limit.

Responsive behavior must be verified at representative narrow mobile widths, not inferred only from desktop layout.

### Editing

- The existing buyer quick view gains a small, clearly labeled edit action.
- Username is visible and read-only.
- Preferred name uses one optional text field.
- Tags use a searchable chip input. Existing tags in the current scope are suggested first, while new tags can be created directly.
- Save and Cancel states are explicit and usable with touch, keyboard, and screen readers.
- Search and filtering match username, preferred name, and tags using normalized comparison.

## Data And Mutation Flow

### Load

1. Resolve the active personal/workspace scope.
2. Hydrate the scope's cached profiles immediately when available.
3. Fetch the authoritative scoped list after an authenticated session is ready.
4. Normalize the API response and replace only the matching scope's profile index.
5. Join profiles with sales-derived buyer summaries at the view-model boundary.

Switching scopes swaps the profile index and cache key. A late response from a previous scope cannot apply to the new active scope.

### Save

1. Validate and normalize the preferred name and tags in the frontend.
2. Create a stable mutation ID and retain the current expected version.
3. Apply an optimistic local update marked as pending.
4. Submit the scoped mutation once an authenticated session and network are available.
5. Replace the optimistic record with the authoritative response and clear the pending state.
6. Cache the confirmed record and publish a safe workspace realtime invalidation event.

Repeated clicks are guarded while the same mutation is in flight. Retrying the same mutation ID returns the original result instead of applying it twice.

### Realtime

Workspace realtime messages identify the changed profile by its safe document identity and version, not by username or preferred name. Other members invalidate or refetch that record through the authenticated API. Personal profiles do not publish workspace events.

## Offline And Conflict Behavior

- Cached profiles remain readable offline.
- An offline edit is stored in a scope-specific outbox and rendered with a visible pending status.
- Reconnection retries the retained mutation; pending changes survive navigation and app restart.
- A `401` or expired session pauses the mutation without discarding the draft and resumes after authentication recovers.
- A stale version returns a conflict state containing the local draft and the latest safe server record.
- The UI explains that a teammate changed the profile and offers Reload and Retry actions.
- Reload never silently destroys the local draft; retry requires the user to confirm the refreshed values.
- Permanent validation or permission errors remove optimistic authority while keeping the editable draft available.

English and French copy must explain pending, saved, offline, conflict, permission, and retry states with correct French diacritics.

## Test Strategy

### Domain And Contract Tests

- username normalization reuses current buyer-key semantics;
- preferred-name trimming and length limits;
- tag trimming, casing, deduplication, count, and length limits;
- empty metadata produces a delete operation;
- profile composition does not copy or alter derived sales metrics;
- identity formatting falls back correctly when no preferred name exists.

### API And Repository Tests

- personal and workspace scope isolation;
- every active workspace member can read and mutate shared profiles;
- non-members and inactive members are rejected;
- deterministic identity within a scope and separation across scopes;
- conditional create, update, and delete behavior;
- stale versions return a stable conflict without overwrite;
- repeated mutation IDs are idempotent;
- timestamps and versions are server-managed;
- invalid external input is rejected;
- logs and telemetry omit buyer identity fields;
- personal export and deletion include buyer profiles.

### Frontend Tests

- buyer quick view displays and edits preferred name and tags;
- Sales and Portfolio display the preferred name while retaining the username;
- search matches username, preferred name, and tags;
- scope switching cannot leak or apply stale profile data;
- offline edits survive reload, retry once, and clear pending state after success;
- auth expiry preserves the draft;
- teammate realtime events refresh the shared profile;
- conflicts preserve the local draft and expose recovery actions;
- clearing all metadata deletes the profile;
- English and French strings render for all new states.

### Responsive And Accessibility Tests

- narrow mobile buyer rows use separate preferred-name and username lines;
- long values truncate without horizontal overflow or covering row actions;
- the quick view exposes the complete identity after truncation;
- tag overflow uses a stable `+N` treatment on dense surfaces;
- full accessible names are present for truncated identities;
- edit, save, cancel, conflict, and retry controls are keyboard and screen-reader operable;
- light and dark themes preserve readable text, focus, pending, error, and conflict states.

## Documentation And Architecture Updates

After implementation is verified:

- update `docs/product/features/buyer-crm.md` to mark the lightweight identity layer as implemented and keep deferred CRM features explicit;
- update C4 Web/API component responsibilities for buyer-profile storage and workspace realtime invalidation;
- add an ADR only if the final Cosmos partitioning or conflict contract introduces an architecture decision not already covered by existing scoped-entity conventions;
- keep product capability details out of `docs/refactorplan.md` unless implementation reveals a separate technical backlog item.

## Acceptance Criteria

- A seller can add or update a preferred name and tags from the existing buyer quick view in a few seconds.
- Sales and Portfolio show the preferred name and preserve access to the original username.
- Long identities and tags remain usable without overflow on narrow mobile screens.
- Every active workspace member sees and can edit the same shared buyer profile.
- Personal and workspace profiles never bleed into each other.
- Offline, authentication-expired, and concurrent-edit paths preserve the seller's draft and never silently overwrite newer data.
- Historical sales and derived CRM analytics are not rewritten or duplicated.
- Account export/deletion, telemetry privacy, bilingual copy, and focused tests cover the new entity.
