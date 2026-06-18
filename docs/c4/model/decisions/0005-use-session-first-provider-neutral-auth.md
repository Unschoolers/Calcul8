# 5. Session-first auth

Date: 2026-05-19

## Status

Accepted

## Context

The app signs users in with Google today, but auth-sensitive API code should not couple the whole architecture to one identity provider or to long-lived browser-stored secrets.

Unsafe cookie-authenticated writes need CSRF protection. Production CORS must also be strict enough that credentialed requests cannot be read by arbitrary origins.

## Decision

Keep shared auth code session-first and provider-neutral. Identity provider details should stay at the boundary where sessions are created or verified.

Unsafe cookie-authenticated API requests require CSRF protection, and production CORS must not allow credentialed wildcard origins.

## Consequences

Future identity-provider changes should not rewrite business APIs.

Browser-stored sensitive material must be minimized.

Production CORS wildcard behavior remains a hard safety issue until guarded by API config/tests.
