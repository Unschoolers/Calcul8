# Calcul8 Refactor Plan

Updated on 2026-07-21 after completing the session-first authentication boundary and rescanning the repository for consolidation opportunities. Completed UI, bilingual contract, realtime recovery, system configuration, bracket battle, singles-image work, complete account erasure, production CORS and distributed rate-limit hardening, release-gate coverage, generated artifact hygiene, billing/session/Whatnot concurrency fixes, atomic local snapshot application, public-session access revalidation, session-first frontend authentication, and the two cross-document recovery workflows are intentionally removed from this plan.

This is the active technical and security backlog, plus a staged test-maintenance follow-up discovered while promoting all tests into `verify:all`. The production priorities below target real net deletion through shared services, typed dependency injection, reusable domain contracts, and focused generic helpers. Moving the same code into more files does not count as a successful refactor. Each item should be implemented TDD-style, verified against the affected package, and deleted from this file once the repo proves it is done.

Production line estimates are planning ranges from the 2026-07-21 scan. They exclude tests and count the shared infrastructure added by the refactor, so the target is net deletion rather than gross lines moved.

## Production Refactor Priorities

| Priority | Refactor | Current production footprint | Target net reduction |
| --- | --- | ---: | ---: |
| 1 | Finish the shared game engine | About 11,051 TypeScript lines | 1,200-1,800 lines |
| 2 | Replace untyped component context bridges with typed dependency injection | 431 `Record<string, unknown>` occurrences | 500-900 lines |
| 3 | Build a typed Cosmos repository kernel | About 2,538 lines across four large repositories | 450-750 lines |
| 4 | Unify Whatnot CSV and OAuth import pipelines | About 6,223 frontend and API lines | 450-800 lines |
| 5 | Extract reusable window and dashboard controllers | About 4,925 lines across the major windows | 350-650 lines |

The combined planning target is approximately 2,950-4,900 net production lines. This is not a quota: correctness, explicit boundaries, strict typing, scope safety, and maintainability take precedence over deleting a line that still expresses necessary domain behavior.

### 1. Finish The Shared Game Engine

**Priority:** Highest consolidation leverage and largest realistic production-line reduction.

**Scan finding:** The frontend game area under `src/components/windows/game` plus its shared contracts contains about 9,529 production TypeScript lines, while the game and wheel API features contain another 1,522. The existing adapter seam in `src/components/windows/game/services/gameAdapters.ts` is a good foundation, but reusable lifecycle and side-effect behavior is still spread across wheel-named command, state, inventory, sale, fairness, and spectator helpers. Large concentration points include `wheelSessionMethods.ts`, `wheelSpinMethods.ts`, `wheelConfigMethods.ts`, `wheelSessionState.ts`, `GameWindow.definition.ts`, and the stage/overlay coordinators.

**Risk:** Wheel, Mystery Grid, and Bracket can drift into separate implementations of starting, restoring, publishing, settling, and ending a game. Repeated orchestration also makes inventory loss, duplicate sales, stale spectator snapshots, and inconsistent recovery more likely. Merely renaming wheel files or introducing a universal base class would hide the duplication without removing it.

**Implementation direction:**

1. Define a small game-session engine around explicit ports for persistence, spectator publication, inventory reservation/settlement, sale recording, fairness proof storage, time, and id generation.
2. Move shared preview/live lifecycle transitions, start/reset/end orchestration, session restoration, and stale-operation protection into the engine.
3. Represent Wheel, Mystery Grid, and Bracket behavior through typed adapters that supply their outcome rules, configuration validation, inventory requirements, settlement payloads, and spectator snapshot projection.
4. Reuse one inventory and sale settlement pipeline for every game that consumes inventory or records a sale, while keeping stable mutation ids and optimistic-concurrency behavior.
5. Reuse one spectator-session publisher and status lifecycle across game types.
6. Keep canvas rendering, grid layout, dice animation, bracket resolution, and other genuinely game-specific algorithms outside the generic engine.
7. Remove compatibility adapters and wheel-prefixed generic helpers only after all three game flows use the replacement boundary.

**Architecture guardrails:**

- Do not build a base class that depends on the root Vue context.
- Domain adapters must be pure where practical; browser, network, storage, and clock access belong behind injected ports.
- A failed settlement must leave enough stable state to retry without duplicating sales or inventory deductions.
- Mobile, desktop, and spectator experiences must consume the same underlying session state.

