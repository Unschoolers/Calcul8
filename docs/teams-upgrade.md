# Teams Upgrade Plan

## Status Snapshot (2026-03-17)

Current repository state:

- Workspace-aware sync scope already exists in the API.
  - `POST /api/sync/pull` and `POST /api/sync/push` accept optional `workspaceId`.
  - Workspace sync uses `ws:<workspaceId>` partition keys.
  - Membership is enforced for workspace sync access.
- Workspace management endpoints already exist.
  - `POST /api/workspaces`
  - `GET /api/workspaces/{workspaceId}/members`
  - `POST /api/workspaces/{workspaceId}/members`
  - `DELETE /api/workspaces/{workspaceId}/members/{memberUserId}`
- Frontend sync payloads already support optional `workspaceId`.
  - `src/app-core/methods/ui/sync-payload.ts`
- Frontend does not yet have first-class workspace state.
  - No active scope model
  - No workspace selector
  - No shared-vs-personal storage isolation

## Goal

Add a lean shared-workspace MVP where:

- every user keeps their existing personal workspace
- a user can create a shared workspace
- a user can invite another person with a join link
- both people can switch between personal and shared workspace
- shared workspace data syncs across members

For MVP, the important rule is:

- personal mode stays untouched
- workspace mode is additive and isolated

## Product Model

Keep these concepts separate:

- Personal Pro
  - existing user-level paid access
  - no behavior change in MVP
- Team workspace
  - shared collaboration mode
  - billing can be layered on after the collaboration flow works

Do not reuse `hasProAccess` for team collaboration.

## Migration Plan

Keep migration as lean as possible:

- Do not migrate existing personal data.
- Do not rewrite existing personal localStorage keys.
- Do not auto-copy personal data into a shared workspace.
- Do not backfill Cosmos records for existing users.
- Create workspace-specific records only when a workspace is created or joined.

Practical meaning:

- current personal mode keeps using existing storage and sync behavior
- shared workspace mode uses new workspace-specific storage and sync scope
- switching to a fresh shared workspace should show an empty workspace unless we later add an explicit copy/import action

This is the safest MVP because it avoids risking current users' personal data.

## Why Scope Switching Still Matters

This is not just a UI toggle.

Today, local persistence is still effectively global/single-scope:

- presets use one storage key
- sales use one storage prefix
- last selected lot is global
- sync client version is global

Relevant files:

- `src/app-core/storageKeys.ts`
- `src/app-core/state.ts`
- `src/app-core/methods/config-storage.ts`
- `src/app-core/methods/ui/sync-service.ts`

If we add workspace switching without storage namespacing, users could see:

- personal lots appearing in shared mode
- shared lots appearing in personal mode
- stale sync hashes suppressing sync in the wrong scope
- wrong last lot restored after a scope switch

So even for a lean MVP, local storage and sync state must become scope-aware.

## MVP UX

### Personal mode

- remains the default
- keeps current behavior
- keeps current local data
- keeps current Pro behavior

### Shared workspace mode

- loads data from the selected `workspaceId`
- syncs shared data for all members
- does not automatically inherit personal data

### Workspace switching

The user should be able to switch between:

- Personal
- Shared: `<workspace name>`

When switching:

- persist selected scope
- clear in-memory state for the previous scope
- pull the selected scope from cloud sync
- keep personal and shared data isolated

## MVP Join-Link Model

Current API only supports direct member upsert by `userId`.
That is not good enough for a user-facing flow.

Recommended lean join flow:

- Owner clicks `Invite to workspace`
- API creates a join token for that workspace
- API returns a shareable URL
- Shared URL looks like:
  - `/join?invite=<token>`
- Recipient opens the link
- Recipient signs in if needed
- Recipient confirms joining the workspace
- API creates membership for the signed-in user

Do not use plain `/join?workspaceId=<id>` as the join mechanism.

### Join-link storage

Suggested minimal document model:

