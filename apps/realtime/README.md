# WhatFees Realtime Gateway

Small websocket fan-out service for shared workspaces.

This app is designed to sit beside:

- `apps/api` for authoritative HTTP writes and Cosmos persistence
- the frontend for websocket subscriptions on shared workspace lots

## Why it exists

The current app polls `sales` and `live-pricing` routes. This gateway is the next step toward realtime for shared workspaces:

1. Frontend still loads initial state from the existing API.
2. Frontend opens a websocket and subscribes to a workspace lot room.
3. `apps/api` keeps saving sales and live pricing exactly as it does today.
4. After a successful write, `apps/api` can notify this service via `POST /internal/publish`.
5. This service broadcasts the change to connected clients in that room.

Personal spaces can stay on the current polling path.

## Suggested room keys

- `workspace:<workspaceId>:lot:<lotId>`

## Local setup

```bash
cd apps/realtime
npm install
npm run build
npm start
```

`npm start` and `npm run start:dev` automatically read `apps/realtime/.env.local`.

Default local file:

```dotenv
PORT=8080
REALTIME_ALLOWED_ORIGIN=http://localhost:5173
REALTIME_DEV_ALLOW_UNAUTH_SUBSCRIBE=true
```

Defaults:

- websocket endpoint: `ws://localhost:8080/socket`
- health endpoint: `http://localhost:8080/healthz`
- internal publish endpoint: `POST http://localhost:8080/internal/publish`

## One-command Azure bootstrap

From the repo root:

```bash
npm run realtime:bootstrap
```

That script will:

1. build the realtime TypeScript app
2. build the Docker image
3. push the image to `calcul8teregistry`
4. create `whatfees-prod-env` if needed
5. create or update `whatfees-realtime`

It prompts for:

- `REALTIME_INTERNAL_API_KEY`
- `REALTIME_TOKEN_SECRET`

## Environment variables

- `PORT`
  - optional
  - default `8080`
- `REALTIME_INTERNAL_API_KEY`
  - optional in local development
  - required in production
  - required header for publish calls:
    - `x-realtime-key: <value>`
    - or `Authorization: Bearer <value>`
- `REALTIME_ALLOWED_ORIGIN`
  - optional
  - comma-separated allowlist of accepted browser origins
  - when set, websocket upgrade requests from other origins are rejected
- `REALTIME_DEV_ALLOW_UNAUTH_SUBSCRIBE`
  - optional
  - default `true` outside production
  - if `false`, clients must provide a signed token
- `REALTIME_TOKEN_SECRET`
  - optional in local development
  - required in production
  - when set, subscribe requests can include a signed token

## Subscribe protocol

Clients connect to `/socket` and send:

```json
{
  "type": "subscribe",
  "rooms": ["workspace:ws_123:lot:1771041815496"]
}
```

Optional token form:

```json
{
  "type": "subscribe",
  "rooms": ["workspace:ws_123:lot:1771041815496"],
  "token": "<signed token>"
}
```

Server responses:

```json
{ "type": "subscribed", "rooms": ["workspace:ws_123:lot:1771041815496"] }
{ "type": "error", "message": "..." }
{ "type": "pong" }
```

Broadcast payload shape:

```json
{
  "type": "event",
  "room": "workspace:ws_123:lot:1771041815496",
  "eventType": "sale.upserted",
  "data": {
    "id": 1773773650958,
    "version": 3
  }
}
```

## Internal publish protocol

`POST /internal/publish`

```json
{
  "room": "workspace:ws_123:lot:1771041815496",
  "eventType": "sale.upserted",
  "data": {
    "id": 1773773650958,
    "version": 3,
    "updatedAt": "2026-03-17T18:54:21.782Z"
  }
}
```

You can also send `rooms: string[]` to fan out to multiple rooms in one call.

## Production notes

- Host this on a dedicated long-lived Node runtime such as Azure Container Apps or App Service.
- Use `wss://ws.whatfees.ca` from the browser.
- Keep REST as the source of truth.
- Keep polling as a reconnect / fallback path until websocket flow is proven stable.
- Keep production at one replica until a shared backplane owns room membership and publish fan-out.

## Smoke checks

From the repo root, a deployed gateway can be checked with:

```bash
REALTIME_SMOKE_BASE_URL=https://ws.whatfees.ca \
REALTIME_INTERNAL_API_KEY=<shared internal publish key> \
REALTIME_TOKEN_SECRET=<shared subscribe token secret> \
REALTIME_SMOKE_ORIGIN=https://app.whatfees.ca \
npm run smoke:realtime
```

The smoke runner checks `/healthz`, opens a signed WebSocket subscription, publishes an internal event to the same room, and fails unless the event is delivered back over the socket.

## GitHub Actions deployment

The repo includes:

- CI validation through `.github/workflows/ci.yml`
- production deployment through `.github/workflows/deploy-realtime-prod.yml`

Expected GitHub environment: `prod-realtime`

Required variables:

- `AZURE_CLIENT_ID_PROD`
- `AZURE_TENANT_ID_PROD`
- `AZURE_SUBSCRIPTION_ID_PROD`
- `AZURE_CONTAINER_APP_NAME_REALTIME_PROD`
- `AZURE_CONTAINER_APP_ENVIRONMENT_PROD`

Required secrets:

- `REALTIME_INTERNAL_API_KEY_PROD`
- `REALTIME_TOKEN_SECRET_PROD`

The deploy workflow uses GitHub OIDC via `azure/login@v2`, so you do not need a stored Azure credentials JSON secret.

The workflow currently hardcodes these production values to keep setup minimal:

- resource group: `DefaultResourceGroup-CCAN`
- registry: `calcul8teregistry`
- allowed origin: `https://whatfees.ca`
  - update this to include every real frontend host, for example:
    - `https://app.whatfees.ca,https://whatfees.ca`
- min replicas: `1`
- max replicas: `1`