**Target net reduction:** 1,200-1,800 production TypeScript lines.

**Done when:** All three games use the same session lifecycle, persistence, spectator, inventory, and sale orchestration boundaries; game-specific files contain rules and rendering rather than duplicated infrastructure; existing fairness, inventory, sales, recovery, and spectator tests remain green; new adapter-contract tests prove each game supplies the required behavior; and the measured production TypeScript footprint is reduced within the target range or the final report explains which necessary domain behavior prevented it.

### 2. Replace Untyped Component Context Bridges With Typed Dependency Injection

**Priority:** Critical frontend architecture cleanup that enables the remaining window and game refactors.

**Scan finding:** Production frontend code contains 431 `Record<string, unknown>` occurrences, including 353 under window components, plus about 60 repeated `ctx` prop, `inject("appCtx")`, and setup-bridge patterns. Portfolio, Singles, Sales, Live, and Game frequently receive the root application object and recover dependencies through casts, runtime property access, or very large `Pick<AppState, ...>` context types.

**Risk:** Components can compile while depending on undeclared root methods, tests must construct large partial application objects, and a root-state rename can break unrelated windows at runtime. The pattern also works against the earlier AppContext breakup because aggregate context still crosses component boundaries indirectly.

**Implementation direction:**

1. Define narrow domain ports such as `PortfolioPorts`, `SalesPorts`, `SinglesCatalogPorts`, `GameSessionPorts`, `WorkspacePorts`, and shared UI ports for notification, navigation, formatting, and confirmation.
2. Provide ports through typed Vue injection keys and focused composables rather than string-based `appCtx` injection.
3. Let each window depend only on the commands and read models it actually consumes; do not expose the root application state through a catch-all port.
4. Replace runtime method discovery and `this as Record<string, unknown>` calls with explicit typed functions.
5. Use factories to assemble production adapters from `src/app-core`, while tests inject in-memory fakes for network, storage, clock, and browser boundaries.
6. Remove obsolete `ctx` props and context-bridge setup blocks as each domain migrates.
7. Shrink `src/app-core/context/commerce.ts` and related context files by deleting redundant `Pick<AppState, ...>` compositions after their consumers use ports.

**Architecture guardrails:**

- Dependency injection should expose capabilities, not a service locator or renamed global context.
- Domain types must not import Vue.
- Components should not import concrete API/storage implementations when a port already exists.
- Keep current PWA, responsive, theme, and local-first behavior unchanged.

**Target net reduction:** 500-900 production TypeScript lines, with a substantial reduction from the 431 current `Record<string, unknown>` occurrences.

**Done when:** Major windows no longer inject or accept the aggregate `appCtx`; domain components use typed injection keys or explicit typed props; root methods are not discovered dynamically; component tests use small domain fakes instead of partial AppState objects; strict frontend and test typechecks pass; and an architecture test prevents new aggregate-context dependencies from spreading.

### 3. Build A Typed Cosmos Repository Kernel

**Priority:** High backend reuse, consistency, and concurrency safety.

**Scan finding:** `workspaceRepository.ts`, `whatnotRepository.ts`, `salesRepository.ts`, and `entitlementRepository.ts` contain about 2,538 production lines. They repeatedly implement ETag extraction, `If-Match` request options, retry wrapping, read-or-null behavior, create/replace/delete mechanics, query iteration, partition-key handling, and translation of Cosmos not-found, conflict, and precondition failures.

**Risk:** Repository-specific copies can drift in retry policy, optimistic-concurrency enforcement, conflict translation, and partition-key construction. These are data-safety boundaries where small inconsistencies can become lost updates, duplicate records, or records that cannot be repaired. A universal repository abstraction would be equally dangerous if it hid domain queries or lifecycle transitions.

**Implementation direction:**

1. Add a typed Cosmos document-store kernel that accepts a container port, document codec, id strategy, partition-key strategy, retry policy, and conflict mapper.
2. Centralize `readOrNull`, create-only writes, conditional replace, conditional delete, paged/fetch-all queries, ETag extraction, and standard Cosmos error classification.
3. Inject containers, clock, and id generation so repository tests do not depend on module-level Cosmos access or unstable time/ids.
4. Keep domain queries, lifecycle transitions, audit metadata, state-machine decisions, and user-facing conflict messages in their feature repositories.
5. Migrate one lower-risk repository slice first, prove the kernel against conflict/not-found/retry tests, then move Sales, Workspace, Whatnot, and Entitlements incrementally.
6. Delete repository-local copies only after their domain tests pass against the shared kernel.

