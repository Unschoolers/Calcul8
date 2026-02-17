# WhatFees

PWA profitability calculator (Vue 3 + Vuetify + TypeScript + Vite).

## Local development

```bash
npm ci
npm run dev
```

Frontend env for Play purchase flow:

- `VITE_API_BASE_URL=https://<your-function-app>.azurewebsites.net/api`
- `VITE_GOOGLE_CLIENT_ID=<google web client id>`
- `VITE_PLAY_PRO_PRODUCT_ID=<play in-app product id, e.g. pro_access>`
- `VITE_PURCHASE_PROVIDER` (optional debug override: `auto` default, or `play`/`stripe`)

## Quality checks

```bash
npm run verify
```

## Production build

```bash
npm run build:prod
```

## Google Play (TWA)

See:

- `docs/google-play-release.md`

Windows one-command helper:

```powershell
npm run release:play
```

## Security

- `SECURITY.md`
