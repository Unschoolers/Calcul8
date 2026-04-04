# Future Work: Workspace/Team Sync Strategy

## Snapshot (2026-02-25)
Current backend state:
- Workspace-aware sync scope is implemented.
- `POST /api/sync/pull` and `POST /api/sync/push` accept optional `workspaceId`.
- Workspace access is gated by membership checks for workspace scope.
- Workspace APIs are implemented:
  - `POST /api/workspaces`
  - `GET /api/workspaces/{workspaceId}/members`
  - `POST /api/workspaces/{workspaceId}/members`
  - `DELETE /api/workspaces/{workspaceId}/members/{memberUserId}`
- Tests are in place for workspace scope resolution and workspace route handlers.

Scope key format in code today:
- Personal sync scope partition key: `<googleSub>` (legacy format preserved intentionally).
- Workspace sync scope partition key: `ws:<workspaceId>`.

## Goal
Add team/workspace data sharing without a full storage redesign.

Related prep checklist:
- `docs/entitlement-scope-refactor-prep.md`

## Decision
Reuse the current sync Cosmos container and keep partition key path as `/userId`, while treating that field as a sync scope key.

## Why this approach
- Minimal infrastructure change.
- Works with personal and workspace scopes.
- Preserves partition-local reads/writes.
- Can be introduced incrementally.

## Remaining high-priority work
1. Add workspace entitlement licensing gate.
   - Team/workspace operations should check entitlement scope (for example `entitlement:ws:<workspaceId>`) in addition to membership.
2. Tighten workspace create conflict handling.
   - Duplicate workspace create should always return `409`.
3. Make workspace create + owner membership effectively atomic.
   - Avoid partial state if second write fails.
4. Add end-to-end frontend workspace context flow.
   - Workspace selector, persisted scope, and scoped sync payload propagation.

## Risks
- Membership-only checks are not enough if teams become a paid SKU.
- Partial writes during workspace create can leave orphan workspace records.
- Legacy personal partition key format can cause confusion if mixed with future `u:<id>` plans.

## Deployment note
Current snapshot is safe for production if workspace/team UI is not publicly enabled yet.  
Before enabling team features broadly, finish the remaining high-priority items above.
