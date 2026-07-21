# Session-First Auth Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make normal frontend API traffic structurally session-only while retaining bearer authentication solely for Google session bootstrap and Google Play purchase verification.

**Architecture:** Replace the generic mode-driven header builder with separate session and bootstrap APIs so normal call sites cannot opt into bearer authentication. Remove auth-mode parameters from sync, retain the existing cookie/CSRF request pipeline, and add source-boundary tests that fail if bearer authentication spreads beyond the two approved provider boundaries.

**Tech Stack:** Vue 3, TypeScript strict mode, Vitest, Azure Functions, Node.js

## Global Constraints

- Bearer authentication remains allowed only for Google session bootstrap and Google Play purchase verification.
- Normal frontend requests must neither read nor send the stored Google ID token.
- Cookie credentials, CSRF injection and refresh, offline handling, auth-expiry recovery, and scope isolation must remain unchanged.
- Frontend and backend must remain strict-TypeScript compatible.
- Documentation must describe the implemented boundary and preserve the separation between technical backlog and architecture truth.

---

### Task 1: Split Session and Bootstrap Header APIs

**Files:**
- Modify: `tests/auth-session.test.ts`
- Modify: `src/app-core/auth/session.ts`
- Modify: `src/app-core/auth/index.ts`

**Interfaces:**
- Produces: `buildSessionHeaders(extraHeaders?: Record<string, string>): Record<string, string>`
- Produces: `buildBootstrapBearerHeaders(googleIdToken: string, extraHeaders?: Record<string, string>): Record<string, string>`
- Removes: `FrontendAuthMode` and `buildAuthenticatedHeaders`

- [ ] **Step 1: Write failing API tests**

Replace the mode-based header tests with tests that call the desired APIs directly:

```ts
test("buildSessionHeaders preserves caller headers without reading or attaching Google auth", () => {
  setStoredGoogleIdToken("google-token");
  const headers = buildSessionHeaders({ "Content-Type": "application/json" });
  assert.deepEqual(headers, { "Content-Type": "application/json" });
});

test("buildBootstrapBearerHeaders attaches only an explicitly supplied token", () => {
  setStoredGoogleIdToken("stored-token-that-must-not-be-read");
  const headers = buildBootstrapBearerHeaders("bootstrap-token", {
    "Content-Type": "application/json"
  });
  assert.deepEqual(headers, {
    "Content-Type": "application/json",
    Authorization: "Bearer bootstrap-token"
  });
});

test("buildBootstrapBearerHeaders omits authorization for an empty token", () => {
  assert.deepEqual(buildBootstrapBearerHeaders("   "), {});
});
```

- [ ] **Step 2: Verify the tests fail for the missing API**

Run: `npm run test -- tests/auth-session.test.ts`

Expected: FAIL because `buildSessionHeaders` and `buildBootstrapBearerHeaders` are not exported.

- [ ] **Step 3: Implement the separated APIs**

In `src/app-core/auth/session.ts`, remove the Google-token import and mode type, then add:

```ts
export function buildSessionHeaders(
  extraHeaders: Record<string, string> = {}
): Record<string, string> {
  return { ...extraHeaders };
}

export function buildBootstrapBearerHeaders(
  googleIdToken: string,
  extraHeaders: Record<string, string> = {}
): Record<string, string> {
  const headers = { ...extraHeaders };
  const token = googleIdToken.trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}
```

Export both functions from `src/app-core/auth/index.ts` while retaining `handleExpiredAuthState`.

- [ ] **Step 4: Verify the new API tests pass**

Run: `npm run test -- tests/auth-session.test.ts`

Expected: Header-unit tests pass; bootstrap integration may remain red until Task 2 migrates its import.

### Task 2: Make Normal Request Call Sites Session-Only

**Files:**
- Modify: `src/app-core/methods/config-io.ts`
- Modify: `src/app-core/methods/ui/auth/account.ts`
- Modify: `src/app-core/methods/ui/auth/auth-session.ts`
- Modify: `src/app-core/methods/ui/common/api-client.ts`
- Modify: `src/app-core/methods/ui/entitlements/entitlements-status-service.ts`
- Modify: `src/app-core/methods/ui/entitlements/entitlements-stripe.ts`
- Modify: `src/app-core/methods/ui/workspace/workspace-api.ts`
- Modify: `src/app-core/methods/ui/sync/sync-network.ts`
- Modify: `src/app-core/methods/ui/sync/sync-session.ts`
- Modify: `tests/sync-service.test.ts`

**Interfaces:**
- Consumes: the two header APIs from Task 1
- Changes: `requestCloudSyncPull(baseUrl: string, workspaceId?: string): Promise<Response>`
- Changes: `requestCloudSyncPush(baseUrl: string, payload: SyncPayload): Promise<Response>`

- [ ] **Step 1: Write failing sync boundary expectations**

Change the two sync assertions so an auth-mode argument is forbidden:

```ts
assert.equal(requestCloudSyncPush.mock.calls[0]?.length, 2);
assert.equal(requestCloudSyncPull.mock.calls[0]?.length, 2);
```

- [ ] **Step 2: Verify sync tests fail on the existing third argument**

