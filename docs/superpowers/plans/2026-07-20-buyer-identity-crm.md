# Buyer Identity CRM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add shared, scoped buyer profiles containing username, preferred name, tags, and system metadata to the existing buyer analytics experience.

**Architecture:** Store buyer profiles as independently versioned documents in the existing `syncSnapshots` Cosmos container, partitioned by the resolved personal/workspace scope. Add thin scoped API handlers, a local-first frontend store with an outbox, and compose profile metadata with existing sales-derived summaries at the UI boundary.

**Tech Stack:** Vue 3 Options API, Vuetify 4, TypeScript 6 strict mode, Azure Functions v4, Cosmos DB, workspace WebSocket realtime, Vitest, Vue Testing Library.

## Global Constraints

- Persist only username, optional preferred name, tags, and system metadata; never duplicate sales-derived analytics.
- Do not ingest shipping-label, address, email, phone, provider, notes, pronunciation, alias, messaging, or AI data.
- Personal and workspace scopes must never bleed into each other.
- Every active workspace member may read and edit the workspace's shared buyer profiles.
- Use optimistic concurrency and idempotent mutation IDs; never silently overwrite a teammate's update.
- Preferred name is limited to 80 characters; profiles contain at most 10 case-insensitively unique tags of at most 32 characters each.
- Long mobile identities use separate truncated preferred-name and username lines, expose the complete identity in the quick view and accessible label, and never depend on hover.
- New UI copy must be available in English and French with correct French diacritics.
- Preserve all unrelated working-tree changes and commit only task-owned files.

---

### Task 1: Buyer Profile Repository

**Files:**
- Modify: `apps/api/src/types.ts`
- Modify: `apps/api/src/lib/cosmos/ids.ts`
- Create: `apps/api/src/lib/cosmos/buyerProfileRepository.ts`
- Create: `apps/api/src/lib/cosmos/buyerProfileRepository.test.ts`

**Interfaces:**
- Consumes: `getContainers`, `withCosmosRetry`, Cosmos conflict helpers, and `buildSyncScopePartitionKey` conventions.
- Produces: `BuyerProfileDocument`, `listBuyerProfiles`, `getBuyerProfile`, `upsertBuyerProfile`, `deleteBuyerProfile`, and `BuyerProfileVersionConflictError`.

- [x] **Step 1: Write failing repository tests**

Cover deterministic scoped identity, list filtering by `docType`, server timestamps/version, create/update idempotency, stale-version conflicts, delete conflicts, and scope separation. Use the existing fake Cosmos container patterns from `salesRepository.test.ts`.

```ts
const created = await upsertBuyerProfile(config, {
  scopeKey: "workspace:w1",
  username: " CardKing27 ",
  preferredName: " Marc ",
  tags: ["VIP", "vip", " Pokémon "],
  updatedBy: "user-1",
  mutationId: "buyer:test:create",
  baseVersion: 0
});

expect(created.username).toBe("CardKing27");
expect(created.preferredName).toBe("Marc");
expect(created.tags).toEqual(["VIP", "Pokémon"]);
expect(created.version).toBe(1);
```

- [x] **Step 2: Run the repository test and confirm RED**

Run: `npm --prefix apps/api run test -- src/lib/cosmos/buyerProfileRepository.test.ts`

Expected: FAIL because the repository module and document type do not exist.

- [x] **Step 3: Add the document contract and deterministic ID**

```ts
export interface BuyerProfileDocument {
  id: string;
  docType: "buyer_profile";
  userId: string;
  username: string;
  normalizedUsername: string;
  preferredName?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
  mutationId: string;
  version: number;
  _etag?: string;
}
```

Add `buyerProfileDocumentId(scopeKey, normalizedUsername)` using a SHA-256-derived safe suffix so raw usernames do not appear in document IDs.

- [x] **Step 4: Implement normalization and conditional repository writes**

```ts
export interface UpsertBuyerProfileInput {
  scopeKey: string;
  username: string;
  preferredName?: string;
  tags: string[];
  updatedBy: string;
  mutationId: string;
  baseVersion: number;
}

export async function upsertBuyerProfile(
  config: ApiConfig,
  input: UpsertBuyerProfileInput
): Promise<BuyerProfileDocument>;
```

Create with `version: 1`; replace only when `baseVersion` matches the current version and Cosmos `_etag`; return the existing document when `mutationId` already matches. Translate create and precondition races to `BuyerProfileVersionConflictError`.

