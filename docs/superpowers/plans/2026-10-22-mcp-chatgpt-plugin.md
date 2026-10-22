# WhatFees MCP Server and ChatGPT Plugin Implementation Plan

> **Status:** Plan only. No code, plugin submission, production rollout or infrastructure changes are authorized by this document.
>
> **For coding agents:** Read `AGENTS.md`, `docs/codingstandard.md`, and `docs/repo-organization.md`. Create a task-specific [ ]/[x] checklist with verification evidence. Use isolated worktrees, focused tests, scoped commits and independent final review. Follow this plan as a set of deliverable slices, not one giant prompt.

**Goal:** Let an authenticated WhatFees customer use ChatGPT or any compatible MCP client to inspect sales, inventory, lots, portfolio performance and calculate target selling prices. Add controlled write actions only in a later approval-gated release.

**Related plan:** [OAuth 2.1 and Public API](2026-10-22-oauth-public-api.md). It owns the OAuth issuer, public REST, cross-client principal/permissions contract and shared domain ports. **This plan does not build another authorization server or another fee engine.**

**Current code (verified 2026-10-22):** TypeScript Azure Functions API in `apps/api` with Cosmos DB. Read endpoints and underlying services already cover scoped sync data, sales, workspaces and card search. `src/domain/calculations*.ts` and `src/domain/whatnot-fees.ts` contain fee/pricing rules. `apps/api/host.json` uses HTTP `routePrefix: api`. Transport compatibility and exact public MCP URL are **not yet decided**.

## 1. Scope, constraints and decisions

- [ ] MVP is remote MCP using supported Streamable HTTP, public HTTPS, JSON-RPC tool discovery/calls and OAuth-protected customer data. Confirm protocol version/client support at implementation time.
- [ ] Server should be client-neutral and usable with non-ChatGPT MCP clients. ChatGPT plugin packaging is a separate adapter/distribution layer.
- [ ] Reuse existing Azure Functions app and its deploy workflow if feasible, no second container or paid service without an explicit trade-off decision.
- [ ] Never trust workspace IDs, user IDs, roles or fee settings supplied as authorization context by an LLM. Obtain principal only from an independently verified OAuth token and recheck workspace membership in services.
- [ ] For the MVP, all tools reading private data require appropriate OAuth scopes. No anonymous inventory, sales, portfolio or workspace enumeration. A standalone calculation tool may be made anonymous later, only by explicit policy.
- [ ] MCP calls domain ports shared with REST, not internal HTTP endpoints or raw Cosmos/sync dumps. Bound query sizes, result shapes, token usage and costs.
- [ ] No Shopify/Whatnot commands or write actions in the first production launch. Existing game, live-sale, inventory, fee, external integration and subscription behavior must not regress.
- [ ] Maintain current versioned account data boundaries and avoid cross-user/cross-workspace leakage, prompt injection through card/product names, and leaks in logs/tool errors.

### Transport architecture spike (M0 gate)

Compare **official TypeScript MCP SDK hosted in an Azure HTTP Function** versus **Azure Functions native MCP bindings**:

- Required: stateless/distributed scaling behavior, request headers, per-user OAuth bearer validation, OAuth challenge headers, streaming and client compatibility, reliable Azure Flex Consumption deployment, current MCP protocol version and operational cost.
- Azure's native MCP endpoint may be ` /runtime/webhooks/mcp ` and normally uses a Functions system key, which ChatGPT cannot treat as customer OAuth. **Do not disable system-key protection and expose customer tools anonymously.** Prefer a direct SDK/HTTP route or vetted OAuth gateway if native bindings cannot satisfy per-user OAuth.
- Check whether ` /api/mcp ` (subject to existing route prefix), custom domains and well-known discovery URLs route correctly. Do not assume ` /mcp ` is available until a smoke test proves it.
- Write a short ADR with tested transport choice, request/response examples, deployment consequences and rejection reasons. M0 freezes the hosting seam before any worker registers production routes.

## 2. Shared contract with the OAuth/Public API plan

The API plan's P0 integrator freezes:

- `ExternalPrincipal` = authenticated user ID, client ID, **MCP resource audience**, allowed scopes and optional grant/token ID/expiry.
- `validateExternalAccessToken({ bearerToken, expectedResource, requiredScopes })`: typed principal or 401/403, no implicit cookie or Google-ID-token fallback.
- `resolveExternalScope({ principal, workspaceId? })`: personal or active workspace only; final membership recheck before output/action.
- Narrow, typed domain read services for account, workspaces, lots, sales, portfolio and pricing; service calls take principal/scope, not arbitrary user IDs.
- Initial scopes: `account:read`, `workspaces:read`, `lots:read`, `sales:read`, `pricing:calculate`. Future writes are separate `lots:write` and `sales:write` grants.
- Distinct configured REST and MCP resource identifiers, a shared OAuth issuer, and strong audience checks. Never forward an MCP access token to REST as if it were a general-purpose credential.

