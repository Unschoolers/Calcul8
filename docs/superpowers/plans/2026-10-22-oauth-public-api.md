# WhatFees OAuth 2.1 and Public API Implementation Plan

> **Status:** Plan only. No implementation or production rollout is authorized by this document.
>
> **For coding agents:** Follow `AGENTS.md`, `docs/codingstandard.md`, and `docs/repo-organization.md`. Create a fresh task checklist with [ ]/[x] plus evidence. Prefer isolated worktrees, bounded changes, regression tests first for behavior fixes, and an independent reviewer. Do not claim a task complete without its checks.

**Goal:** Provide a secure, versioned public REST API for third-party clients and an OAuth-compatible identity/authorization layer that can also authenticate WhatFees MCP clients.

**Related plan:** [MCP and ChatGPT plugin](2026-10-22-mcp-chatgpt-plugin.md). Both plans may proceed in parallel after the interface contract in Section 2 is frozen.

**Current code (verified 2026-10-22):** Node 22/TypeScript Azure Functions under `apps/api`; Cosmos DB; `apps/api/src/lib/auth/resolveUser.ts` uses session cookies for ordinary API requests and Google ID-token bearer only at explicitly allowed boundaries. `apps/api/src/features/sync/pullHandler.ts` reads scoped sync snapshots, and `apps/api/src/features/workspaces/helpers.ts` enforces membership. Existing Shopify/Whatnot OAuth is provider integration, not a reusable public API authorization server. There is no established public OAuth resource-server contract or OpenAPI v1 in this repository.

## 1. Invariants and bounded scope

- [ ] Keep browser sign-in/session-cookie/CSRF behavior unchanged. Never reinterpret a Google ID token as a WhatFees API access token.
- [ ] Use authorization code + PKCE S256 for interactive public clients. Support refresh/revocation as applicable; no password grant or long-lived shared API keys as a shortcut.
- [ ] Follow the current MCP authorization requirements even if public REST consumers need less: OAuth discovery, protected resource metadata, resource indicators, client identification/registration, and auditable consent.
- [ ] Bind access tokens to the intended resource, user, client, expiry and scopes. Reject wrong issuer/audience, expired, revoked or insufficient-scope tokens. Do not let a token issued for MCP silently authorize REST, or vice versa.
- [ ] A token never grants workspace membership. Resolve requested personal/workspace scope server-side, verify active membership and recheck at the final service boundary.
- [ ] Preserve existing entitlements, billing separation, rate limits, deterministic sync, inventory integrity, data residency choices and logging redaction. No migration of existing sessions without an explicit rollout plan.
- [ ] Do not expose unsafe bulk `sync/push`, admin/migration, billing internals, OAuth credentials, raw Cosmos documents or access to other tenants through the new public API.
- [ ] Use existing Azure Functions and Cosmos by default; add a paid service only after a documented cost/security/compatibility comparison.

**MVP:** account/workspace reads, lots, sales, portfolio summaries, and server-consistent price calculations. Writes, SDK distribution and public registration belong to later gated phases. Private integration can be tested in dev first.

## 2. Cross-plan contracts (freeze before parallel implementation)

The integrator owns the contract, not any individual worker. Write versioned types in a deployment-safe shared API module, preferably `apps/api/src/lib/externalAccess/` with tests, then freeze its exports for the first round of tasks:

- `ExternalPrincipal`: immutable `userId`, `clientId`, `resource` (exact audience), `scopes`, optional stable token/grant ID and expiry. **Never** trust a caller-provided user ID, workspace ID, role or entitlement claim.
- `validateExternalAccessToken({ bearerToken, expectedResource, requiredScopes })`: validates an already-issued token and produces the principal or a typed unauthorized/forbidden error. A resource server must not mint tokens during request validation.
- `resolveExternalScope({ principal, workspaceId? })`: resolves personal or active workspace access using existing centralized sync-scope/permission rules. Revalidate access before returning data or committing writes.
- `ExternalError` and public response conventions: consistent 400/401/403/404/409/412/422/429 shape, correlation ID, and redacted server logs.
- Resource identifiers: configure and freeze **distinct canonical HTTPS URI identifiers** for REST v1 and MCP. Do not hardcode unverified production hostnames into source. Both plans use the same issuer and scopes, but enforce their own expected resource.
- Initial scopes (freeze names in OpenAPI and tool declarations): `account:read`, `workspaces:read`, `lots:read`, `sales:read`, `pricing:calculate`. Reserve `lots:write` and `sales:write` for a separately reviewed release.
- Domain ports: define typed, narrow account/workspace, lot, sales, portfolio and pricing read services accepting `ExternalPrincipal` + resolved scope. Prefer reusing existing services over direct Cosmos access from transports. A public REST handler and an MCP tool call the **same** domain port, not each other over HTTP.