- [x] **Step 5: Run repository tests and API typecheck**

Run: `npm --prefix apps/api run test -- src/lib/cosmos/buyerProfileRepository.test.ts`

Expected: PASS.

Run: `npm --prefix apps/api run typecheck`

Expected: PASS.

- [x] **Step 6: Commit the repository slice**

```bash
git add apps/api/src/types.ts apps/api/src/lib/cosmos/ids.ts apps/api/src/lib/cosmos/buyerProfileRepository.ts apps/api/src/lib/cosmos/buyerProfileRepository.test.ts
git commit -m "feat(api): add scoped buyer profile repository"
```

### Task 2: Scoped Buyer Profile API And Realtime Invalidation

**Files:**
- Create: `apps/api/src/features/buyerProfiles/services.ts`
- Create: `apps/api/src/features/buyerProfiles/handlers.ts`
- Create: `apps/api/src/features/buyerProfiles/handlers.test.ts`
- Create: `apps/api/src/functions/buyerProfiles.ts`
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/src/lib/realtime.ts`
- Modify: `apps/api/src/lib/realtime.test.ts`

**Interfaces:**
- Consumes: Task 1 repository, `resolveUserId`, `resolveSyncScope`, `assertSyncScopeAccess`, `hasWorkspaceMembership`, shared HTTP helpers, and workspace presence realtime room.
- Produces: `GET/PUT/DELETE /buyer-profiles`, public `BuyerProfileDto`, and `buyer.profile.changed` workspace invalidation events.

- [x] **Step 1: Write failing service/handler tests**

Test personal access, active workspace-member access, non-member rejection, input validation, `409` conflict translation, and safe realtime payloads.

```ts
expect(publishEvent).toHaveBeenCalledWith(expect.objectContaining({
  eventType: "buyer.profile.changed",
  data: { profileId: expect.any(String), version: 2, deleted: false }
}));
```

- [x] **Step 2: Run handler tests and confirm RED**

Run: `npm --prefix apps/api run test -- src/features/buyerProfiles/handlers.test.ts`

Expected: FAIL because the feature handlers do not exist.

- [x] **Step 3: Implement scoped services and DTO shaping**

```ts
export interface BuyerProfileDto {
  username: string;
  preferredName?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  version: number;
}

