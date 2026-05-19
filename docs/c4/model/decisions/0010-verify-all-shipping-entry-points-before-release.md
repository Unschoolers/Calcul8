# 10. Verify all shipping entry points before release

Date: 2026-05-19

## Status

Proposed

## Context

Calcul8 ships more than one runtime boundary: the web PWA, the spectator entry, API Functions, and the realtime gateway.

The current refactor plan identifies release and CI filter gaps where Android release verification can miss API or realtime breakage, and spectator-only entry changes can miss CI or deployment triggers.

## Decision

Release and CI workflows should verify every shipping runtime boundary affected by a change.

Android release should run the full relevant verifier by default, or require an explicit documented skip. CI path filters must include root HTML entry points such as `spectator.html`.

## Consequences

Release confidence comes from the same boundaries users depend on.

Release scripts may take longer, but they catch cross-runtime contract drift before shipping.

Skipping a verifier becomes an explicit decision instead of an accidental omission.