**Architecture guardrails:**

- The kernel owns Cosmos mechanics, not business rules.
- Callers must provide explicit ids and partition keys; no hidden inference from loosely typed documents.
- Conditional writes remain the default for cloud-authoritative updates.
- Repository APIs continue translating infrastructure failures into stable domain errors.
- Do not introduce inheritance; prefer typed composition around small ports.

**Target net reduction:** 450-750 production TypeScript lines.

**Done when:** The four large repositories share one tested implementation of Cosmos mechanics; duplicated ETag, retry, query, and conflict boilerplate is removed; domain-specific state transitions remain explicit; repository tests cover not-found, create conflict, stale ETag, retry, and partition-key behavior; API typecheck and tests pass; and the four-repository net footprint falls within the target range or retained differences are documented as domain-specific.

### 4. Unify Whatnot CSV And OAuth Import Pipelines

**Priority:** High-value domain consolidation around a revenue-critical workflow.

**Scan finding:** Whatnot import and review behavior spans about 2,446 frontend lines and 3,777 API lines. CSV and OAuth use different ingestion adapters but converge on duplicated concepts: normalized import rows, mapped sale types, review actions, decision kinds, external transaction references, grouping, duplicate candidates, and confirmation decisions. Several of these unions and interfaces are separately declared in `src/types/app.ts` and `apps/api/src/types.ts`.

**Risk:** Contract drift can make a row valid in the frontend but invalid or differently interpreted by the API. Separate normalization and grouping rules can produce inconsistent duplicate suggestions, especially when Whatnot changes export columns or provider payloads. Confirmation recovery, credential access, and seller-authored memo preservation are sensitive and must not be pulled into an unsafe generic frontend layer.

**Implementation direction:**

1. Define shared, runtime-validated contracts for `ImportCandidate`, external transaction identity, mapped sale type, duplicate candidate, review decision, and confirmation request/response shapes.
2. Treat CSV and OAuth as source adapters that emit the same normalized candidate contract.
3. Centralize pure normalization, sale-type inference, grouping-key construction, external-reference construction, and review-decision validation in a shared domain package.
4. Keep OAuth credentials, provider API calls, durable batch recovery, leases, Cosmos writes, and confirmation execution on the API.
5. Keep CSV file parsing and user-driven column mapping in the frontend, but pass its output through the same candidate validator used for OAuth rows.
6. Preserve seller-authored `memo` values and keep external provider metadata in `externalTransactionRefs` or other explicit metadata fields.
7. Remove duplicated frontend/API unions and normalization helpers after both sources pass contract tests.

**Architecture guardrails:**

- Shared code must be pure and have no Vue, Azure Functions, Cosmos, or browser dependency.
- Provider-specific raw payloads stay behind their source adapter.
- Durable confirmation remains an idempotent API-side workflow with stable operation keys and checkpoints.
- Workspace/personal scope is explicit in every server-side batch and mutation.
- Unknown provider fields must be normalized or rejected at the boundary, never trusted through TypeScript casts.

**Target net reduction:** 450-800 production TypeScript lines.

**Done when:** CSV and OAuth imports emit one validated candidate model; review and confirmation contracts are shared rather than duplicated; grouping, type inference, duplicate-candidate, and external-reference rules have one source of truth; memo preservation and scope isolation tests remain green; raw provider access and durable recovery remain server-side; and combined Whatnot production lines are reduced within the target range without weakening recovery behavior.

### 5. Extract Reusable Window And Dashboard Controllers

**Priority:** High frontend maintainability and practical line reduction after typed DI is established.

**Scan finding:** Portfolio, Singles, Sales, and Live contain about 4,925 production TypeScript lines. `PortfolioWindow.definition.ts` alone is about 975 lines and combines sorting, filters, menu behavior, drilldowns, formatting, chart state, dashboard presets, KPI presentation, buyer quick views, and context bridging. The major windows repeat sort direction/icon handling, persisted selections, loading/error state, dialog state, responsive list/table presentation, formatting fallbacks, and local-storage access.

**Risk:** Large option objects make small UI changes expensive and encourage copy/paste between dashboards. Presentation rules become difficult to test without mounting or emulating a large Vue instance. Extracting arbitrary methods into more files would not improve the design unless the result is a reusable typed controller or pure view-model builder.

