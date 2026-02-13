# calcul8 API (Azure Functions)

This is a separate deployable backend project for:

- `GET /api/entitlements/me`
- `POST /api/sync/pull`
- `POST /api/sync/push`

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

## Cosmos containers

Recommended partition key for both containers: `/userId`.

- `entitlements` container:
  - `id`: `entitlement:<userId>`
  - `userId`
  - `hasProAccess`
  - `updatedAt`

- `sync_data` container:
  - `id`: `sync:<userId>`
  - `userId`
  - `presets` (array)
  - `salesByPreset` (object of arrays)
  - `version`
  - `updatedAt`

## Security notes

- Never put Cosmos keys in frontend code.
- Restrict CORS via `ALLOWED_ORIGINS`.
- Move to real auth (Google OIDC validation) for prod.