**Parallelism rule:** MCP agents may build with a fake authenticated principal and mocked domain ports *immediately after P0*, but must not enable a private tool against real data until the real issuer, token verifier and workspace guards pass integration tests. Changes to the frozen contract require joint approval from both integrators.

## 3. MVP tool catalog (versioned, user-goal oriented)

| Tool | Input | Result | Required scope |
| --- | --- | --- | --- |
| `get_account` | none | Connected account identity, minimal metadata; consider ChatGPT profile annotation | `account:read` |
| `list_workspaces` | page/cursor | Accessible personal/shared workspace choices | `workspaces:read` |
| `list_lots` | workspace, filters, cursor, limit | Scoped paged lots with compact inventory status | `lots:read` |
| `get_lot_details` | lot ID, workspace | Authorized lot detail and relevant stock/pricing context | `lots:read` |
| `get_sales` | workspace, lot/date filters, cursor, limit | Compact authorized sales | `sales:read` |
| `get_portfolio_summary` | workspace, date range/currency | Revenue, cost, profit and clearly labeled currency | `sales:read` |
| `calculate_target_price` | cost, desired profit %, fee context/currency | Price and an itemized explanation using the same WhatFees math | `pricing:calculate` |
| `search_cards` | game, query, bounded limit, filters | Sanitized card catalog search results | `lots:read` for MVP; revisit separate public scope later |

- [ ] Validate tool names/titles/descriptions, strict input/output schemas, required-versus-optional arguments, invalid IDs and tool errors before publication.
- [ ] Add accurate `readOnlyHint: true`, `destructiveHint: false`, `openWorldHint` values, and applicable per-tool OAuth `securitySchemes`. Annotations do not substitute for server authorization.
- [ ] Use concise `structuredContent` with explicit decimal/currency, date/timezone, `nextCursor` and truncation semantics. No full snapshot dumps or unbounded sale lists.
- [ ] Define `calculate_target_price` profit percentage semantics from current WhatFees app behavior and golden tests; distinguish markup versus margin before freezing tool semantics. Reuse Whatnot tier and shipping/fee rules. Do not invent currency conversions or live fee rates.
- [ ] Avoid calling card names, sale comments or integration metadata trusted instructions; treat them as untrusted data and return only sanitized fields.

## 4. Parallel execution packets and ownership

One subagent per packet, on an isolated branch/worktree. Shared registration, package manifests, lockfiles and configuration belong **only to the integrator**.

### Wave 0 (M0: integrator transport decision + API P0 frozen contract)

- [ ] Spike current MCP SDK/protocol, Azure native MCP extension and ChatGPT dev connections. Test OAuth error-header support, request lifecycle, statelessness and Function deployment packaging.
- [ ] Publish ADR, exact `McpToolContext` interface backed by frozen `ExternalPrincipal`, and one mockable domain-port contract.
- [ ] Reserve integrator-owned files: `apps/api/src/index.ts`, `apps/api/package.json`, API package lock, `apps/api/host.json`, shared auth/config/barrels and deploy workflows. No worker edits these.

### Wave 1 (M1-M5 run independently after M0)

**M1: MCP transport and protocol tests**

**Owns:** `apps/api/src/features/mcp/transport/*`, `apps/api/src/functions/mcp*.ts` (new files; no entrypoint registrations), corresponding tests.

- [ ] Implement initialize, tool listing, calls, content negotiation, protocol errors, required HTTP headers and bounded request bodies using the chosen transport.
- [ ] Inject a mockable principal verifier; respond with correct OAuth discovery/challenge for missing authorization, and scoped 401/403 behavior.
- [ ] Test malformed JSON-RPC, tool not found, bad method, bad body, wrong protocol version, parallel calls, reconnect and stateless scale-out.

**M2: Tool definitions and response schemas**

**Owns:** `apps/api/src/features/mcp/catalog/*`, schema/annotation tests.

- [ ] Define all MVP tools, input/output JSON schemas, per-tool scopes, useful descriptions, read-only annotations and minimal result contracts.
- [ ] Unit-test required fields, bounds, unknown fields, annotations, schema compatibility and stable tool names.
- [ ] Provide pure descriptors/registrations consumed by M1. Do not implement Cosmos lookups in the catalog layer.

**M3: Read tools (account, workspaces, lots and sales)**

**Owns:** `apps/api/src/features/mcp/tools/read*`, own tests.

- [ ] Implement account/workspace/lot/sale tool handlers using mocked external domain ports, without reimplementing authentication or workspace resolution.
- [ ] Test personal vs shared workspace, revoked membership during a read, missing/foreign IDs, stable pagination, stale snapshot generation, large inputs, empty lists and output redaction.
- [ ] Use API plan P5 domain implementations when available; until then mock the *same frozen types*.

**M4: Analytics and pricing tools**

**Owns:** `apps/api/src/features/mcp/tools/analytics*`, own tests.

