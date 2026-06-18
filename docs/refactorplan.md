# Calcul8 Refactor Plan

Regenerated on 2026-06-15 from a live repo scan after the previous top-three backlog was cleared. Completed UI, bilingual contract, realtime recovery, system configuration, bracket battle, singles-image work, personal Whatnot credential erasure, production CORS wildcard rejection, and release-gate coverage are intentionally removed from this plan.

This is the active top-three technical and security backlog, plus a staged test-maintenance follow-up discovered while promoting all tests into `verify:all`. Each item should be implemented TDD-style, verified against the affected package, and deleted from this file once the repo proves it is done.

## Top 3 Priorities

### 1. Stop Tracking Generated Release Artifacts And Enforce Artifact Hygiene

**Priority:** Critical security and release hygiene.

**Scan finding:** `app-release-signed.apk.idsig` is tracked in git even though `.gitignore` blocks most Android release byproducts (`app-release-*.apk`, `*.aab`, `*.jks`, `*.keystore`, signing credentials, and Play service-account files). The release scripts and security checks already exist, but the ignore policy does not catch this `.idsig` artifact class and the repository currently contains one generated release file.

**Risk:** Release artifacts and signing byproducts are easy to treat as harmless, but committed build outputs are public forever and can drift from the reproducible release path. This weakens the security posture around Play release automation and makes future secret hygiene reviews less trustworthy.

**Implementation direction:**

- Remove tracked generated Android release artifacts after confirming they are not required source files.
- Extend `.gitignore` and the existing security/release checks to block `.idsig` and any other generated signing sidecars emitted by the current TWA/Bubblewrap flow.
- Add or update a focused test/check so future generated release files fail locally before commit.
- Keep `public/.well-known/assetlinks.json` tracked; it is deploy source, not a generated signing secret.

**Done when:** `git ls-files` shows no generated `.apk`, `.aab`, `.idsig`, `.jks`, `.keystore`, or credential material; the release/security check fails on a fixture or staged sample for those artifact classes; `npm run verify` or the smallest release/security verification command covering the changed guard passes.

### 2. Finish Session-First Auth By Removing Normal-Flow Bearer Fallback

**Priority:** Critical auth boundary hardening.

**Scan finding:** `src/app-core/auth/storage.ts` has moved Google ID token and CSRF handling out of persistent `localStorage`, but it still exposes module-level Google ID token state. Normal app helpers such as `src/app-core/methods/ui/workspace/workspace-api.ts` still use session-preferred authenticated headers that can fall back to bearer-style auth after the session bootstrap path. The API side already has cookie-backed sessions and CSRF support in `apps/api/src/lib/auth/sessions.ts`, `apps/api/src/lib/auth/csrf.ts`, and `apps/api/src/lib/auth/resolveUser.ts`.

**Risk:** Keeping provider ID tokens available to normal app API calls leaves more browser-side auth material in play than the session-first design needs. It also makes auth behavior harder to reason about across personal, workspace, sync, and Whatnot flows.

**Implementation direction:**

- Centralize the final auth-mode decision in the frontend auth/API client helpers instead of allowing feature helpers to choose bearer fallback ad hoc.
- Limit Google ID token use to explicit sign-in/session-bootstrap or re-auth flows; normal app, workspace, sync, and Whatnot API calls should use session cookies plus CSRF where required.
- Keep legacy token hydration only as a cleanup path that clears old persistent keys without re-persisting secrets.
- Preserve provider-neutral server auth and require CSRF for unsafe cookie-authenticated requests.

**Done when:** Normal frontend API calls no longer read or send the stored Google ID token after session bootstrap; tests prove unsafe cookie-authenticated requests include CSRF; tests prove normal calls do not use bearer fallback; legacy `localStorage` auth keys are still cleared safely during hydration.

### 3. Make Cross-Document Writes Recoverable, Starting With Whatnot Confirmation And Workspace Creation

**Priority:** High data-integrity and recovery hardening.

**Scan finding:** The repo still has important multi-document workflows that are intentionally guarded but not fully recoverable. `apps/api/src/features/whatnot/importConfirm.ts` claims a review batch, writes sales plus Whatnot mappings, then completes the batch; once any write starts, failures leave the batch in `processing` instead of releasing it. `apps/api/src/lib/cosmos/workspaceRepository.ts` creates a workspace document before owner membership and attempts rollback if membership creation fails, but a rollback failure can still leave a half-created workspace lifecycle state.

**Risk:** These paths protect against duplicate concurrent work, but partial failures can leave users with stuck imports, invisible or half-created resources, or support-only recovery. Because the app is local-first and workspace-scoped, recovery must be deterministic and scope-safe rather than relying on silent retries or manual Cosmos edits.

**Implementation direction:**

- Add failing tests for mid-confirm Whatnot write failures after the first sale/mapping write and for workspace creation where owner membership or cleanup fails.
- Introduce explicit recoverable states, idempotency keys, or compensation records so retried requests can finish, skip already-written work, or expose a clear repair path without duplicating sales or leaking workspace data.
- Keep optimistic concurrency at repository boundaries and translate Cosmos conflicts into stable API responses.
- Emit high-signal telemetry for partial write states so production recovery is observable.

**Done when:** Retrying a partially failed Whatnot confirmation is deterministic and does not duplicate sales or mappings; stuck `processing` batches have a tested recovery path; workspace creation cannot leave an active workspace without owner membership or marks the partial state explicitly; API tests cover conflict, retry, and cleanup-failure paths.

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
