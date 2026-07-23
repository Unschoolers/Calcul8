# 11. Own the Android runtime with Capacitor

Date: 2026-07-23

## Status

Accepted

## Context

The Bubblewrap TWA release depended on Android Browser Helper billing and did not
provide a durable native boundary for Google Play Billing 8, Credential Manager, or
future Android requirements. Shipping policy now requires target API 36 and Billing
Library 8 or later.

The product must retain one Vue implementation across web and Android. Native code
should remain small provider infrastructure rather than becoming a second app.

## Decision

Build Android from the source-controlled Capacitor 8.4.0 project in `apps/android`,
targeting API 36. Native integrations are Kotlin plugins behind typed TypeScript ports:

- BillingClient 8.3.0 queries products, purchases, and restores. It returns purchase
  facts but never grants access.
- Credential Manager obtains a Google ID token. The API session bootstrap remains the
  authentication authority.
- Browser implementations remain behind the same ports.

The API remains authoritative for token verification, entitlement facts, cookie
sessions, CSRF, and authorization. Signing material and generated release artifacts
are never source controlled.

## Consequences

Android upgrades are explicit Gradle changes guarded by CI dependency inspection,
native tests, lint, and bundle construction. The team owns a small Kotlin surface,
while most product behavior stays in shared TypeScript and Vue code.

Bubblewrap is absent from active release automation. Its rollback inputs remain until
the Capacitor artifact passes the internal-testing acceptance matrix.
