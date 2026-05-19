# Calcul8 Architecture Overview

Calcul8 is a local-first PWA for live selling, lot management, profitability analysis, workspace sync, Whatnot imports, and public game sessions.

The browser app keeps local state usable when the network is unavailable, while the API owns cloud-authoritative boundaries such as workspace sync snapshots, billing facts, Whatnot credentials, sales persistence, and public game-session state.

The realtime gateway is a separate runtime because workspace presence, lot updates, and public game-session updates need push delivery over WebSocket. It currently stores room membership and presence in process memory, so production deployment must stay single-replica until a shared backplane is introduced.

## Primary Containers

- Web PWA: authenticated seller workflows, local-first state, app shell, windows, and sync orchestration.
- Spectator Page: public read-only view of game-session state.
- API Functions: authenticated and public HTTP API boundaries.
- Realtime Gateway: WebSocket subscriptions, internal publish endpoint, room membership, and presence snapshots.
- Cosmos DB: cloud-authoritative storage.
- Browser Local Storage: local-first state and sync metadata.

## Current Architecture Risks

The C4 model intentionally highlights the same areas tracked in `docs/refactorplan.md`:

- Personal credentials must be deleted completely during account deletion.
- Billing entitlements must be derived from atomic provider facts.
- Workspace sync must use non-destructive conflict recovery.
- Realtime production must remain authenticated and single-replica until it has a backplane.
- Public game sessions need optimistic concurrency around stale publishes.