- [ ] Implement portfolio and target-price tools via existing or P5-extracted pure calculations, with goldens shared with frontend/REST, not new arithmetic.
- [ ] Test platform fees, Whatnot tiers, target-profit semantics, fixed fees, CAD/USD, buyer shipping, zero/high fees, missing source data and numeric precision.
- [ ] Never recompute portfolio summaries by downloading entire workspace sync snapshots into the MCP transport.

**M5: Plugin package and quality scenarios**

**Owns:** `integrations/chatgpt-whatfees/*`, `docs/mcp/*`, pure manifest/test fixtures. No server config edit.

- [ ] Create portable plugin package (`plugin.json`, `mcp.json`) following current OpenAI schemas, metadata, logo references and onboarding description; omit secrets/credential material.
- [ ] Define private connection steps, OAuth consent/reconnect, install/uninstall and common task examples.
- [ ] Prepare **five positive and three negative** review scenarios including cross-workspace rejection and attempted unsafe changes; reviewer test-account setup uses synthetic data and privately stored credentials.
- [ ] Do not publish/submit during implementation. Recheck package/review rules at release.

### Wave 2: integrate when both tracks are green

- [ ] Integrator wires SDK/transport, tool registry, OAuth verifier, routes, Azure deployment and feature flags **once** after reviewing M1-M5.
- [ ] Confirm real authenticated calls with the API plan's issuer; reject wrong MCP audience, REST-only token, wrong scopes, expired/revoked token, workspace access revoked after issuance.
- [ ] Use MCP Inspector for initialize/tools/list/tools/call (and negative paths), then connect a private ChatGPT plugin against a reachable **dev** HTTPS endpoint.
- [ ] Demonstrate account linking, ChatGPT choosing the right workspace, multi-turn follow-ups, token refresh, handling ambiguous lot names and bounded result sizes.
- [ ] Run API-focused suites and `npm run verify:api`. When shared calculations/types/web code change, run `npm run verify:all`; inspect the deployed `apps/api` staged package for imports outside deploy root.
- [ ] Independent reviewer audits protocol handling, tenant isolation, the price engine parity, token/log leakage, cost controls and negative test evidence.

## 5. Optional write tools (separate review, never implicit in MVP)

- [ ] Define `create_lot`, `update_lot`, `preview_sale`, `record_sale`, and `update_inventory` only once underlying API/domain writes are safely exposed.
- [ ] Require explicit user-confirmation UX, least-privilege write scopes, stable operation/idempotency IDs, optimistic concurrency and audit log. Tool annotations correctly report write/destructive potential.
- [ ] Keep `preview_sale` side-effect-free, and reject repeated/different-payload sale IDs instead of duplicating sales.
- [ ] Use the same inventory guard, sealed-box/pack consumption and Shopify/Whatnot reconciliation as the app. Never mutate a whole sync snapshot as a shortcut.
- [ ] Test concurrent actors, retries/timeouts, revoked memberships, orphaned updates and provider failures before enabling writes.

## 6. Integrator and release checklist

- **Suggested agent order:** P0/M0 decisions -> M1/M2/M3/M4/M5 independently -> joint REST/MCP contract integration -> dev end-to-end -> independent security/product review.
- **Parallel agent handoff:** branch + commit SHA, owned files, completed/pending checklist, failing-first test evidence if relevant, exact validation commands/results, risky scenarios, outstanding questions. Mark blockers honestly.
- **Merge policy:** agents do not directly push main or touch shared manifests. Integrator reviews and merges one work packet at a time, runs the combined tests, and records the diff and commit. A broken dev connection is not a completed milestone.
- **Metrics:** MCP request error/latency/tool-use rates, Cosmos RUs, token/call costs, safe limits and OAuth denial outcomes. Never log full prompts, private sales bodies or access tokens by default.
- **Release gates:** no unauthenticated private reads; no cross-tenant access; no plugin release before independently validated OAuth, performance budget, rollback path, monitored dev connection and explicit owner approval.
- **Definition of done (read-only):** an external MCP client and private ChatGPT plugin can authenticate to a real dev WhatFees account, discover 8 tools, read only authorized user/workspace data, calculate prices that match WhatFees, handle errors correctly, and survive reconnect. No write tool is reachable.

## 7. Official references (revalidate before coding)

- [OpenAI: Build an MCP server](https://developers.openai.com/plugins/build/mcp-server)
- [OpenAI: MCP plugin authentication](https://developers.openai.com/plugins/build/auth)
- [OpenAI: Package a plugin](https://developers.openai.com/plugins/build/plugins)
- [OpenAI: Plugin review and publication](https://developers.openai.com/plugins/deploy/submission)
- [MCP protocol specification](https://modelcontextprotocol.io/specification/)
- [Azure Functions MCP bindings and native webhook key requirements](https://learn.microsoft.com/en-us/azure/azure-functions/functions-bindings-mcp)
