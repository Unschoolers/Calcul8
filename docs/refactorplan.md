# Calcul8 Refactor Plan

Regenerated on 2026-05-29 from the live repo and updated on 2026-06-12 after the account deletion credential-erasure slice was completed. Completed UI, bilingual contract, realtime recovery, system configuration, bracket battle, singles-image work, and personal Whatnot credential erasure are intentionally removed from this plan.

This is the active top-three backlog only. Each item should be implemented TDD-style, verified against the affected package, and deleted from this file once the repo proves it is done.

## Top 3 Priorities

### 1. Production CORS Must Reject Credentialed Wildcards

- Priority: Critical - auth boundary.
- Finding: `ALLOWED_ORIGINS=*` reflects any request origin while also setting `Access-Control-Allow-Credentials: true` and exposing `x-csrf-token`.
- Evidence: `apps/api/src/lib/http.ts`, `apps/api/src/lib/config.ts`.
- Risk: a hostile origin could read session-related response headers and issue cookie-authenticated writes if wildcard CORS reaches production.
- SOLID direction: centralize CORS policy in config/http helpers and make production validation fail fast instead of spreading environment checks across handlers.
- Done when:
  - `API_ENV=prod` rejects wildcard origins at config load or HTTP guard time.
  - Non-prod wildcard behavior remains deliberate and covered.
  - HTTP/config tests cover prod wildcard rejection, explicit prod allowlists, and preflight behavior.

### 2. Release And CI Gates Must Cover Every Shipping Entry Point

- Priority: High - release reliability.
- Finding: release and deploy checks have improved, but the gates are still split by entry point and path filters can miss shared or root shipping changes.
- Evidence: `package.json`, `.github/workflows/ci.yml`, `.github/workflows/deploy-api-prod.yml`, `.github/workflows/deploy-realtime-prod.yml`, `.github/workflows/deploy-pages.yml`, `scripts/release-google-play.ps1`, `vite.config.ts`, `spectator.html`.
- Risk: a web, spectator, API, realtime, or shared-contract change can ship without the verifier that actually protects the affected runtime.
- SOLID direction: keep one release preflight contract and let workflows call it, instead of duplicating partial package knowledge in each workflow.
- Done when:
  - `release:play` runs the full required preflight or requires an explicit, logged skip.
  - CI/deploy path filters include all root HTML entry points, shared contracts, scripts, and package locks that affect the built app.
  - A lightweight workflow test or script dry-run proves the expected verifier runs for web, API, realtime, and shared-contract changes.
