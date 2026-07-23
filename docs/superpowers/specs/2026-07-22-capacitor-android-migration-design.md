# Capacitor Android Migration Design

**Date:** 2026-07-22
**Status:** Approved

## Goal

Replace the Bubblewrap-generated Trusted Web Activity release with a source-controlled Capacitor Android application that reuses the existing Vue application, targets Android 16/API 36, uses Google Play Billing Library 8.3.0, and preserves session-first authentication.

## Decision

The browser/PWA deployment remains a first-class product and continues to use web APIs. Android becomes a Capacitor 8 application whose native project is committed under `apps/android`. Bubblewrap is removed from the release path after an internal Play test proves login, purchases, recovery, and app navigation.

Capacitor is a runtime boundary, not a second application. Vue components, domain services, API contracts, workspace behavior, offline storage, and entitlement projection stay shared. Platform-specific behavior is limited to small typed ports in `src/app-core/platform` and narrow native plugins in the Android project.

## Android Runtime

- Application id remains `io.whatfees` so the existing Play listing, signing lineage, products, purchases, and Digital Asset Links identity remain valid.
- Capacitor 8.4.0 is pinned across `@capacitor/core`, `@capacitor/cli`, and `@capacitor/android`.
- The native project lives at `apps/android` through `capacitor.config.ts`.
- Web assets are copied from `dist`; production must not load `server.url`.
- Android uses Capacitor's HTTPS local scheme with hostname `app.whatfees.ca`. This retains the deployed web origin as the logical first-party origin while still serving bundled assets.
- `minSdkVersion` is 24, `compileSdkVersion` is 36, and `targetSdkVersion` is 36.
- Release logs and WebView debugging are disabled outside debug builds.

## Purchase Architecture

Introduce a `PlayBillingPort` with three operations:

```ts
export interface PlayPurchase {
  productId: string;
  purchaseToken: string;
  state: "purchased" | "pending";
}

export interface PlayBillingPort {
  isAvailable(): Promise<boolean>;
  listPurchases(): Promise<PlayPurchase[]>;
  purchase(productId: string): Promise<PlayPurchase>;
}
```

The web adapter retains Digital Goods API and `PaymentRequest` compatibility. The Android adapter calls a local Capacitor plugin. Entitlement orchestration consumes only `PlayBillingPort`; it does not inspect browser payloads or native BillingClient objects.

The Android plugin wraps Google Play Billing Library 8.3.0 and supports only the current non-consumable `pro_access` flow:

- connect with automatic service reconnection;
- enable pending one-time purchases;
- query one-time `ProductDetails`;
- launch exactly one in-flight purchase;
- return purchased or pending results with product id and purchase token;
- query owned one-time purchases for restore and already-owned recovery;
- map user cancellation, unavailable products, disconnection, pending state, and developer errors to stable plugin error codes.

The API remains authoritative. The native plugin does not grant Pro access and does not acknowledge purchases independently. The existing API verifies the purchase token, enforces token ownership, projects entitlement state, and acknowledges only after durable entitlement handling.

## Authentication Architecture

Google Identity Services inside an embedded WebView is not the Android authentication boundary. Add an `IdentityCredentialPort` whose Android implementation calls a local Capacitor plugin backed by Android Credential Manager and Sign in with Google.

The native plugin returns a short-lived Google ID token to the existing auth coordinator. The coordinator uses that token only for the existing `/auth/me` bootstrap request. The API validates the token and issues the existing HttpOnly session and refresh cookies plus CSRF token. All normal API traffic remains cookie + CSRF authenticated; native migration must not introduce normal-flow bearer authentication or persist a new long-lived bearer credential.

The Android WebView origin is `https://app.whatfees.ca`, the production API remains `https://api.whatfees.ca`, and production cookies remain `Secure; SameSite=None`. CORS continues to allow only configured origins with credentials. Tests must prove that Android bootstrap still converges on the same session-first state as browser bootstrap.

## Release And CI

`release:play` will:

1. run `npm run verify:all`;
2. build production web assets;
3. synchronize Capacitor assets and native version metadata;
4. assert API 36 and Billing 8.3.0 from Gradle configuration and the resolved dependency graph;
5. build a signed release AAB through the committed Gradle wrapper;
6. place the generated bundle under an ignored release-output directory.

Keystores, signing passwords, local SDK paths, Gradle caches, APKs, AABs, and generated build directories remain ignored and rejected by the security scan if staged. Source Gradle files, wrapper metadata, Android manifests, resources, and native plugin code must be tracked.

CI gains an Android job triggered by native, Capacitor, billing-port, auth-port, release-script, and root dependency changes. It installs JDK 21 and Android SDK 36, runs native unit tests and lint, verifies the resolved Billing dependency, and builds an unsigned release bundle.

## Testing And Cutover

Automated coverage includes:

- web and Android adapter contract tests;
- purchase payload normalization and stable error mapping;
- single-flight purchase protection;
- purchased, pending, cancelled, unavailable, disconnected, and already-owned recovery paths;
- browser GIS selection versus native Credential Manager selection;
- native token bootstrap followed by session-only requests;
- API 36 and Billing 8 dependency guards;
- release-script and artifact-hygiene guards;
- Android JVM tests, lint, strict TypeScript, frontend/API suites, and production builds.

Play internal testing must verify fresh login, returning login, logout, process restart, offline launch, `pro_access` purchase, cancellation, pending purchase, existing purchase restoration, account mismatch rejection, purchase-token verification, and entitlement restoration before Bubblewrap is removed.

## Documentation Boundaries

- `docs/google-play-release.md` owns operator steps for Android builds and Play submission.
- `docs/c4` records the Capacitor container and native identity/billing adapters because this changes deployed architecture.
- `docs/refactorplan.md` remains a technical refactor backlog and receives no migration history unless unresolved design debt remains after cutover.

## Completion Criteria

- A source-controlled Capacitor AAB for `io.whatfees` targets API 36.
- Its resolved dependency graph contains Google Play Billing 8.3.0 and no Billing version below 8.
- Google login creates the existing server session in one user action.
- Play purchase and restore flows unlock Pro only after API verification.
- Browser/PWA behavior remains green and unchanged.
- CI builds and validates Android without signing secrets.
- The release guide and C4 model describe Capacitor rather than Bubblewrap as the Android production container.
