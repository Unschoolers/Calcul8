# Calcul8 Refactor Plan

Updated on 2026-07-22. This file contains only verified remaining refactor work. Completed work and historical implementation notes are removed instead of archived here. Line-count targets are intentionally omitted: each implementation must report its measured net production TypeScript change, but maintainability and correctness take precedence over a speculative deletion quota.

## High Priority

### 1. Centralize Repeated Cosmos Repository Mechanics

The four largest repositories currently contain 2,538 production TypeScript lines:

- `apps/api/src/lib/cosmos/workspaceRepository.ts`: 745 lines
- `apps/api/src/lib/cosmos/whatnotRepository.ts`: 733 lines
- `apps/api/src/lib/cosmos/salesRepository.ts`: 549 lines
- `apps/api/src/lib/cosmos/entitlementRepository.ts`: 511 lines

ETag reads, `If-Match` options, retries, query iteration, not-found handling, and Cosmos conflict classification are still repeated across these and other repositories.

Remaining work:

1. Extract small typed helpers for ETag access, conditional operations, read-or-null behavior, query collection, and standard Cosmos error classification.
2. Keep document ids, partition keys, domain queries, lifecycle transitions, audit fields, and conflict messages inside their feature repositories.
3. Inject containers, clocks, and id generators where tests currently depend on module-level infrastructure.
4. Migrate repositories incrementally and delete local copies only after conflict, retry, not-found, and partition-key tests pass.

Done when repeated Cosmos mechanics have one tested implementation, optimistic concurrency remains explicit, domain behavior is not hidden behind a generic repository abstraction, and API tests and strict typechecking pass.

### 2. Share Whatnot Import Contracts And Pure Normalization

The Whatnot workflow remains distributed across frontend CSV/review code and API OAuth, review, duplicate-detection, confirmation, and repository code. Equivalent unions such as `WhatnotMappedSaleType`, `WhatnotImportDecisionKind`, and `WhatnotReviewImportAction` are still declared separately in `src/types/app.ts` and `apps/api/src/types.ts`.

Remaining work:

1. Define shared runtime-validated contracts for normalized import candidates, external transaction identity, mapped sale types, duplicate candidates, review decisions, and confirmation request/response shapes.
2. Make CSV and OAuth source adapters emit the same normalized candidate contract.
3. Centralize pure normalization, sale-type inference, grouping keys, external-reference construction, and review-decision validation.
4. Keep CSV file parsing and column mapping in the frontend; keep OAuth credentials, provider calls, leases, Cosmos writes, and durable confirmation recovery in the API.
5. Preserve seller-authored Notes and keep provider metadata in explicit external-reference fields.

Done when frontend and API import paths share one validated candidate and decision model, duplicated contract declarations and normalization rules are removed, and scope isolation, memo preservation, duplicate detection, and recovery tests remain green.

## Medium Priority

### 3. Break Large Window Controllers Into Reusable Read Models And Composables

The Portfolio, Singles, Sales, and Live window directories currently contain 5,041 production TypeScript lines. `PortfolioWindow.definition.ts` remains 966 lines and `SinglesConfigWindow.definition.ts` remains 632 lines. Typed capability injection is complete, but these option objects still combine presentation state, sorting, filtering, formatting, persistence, dialog state, and domain-specific view-model construction.

Remaining work:

1. Extract pure Portfolio and Singles read-model builders from their Vue option objects.
2. Introduce focused composables only where at least two current windows prove reuse, such as sorting, persisted selection, filter menus, responsive pagination, or dialog state.
3. Reuse existing KPI, panel, table, empty/loading/error, and responsive primitives instead of adding window-specific variants.
4. Keep effects behind existing typed ports and central storage-key helpers.
5. Preserve bilingual copy, accessibility, theme tokens, and the shared mobile/desktop logic path.

Done when the largest windows are thin composition layers, each generic composable has multiple real consumers, pure read models have focused tests, and duplicated controller logic is deleted rather than moved.

## Low Priority

### 4. Finish Standardizing Test Fixtures

Shared web builders already exist in `tests/helpers/fixtures.ts`, but adoption is incomplete. Fee constants, local `makeSale`/`makeLot` functions, Whatnot rows, Cosmos documents, browser mocks, and component contexts are still recreated in individual test files.

Remaining work:

1. Move repeated fee assumptions and remaining local Lot, Sale, Singles, Whatnot, and Cosmos builders into focused test helpers.
2. Add API builders for repository documents, auth claims, entitlements, sync snapshots, and Whatnot import rows.
3. Add UI harness helpers for typed capability providers, storage/browser boundaries, and component method tests.
4. Migrate fragile, high-churn fixture clusters first; do not rewrite stable tests solely for uniformity.

Done when new tests use shared builders by default, financial assumptions are explicit, direct component mounts use typed capability fakes, and `npm run verify:all` remains green.
