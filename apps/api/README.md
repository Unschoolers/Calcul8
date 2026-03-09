# WhatFees API (Azure Functions)

This is a separate deployable backend project for:

- `GET /api/entitlements/me`
- `POST /api/entitlements/verify/{provider}`
- `POST /api/entitlements/verify-play`
- `POST /api/billing/checkout-session`
- `POST /api/billing/webhook`
- `POST /api/sync/pull`
- `POST /api/sync/push`
- `POST /api/ops/sync/import-user`
- `POST /api/workspaces`
- `GET /api/workspaces/{workspaceId}/members`
- `POST /api/workspaces/{workspaceId}/members`
- `DELETE /api/workspaces/{workspaceId}/members/{memberUserId}`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `POST /api/auth/logout-all`
- `POST /api/migrations/run`
- `GET /api/migrations/runs`

It is designed to stay independent from the frontend deployment (GitHub Pages).

## Local setup

1. Install dependencies:

```bash
cd apps/api
npm install
```

2. Copy settings template:

```bash
cp local.settings.json.example local.settings.json
```

3. Fill `local.settings.json` with your Cosmos values.
   Also set:
   - `GOOGLE_OAUTH_CLIENT_ID` (your Google OAuth Web client ID)
   - `GOOGLE_PLAY_PACKAGE_NAME` (Android package id, for example `io.whatfees`)
   - `GOOGLE_PLAY_PRO_PRODUCT_IDS` (comma-separated in-app product ids that unlock Pro)
   - `GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL`
   - `GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY`
   - `COSMOSDB_MIGRATION_RUNS_CONTAINER_ID` (optional, default `migration_runs`)
   - `COSMOSDB_SESSIONS_CONTAINER_ID` (optional, default `sessions`)
   - `SYNC_IMPORT_SOURCE_COSMOSDB_ENDPOINT` (optional, defaults to `COSMOSDB_ENDPOINT`)
   - `SYNC_IMPORT_SOURCE_COSMOSDB_KEY` (optional, defaults to `COSMOSDB_KEY`)
   - `SYNC_IMPORT_SOURCE_COSMOSDB_DATABASE_ID` (optional, defaults to `COSMOSDB_DATABASE_ID` or `whatfees`)
   - `SYNC_IMPORT_SOURCE_COSMOSDB_SYNC_CONTAINER_ID` (optional, defaults to `COSMOSDB_SYNC_CONTAINER_ID` or `sync_data`)
   - `SESSION_COOKIE_NAME` (optional, default `whatfees_session`)
   - `SESSION_IDLE_TTL_SECONDS` (optional, default `604800`)
   - `SESSION_ABSOLUTE_TTL_SECONDS` (optional, default `2592000`)
   - `SESSION_TOUCH_INTERVAL_SECONDS` (optional, default `900`)
   - `MIGRATIONS_ADMIN_KEY` (recommended in prod for admin migration endpoint)
   - Stripe checkout (optional):
     - `STRIPE_SECRET_KEY`
     - `STRIPE_WEBHOOK_SECRET`
     - `STRIPE_ONE_TIME_PRICE_ID`
     - `STRIPE_SUCCESS_URL`
     - `STRIPE_CANCEL_URL`

4. Run:

```bash
npm run start:build
```

## Auth behavior

- API supports session cookies + bearer token fallback.
- Session cookie:
  - `HttpOnly`
  - `SameSite=Lax` in `dev`, `SameSite=None; Secure` in `prod`
  - sliding idle expiration + absolute expiration
- CSRF protection for cookie-authenticated unsafe methods (`POST`/`DELETE`):
  - client must send header `x-csrf-token`
  - API returns/refreshes this token in response header `x-csrf-token` on authenticated responses
  - if `Authorization: Bearer ...` is used, bearer auth path remains accepted as fallback
- Bearer fallback:
  - `Authorization: Bearer <google-id-token>`
  - API validates token via Google token info endpoint and uses `sub` as `userId`.
  - Valid bearer auth can bootstrap/refresh the session cookie.
- Missing/invalid auth returns `401`.
- Frontend requests should use `credentials: include` so cookie auth works cross-origin.

## Sync scope behavior

- `POST /api/sync/pull` and `POST /api/sync/push` support optional `workspaceId`.
- Personal sync scope:
  - partition key: `<googleSub>` (legacy personal scope format kept for compatibility).
- Workspace sync scope:
  - partition key: `ws:<workspaceId>`.
- Workspace sync reads/writes are authorized only when caller has active workspace membership.

## Admin sync import (prod -> dev)

- `POST /api/ops/sync/import-user` copies sync data from a source `userId` into the caller account.
- This endpoint is restricted in code to admin user id `107850224060485991888`.
- Write target always uses `COSMOSDB_*` settings (your local/dev environment).
- Read source uses `SYNC_IMPORT_SOURCE_COSMOSDB_*` when provided; otherwise it falls back to `COSMOSDB_*`.