export async function listBuyerProfilesForActor(
  config: ApiConfig,
  actorUserId: string,
  workspaceId?: string
): Promise<BuyerProfileDto[]>;
```

Resolve and authorize the scope once in services. Never trust a body `scopeKey`.

- [x] **Step 4: Implement strict route parsing and errors**

`PUT /buyer-profiles` accepts:

```ts
{
  workspaceId?: string;
  username: string;
  preferredName?: string;
  tags: string[];
  baseVersion: number;
  mutationId: string;
}
```

`DELETE /buyer-profiles` accepts `workspaceId`, `username`, `baseVersion`, and `mutationId`. Both reject unknown identity/system fields and translate repository conflicts to HTTP `409`.

- [x] **Step 5: Add workspace presence-room publishing and function registration**

Expose a focused `publishWorkspacePresenceRealtimeEventBestEffort` helper. Publish only the safe hashed profile ID, resulting version, and deletion flag. Register one route dispatcher supporting `GET`, `PUT`, `DELETE`, and `OPTIONS`, then import it from `apps/api/src/index.ts`.

- [x] **Step 6: Run focused API tests and typecheck**

Run: `npm --prefix apps/api run test -- src/features/buyerProfiles/handlers.test.ts src/lib/realtime.test.ts`

Expected: PASS.

Run: `npm --prefix apps/api run typecheck`

Expected: PASS.

- [x] **Step 7: Commit the API slice**

```bash
git add apps/api/src/features/buyerProfiles apps/api/src/functions/buyerProfiles.ts apps/api/src/index.ts apps/api/src/lib/realtime.ts apps/api/src/lib/realtime.test.ts
git commit -m "feat(api): expose shared buyer profile routes"
```

### Task 3: Account Export And Deletion Coverage

**Files:**
- Modify: `apps/api/src/features/account/exportHandler.ts`
- Modify: `apps/api/src/features/account/exportHandler.test.ts`
- Modify: `apps/api/src/features/account/accountErasureService.ts`
- Modify: `apps/api/src/features/account/accountErasureService.test.ts`

**Interfaces:**
- Consumes: Task 1 `listBuyerProfiles` and the existing partition-wide `deleteAllSyncData` deletion behavior.
- Produces: `buyerProfiles` in personal account exports and an explicit erasure contract test.

- [x] **Step 1: Write failing export and erasure tests**

```ts
expect(body.buyerProfiles).toEqual([
  expect.objectContaining({ username: "cardking27", preferredName: "Marc" })
]);
```

Assert that account deletion still removes all documents in the personal sync partition, including `docType: "buyer_profile"`, while not deleting workspace partitions.

- [x] **Step 2: Run focused tests and confirm RED**

Run: `npm --prefix apps/api run test -- src/features/account/exportHandler.test.ts src/features/account/accountErasureService.test.ts`

Expected: FAIL because export omits buyer profiles.

- [x] **Step 3: Add profile export and explicit erasure ownership**

Load personal profiles alongside entitlement, purchases, and sync snapshot. Return public DTO fields only. Keep partition-wide personal deletion centralized; document that workspace profiles belong to the workspace lifecycle.

- [x] **Step 4: Run focused tests and commit**

Run: `npm --prefix apps/api run test -- src/features/account/exportHandler.test.ts src/features/account/accountErasureService.test.ts`

Expected: PASS.

```bash
git add apps/api/src/features/account
git commit -m "feat(api): include buyer profiles in account lifecycle"
```

### Task 4: Frontend Buyer Profile Domain, API Client, Cache, And Outbox

**Files:**
- Modify: `src/types/app.ts`
- Modify: `src/app-core/storageKeys.ts`
- Modify: `src/app-core/state.ts`
- Modify: `src/app-core/context-app.ts`
- Modify: `src/app-core/methods/ui.ts`
- Create: `src/app-core/buyer-profile.ts`
- Create: `src/app-core/methods/ui/buyers/buyer-profile-api.ts`
- Create: `src/app-core/methods/ui/buyers/buyer-profile-cache.ts`
- Create: `src/app-core/methods/ui/buyers/buyer-profile-store.ts`
- Create: `tests/buyer-profile.test.ts`
- Create: `tests/buyer-profile-store.test.ts`

**Interfaces:**
- Consumes: existing `normalizeBuyerKey`, scoped storage helpers, entity API helpers, auth epoch, network/offline state, and app notifications.
- Produces: `BuyerProfile`, `BuyerProfileDraft`, `getBuyerProfile`, `loadBuyerProfiles`, `saveBuyerProfile`, `retryBuyerProfileMutation`, and `deleteBuyerProfile` app methods.

- [x] **Step 1: Write failing domain and store tests**

Cover normalization, profile lookup, cache keys per scope, stale-response rejection after scope switching, optimistic save, outbox restoration, idempotent retry, auth pause, and `409` draft preservation.

```ts
expect(composeBuyerIdentity("cardking27", profile)).toEqual({
  username: "cardking27",
  preferredName: "Marc",
  primaryLabel: "Marc",
  secondaryLabel: "@cardking27",
  accessibleLabel: "Marc (@cardking27)"
});
```

- [x] **Step 2: Run tests and confirm RED**

Run: `npm run test -- tests/buyer-profile.test.ts tests/buyer-profile-store.test.ts`

Expected: FAIL because the modules do not exist.

- [x] **Step 3: Add strict frontend types and pure domain functions**

```ts
export interface BuyerProfile {
  username: string;
  preferredName?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  version: number;
}

export type BuyerProfileSaveState = "idle" | "pending" | "saving" | "conflict" | "error";
```

Add pure DTO normalization, tag normalization, profile indexing, and identity composition.

- [x] **Step 4: Add scoped cache and outbox helpers**

Use centralized storage-key builders based on the active `AppStorageScope`. Persist confirmed profiles separately from pending mutations. Pending records retain mutation ID, expected version, draft, and operation type.

- [x] **Step 5: Add API client and app store methods**

Use `requestJson`, `getScopeQuery`, `getScopeBody`, and `createMutationId`. Capture the originating scope key before every async operation and ignore a late response when the active scope changed. Apply optimistic values immediately, but retain confirmed values and drafts separately for conflict recovery.

- [x] **Step 6: Register state and methods**

Add profile index, status, scope key, drafts, and pending mutations to app state/context. Register the buyer methods in `uiMethods` without placing persistence behavior in Vue components.

- [x] **Step 7: Run tests and frontend typecheck**

Run: `npm run test -- tests/buyer-profile.test.ts tests/buyer-profile-store.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [x] **Step 8: Commit the frontend data slice**