**No parallel agent may edit this contract after freeze without notifying both workstream integrators and rerunning their contract tests.** All field or scope naming disagreements become a short integration decision, not two competing implementations.

## 3. Dependency graph and agent work packets

Each packet below is intended for **one Luna-sized worker in its own branch/worktree**, with tests owned next to code. An integrator reviews each diff, cherry-picks in dependency order, resolves only integration seams, and runs the full gate. Workers must not independently modify global entrypoints, shared manifests or package locks.

### Wave 0: architecture and interface freeze (integrator; blocks final wiring only)

**P0: Decide authorization-server strategy and contract**

- [ ] Compare an existing managed OAuth authorization server to a carefully maintained in-process issuer: costs, Azure integration, OAuth 2.1/MCP discovery, CIMD/DCR compatibility, PKCE, refresh rotation, operational burden, key rotation and incident recovery. Prefer a vetted provider if the requirements and cost fit. Do not hand-roll crypto.
- [ ] Decide issuer URL, distinct REST/MCP resource identifiers, JWT/JWKS versus opaque token introspection, client registration (CIMD/DCR/pre-registered), consent model, scope matrix, redirect URI policy, token lifetime and account-linking UX.
- [ ] Write contract types and mocked principal fixtures; document exact exported names and public response schemas. Record ADR/decision evidence before splitting workers.
- [ ] Reserve integrator-only files: `apps/api/src/index.ts`, `apps/api/package.json`, API lockfile, `apps/api/host.json`, shared auth barrel/config/types, `.github/workflows/*`.

### Wave 1: parallel and non-overlapping workers (after P0)

**P1: OAuth discovery and consent flow**

**Owns:** `apps/api/src/features/externalOAuth/metadata*`, `authorization*`, corresponding tests.

- [ ] Add authorization-server metadata (and endpoint routes as required by selected issuer), protected-resource metadata for the public API, supported PKCE methods, redirect validation, client identification and explicit user consent.
- [ ] Where delegating to an external issuer, build only the necessary WhatFees account/consent integration; do not write a second authorization server.
- [ ] Tests: metadata discovery, valid client, unknown client, unsafe redirect, invalid state, missing S256, issuer mismatch, denied consent, login failure.

**P2: Token lifecycle and revocation**

**Owns:** `apps/api/src/features/externalOAuth/tokens*`, dedicated Cosmos repository and tests; coordinate any persistence schema with P0 before editing.

- [ ] Implement/verifiably configure short-lived access tokens, refresh rotation, grant revocation, client/scope/resource binding, signing-key rotation or introspection, and cleanup.
- [ ] Store only hashes of persisted refresh secrets; never log bearer/refresh tokens or entire consent grants.
- [ ] Tests: replayed authorization code, reuse of rotated refresh token, wrong resource, expired/revoked grant, concurrent refresh, rollback after failed persistence, rotation failure and logout behavior.

**P3: Principal verification and authorization**

**Owns:** `apps/api/src/lib/externalAccess/verify*`, `scope*`, plus focused tests. P0 owns contract exports.

- [ ] Implement the frozen `validateExternalAccessToken` and scope resolver. Enforce issuer/audience/scopes and shared-workspace membership before domain service entry.
- [ ] Explicitly keep legacy frontend cookie-auth routes on their existing resolver; no broad enablement of bearer fallback in `resolveUserId`.
- [ ] Tests: other user's data, unrelated workspace, removed membership mid-request, non-owner writes, wrong/missing scopes, token intended for other audience.

**P4: Public read API routes**

**Owns:** `apps/api/src/features/publicApi/*`, `apps/api/src/functions/publicApi*.ts` (new files only), own route tests.

- [ ] Define versioned `GET /api/v1/me`, `GET /api/v1/workspaces`, `GET /api/v1/lots`, `GET /api/v1/lots/{lotId}`, `GET /api/v1/sales`, `GET /api/v1/portfolio/summary`, and `POST /api/v1/pricing/target`. POST pricing is pure calculation, not a write.
- [ ] Authenticate using mockable frozen principal port, never arbitrary caller-supplied user IDs. Use typed filters, bounded cursor pagination, UTC/date and currency conventions, input limits, safe projections and consistent errors.
- [ ] Tests: correct scope, pagination stability, invalid filters, empty account, missing lot, huge requests, unauthorized and rate-limited requests.

**P5: Domain read ports + calculation extraction**

**Owns:** dedicated `apps/api/src/features/publicApi/services/*` and necessary new deployment-safe pure shared domain files; coordinate shared code changes with P0.