## Known limitations (current snapshot)

- Workspace entitlement licensing is not enforced yet (membership-gated today).
- Workspace create and owner-membership create are separate writes (non-transactional).
- Duplicate workspace create conflict handling should be hardened to always return `409`.

## Entitlement verification flow

1. Frontend gets a Google ID token.
2. Frontend sends `POST /api/entitlements/verify-play` with:
   - `purchaseToken` (required)
   - `productId` (optional if configured in API env)
   - `packageName` (optional if configured in API env)
3. API verifies purchase with Google Play Developer API.
4. On success API upserts entitlement in Cosmos (`hasProAccess=true`, `purchaseSource=google_play`).
5. API stores a hashed purchase token record and rejects token reuse across different users.
6. API acknowledges the Google Play purchase when needed.
7. Frontend calls `GET /api/entitlements/me` to read current access.

Provider routing note:
- Preferred endpoint is now `POST /api/entitlements/verify/{provider}`.
- Current supported provider is `play` (so `POST /api/entitlements/verify/play`).
- Legacy `POST /api/entitlements/verify-play` remains supported for backward compatibility.

Note:
- `GET /api/entitlements/me` now auto-creates a baseline entitlement row on first authenticated request
  (`hasProAccess=false`) so each user has a record from first login.

## Cosmos containers

Recommended partition key for both containers: `/userId`.

- `entitlements` container:
  - user entitlement docs:
    - `id`: `entitlement:<userId>`
    - `userId`
    - `hasProAccess`
    - `purchaseSource`
    - `updatedAt`
  - Google Play purchase docs:
    - `id`: `play_purchase:<purchaseTokenHash>`
    - `docType`: `play_purchase`
    - `userId`
    - purchase metadata fields
  - purchase verification idempotency docs:
    - `id`: `purchase_verify:<userId>:<provider>:<idempotencyKey>`
    - `docType`: `purchase_verification_result`
    - cached response payload
  - workspace docs:
    - `id`: `workspace:<workspaceId>`
    - `docType`: `workspace`
    - `workspaceId`
    - `name`
    - `ownerUserId`
  - workspace membership docs:
    - `id`: `m:<userId>:<workspaceId>`
    - `docType`: `workspace_membership`
    - `userId`
    - `workspaceId`
    - `role`: `owner|admin|member`
    - `status`: `active|disabled|removed`
    - `updatedAt`

- `sync_data` container (incremental model):
  - partition key (`userId`) is a scope key:
    - personal: `<googleSub>`
    - workspace: `ws:<workspaceId>`
  - preset docs:
    - `id`: `sync:preset:<userId>:<presetId>`
    - `docType`: `sync_preset`
    - `userId`
    - `presetId`
    - `preset`
    - `sales`
    - `version`
    - `updatedAt`
  - meta doc:
    - `id`: `sync:meta:<userId>`
    - `docType`: `sync_meta`
    - `userId`
    - `version`
    - `updatedAt`

- `migration_runs` container:
  - `id`: `migration_run:<migrationId>:<timestamp>:<random>`
  - `docType`: `migration_run`
  - `migrationId`
  - `status`: `running|succeeded|failed`
  - `dryRun`
  - `startedAt`
  - `completedAt`
  - `triggeredByUserId`
  - `note`
  - `result` / `errorMessage`
  - optional marker docs for smoke/metadata migrations:
    - `id`: `migration_marker:<migrationId>`
    - `docType`: `migration_marker`
    - `migrationId`
    - `updatedAt`
    - `lastRunId`

- `sessions` container:
  - `id`: `<random-session-id>`
  - `docType`: `session`
  - `userId`
  - `createdAt`
  - `lastSeenAt`
  - `idleExpiresAt`
  - `absoluteExpiresAt`

## Run a migration

`POST /api/migrations/run`

Request body:

```json
{
  "migrationId": "first_migration",
  "dryRun": false,
  "note": "manual smoke test"
}
```

Headers:
- `x-migration-key: <MIGRATIONS_ADMIN_KEY>` (required in prod)
- `x-admin-id: <optional-audit-label>` (optional)

List runs:

`GET /api/migrations/runs?migrationId=first_migration&limit=20`

Headers:
- `x-migration-key: <MIGRATIONS_ADMIN_KEY>` (required in prod)
- `x-admin-id: <optional-audit-label>` (optional)

Dry-run behavior:
- `dryRun=true`: runs `analyze` only and returns preview plan (no migration data writes).
- `dryRun=false`: runs `analyze`, then `apply` with that plan.
- Both modes still write a `migration_run` audit record.

## Security notes

- Never put Cosmos keys in frontend code.
- Restrict CORS via `ALLOWED_ORIGINS`.
- Google token validation is required for all authenticated routes.
- Never commit `local.settings.json`; keep secrets in Function App settings and GitHub secrets.
