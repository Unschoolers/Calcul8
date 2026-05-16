# Calcul8 Refactor TODO

Ordered from critical to low. This file only lists remaining work found during the current frontend, API, and realtime scan.

## High

### 1. Whatnot Import And Review Boundaries

- Finding: Whatnot import/review behavior is split across large frontend components and separate API normalization paths, with UI files still owning grouping, duplicate matching, preview state, and mutation orchestration.
- Scope: `src/components/windows/whatnot/WhatnotReviewDialog.ts`, `src/components/windows/whatnot/WhatnotCsvImportDialog.ts`, `src/app-core/shared/whatnot-csv.ts`, `apps/api/src/features/whatnot/*`, `apps/api/src/lib/whatnot.ts`.
- Acceptance: move duplicate matching, row grouping, import preview mapping, and shared normalization into typed service helpers used consistently at the UI and API boundaries.

### 2. Large Frontend Window Surfaces

- Finding: several user-facing windows remain large enough that feature changes risk accidental cross-behavior edits, especially Singles, Portfolio, and Live surfaces.
- Scope: `src/components/windows/singles/*`, `src/components/windows/portfolio/*`, `src/components/windows/live/*`.
- Acceptance: extract typed view-model helpers and focused panels when touching these areas; reduce `this: any` component contracts; keep mobile, tablet, and desktop behavior in the same logic path.

### 3. Game Command Surface Cleanup

- Finding: after the public-session naming pass, the game window still has large wheel-named command modules and compatibility adapters around session/config/spin behavior.
- Scope: `src/components/windows/game/commands/*`, `src/components/windows/game/coordinator/*`, `src/app-core/game/*`, remaining wheel compatibility adapters.
- Acceptance: keep compatibility isolated, move reusable behavior into typed game/session helpers, and only leave wheel-specific names where the product concept is actually wheel-specific.

## Medium

### 4. API Route Boundary Standardization

- Finding: API feature handlers are thin enough to work, but sales, whatnot, and workspace routes still repeat request parsing, telemetry, response shaping, and error translation patterns.
- Scope: `apps/api/src/features/sales/handlers.ts`, `apps/api/src/features/whatnot/handlers.ts`, `apps/api/src/features/workspaces/*`, shared HTTP/response helpers.
- Acceptance: introduce focused route-boundary helpers for validation, actor/session extraction, telemetry context, and domain error mapping without moving business behavior back into function entry points.

## Low

### 5. Test Suite Organization

- Finding: several frontend and API tests are very large, which makes failures hard to triage and encourages unrelated setup reuse.
- Scope: large suites such as calculations, wheel/game config/session, singles config, sales methods, sync service, and API workspace/public-session tests.
- Acceptance: split large suites by feature behavior as nearby code changes require it, move shared fixture builders into explicit helpers, and keep exact-output fixture tests authoritative where they represent real business contracts.

### 6. Generated Artifact And Contract Hygiene

- Finding: generated shared contract copies, build output, and coverage artifacts can still distract from source changes during broad refactors.
- Scope: `shared/*`, `apps/api/src/shared/*`, `apps/*/dist`, coverage/build artifacts, contract-generation scripts.
- Acceptance: document the regeneration path, keep generated outputs out of normal review unless intentionally refreshed, and make version/compiler drift visible before release work.
