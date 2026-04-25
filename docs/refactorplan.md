# Calcul8 Refactor Plan

Fresh repo snapshot. This plan tracks the work that would reduce real risk in the current codebase, ordered by payoff and blast radius.

## Current Shape

- Root app is a Vue 3 + Vuetify + TypeScript PWA. `src/app.ts` still assembles one large Options API root from `src/app-core/state.ts`, `src/app-core/computed.ts`, `src/app-core/methods/index.ts`, lifecycle, and watchers.
- Feature UI is mostly split into `.vue`, `.ts`, `.html`, and `.css` files under `src/components`.
- The frontend has strong central app types in `src/app-core/context-app.ts`, `src/app-core/context-contracts.ts`, and `src/types/app.ts`, but many child components still receive the whole app through `ctx` and `createWindowContextBridge`.
- Backend code is split into `apps/api` Azure Functions plus `apps/api/src/lib` repositories/services. Realtime websocket gateway lives in `apps/realtime`.
- Shared cross-app helpers already exist for scope keys and realtime room names under `shared`.
- Test coverage is broad: 91 root frontend tests and 47 API tests at the time of this pass.

## Priority 0 - Release And Repo Hygiene

This is the first cleanup because it concerns public repo safety and reproducible releases.

Observed state:

- `twa-manifest.json` still has `signingKey.path` set to `whatfees-upload.jks`.
- `scripts/release-google-play.ps1` defaults to `-KeystorePath "whatfees-upload.jks"` and can generate a keystore in the repo root.
- Tracked generated artifacts still include `app-release-signed.apk.idsig`, `tmp-index-render.js`, and `tmp-test.png`.
- The working tree also contains ignored Android/Bubblewrap outputs and keystores in the repo root.

To do:

1. Remove tracked generated artifacts from git while leaving local files alone if still needed.
2. Make the release flow prefer an explicit keystore path outside the repo, for example via `-KeystorePath` or an environment variable.
3. Make release scripts fail fast, or at least warn loudly, when a signing key resolves inside the repository.
4. Decide whether `twa-manifest.json` should keep a placeholder signing path or be patched from local release config before Bubblewrap runs.
5. Extend the release docs so the one-command path no longer teaches creating `whatfees-upload.jks` in the repo root.
6. Add a small guard to `security:scan` or release pre-flight that reports tracked release artifacts, tracked keystore-like files, and repo-local signing paths.

Done when:

- `git ls-files` does not list generated APK/AAB/signing/test-render leftovers.
- Release docs and scripts point signing material outside the repo by default.
- A release can still be built with an explicit local keystore path.

## Priority 1 - Reduce App-Root Coupling In UI Components

The biggest frontend refactor target is no longer one giant file. It is the app-root bridge pattern.

Observed state:

- `src/App.html` passes `this` or `$root` into most shell/window components.
- `src/components/windows/contextBridge.ts` proxies the root app context into child components.
- Many components declare `ctx: PropType<Record<string, unknown>>`, then read arbitrary root fields and methods.
- The central `AppContext` type is good enough to be reused, but most components do not depend on narrower typed contracts yet.

To do:

1. Define small feature-facing context interfaces instead of passing the whole root app everywhere. Start with shell/account, sales, live, portfolio, singles, wheel, and Whatnot.
2. Add typed provider helpers next to `contextBridge.ts` so components can request a known contract rather than a free-form proxy.
3. Migrate low-risk shell components first: `AuthGateCard`, `AppShellTopBar`, `LotSelectorOnboardingBlock`, `WorkspaceModals`, `SaleEditorModal`, `PortfolioReportModal`, and `AutoCalculateModal`.
4. Replace `$refs` method lookups from `App.html` with explicit component events where practical, especially singles add, wheel compact actions, and live reset/apply actions.
5. Keep compatibility through incremental adapters so this does not become a rewrite.

Done when:

- New child components do not accept `Record<string, unknown>` app contexts.
- Existing bridge usage is isolated behind typed adapters.
- Root template coupling is smaller and easier to reason about.

## Priority 2 - Type The High-Change Window View Models

The main window definitions still concentrate the largest practical type holes.

Observed hotspots:

- `src/components/windows/SalesWindow.definition.ts`
- `src/components/windows/PortfolioWindow.definition.ts`
- `src/components/windows/LiveWindow.definition.ts`
- `src/components/windows/live/LiveSinglesPanel.ts`
- `src/components/windows/whatnot/WhatnotReviewDialog.ts`
- `src/components/windows/whatnot/WhatnotCsvImportDialog.ts`

To do:

1. Introduce explicit `This` or view-model interfaces for each window, following the partial pattern already used by `SinglesConfigWindow.definition.ts`.
2. Move pure presentation helpers out of component definitions into typed helper modules with focused tests.
3. Type forecast scenario, sales history, portfolio filter, and Whatnot review row helpers instead of using generic object records.
4. Convert `this: any` in Whatnot and Live paths to typed contracts.
5. Keep tests close to each migration. Prefer narrow unit tests for extracted helpers and one component behavior test where template behavior depends on it.

Done when:

- The largest window files no longer need broad `Record<string, unknown>` for normal state/method access.
- Refactors to sales, portfolio, live pricing, and Whatnot review flows get compiler help instead of runtime probing.

## Priority 3 - Make Wheel Boundaries Explicit

Wheel is feature-rich and already split across many files, but the file graph still behaves like one large component.

Observed state:

- Large wheel files include `wheelSessionMethods.ts`, `wheelConfigMethods.ts`, `wheelSpinMethods.ts`, `WheelWindow.definition.ts`, `wheelControllerState.ts`, `wheelStageComputeds.ts`, `wheelHelpers.ts`, `WheelSessionPanel.ts`, `wheelSpectator.ts`, and `wheelSpectatorMethods.ts`.
- Wheel child components use `wheelCtx` and nested bridges.
- Session, spin, fairness, spectator, inventory deduction, config editing, and canvas rendering are partly separated but still share mutable component state.

To do:

1. Define clear subdomains: config editing, live session, spin execution, fairness proof, inventory deduction, spectator/public session, and canvas rendering.
2. Give each subdomain an explicit input/output contract and move pure logic out of component method bags.
3. Replace direct mutation of root/wheel component bags with service functions that return patches or typed results where feasible.
4. Keep `WheelWindow.definition.ts` as the coordinator, not the owner of every behavior.
5. Add focused tests for session persistence, chase replacement, fairness history, spectator snapshot generation, and inventory deduction decisions.

Done when:

- Wheel changes can usually touch one subdomain plus one coordinator integration point.
- Child panels no longer need broad nested bridge access for ordinary rendering and actions.

## Priority 4 - Consolidate Realtime And Sync Configuration

Realtime room naming is shared, but endpoint and environment decisions are still split.

Observed state:

- Room names are shared through `shared/workspace-realtime-rooms.*`.
- Frontend websocket defaults live in `src/app-core/methods/ui/workspace-realtime-state.ts`.
- API publish defaults live in `apps/api/src/lib/realtime.ts`.
- Realtime app behavior lives separately in `apps/realtime/src`.

To do:

1. Create one shared realtime config helper or documented config contract for socket URL, publish URL, room-count URL, and production host defaults.
2. Keep frontend and backend override names aligned: `VITE_REALTIME_SOCKET_URL`, `REALTIME_PUBLISH_URL`, `REALTIME_INTERNAL_API_KEY`, and `REALTIME_TOKEN_SECRET`.
3. Add tests for host/env resolution so `whatfees.ca`, local dev, and explicit overrides do not drift.
4. Decide whether public wheel spectator realtime should share the same config contract as workspace realtime.
5. Review `src/spectator-main.ts` against the app-core realtime client so reconnection, envelope parsing, and room handling do not diverge silently.

Done when:

- Changing realtime deployment domains requires editing one contract, not frontend and API defaults independently.
- Frontend, API, and gateway tests agree on the same environment behavior.

## Priority 5 - Strengthen Cloud Sync And Entity Contracts

Sync is already safer than a simple snapshot overwrite, but the contracts are still too loose at important boundaries.

Observed state:

- API sync payloads still use `unknown[]` and `Record<string, unknown[]>` in `apps/api/src/types.ts`.
- Frontend sync is split across `src/app-core/methods/ui/sync-*`.
- Sales/live pricing have more authoritative entity paths, but legacy snapshot compatibility remains important.

To do:

1. Define shared DTOs for lots, sales, wheel configs, live pricing, and sync metadata at the API boundary.
2. Keep runtime parsing at the network boundary, but return typed normalized shapes to services.
3. Separate legacy snapshot import/export compatibility from current entity sync logic.
4. Add contract tests that round-trip representative personal and workspace payloads.
5. Keep storage reset recovery and conflict policy behavior explicit in tests before changing sync internals.

Done when:

- API handlers and frontend sync code share named DTOs instead of parallel loose records.
- Legacy migrations still pass, but current sync code is typed around current entities.

## Priority 6 - Untangle Billing, Entitlements, And Workspace Access

Personal Pro is wired; workspace access is intentionally not yet its own billing model.

Observed state:

- `hasProAccess` is personal.
- Workspace creation, membership, sync, realtime, and Whatnot workspace scope are available to signed-in users.
- Backend entitlement document shapes include room for scoped ids, but product flows do not yet expose workspace billing.

To do when product direction is clear:

1. Add a workspace billing domain rather than stretching personal Pro.
2. Define effective access by scope: personal user, workspace owner, workspace member, and workspace plan.
3. Keep personal Pro gates personal-only unless explicitly replaced.
4. Add workspace entitlement APIs and UI state separately from profile/auth state.
5. Test workspace downgrade, removed member, owner transfer, and personal fallback cases.

Done when:

- Access checks answer "which scope grants this?" instead of reading only `hasProAccess`.

## Priority 7 - Keep Tests Fast And Intentional

The test suite is broad enough that refactors should preserve small, targeted feedback loops.

To do:

1. Keep adding tests next to extracted helpers instead of relying only on broad component tests.
2. Make common context builders for app, sales, wheel, sync, and API tests so `Record<string, unknown>` fixtures do not hide broken contracts.
3. Keep root `npm run verify`, API `npm --prefix apps/api run test`, and API typecheck as the merge-level gates.
4. Consider adding a realtime package test script before larger gateway changes.
5. Keep hot-path coverage focused on pricing, sync safety, sales/import, auth/session, workspace membership, and wheel fairness/session behavior.

## Suggested Order Of Work

1. Release/repo hygiene.
2. Typed app context adapters for shell components.
3. Sales and Portfolio window typing, because they are high-change and lower complexity than wheel.
4. Live and Whatnot typing, especially the remaining `this: any` methods.
5. Wheel subdomain contracts.
6. Realtime config consolidation.
7. Sync DTO tightening.
8. Workspace billing/access model when product decisions are ready.

## Guardrails

- Preserve local-first behavior and legacy personal-mode migrations.
- Keep personal and workspace scope boundaries explicit.
- Refactor in thin slices with tests at each seam.
- Prefer typed adapters and service extraction over large rewrites.
- Do not remove compatibility paths until the migration and rollback story is clear.
