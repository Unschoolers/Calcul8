# WhatFees incremental refactoring implementation plan

> For agentic workers: use subagent-driven development. Execute one numbered item at a time. Each item has its own branch, incremental commits, and PR; independent review follows PR creation and precedes the next item.

**Goal:** Complete the ten code-review priorities as ten working, reviewable PRs.
**Architecture:** Preserve existing product flows, local-first recovery and capability ports while consolidating duplicated contracts and invariants, then separating state, controllers and effects.
**Tech stack:** Vue/Vuetify/TypeScript, Azure Functions/Cosmos, Vitest/Playwright.
**Spec:** The accepted ten-item code review and the user's execution instruction in this conversation (2026-10-08 UTC).

## Global Constraints

- Use Luna for bounded implementation and tests by default; reserve GPT-6.1 Sol for complex design decisions or focused reviews. This reflects the user's later cost preference. No worker may delegate further.
- Work in order 1 through 10. At least one meaningful implementation commit per item; use multiple focused commits for larger work.
- Open a PR after the item works. The controller independently validates after PR creation and resolves findings before advancing.
- Stack each branch and PR on the preceding validated branch. Do not merge or push to main.
- Follow docs/codingstandard.md and docs/repo-organization.md. Preserve mobile/desktop behavior, theme behavior, provider-neutral session auth, CSRF, scope isolation, optimistic concurrency and stable mutation identities.
- Never hide errors to make checks pass. Report pre-existing failures with evidence and resolve failures caused by this series.
- Use focused regression/behavior tests while iterating; run required area verification before reporting an item ready.
- Keep each PR scoped to its numbered item. Existing compatibility surfaces may delegate to a new owner during a migration, but must not duplicate state or behavior.

## Review Focus

- Pending game-sale retry identity must survive browser/API serialization.
- A sold Shopify box must consume the same physical units and cost basis as a manual box sale.
- Failed/offline/conflicted persistence must not be reported as confirmed success.
- Requests completing after account/workspace/lot changes must not mutate the new scope.
- Typed controller changes must preserve mounted component actions, mobile search and game settlement ordering.

### Task 1: Canonical shared contracts