```bash
git add src/types/app.ts src/app-core/storageKeys.ts src/app-core/state.ts src/app-core/context-app.ts src/app-core/methods/ui.ts src/app-core/buyer-profile.ts src/app-core/methods/ui/buyers tests/buyer-profile.test.ts tests/buyer-profile-store.test.ts
git commit -m "feat(web): add scoped buyer profile store"
```

### Task 5: Lifecycle And Workspace Realtime Refresh

**Files:**
- Modify: `src/app-core/lifecycle.ts`
- Modify: `src/app-core/watch.ts`
- Modify: `src/app-core/methods/ui/workspace/workspace-realtime-state.ts`
- Modify: `src/app-core/methods/ui/workspace/workspace-realtime-events.ts`
- Modify: `src/app-core/methods/ui/workspace/workspace-realtime.ts`
- Modify: `tests/workspace-realtime.test.ts`
- Modify: `tests/workspace-scope.test.ts`

**Interfaces:**
- Consumes: Task 4 store methods and the Task 2 `buyer.profile.changed` event.
- Produces: initial/scope-change hydration, reconnect outbox drain, and safe realtime refetch.

- [x] **Step 1: Write failing lifecycle and realtime tests**

Assert that auth-ready mount and scope switches hydrate the correct cache/API data, online recovery drains only the active scope outbox, and a workspace buyer event refetches profiles without containing customer PII.

- [x] **Step 2: Run focused tests and confirm RED**

Run: `npm run test -- tests/workspace-realtime.test.ts tests/workspace-scope.test.ts`

Expected: FAIL for missing buyer-profile event handling and lifecycle calls.

- [x] **Step 3: Integrate load, scope switch, online retry, and realtime invalidation**

Hydrate cached profiles before remote load. Cancel/ignore old-scope requests. On `buyer.profile.changed`, refetch the active workspace profile list. Drain pending mutations after online/auth recovery without blocking existing sales synchronization.

- [x] **Step 4: Run focused tests and commit**

Run: `npm run test -- tests/workspace-realtime.test.ts tests/workspace-scope.test.ts`

Expected: PASS.

```bash
git add src/app-core/lifecycle.ts src/app-core/watch.ts src/app-core/methods/ui/workspace tests/workspace-realtime.test.ts tests/workspace-scope.test.ts
git commit -m "feat(web): synchronize shared buyer profiles"
```

### Task 6: Responsive Buyer Identity UI And Editing

**Files:**
- Create: `src/components/customers/BuyerIdentityLabel.vue`
- Create: `src/components/customers/BuyerIdentityLabel.ts`
- Create: `src/components/customers/BuyerIdentityLabel.html`
- Create: `src/components/customers/BuyerIdentityLabel.css`
- Modify: `src/components/customers/BuyerQuickViewModal.ts`
- Modify: `src/components/customers/BuyerQuickViewModal.html`
- Modify: `src/components/customers/BuyerQuickViewModal.css`
- Modify: `src/components/windows/sales/SalesHistoryLedger.ts`
- Modify: `src/components/windows/sales/SalesHistoryLedger.html`
- Modify: `src/components/windows/sales/SalesWindow.definition.ts`
- Modify: `src/components/windows/sales/SalesWindow.html`
- Modify: `src/components/windows/portfolio/PortfolioWindow.ts`
- Modify: `src/components/windows/portfolio/PortfolioWindow.definition.ts`
- Modify: `src/components/windows/portfolio/PortfolioWindow.html`
- Modify: `src/app-core/i18n/locales/en/sales.json`
- Modify: `src/app-core/i18n/locales/fr/sales.json`
- Modify: `tests/vue/component-actions.scenario.test.ts`
- Create: `tests/vue/buyer-profile.scenario.test.ts`
- Modify: `tests/buyer-quick-view-ui.test.ts`
- Modify: `tests/portfolio-customer-performance-ui.test.ts`

**Interfaces:**
- Consumes: Task 4 identity composition/store methods and existing buyer summary props.
- Produces: reusable two-line identity rendering, modal edit events, responsive truncation, and preferred-name/tag search/display.

