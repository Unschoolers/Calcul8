# Calcul8 Refactor Plan

Current plan tracks active refactor targets only. 

---

## Critical

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

- `src/components/windows/LiveWindow.definition.ts` still carries explicit `this: any` entry points and broad `Record<string, unknown>` view-model casts
- `src/components/windows/live/LiveSinglesPanel.ts` still leans on generic `ctx`/`$root` access and runtime method lookups
- `src/components/windows/SalesWindow.definition.ts` and `src/components/windows/PortfolioWindow.definition.ts` still model most component state through `Record<string, unknown>`
- wheel display/session modules such as `src/components/windows/wheel/wheelComputedShared.ts`, `src/components/windows/wheel/wheelSpinMethods.ts`, and `src/components/windows/wheel/wheelSessionMethods.ts` still rely heavily on `Record<string, unknown>` mutation

These files sit on inventory, sales, wheel, and live selling flows, so weak typing keeps refactors risky and test intent less clear.

Refactor toward:

- extracting typed view-model interfaces for window definitions instead of passing broad app-root bags around
- extracting typed composables/helpers for live singles editing, portfolio filters, and sales history presentation
- extracting typed wheel services for session persistence, chase replacement, fairness, and sales recording
- reducing `this`-driven mutation and runtime method lookup in favor of explicit typed inputs/outputs
- shifting more behavior under focused unit tests instead of broad component tests only

---

## Medium

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
