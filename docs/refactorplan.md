# Calcul8 Refactor Plan

Updated on 2026-07-16 after the critical reliability audit. Completed UI, bilingual contract, realtime recovery, system configuration, bracket battle, singles-image work, complete account erasure, production CORS and distributed rate-limit hardening, release-gate coverage, generated artifact hygiene, billing/session/Whatnot concurrency fixes, atomic local snapshot application, public-session access revalidation, and the two cross-document recovery workflows are intentionally removed from this plan.

This is the active technical and security backlog, plus a staged test-maintenance follow-up discovered while promoting all tests into `verify:all`. Each item should be implemented TDD-style, verified against the affected package, and deleted from this file once the repo proves it is done.

## Top Priorities

### 1. Finish Session-First Auth By Removing Normal-Flow Bearer Fallback

**Priority:** Critical auth boundary hardening.

**Scan finding:** `src/app-core/auth/storage.ts` has moved Google ID token and CSRF handling out of persistent `localStorage`, but it still exposes module-level Google ID token state. Normal app helpers such as `src/app-core/methods/ui/workspace/workspace-api.ts` still use session-preferred authenticated headers that can fall back to bearer-style auth after the session bootstrap path. The API side already has cookie-backed sessions and CSRF support in `apps/api/src/lib/auth/sessions.ts`, `apps/api/src/lib/auth/csrf.ts`, and `apps/api/src/lib/auth/resolveUser.ts`.

**Risk:** Keeping provider ID tokens available to normal app API calls leaves more browser-side auth material in play than the session-first design needs. It also makes auth behavior harder to reason about across personal, workspace, sync, and Whatnot flows.

**Implementation direction:**

- Centralize the final auth-mode decision in the frontend auth/API client helpers instead of allowing feature helpers to choose bearer fallback ad hoc.
- Limit Google ID token use to explicit sign-in/session-bootstrap or re-auth flows; normal app, workspace, sync, and Whatnot API calls should use session cookies plus CSRF where required.
- Keep legacy token hydration only as a cleanup path that clears old persistent keys without re-persisting secrets.
- Preserve provider-neutral server auth and require CSRF for unsafe cookie-authenticated requests.

**Done when:** Normal frontend API calls no longer read or send the stored Google ID token after session bootstrap; tests prove unsafe cookie-authenticated requests include CSRF; tests prove normal calls do not use bearer fallback; legacy `localStorage` auth keys are still cleared safely during hydration.

## Planned Test-Maintenance Follow-Up

### Standardize Test Fixtures With Shared Builders

**Priority:** High test maintainability and contract safety.

**Scan finding:** Promoting all tests into `verify:all` exposed repeated raw fixture drift across web and API tests. Many tests still hand-build partial `Lot`, `Sale`, Whatnot review rows, Cosmos documents, app contexts, storage mocks, and component `this` contexts. Strict test typechecking caught missing fee-profile fields, stale object shapes, and unclear default-fee assumptions, but the fixes added local casts and repeated fixture fragments that will drift again without shared builders.

**Risk:** Raw fixtures make large refactors expensive because unrelated tests fail on schema noise instead of behavior. They also hide important business assumptions, especially money math where default Whatnot fees and no-fee scenarios must be explicit. If the app types keep evolving while tests copy object literals, `verify:all` will stay useful but become noisy and slower to repair.

**Implementation direction:**

1. Create core web test builders: `makeLot`, `makeSale`, `makeSinglesPurchase`, fee helpers such as `WHATNOT_FEES` and `NO_FEES`, and shared storage/fetch mocks.
2. Migrate money/domain tests first, especially calculations, computed portfolio data, portfolio forecast, sales helpers, and fee-sensitive fixtures.
3. Create API test builders for Cosmos documents, repository records, request contexts, auth claims, entitlements, sales, sync snapshots, and Whatnot import rows.
4. Create UI/component harness helpers for partial Vue `this` contexts, component method calls, mocked window/document/storage, and table/dialog/window method tests.
5. Document fixture rules, then replace raw `Lot`, `Sale`, Whatnot, Cosmos, and app-context object literals gradually so tests express intent instead of full schemas.

**Done when:** New tests use builders by default for shared domain/API/UI shapes; fee assumptions are explicit in money tests; component method tests use harness helpers instead of ad hoc `Record<string, any>` contexts; the most fragile existing raw fixture clusters are migrated; `npm run verify:all` remains green after each migration slice.
