# 10. Verify all shipping entry points before release

Date: 2026-05-19

## Status

Accepted

## Context

Calcul8 ships more than one runtime boundary: the web PWA, the spectator entry, API Functions, and the realtime gateway.

Older release paths could miss API or realtime breakage, and spectator-only entry changes could miss CI or deployment triggers. The repo now has a single local verification gate that covers web, web test types, API, API test types, and realtime.

## Decision

Release and CI workflows must verify every shipping runtime boundary affected by a change.

Android release runs `npm run verify:all` by default before production build steps, or requires an explicit documented skip. The `verify:all` script runs the web, API, realtime, and test-typechecking gates in parallel where possible. CI path filters must include root HTML entry points such as `spectator.html`.

Playwright visual smoke tests are not the full release gate. They are a targeted smoke layer for real seeded screens, overflow detection, and local screenshots.

## Consequences

Release confidence comes from the same boundaries users depend on.

Release scripts may take longer, but they catch cross-runtime contract drift before shipping.

Skipping a verifier becomes an explicit decision instead of an accidental omission.

Strict test typechecking makes raw fixture drift visible, so shared test builders are required to keep the gate maintainable as schemas evolve.
