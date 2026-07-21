# Session-First Auth Completion Design

**Date:** 2026-07-21  
**Status:** Approved

## Goal

Make Google bearer authentication structurally unavailable to normal frontend API traffic while preserving it for the two explicit provider boundaries that require it: Google sign-in/session bootstrap and Google Play purchase verification.

## Current Gap

Normal `session-preferred` requests no longer send an `Authorization` header, but the shared mode-based header helper still reads the in-memory Google ID token before deciding not to attach it. The `FrontendAuthMode` argument also lets feature helpers select `bearer-required`, leaving a future regression path even though current normal callers choose session mode.

## Architecture

Replace the mode-based API with purpose-specific helpers:

- `buildSessionHeaders(extraHeaders?)` copies caller headers without importing, reading, or attaching a Google ID token. Normal app, account, workspace, sync, Whatnot, sales, configuration, Stripe, and entitlement-status requests use this helper or rely on the shared fetch client directly.
- `buildBootstrapBearerHeaders(googleIdToken, extraHeaders?)` attaches a validated non-empty token. Only the explicit `/auth/me` session-bootstrap flow may call it.
- Google Play purchase verification remains an explicit provider boundary and may attach the supplied Google ID token directly. It is not a normal app API request.

Remove `FrontendAuthMode` and mode arguments from sync request interfaces. Normal feature code must not be able to opt into bearer authentication through a generic transport option.

The shared fetch client continues to:

- send `credentials: include` by default;
- add the in-memory CSRF token to unsafe cookie-authenticated requests;
- refresh CSRF state from authenticated responses;
- refresh an expired server session through `/auth/refresh` without bearer fallback;
- clear auth state when refresh fails.

## Allowed Bearer Boundaries

Frontend bearer construction is allowed only in:

1. the dedicated session-bootstrap header helper used by `/auth/me`;
2. Google Play purchase verification.

Backend `allowBearerAuth: true` is allowed only for the matching auth bootstrap and Play verification handlers. All normal authenticated API routes remain session-first and require CSRF for unsafe cookie-authenticated methods.

## Testing And Enforcement

- Update auth-session tests to prove session headers preserve caller headers without attaching bearer data and bootstrap headers attach bearer only when explicitly supplied a token.
- Keep the existing CSRF tests proving unsafe requests receive `x-csrf-token` and explicit CSRF headers are preserved.
- Update sync tests and types after removing auth-mode parameters.
- Add a source-level architecture guard that restricts frontend bearer-header construction, bootstrap-header use, and backend `allowBearerAuth: true` to the approved files.
- Run frontend auth, shared API, sync, workspace, entitlement, and Play-purchase tests plus frontend/API strict typechecks.
- Run `npm run verify:all` before completion.

## Error And Recovery Behavior

- Missing bootstrap tokens produce no bearer header and preserve the existing unsuccessful bootstrap result.
- A normal request receiving `401` attempts the existing cookie-session refresh or explicit bootstrap path owned by its auth coordinator; generic feature transports do not silently switch authentication modes.
- Offline, retry, notification, entitlement cache, workspace recovery, and sign-out behavior remain unchanged.

## Completion Criteria

- No normal frontend request helper reads or sends a Google ID token.
- No generic feature/network API accepts an auth-mode selector.
- Bearer header construction and backend bearer acceptance are limited by tests to auth bootstrap and Play verification.
- Unsafe cookie-authenticated requests continue to carry CSRF protection.
- Legacy persisted token hydration remains cleanup-only, and tokens are not written back to browser storage.
- Focused and full verification pass with no behavior regressions.
