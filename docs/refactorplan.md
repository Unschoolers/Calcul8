# Calcul8 Refactor TODO

Regenerated on 2026-05-18 from a frontend, API, realtime, CI, dependency, and TypeScript 7 readiness scan.

This file only lists remaining Critical and High priority work. Completed, medium, and low priority cleanup is intentionally omitted.

## Critical

### 1. Account Deletion Must Remove All Personal Credentials

- Finding: Account deletion removes entitlement, profile, Play purchases, sync data, and sessions, but it does not remove the personal Whatnot connection row that stores encrypted OAuth access and refresh tokens.
- Evidence: `apps/api/src/features/account/deleteHandler.ts`, `apps/api/src/lib/cosmos/whatnotRepository.ts`.
- Risk: deleted accounts can leave recoverable third-party credentials in Cosmos.
- Next: add a personal Whatnot connection deletion path, make workspace-owned connections an explicit decision, and add `accountDelete` coverage proving personal Whatnot credentials are erased.

### 2. Production CORS Must Not Allow Credentialed Wildcards

- Finding: `ALLOWED_ORIGINS=*` reflects any origin while also allowing credentials and exposing `x-csrf-token`.
- Evidence: `apps/api/src/lib/http.ts`, `apps/api/src/lib/config.ts`.
- Risk: a hostile origin could read a session CSRF token and issue cookie-authenticated writes if wildcard origins reach production.
- Next: reject wildcard origins when `API_ENV=prod`, or disable credentials and exposed auth headers for wildcard mode; add HTTP guard tests for prod wildcard behavior.

### 3. Shared Sync Needs Atomic Compare-And-Swap And Non-Destructive Conflict Recovery

- Finding: API sync push checks `clientVersion` against a read snapshot, then writes presets/meta without an ETag or transactional guard; frontend stale-version recovery can pull and apply cloud state over dirty local changes.
- Evidence: `apps/api/src/features/sync/pushHandler.ts`, `apps/api/src/lib/cosmos/syncSnapshotIncrementalRepository.ts`, `src/app-core/methods/ui/sync/sync-conflict-policy.ts`, `src/app-core/methods/ui/sync/sync-apply.ts`.
- Risk: concurrent workspace pushes can both pass and overwrite/delete each other, and conflict recovery can become a data-loss path.
- Next: make sync meta the compare-and-swap authority with Cosmos `IfMatch` or a transactional batch where possible; add concurrent same-version push tests expecting one success and one `409`; add frontend tests for stale conflicts with dirty local sales/lots/game changes and require a resolver or preserved pending edits before applying cloud.

## High

### 5. Move Every Package To A TypeScript 6 Baseline And Add TypeScript 7 Native Preview Checks

- Finding: root and API are already on TypeScript 6, but realtime and CardSync still use TypeScript 5.9.3; TypeScript 7 beta ships as `@typescript/native-preview` with `tsgo`, and TS7 adopts TS6 defaults and hard-errors deprecated flags.
- Evidence: `package.json`, `apps/api/package.json`, `apps/realtime/package.json`, `CardSync/package.json`, `tsconfig.json`, `apps/api/tsconfig.json`, `apps/realtime/tsconfig.json`, `CardSync/tsconfig.json`; TypeScript 7 beta notes at `https://devblogs.microsoft.com/typescript/announcing-typescript-7-0-beta/`.
- Risk: toolchain drift will make the TS7 move harder, especially around explicit `rootDir`, explicit `types`, `moduleResolution`, and TS6 deprecations.
- Next: upgrade realtime and CardSync to TypeScript 6.0.3 or newer; add explicit TS7 readiness scripts using `@typescript/native-preview` and `tsgo` side-by-side with `tsc`; keep `typescript` as the stable compiler until TS7 is published under the main package; run TS7 checks for root, API, realtime, and CardSync in a non-blocking or opt-in CI lane first.

### 6. Bring Dependencies To Current Latest Deliberately

- Finding: npm reports newer packages across root, API, realtime, and CardSync. Known desired updates include `@azure/cosmos` 4.9.3 and `@azure/functions` 4.14.0; other current latests include Vite 8.0.13, Vitest 4.1.6, Vue 3.5.34, Vuetify 4.0.7, Three 0.184.0, `vite-plugin-pwa` 1.3.0, `ws` 8.20.1, and `dotenv` 17.4.2.
- Evidence: `package.json`, `package-lock.json`, `apps/api/package.json`, `apps/api/package-lock.json`, `apps/realtime/package.json`, `apps/realtime/package-lock.json`, `CardSync/package.json`, `CardSync/package-lock.json`; latest versions checked with `npm outdated` on 2026-05-18.
- Risk: stale SDKs and build tools hide compatibility work until a release crunch; major build/test upgrades can also break CI if taken casually.
- Next: update Azure SDKs first (`@azure/cosmos` 4.9.3, `@azure/functions` 4.14.0), then upgrade runtime/build/test packages in small batches. Each batch must run the affected verifier: `npm run verify`, `npm --prefix apps/api run verify`, `npm --prefix apps/realtime run verify`, and `npm --prefix CardSync run build`.

### 7. Cosmos Optimistic Concurrency Must Cover Sales, Whatnot, And Public Sessions

- Finding: sale/live-pricing `baseVersion`, Whatnot review confirmation, and public game session publishing still rely on read-before-write or full upserts without ETag/status-transition guards.
- Evidence: `apps/api/src/lib/cosmos/salesRepository.ts`, `apps/api/src/features/whatnot/importConfirm.ts`, `apps/api/src/features/whatnot/saleBuilders.ts`, `apps/api/src/lib/cosmos/whatnotRepository.ts`, `apps/api/src/features/game/publicSessionHandler.ts`, `apps/api/src/lib/cosmos/gamePublicSessionRepository.ts`.
- Risk: two writers can both pass version checks, double-submit can process a Whatnot batch twice, and a stale live public-session publish can regress an ended spectator session.
- Next: replace read-then-upsert flows with ETag-based replace/create or status-claim transitions; make Whatnot confirm idempotent by `batchId`; require monotonic public-session snapshot versions or ETags; add concurrent writer and stale-live-after-ended regression tests.

### 9. Release And CI Filters Must Cover All Shipping Entry Points

- Finding: `release:play` runs web verification but not API/realtime verification, and CI path filters omit `spectator.html` even though Vite builds it as a shipping entry.
- Evidence: `package.json`, `scripts/release-google-play.ps1`, `docs/google-play-release.md`, `vite.config.ts`, `spectator.html`, `.github/workflows/ci.yml`.
- Risk: Android releases can ship while API/realtime contracts are broken, and spectator-only entry changes can miss CI.
- Next: make `release:play` run `npm run verify:all` by default or require an explicit skip; add a dry-run preflight test for the release script; add `spectator.html` to CI path filters or simplify filters for root HTML entries.
