# Calcul8 Refactor Plan

Items grouped by priority. Completed work is removed, not tracked.

---

## Critical

### Stop storing auth and session secrets in `localStorage`

Frontend auth state still persists sensitive tokens in browser storage:

- `src/app-core/auth/storage.ts:15` / `:19` store the CSRF token in `localStorage`
- `src/app-core/auth/storage.ts:27` / `:31` store the Google ID token in `localStorage`

This is a higher-priority security issue than the current medium-priority cleanup items. Any XSS bug or compromised third-party script gets direct read access to those values, which expands a UI bug into account/session compromise.

Refactor toward:

- server-managed session cookies for auth where possible (`HttpOnly`, `Secure`, `SameSite`)
- in-memory frontend auth state for any browser-only token that cannot move to cookies
- a single auth storage abstraction so token lifecycle, logout, expiry handling, and migration are consistent
- explicit migration/cleanup logic to remove legacy `localStorage` tokens on upgrade

### Separate signing materials and generated release artifacts from the repo workflow

The Android/TWA release path is still coupled to repo-local signing inputs and generated artifacts:

- `twa-manifest.json:19-20` points Bubblewrap at `whatfees-upload.jks`
- the repo root currently contains release/signing artifacts and generated files
- tracked generated files still exist despite `.gitignore` rules (`app-release-signed.apk.idsig`, `tmp-index-render.js`, `tmp-test.png`)

Even when secrets are not currently tracked, keeping signing material and release outputs in the normal working tree makes accidental disclosure and bad release hygiene much more likely.

Refactor toward:

- moving keystores and signing config fully outside the repository tree
- loading signing paths from untracked machine/local release config only
- removing tracked generated artifacts that should be ignored and auditing git history for past leaks if needed
- making release scripts fail fast when signing inputs are missing instead of assuming repo-root defaults

---

## High

### Break up the root app shell before further feature work

The top-level UI shell is still concentrated in very large files:

- `src/App.html` is 1,279 lines
- `src/styles/app.css` is 1,734 lines

That size makes unrelated changes collide, increases regression risk, and keeps global state/layout concerns tangled together. This should move ahead of medium cleanup because the root shell is the choke point every feature keeps touching.

Refactor toward:

- extracting the account/workspace shell, onboarding, and top-level dialogs into focused subcomponents
- moving window-specific layout and style rules out of global `app.css`
- limiting the root app to composition, routing/view selection, and shared providers

### Split the cloud sync coordinator into smaller services with explicit state transitions

`src/app-core/methods/ui/sync-service.ts` is carrying queueing, conflict handling, auth expiry, local reset recovery, scheduler control, workspace scoping, and persistence in one place.

Signals from the current implementation:

- queue state is managed through a `WeakMap<object, Map<string, SyncCoordinatorState>>` (`:107`)
- pull/push scheduling and merge flags (`pendingPull*`, `pendingPush*`) span multiple branches (`:233-252`, `:473-516`)
- the same module directly handles workspace access loss, conflict recovery, and periodic scheduling (`:311`, `:418`, `:485`)

This is important because sync bugs are data-loss bugs. The current tests help, but the implementation is hard to reason about under races.

Refactor toward:

- a small sync coordinator/state machine with explicit events and transitions
- separate modules for transport, persistence, conflict policy, and scheduler ownership
- shared scope-resolution helpers so personal/workspace logic is not threaded through every branch
- higher-level integration tests around concurrent pull/push, offline recovery, and workspace access loss

### Replace the `any`-driven window-definition pattern in the biggest frontend hotspots

Two of the largest interactive modules still rely heavily on `this: any` / `Record<string, unknown>` and combine unrelated responsibilities:

- `src/components/windows/SinglesConfigWindow.definition.ts` exports `singlesConfigWindowDefinition: any` (`:95`) and contains dozens of `this: any` computed/method entries (`:155-636`)
- `src/components/windows/wheel/wheelSessionMethods.ts` mixes session persistence, inventory mutation, fairness history, and realtime broadcasting behind a large untyped method bag (`:75-479`)

This is now a high-priority maintainability issue because these files sit on core inventory/sales flows. Type holes here make regressions easy to ship and difficult to catch during refactors.

Refactor toward:

- extracting typed composables or service modules for search, virtualization, row editing, wheel session persistence, and wheel broadcast flows
- replacing `this`-driven mutation with explicit typed inputs/outputs where practical
- shrinking each file until tests can target smaller pure functions instead of broad component behavior only

---

## Medium

### Centralize API base URL resolution and failure handling

Frontend API base URL handling is still duplicated and runtime checks are scattered:

- `resolveApiBaseUrl()` in `src/app-core/methods/ui/api-client.ts`
- `resolveCardsApiBaseUrl()` in `src/components/windows/singles/useSinglesCatalogSearch.ts`

Current callers usually guard missing configuration correctly, so this is not a critical bug. The risk is drift: future API consumers can easily re-implement base URL lookup or handle missing config differently.

Unify API base URL resolution behind one shared helper and standardize the missing-configuration behavior so new frontend API code fails consistently.

### Consolidate realtime endpoint URL constants

Room naming is now centralized in the shared `workspace-realtime-rooms` module. Remaining cleanup is only the endpoint/domain configuration still split across files:

- `DEFAULT_REALTIME_PUBLISH_URL` in `apps/api/src/lib/realtime.ts`
- `FALLBACK_REALTIME_SOCKET_URL`, `PROD_REALTIME_SOCKET_URL`, and the `whatfees.ca` host check in `src/app-core/methods/ui/workspace-realtime.ts`

Unify those defaults so domain or host changes do not require edits in multiple apps.

---

## Low

### Define workspace billing and access model

Intentionally deferred. Current state: workspace creation, membership, sync, and collaboration are open to all signed-in users. `hasProAccess` is personal-only. The `buildEntitlementDocumentId("workspace", ...)` ID scheme is ready but unused.

When workspace licensing ships:

- Introduce a separate workspace billing domain — do not stretch personal Pro into team licensing
- Add workspace billing state and workspace-level entitlement APIs
- Compute effective access by scope (`personalHasProAccess`, `workspacePlan`, `workspaceSeatStatus`, `effectiveFeatureAccess`)
- Move workspace feature gates to workspace plan/seat status
- Keep personal Pro checks for personal scope only
- Expose billing source in UI copy (personal Pro vs workspace-paid)
- Prefer grace-first rollout with enforcement behind a flag
- Candidate model: workspace subscription with per-member pricing (~$5/user/month)