Files: shared/* contract runtimes and declarations; apps/api/src/shared/* copies; generation tooling and build/check scripts; tests/shared-sync-contracts.test.ts and relevant API contract tests.
Produce: one canonical source per shared runtime contract with generated ESM/CommonJS/API-compatible artifacts and declarations as appropriate. Preserve existing import entry points and NodeNext consumers. Prefer typed canonical source; avoid manual runtime copies. Include a deterministic generated-output check in verification.
- [ ] Reproduce browser/root/API disagreement for wheelPendingInventoryIssues pendingSale and pendingSaleLotId, with runtime parity assertions for all three entry points.
- [ ] Consolidate duplicated shared runtime implementations and generation, preserving fields/normalization and API deployment isolation.
- [ ] Add meaningful parity and generated-output freshness verification. Test malformed inputs and the pending-sale roundtrip.
- [ ] Run relevant tests and npm run verify:all. Make focused commits and open PR 1 against main.

### Task 2: Shared sale inventory consumption

Files: shared/box-inventory sources; src/domain/calculations*.ts; game/services/wheelSaleSupport.ts; apps/api/src/features/shopify/saleProjection.ts and reconcileService.ts; Whatnot sale builders and relevant tests.
Consume: generated shared contract infrastructure from task 1.
Produce: one canonical sale-consumption function using sale and lot context, shared by stock, sold-progress and bulk cost allocation. Preserve persisted sale compatibility and sealed/open-box accounting.
- [ ] Regress one Shopify box with packsCount 0 versus equivalent manual box with packsCount quantity*packsPerBox; assert equal units, progress and cost basis.
- [ ] Normalize consumption for box/pack/wheel/rtyh and singles without double counting or rewriting historical prices.
- [ ] Migrate all affected readers/producers, verify imports, games, refunds/deletes and oversold handling.
- [ ] Run web/API/shared checks; commit increments and open PR 2 against PR 1 branch.

### Task 3: Explicit persistence outcomes

Files: sales-persistence.ts, sales.ts, sync/{sync-push,sync-pull,sync-coordinator,sync-service}.ts, context types and callers/tests.
Produce: awaitable discriminated results representing confirmed success, skipped/offline, conflict and failure. Keep UI notification at an appropriate caller boundary and preserve background scheduler behavior.
- [ ] Regress delayed/failed save and sync: no premature success; callers can await completion and inspect result.
- [ ] Return and propagate outcomes through public methods and all dependent callers, retain in-flight/scope guards and confirmed-cloud/cache-failure distinction.
- [ ] Cover retry/conflict/auth/offline and queue draining; avoid losing requested work.
- [ ] Run required web checks; commit increments and open PR 3.

### Task 4: Unified HTTP transport

Files: ui/common/api-client.ts; entity-api-shared.ts; workspace/workspace-api.ts; whatnot/whatnot-http.ts; Shopify callers and transport tests.
Produce: one shared transport for session refresh, structured errors, caller cancellation and timeout, with explicit safe/idempotent mutation retry policy. Domain wrappers may translate user copy but must not reimplement auth.
- [ ] Regress external abort handling, auth refresh single flight, unsafe non-idempotent writes and Retry-After.
- [ ] Preserve CSRF/session behavior and stable mutation identities; migrate duplicated authenticated wrappers.
- [ ] Ensure aborting cancels fetch and retry delays without turning cancellation into user-facing failure.
- [ ] Run required web checks; commit increments and open PR 4.

### Task 5: Feature-owned state

Files: src/app.ts, state.ts, context capability ports, feature stores/controllers, watchers and component injection tests.
Produce: actual focused owners for sales state, integration state and game-session state. Root assembles/injects owners; compatibility properties delegate reactively rather than holding copies. Avoid merely moving field initializers into new files.
- [ ] Pin reactive state sharing and scope reset behavior with mounted/capability tests.
- [ ] Move ownership in separate commits, preserving existing ports and runtime behavior.
- [ ] Move associated lifecycle/reset logic with each owner; retain one source of truth and clean disposal.
- [ ] Run web checks and relevant mounted scenarios; commit increments and open PR 5.

### Task 6: Shopify editor controllers

Files: ui/shopify/shopify-editor.ts, new cohesive controller/client modules, Shopify editor context/ports and scenario tests.
Consume: feature-owned integration state and shared transport/outcomes.
Produce: typed Shopify client plus focused binding/details/create/search/session coordination modules. A thin facade may preserve callers; it must not retain mixed orchestration.
- [ ] Preserve partial provider mutation recovery, stable payload/mutation IDs, version/generation guards and saved-lot validation in tests.
- [ ] Extract by responsibility in multiple commits; model operation status explicitly and preserve UI contracts.
- [ ] Run Shopify unit/scenario tests and required web checks; open PR 6.

### Task 7: Typed game controllers

Files: windows/shared/contextBridge.ts; game coordinator, nested components, session/command interfaces, services and mounted game tests.
Consume: feature-owned game session from task 5 and shared sale behavior.
Produce: explicit typed injected session state/commands, replacing game proxy forwarding and Vue .$ .ctx access. Separate animation effects from persistent settlement and keep wheel/grid/bracket support.
- [ ] Pin nested component actions, preview/live state isolation, async settlement and session persistence/publication order.
- [ ] Migrate bridge consumers to typed controllers in increments; remove internal-Vue fallback for games and redundant compatibility paths.
- [ ] Run game unit/scenario tests and required web checks; open PR 7.

### Task 8: Channel-independent authorization

Files: apps/api/src/lib scope authorization helper; features/whatnot/serviceCore.ts; features/shopify/requestHelpers.ts; authorization tests.
Produce: provider-neutral personal/workspace membership and owner checks with structured denial codes. No Shopify dependency on Whatnot scope implementation or matching English error text.
- [ ] Pin personal, active member, owner, disabled/removed/nonmember access cases.
- [ ] Extract shared policy, preserve partition-key and connection-key formats, migrate both channels.
- [ ] Run API checks; commit and open PR 8.

### Task 9: Reusable asynchronous search lifecycle

Files: a focused app-core search composable/controller; singles/useSinglesCatalogSearch.ts; Shopify search controller; mounted autocomplete tests.
Consume: cancellation-aware transport and separated Shopify controller.
Produce: shared debounce/request identity/cancel/loading/results/error/disposal mechanics with domain adapters for card filtering and Shopify pagination/selection.
- [ ] Regress letter-by-letter input, stale completion, clear/unmount, context changes, empty/error distinctions and pagination.
- [ ] Migrate both searches without changing their domain matching or selection rules; preserve mobile keyboard behavior.
- [ ] Run relevant scenarios and required web checks; commit increments and open PR 9.

### Task 10: Refactoring-friendly verification

Files: package/typecheck config; Vue exports including SinglesConfigWindow.ts; source-text UI tests and corresponding mounted/browser tests.
Produce: Vue template typechecking in normal verification, correctly typed component exports, and behavior/layout tests replacing brittle implementation-text assertions. Keep deliberate architecture checks where they assert a real boundary.
- [ ] Enable vue-tsc or equivalent complete Vue checking; fix errors rather than broadly excluding files or adding any casts.
- [ ] Replace source-regex behavioral assertions with mounted/browser assertions covering auth startup, action presence, responsive legibility and core changed flows.
- [ ] Preserve real coverage and run complete verify:all plus relevant browser checks on final combined series.
- [ ] Commit increments and open PR 10; controller validates final PR and combined series.