- [ ] Reuse sales and sync-snapshot repository rules without reintroducing stale generation reads or exposing unfiltered snapshots.
- [ ] Move/repackage only required pure calculation logic from `src/domain/calculations*.ts` / `src/domain/whatnot-fees.ts` into deployable shared code, if needed. **Do not import runtime web source files from compiled API output** or duplicate fee/target-margin formulas.
- [ ] Cover mixed CAD/USD, taxes/fees, Whatnot tiers, pack/box accounting, pricing target definition, historical edits and partial/missing data with cross-boundary parity fixtures.
- [ ] Prevent N+1/large Cosmos scans; bound fan-out and measure representative request units.

**P6: OpenAPI specification, examples and contract tests**

**Owns:** `docs/api/openapi.v1.yaml`, `docs/api/README.md`, spec lint/contract fixtures under isolated API test files.

- [ ] Author OpenAPI 3.1 contracts for the intended v1 endpoints and OAuth scopes. Examples must be sanitized and use realistic CAD/USD and workspace shapes.
- [ ] Ensure every documented response/status matches a route test and error schema; add smoke snippets for OAuth + fetch, pagination and 429 retry.
- [ ] Document version/deprecation policy, privacy, rate limits, quotas, entitlements and client terms. Avoid publishing API credentials.
- [ ] Spec lint/contract tests should run offline and must fail on route/schema drift.

### Wave 2: integrator-owned seams, once P1-P6 are validated

- [ ] Wire function registrations, config, dependencies and lockfile only once; adjust CI/deploy path filters and documentation from a single integration branch.
- [ ] Validate OAuth callback and token audience with **real dev issuer**, not only mocks; verify logout/revoke end to end. Record whether issuer supports ChatGPT CIMD, DCR or a registered client.
- [ ] Validate representative cross-client traffic (REST + MCP) against same domain ports while ensuring separate audiences.
- [ ] Run focused suites, `npm run verify:api`; if shared/web calculations change, also `npm run verify:all`. Review staged package: all runtime modules must live under `apps/api` deployment root.
- [ ] Perform independent security review of scopes, replay, redirect attacks, token storage, revoked workspace access, excessive payloads and cross-user access.

## 4. Future write API (separate explicit approval)

- [ ] Introduce `POST /api/v1/lots`, `PATCH /api/v1/lots/{lotId}`, `POST /api/v1/sales/preview`, `POST /api/v1/sales` and stock modifications only after read-only production hardening.
- [ ] Require least-privilege write scopes, verified role, idempotency keys, bounded conflict retries, ETag/version checks, audit trail and stable sale identity.
- [ ] Reuse existing atomic sale/inventory guard, Shopify/Whatnot reconciliation and sealed/open-box accounting. No arbitrary snapshot overwrite; no unconfirmed destructive action.

## 5. Execution, integration and release gates

- **Parallelism:** Wave 1 P1-P6 can run concurrently *after P0* because file ownership is disjoint. P4/P5 use frozen mocked ports; P1/P2/P3 share issuer decisions but avoid editing each other's files.
- **Agent handoff format:** branch/commit SHA, owned files, requirements checklist, tests that failed before change and pass after, commands/results, migration/runtime notes, unresolved risk. An agent summary alone is not evidence.
- **Merge order:** P0 -> P3/P5 -> P4/P6 -> P1/P2 (or P1/P2 earlier where independent) -> integrator wiring; rebase/cherry-pick, resolve cross-module breakage and rerun full gate after the final merge. No overlapping worker edits to lockfiles/config/index.
- **Release:** feature-flagged dev issuer/API first; prod requires signed-off threat model, OAuth interoperability check, cost budget, token/key operational runbook, rollback and independent review.
- **Definition of done:** An external client can complete PKCE login, receive a resource-bound token, fetch its *own* versioned REST data, fail safely with wrong scopes/resource/expired/revoked tokens, and never access a removed workspace. OpenAPI and automated tests agree.

## 6. Official references (revalidate before implementation)

- [OpenAI MCP/plugin OAuth requirements](https://developers.openai.com/plugins/build/auth)
- [MCP authorization and current protocol](https://modelcontextprotocol.io/specification/)
- [OAuth 2.0 Authorization Server Metadata (RFC 8414)](https://www.rfc-editor.org/rfc/rfc8414)
- [OAuth 2.0 Protected Resource Metadata (RFC 9728)](https://www.rfc-editor.org/rfc/rfc9728)
- [OAuth 2.0 Resource Indicators (RFC 8707)](https://www.rfc-editor.org/rfc/rfc8707)
- [OpenAPI Specification](https://spec.openapis.org/oas/latest.html)
