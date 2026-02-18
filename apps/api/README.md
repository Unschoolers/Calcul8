# WhatFees API (Azure Functions)

This is a separate deployable backend project for:

- `GET /api/entitlements/me`
- `POST /api/entitlements/verify/{provider}`
- `POST /api/entitlements/verify-play`
- `POST /api/sync/pull`
- `POST /api/sync/push`
- `POST /api/admin/migrations/run`
- `GET /api/admin/migrations/runs`

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
   - `MIGRATIONS_ADMIN_KEY` (recommended in prod for admin migration endpoint)

4. Run:

```bash
npm run start:build
```

## Auth behavior (current scaffold)

- Dev-only bypass is supported via `x-user-id` header when:
  - `API_ENV=dev`
  - `AUTH_BYPASS_DEV=true`

This is intentionally temporary. Replace with Google token validation before production rollout.

If `Authorization: Bearer <google-id-token>` is provided, API now validates it against Google token info endpoint
and uses `sub` as `userId`.

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
  - `id`: `entitlement:<userId>`
  - `userId`
  - `hasProAccess`
  - `purchaseSource`
  - `updatedAt`

- `sync_data` container (incremental model):
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

## Run a migration

`POST /api/admin/migrations/run`

Request body:

```json
{
  "migrationId": "first_migration",
  "dryRun": false,
  "note": "manual smoke test"
}
```

Headers:
- `Authorization: Bearer <google-id-token>` (required)
- `x-migration-key: <MIGRATIONS_ADMIN_KEY>` (required in prod if configured)

List runs:

`GET /api/admin/migrations/runs?migrationId=first_migration&limit=20`

Headers:
- `Authorization: Bearer <google-id-token>` (required)
- `x-migration-key: <MIGRATIONS_ADMIN_KEY>` (required in prod if configured)

## Security notes

- Never put Cosmos keys in frontend code.
- Restrict CORS via `ALLOWED_ORIGINS`.
- Move to real auth (Google OIDC validation) for prod.
- Never commit `local.settings.json`; keep secrets in Function App settings and GitHub secrets.