Run: `npm run test -- tests/sync-service.test.ts`

Expected: FAIL because the current calls include `"session-preferred"` as a third argument.

- [ ] **Step 3: Migrate the bootstrap request explicitly**

In `src/app-core/methods/ui/auth/auth-session.ts`, build the `/auth/me` headers from the token already owned by the auth bootstrap flow:

```ts
headers: buildBootstrapBearerHeaders(getStoredGoogleIdToken())
```

The URL, credentials, timeout, CSRF response handling, session-user storage, and expired-auth handling remain unchanged.

- [ ] **Step 4: Migrate normal requests to the session-only helper**

At each normal call site, replace mode-driven calls with:

```ts
headers: buildSessionHeaders(existingHeaders)
```

Do not pass a request URL and do not read a Google token. Preserve all existing content types, idempotency keys, conditional headers, credentials, retry behavior, error translation, and CSRF behavior.

- [ ] **Step 5: Remove auth modes from sync**

Implement these signatures:

```ts
export async function requestCloudSyncPull(
  baseUrl: string,
  workspaceId?: string
): Promise<Response>

export async function requestCloudSyncPush(
  baseUrl: string,
  payload: SyncPayload
): Promise<Response>
```

Use `buildSessionHeaders({ "Content-Type": "application/json" })` inside both functions. In `createSyncSession`, call pull with `(baseUrl, workspaceId)` and push with `(baseUrl, payload)` only.

- [ ] **Step 6: Verify focused request and sync behavior**

Run: `npm run test -- tests/auth-session.test.ts tests/fetch-with-retry-csrf.test.ts tests/sync-service.test.ts tests/ui-sync.test.ts tests/ui-shared.test.ts tests/config-io-methods.test.ts tests/entitlements-status-sync-service.test.ts tests/entitlements-stripe-service.test.ts`

Expected: PASS, including bootstrap bearer, session-only sync, and unsafe-request CSRF coverage.

### Task 3: Enforce the Provider Boundary and Align Documentation

**Files:**
- Create: `tests/auth-boundaries.test.ts`
- Modify: `docs/refactorplan.md`
- Modify: `apps/api/README.md`

**Interfaces:**
- Consumes: `buildBootstrapBearerHeaders` from Task 1
- Enforces: the approved frontend and backend bearer allowlists

- [ ] **Step 1: Write a failing architecture test**

Create a recursive TypeScript source scan with these allowlists:

```ts
const allowedBootstrapHelperFiles = new Set([
  "src/app-core/auth/index.ts",
  "src/app-core/auth/session.ts",
  "src/app-core/methods/ui/auth/auth-session.ts"
]);
const allowedFrontendAuthorizationFiles = new Set([
  "src/app-core/auth/session.ts",
  "src/app-core/methods/ui/entitlements/purchase-verification.ts"
]);
const allowedBackendBearerFiles = new Set([
  "apps/api/src/features/auth/handlers.ts",
  "apps/api/src/features/entitlements/verifyPlayHandler.ts"
]);
```

Fail for any non-allowlisted production TypeScript file containing `buildBootstrapBearerHeaders`, a Bearer authorization literal, or `allowBearerAuth: true`. Also assert that production sources contain neither `FrontendAuthMode` nor `buildAuthenticatedHeaders`.

- [ ] **Step 2: Verify the guard catches the current generic API**

Run: `npm run test -- tests/auth-boundaries.test.ts`

Expected: FAIL while the old generic mode or disallowed bearer use remains.

- [ ] **Step 3: Complete boundary cleanup until the guard passes**

Remove any remaining generic auth-mode symbols and migrate any missed normal caller to `buildSessionHeaders`. Do not expand the allowlists; a new bearer use requires a separate product/security decision.

- [ ] **Step 4: Update technical documentation**

In `docs/refactorplan.md`, mark the session-first bearer-fallback item complete and retain only genuinely outstanding fixture/test debt. In `apps/api/README.md`, state that normal authenticated routes use the server session cookie, unsafe requests require CSRF, and bearer authentication is accepted only by `/auth/me` bootstrap and Google Play verification.

- [ ] **Step 5: Verify the complete change locally**

Run:

```powershell
npm run test -- tests/auth-session.test.ts tests/auth-boundaries.test.ts tests/fetch-with-retry-csrf.test.ts tests/sync-service.test.ts tests/ui-sync.test.ts tests/ui-shared.test.ts tests/config-io-methods.test.ts tests/entitlements-status-sync-service.test.ts tests/entitlements-stripe-service.test.ts
npm run typecheck
npm run typecheck:tests:web
npm --prefix apps/api run test
npm --prefix apps/api run typecheck
npm run verify:all
git diff --check
```

Expected: every command exits with status 0. If Docker-dependent C4 validation is unavailable, report that environment limitation separately rather than treating it as an auth regression.

- [ ] **Step 6: Commit the completed implementation**

```powershell
git add src/app-core tests/auth-session.test.ts tests/auth-boundaries.test.ts tests/sync-service.test.ts docs/refactorplan.md apps/api/README.md
git commit -m "refactor(auth): enforce session-first request boundary"
```
