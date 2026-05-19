# 3. Keep browser workflows local-first

Date: 2026-05-19

## Status

Accepted

## Context

Calcul8 is used during live selling, where network failures, expired auth, and browser refreshes cannot block the seller from continuing operational work.

The web app already keeps lots, sales, game configuration, sync metadata, and cached session state in browser storage and then reconciles that state with cloud-authoritative API boundaries.

## Decision

Keep seller workflows local-first. The browser remains the immediate source for interactive work, and cloud sync remains a scoped reconciliation mechanism rather than a prerequisite for every local action.

Cloud APIs own shared, paid, security-sensitive, and public-session boundaries. Browser storage owns the responsive editing experience and safe offline recovery.

## Consequences

The UI can continue working when the network is unavailable.

Sync and conflict handling must be explicit, deterministic, and non-destructive.

Shared data must never rely on implicit global local storage keys; it needs scope-aware keys and version metadata.

