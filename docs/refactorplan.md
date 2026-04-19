# Calcul8 Refactor Plan

Current plan tracks active refactor targets only. 

---

## Critical

### Move auth/session secrets out of `localStorage`

Frontend auth still persists sensitive browser-readable values:

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
- generated artifacts are still tracked in git: `app-release-signed.apk.idsig`, `tmp-index-render.js`, and other release/build leftovers in the working tree
- release/signing outputs still live in the normal repository tree

Even when secrets are not committed, this keeps release hygiene fragile and makes accidental disclosure more likely.

Refactor toward:

- moving keystores and signing paths outside the repository
- loading signing config from untracked local machine/release config only
- removing tracked generated artifacts that should be ignored
- making release scripts fail fast when signing inputs are missing

---

## High

### Replace the biggest `any` / `Record<string, unknown>` hotspots in window logic

The largest remaining frontend type holes are still concentrated in high-change windows:

- `src/components/windows/SinglesConfigWindow.definition.ts` still exports `singlesConfigWindowDefinition: any` and relies on many `this: any` entries
- `src/components/windows/wheel/WheelWindow.definition.ts` still exports `wheelWindowDefinition: any`
- `src/components/windows/live/LiveSinglesPanel.ts` still carries many `this: any` methods
- `src/components/windows/wheel/wheelSessionMethods.ts` and related wheel modules still rely heavily on `Record<string, unknown>` casts

These files sit on inventory, wheel, and live selling flows, so weak typing keeps refactors risky and test intent less clear.

Refactor toward:

- extracting typed composables/helpers for singles virtualization, search, and row editing
- extracting typed wheel services for session persistence, chase replacement, fairness, and sales recording
- reducing `this`-driven mutation in favor of explicit typed inputs/outputs
- shifting more behavior under focused unit tests instead of broad component tests only

### Type the portfolio sales/cache access path

Portfolio calculations still rely on weakly typed cache access in a high-value computation path:

- `src/app-core/computed/portfolio.ts` uses `Record<string, unknown>` style access to lot sales/cache state

This is not just style debt. It makes forecasting and sales rollups harder to refactor safely because relationships between lots, cached sales, and derived metrics are hidden behind generic casts.

Refactor toward:

- an explicit typed sales-cache interface
- shared typed helpers for lot-to-sales lookup
- reducing ad hoc `Record<string, unknown>` access in portfolio computations
- clearer ownership of derived portfolio data vs cached storage data

---

## Medium

### Centralize API base URL resolution for cards and app APIs

Frontend API base URL handling is still duplicated:

- `resolveApiBaseUrl()` defined in `src/app-core/methods/ui/api-client.ts`, re-exported via `shared.ts`
- `resolveCardsApiBaseUrl()` in `src/components/windows/singles/useSinglesCatalogSearch.ts`

That duplication is easy to overlook until a third client drifts on env lookup, cached fallback behavior, or missing-config handling.

Refactor toward:

- one shared frontend API base URL resolver
- one consistent fallback/caching rule for all API consumers
- shared missing-configuration behavior so new API clients fail the same way

### Consolidate realtime endpoint configuration

Room naming is now shared correctly, but endpoint configuration is still split across frontend and backend:

- `DEFAULT_REALTIME_PUBLISH_URL` in `apps/api/src/lib/realtime.ts`
- `FALLBACK_REALTIME_SOCKET_URL`, `PROD_REALTIME_SOCKET_URL`, and host-based selection in `src/app-core/methods/ui/workspace-realtime-state.ts`

Refactor toward:

- a single source of truth for default realtime domains/endpoints
- shared host/environment resolution rules between frontend and backend
- fewer hard-coded `whatfees` domain decisions spread across apps

### Reduce wheel module fragmentation and implicit coupling

The wheel feature has been split into many small files, but the boundaries are still implicit rather than cleanly modular:

- `src/components/windows/wheel/WheelWindow.definition.ts`
- `src/components/windows/wheel/wheelSpinMethods.ts`
- `src/components/windows/wheel/wheelSessionMethods.ts`
- `src/components/windows/wheel/wheelSpinState.ts`
- `src/components/windows/wheel/wheelControllerState.ts`
- `src/components/windows/wheel/wheelHelpers.ts`
- `src/components/windows/wheel/wheelSpinFairness.ts`
- related computed/config/session/spectator files in the same folder

Recent fairness, spectator, and broadcast work added capabilities, but also reinforced an implicit dependency graph that is hard to trace when changing the feature.

Refactor toward:

- grouping wheel files by clearer sub-domains such as session, spin, config, display, and fairness
- defining explicit public interfaces between those sub-domains
- extracting more wheel behavior into service-layer modules instead of component-coupled mutation
- consolidating validation at module boundaries instead of spreading it across state/method files

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
