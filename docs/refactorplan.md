# Calcul8 Refactor Plan

Current plan only tracks remaining work. Items that are already done or mostly retired from the active architecture are removed.

---

## Critical

### Move auth/session secrets out of `localStorage`

Frontend auth still persists sensitive values in browser storage:

- `src/app-core/auth/storage.ts` stores the CSRF token in `localStorage`
- `src/app-core/auth/storage.ts` stores the Google ID token in `localStorage`

That means any XSS bug or compromised third-party script can directly read session material.

Refactor toward:

- server-managed auth/session cookies where possible (`HttpOnly`, `Secure`, `SameSite`)
- in-memory frontend state for browser-only tokens that cannot move to cookies
- one auth storage boundary for token lifecycle, logout, expiry, and cleanup
- explicit migration logic that removes legacy `localStorage` tokens on upgrade

### Remove repo-coupled signing inputs and tracked generated artifacts

The Android/TWA release flow is still too tied to repo-local files:

- `twa-manifest.json` still points Bubblewrap at `whatfees-upload.jks`
- generated artifacts are still tracked in git: `app-release-signed.apk.idsig`, `tmp-index-render.js`, `tmp-test.png`
- release/signing outputs still live in the normal working tree

Even when secrets are not committed, this keeps release hygiene fragile and makes accidental disclosure more likely.

Refactor toward:

- moving keystores and signing paths outside the repository
- loading signing config from untracked local machine/release config only
- removing tracked generated artifacts that should be ignored
- making release scripts fail fast when signing inputs are missing

---

## High

### Split the sync coordinator into smaller, explicit services

`src/app-core/methods/ui/sync-service.ts` is still a large multi-responsibility module at 477 lines. It currently mixes:

- queue/coordinator state
- pull and push scheduling
- conflict handling and retry branches
- auth expiry handling
- workspace scope behavior
- persistence/reset recovery

This remains one of the highest-risk refactors because sync bugs are data-loss bugs.

Refactor toward:

- a smaller coordinator/state machine with explicit events and transitions
- separate modules for transport, persistence, scheduler ownership, and conflict policy
- shared personal/workspace scope helpers instead of threading scope logic through every branch
- higher-level integration tests for concurrent sync, offline recovery, and workspace access loss

### Replace the biggest `any` / `Record<string, unknown>` hotspots in window logic

The biggest remaining frontend type holes are still concentrated in inventory and wheel flows:

- `src/components/windows/SinglesConfigWindow.definition.ts` still exports `singlesConfigWindowDefinition: any` and uses many `this: any` methods/computed entries
- `src/components/windows/wheel/wheelSessionMethods.ts` and related wheel state modules still rely heavily on `Record<string, unknown>`

These files sit on core editing, inventory, and sales-adjacent flows, so weak typing keeps refactors risky.

Refactor toward:

- extracting typed composables/helpers for singles virtualization, search, and row editing
- extracting typed wheel services for session persistence, chase replacement, and sales recording
- reducing `this`-driven mutation in favor of explicit typed inputs/outputs
- shifting more behavior under focused unit tests instead of broad component tests only

---

## Medium

### Centralize API base URL resolution for cards and app APIs

Frontend API base URL handling is still duplicated:

- `resolveApiBaseUrl()` in `src/app-core/methods/ui/api-client.ts`
- `resolveCardsApiBaseUrl()` in `src/components/windows/singles/useSinglesCatalogSearch.ts`

That duplication is no longer catastrophic, but it is still easy for callers to drift on env lookup, cached fallback behavior, and missing-config handling.

Refactor toward:

- one shared frontend API base URL resolver
- one consistent fallback/caching rule for all API consumers
- shared missing-configuration behavior so new API clients fail the same way

### Consolidate realtime endpoint configuration

Room naming is already shared, and the old `workspace-realtime.ts` wrapper is now thin. The remaining duplication is endpoint configuration:

- `DEFAULT_REALTIME_PUBLISH_URL` in `apps/api/src/lib/realtime.ts`
- `FALLBACK_REALTIME_SOCKET_URL`, `PROD_REALTIME_SOCKET_URL`, and host-based selection in `src/app-core/methods/ui/workspace-realtime-state.ts`

Refactor toward:

- a single source of truth for default realtime domains/endpoints
- shared host/environment resolution rules between frontend and backend
- fewer hard-coded `whatfees` domain decisions spread across apps

---

## Low

### Define workspace billing and access model

Intentionally deferred. Current state:

- workspace creation, membership, sync, and collaboration are open to signed-in users
- Pro access is still personal-only (`hasProAccess`)
- the shared `buildEntitlementDocumentId("workspace", ...)` shape exists, but workspace billing is not wired through product flows yet

When workspace licensing ships:

- introduce a dedicated workspace billing domain instead of stretching personal Pro
- add workspace billing state and workspace-level entitlement APIs
- compute effective access by scope rather than reusing personal-only flags
- move workspace feature gates to workspace plan/seat status
- keep personal Pro checks for personal scope only
