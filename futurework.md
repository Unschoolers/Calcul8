# Future Work: Workspace/Team Sync Strategy

## Goal
Add team/workspace data sharing without a full storage redesign.

Related prep checklist:
- `docs/entitlement-scope-refactor-prep.md`

## Decision
Reuse the current sync Cosmos container and keep the partition key path as `/userId`, but treat that field as a sync scope key (not always a real user id).

Scope key format:
- Personal scope: `u:<googleSub>`
- Workspace scope: `ws:<workspaceId>`

This keeps partitions non-null and avoids cross-partition reads for sync operations.

## Why this approach
- Minimal infrastructure change.
- Works with personal and team scopes.
- Preserves point-read/write performance.
- Can be introduced incrementally.

## Guardrails
1. Add one helper for partition key generation and use it everywhere.
   - Example: `toSyncScopePartitionKey(userId, workspaceId)`.
2. Do not inline `"u:"` / `"ws:"` logic across files.
3. Never use `null` partition values.
4. Keep actor identity separate from scope identity.
   - Add fields such as `updatedByUserId` for audit.
5. Authorize workspace membership before any sync read/write.

## API changes (target)
`POST /sync/pull`
- Input: optional `workspaceId`
- Resolve partition key:
  - no workspace => `u:<currentUserId>`
  - workspace => `ws:<workspaceId>`
- Verify user is a member for workspace scopes.

`POST /sync/push`
- Input: `lots`, `salesByLot`, optional `workspaceId`, optional `clientVersion`
- Same scope resolution and membership check.
- Versioning remains per scope.

## Data model notes
Sync docs:
- Keep current shape but add optional metadata:
  - `scopeType: "user" | "workspace"`
  - `scopeId: string`
  - `updatedByUserId: string`

Membership docs (new):
- Suggested id: `m:<userId>:<workspaceId>`
- Fields: `userId`, `workspaceId`, `role`, `status`, `updatedAt`

## Migration plan
1. Introduce `workspaceId?: string | null` in frontend state/payload types.
2. Add partition-key helper in API sync layer.
3. Default behavior stays personal scope (`u:<userId>`) when no workspace is set.
4. Add membership checks only when `workspaceId` is provided.
5. Add workspace-aware UI later (switcher, invite/join flows).

## Risks
- Overloading `userId` in sync docs can be confusing.
  - Mitigation: use `scopeId/scopeType` fields and helper naming.
- Missing authz checks could expose team data.
  - Mitigation: block all workspace sync calls without membership validation.

## Tests to add
- Sync pull/push personal scope uses `u:<userId>`.
- Sync pull/push workspace scope uses `ws:<workspaceId>`.
- Non-member workspace access returns auth error.
- Version increments are isolated per scope.