- `id`: `invite:<inviteId>`
- `docType`: `workspace_invite`
- `inviteId`
- `workspaceId`
- `createdByUserId`
- `role`
- `status`: `active|revoked|expired`
- `tokenHash`
- `expiresAt`

### Join-link endpoints

- `POST /api/workspaces/{workspaceId}/join-links`
- `GET /api/workspaces/{workspaceId}/join-links`
- `POST /api/join/accept`
- `DELETE /api/workspaces/{workspaceId}/join-links/{inviteId}`

### MVP constraints

- only one active join link per workspace at first
- joined role is always `member`
- no email flow
- no pending-recipient tracking
- no seat-management complexity yet

## MVP Implementation Order

### 1. Scope-aware frontend state

Add first-class workspace state and keep personal mode untouched.

Suggested state:

- `activeScopeType: "personal" | "workspace"`
- `activeWorkspaceId: string | null`
- `availableWorkspaces: WorkspaceSummary[]`
- `isWorkspaceLoading: boolean`

Needed work:

- add scoped storage key helpers
- make presets/sales storage scope-aware
- make sync client version and sync hash scope-aware
- make workspace switching reset and reload state safely

### 2. Workspace list + switcher

Add a minimal UI to:

- create workspace
- list accessible workspaces
- switch between personal and shared workspace
- open member management

Helpful API addition:

- `GET /api/workspaces/me`

### 3. Join-link flow

Add the lean invitation path:

- create join link
- copy join link
- open `/join?invite=...`
- accept join
- show workspace in switcher

### 4. Billing after collaboration works

Once the collaboration flow is working cleanly:

- add Team billing
- keep it separate from personal Pro
- gate shared workspace access with workspace-level entitlement

Billing is not the first implementation target for MVP.

## Backend Checklist

- Add workspace join-link types to `apps/api/src/types.ts`
- Add workspace join-link storage helpers to `apps/api/src/lib/cosmos.ts`
- Add `GET /api/workspaces/me`
- Add join-link create/list/revoke/accept routes
- Keep current membership routes for internal/admin use as needed
- Add tests for:
  - workspace list endpoint
  - join-link create
  - join-link accept
  - revoked/expired join-link handling

## Frontend Checklist

- Add workspace state to `src/types/app.ts`
- Add workspace context to `src/app-core/state.ts`
- Add scoped storage key helpers to `src/app-core/storageKeys.ts`
- Make config/sales load-save methods scope-aware
- Make sync client version and sync hash scope-aware
- Add workspace switcher UI
- Add create workspace UI
- Add join-link UI
- Add join route / accept flow
- Add tests for:
  - scope switching
  - scoped storage isolation
  - workspace list rendering
  - join-link flow states

## Suggested File Areas To Touch First

Frontend foundation:

- `src/types/app.ts`
- `src/app-core/state.ts`
- `src/app-core/context.ts`
- `src/app-core/storageKeys.ts`
- `src/app-core/methods/config-storage.ts`
- `src/app-core/methods/ui/sync-payload.ts`
- `src/app-core/methods/ui/sync-service.ts`

Backend workspace:

- `apps/api/src/types.ts`
- `apps/api/src/lib/cosmos.ts`
- `apps/api/src/functions/workspaces.ts`
- new join-link route file(s)

## Risks

### Data leakage across scopes

Highest implementation risk.

If storage or sync state remains global, users may see data from the wrong scope.

### Weak join-link security

If join tokens are guessable or do not expire, workspace access could be abused.

### Partial workspace state

Current workspace create and owner membership creation are separate writes.
That is acceptable for early MVP work, but it should be revisited later if needed.

## Immediate Next Step

If work starts now, the best first coding task is:

1. Add scope-aware frontend state and storage helpers.
2. Add `GET /api/workspaces/me`.
3. Build a minimal workspace switcher.

That gives the feature a safe foundation without touching existing personal user data.