- [x] **Step 1: Write failing Vue scenarios and UI contract tests**

Test fallback username rendering, `Marc` plus `@cardking27`, edit/save/cancel, tag chips, pending/conflict/retry states, Sales/Portfolio display, full accessible label, separate mobile lines, ellipsis classes, and `+N` tag overflow.

- [x] **Step 2: Run UI tests and confirm RED**

Run: `npm run test:vue -- tests/vue/buyer-profile.scenario.test.ts tests/vue/component-actions.scenario.test.ts`

Expected: FAIL because edit controls and the shared label do not exist.

Run: `npm run test -- tests/buyer-quick-view-ui.test.ts tests/portfolio-customer-performance-ui.test.ts`

Expected: FAIL for the new UI contracts.

- [x] **Step 3: Implement the reusable identity label**

Render preferred name and username in separate `min-width: 0` lines with single-line ellipsis. Set the complete identity as the accessible label. Render only fitting/limited tags in dense mode and expose remaining count as `+N`.

- [x] **Step 4: Add buyer quick-view editing**

Pass the current profile and save state into the modal. Keep username read-only. Add preferred-name and tag controls with Save/Cancel, disable duplicate in-flight saves, retain drafts on failure, and expose retry/reload for conflicts.

- [x] **Step 5: Use preferred identities in Sales and Portfolio**

Resolve profiles through the root context bridge. Keep the username visible on compact rows and make clicking the identity open the full quick view. Extend customer filtering to match username, preferred name, and tags.

- [x] **Step 6: Add bilingual copy and theme-aware responsive styles**

Use Vuetify theme tokens, correct French diacritics, touch-safe actions, focus states, mobile fullscreen dialog behavior, and no hardcoded light/dark surfaces.

- [x] **Step 7: Run UI tests and typechecks**

Run: `npm run test:vue -- tests/vue/buyer-profile.scenario.test.ts tests/vue/component-actions.scenario.test.ts`

Expected: PASS.

Run: `npm run test -- tests/buyer-quick-view-ui.test.ts tests/portfolio-customer-performance-ui.test.ts tests/customer-performance.test.ts tests/buyer-quick-view.test.ts`

Expected: PASS.

Run: `npm run typecheck && npm run typecheck:tests:web`

Expected: PASS.

- [x] **Step 8: Commit the UI slice**

```bash
git add src/components/customers src/components/windows/sales src/components/windows/portfolio src/app-core/i18n tests
git commit -m "feat(web): add responsive buyer identity editing"
```

### Task 7: Documentation And Complete Verification

**Files:**
- Modify: `docs/product/features/buyer-crm.md`
- Modify: `docs/c4/model/software-systems.dsl`
- Modify: `docs/c4/views/components/api.dsl`
- Modify: `docs/c4/views/components/web.dsl`
- Modify: `docs/c4/views/dynamics/realtime-publish-subscribe.dsl`
- Modify: `docs/superpowers/plans/2026-07-20-buyer-identity-crm.md`

**Interfaces:**
- Consumes: all implemented behavior.
- Produces: factual product/architecture documentation and CI-equivalent verification evidence.

- [x] **Step 1: Update product and C4 documentation**

Mark preferred name/tags and workspace sharing implemented, retain deferred CRM capabilities, and add buyer-profile repository/API/realtime responsibilities only where the deployed architecture changed.

- [x] **Step 2: Run focused API verification**

Run: `npm --prefix apps/api run typecheck`

Expected: PASS.

Run: `npm --prefix apps/api run test`

Expected: PASS.

- [x] **Step 3: Run focused web verification**

Run: `npm run typecheck`

Expected: PASS.

Run: `npm run typecheck:tests:web`

Expected: PASS.

Run: `npm run test:vue`

Expected: PASS.

- [x] **Step 4: Run complete repository verification**

Run: `npm run verify:all`

Expected: PASS. If Docker-dependent C4 validation is unavailable, record it as an environment limitation rather than an application failure.

Run: `git diff --check`

Expected: PASS.

- [x] **Step 5: Mark plan checkboxes complete and commit documentation**

```bash
git add docs/product/features/buyer-crm.md docs/c4 docs/superpowers/plans/2026-07-20-buyer-identity-crm.md
git commit -m "docs: record buyer identity CRM architecture"
```