**Implementation direction:**

1. Build focused composables and pure helpers such as `useSortableRows`, `usePersistedSelection`, `useFilterMenu`, `useAsyncResource`, `useDialogState`, and `useResponsiveDataView` only where at least two current consumers prove the abstraction.
2. Move Portfolio customer, lot-performance, pulse, chart, and drilldown presentation into typed read-model builders that consume domain data and formatting ports.
3. Let components compose read models and commands; keep network, storage, timer, and browser effects behind the typed ports from priority 2.
4. Reuse the existing shared KPI, panel, table, dialog, empty/loading/error, chart, and responsive primitives instead of creating window-specific variants.
5. Centralize persisted UI preferences through the existing storage-key helpers and a safe storage adapter.
6. Delete duplicated sort icons, filter-menu state, dialog plumbing, and formatting fallbacks after consumers migrate.

**Architecture guardrails:**

- Do not create a universal window base class or a configuration DSL for one-off UI.
- Extract only behavior with multiple real consumers or a clear pure domain/view-model responsibility.
- Preserve bilingual copy, theme tokens, accessibility, keyboard behavior, and mobile/desktop behavior.
- Keep desktop and mobile on one logic path; responsive differences belong in view composition rather than duplicated state.

**Target net reduction:** 350-650 production TypeScript lines.

**Done when:** Portfolio is a thin composition layer rather than a monolithic controller; at least two major windows reuse each new generic composable; repeated sorting, persistence, filter, dialog, and async-state code is deleted; pure read-model builders have focused tests; no new root-context dependency is introduced; Vue scenario tests and visual contracts remain green; and the combined major-window footprint is reduced within the target range.

## Recommended Execution Order

1. Finish the shared game engine, using the existing adapter seam and preserving game-specific rendering.
2. Introduce typed dependency-injection ports domain by domain, starting with the dependencies needed by Game and Portfolio.
3. Build and migrate the Cosmos repository kernel one repository slice at a time.
4. Unify Whatnot import contracts and pure normalization before changing durable confirmation execution.
5. Extract window/dashboard controllers after typed ports remove their dependency on aggregate application context.

Each slice must report production TypeScript lines before and after, including the shared infrastructure it added. A slice that only moves lines, increases casts, weakens types, or replaces explicit domain behavior with an opaque generic framework does not satisfy this plan.

## Planned Test-Maintenance Follow-Up

### Standardize Test Fixtures With Shared Builders

**Priority:** High test maintainability and contract safety.

**Scan finding:** Promoting all tests into `verify:all` exposed repeated raw fixture drift across web and API tests. Many tests still hand-build partial `Lot`, `Sale`, Whatnot review rows, Cosmos documents, app contexts, storage mocks, and component `this` contexts. Strict test typechecking caught missing fee-profile fields, stale object shapes, and unclear default-fee assumptions, but the fixes added local casts and repeated fixture fragments that will drift again without shared builders.

**Risk:** Raw fixtures make large refactors expensive because unrelated tests fail on schema noise instead of behavior. They also hide important business assumptions, especially money math where default Whatnot fees and no-fee scenarios must be explicit. If the app types keep evolving while tests copy object literals, `verify:all` will stay useful but become noisy and slower to repair.

**Implementation direction:**

1. Create core web test builders: `makeLot`, `makeSale`, `makeSinglesPurchase`, fee helpers such as `WHATNOT_FEES` and `NO_FEES`, and shared storage/fetch mocks.
2. Migrate money/domain tests first, especially calculations, computed portfolio data, portfolio forecast, sales helpers, and fee-sensitive fixtures.
3. Create API test builders for Cosmos documents, repository records, request contexts, auth claims, entitlements, sales, sync snapshots, and Whatnot import rows.
4. Create UI/component harness helpers for partial Vue `this` contexts, component method calls, mocked window/document/storage, and table/dialog/window method tests.
5. Document fixture rules, then replace raw `Lot`, `Sale`, Whatnot, Cosmos, and app-context object literals gradually so tests express intent instead of full schemas.

**Done when:** New tests use builders by default for shared domain/API/UI shapes; fee assumptions are explicit in money tests; component method tests use harness helpers instead of ad hoc `Record<string, any>` contexts; the most fragile existing raw fixture clusters are migrated; `npm run verify:all` remains green after each migration slice.
