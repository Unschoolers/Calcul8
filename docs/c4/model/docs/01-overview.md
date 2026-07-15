# Calcul8 Architecture Overview

Calcul8 is a local-first PWA for live selling, lot management, profitability analysis, workspace sync, Whatnot imports, and public game sessions.

The browser app keeps local state usable when the network is unavailable, while the API owns cloud-authoritative boundaries such as workspace sync snapshots, billing facts, Whatnot credentials, sales persistence, and public game-session state.

The authenticated app now treats the shell, responsive layout zones, shared KPI/card/table/dialog primitives, and chart sizing as architecture contracts. Mobile and tablet should share the same primary layout path where possible, desktop layouts should switch at the large breakpoint, and runtime sizing should use shared helpers instead of per-screen one-off observers.

The realtime gateway is a separate runtime because workspace presence, lot updates, and public game-session updates need push delivery over WebSocket. It currently stores room membership and presence in process memory, so production deployment must stay single-replica until a shared backplane is introduced.

## Primary Containers

- Web PWA: authenticated seller workflows, local-first state, app shell contracts, responsive windows, UI primitives, and sync orchestration.
- Spectator Page: public read-only view of game-session state.
- API Functions: authenticated and public HTTP API boundaries.
- Realtime Gateway: WebSocket subscriptions, internal publish endpoint, room membership, and presence snapshots.
- Cosmos DB: cloud-authoritative storage.
- Browser Local Storage: local-first state and sync metadata.

## Current Architecture Risks

The C4 model intentionally highlights the same areas tracked in `docs/refactorplan.md`:

- Auth must finish the move to session-first behavior by removing remaining bearer fallback surfaces and avoiding browser-stored auth material.
- Whatnot confirmation and workspace creation now use durable recovery state, deterministic idempotency identities, and user-triggered resume; other cross-document account, billing, sales, and sync workflows still need the same scrutiny when they change.
- Generated release, visual QA, coverage, and architecture artifacts must stay untracked so releases remain reproducible from source.
- Shared test fixtures need builders so strict `verify:all` typechecking catches real contract drift without forcing every test to copy full schemas.
- Recorded sales, sales history, and portfolio metrics must stay distinct from what-if forecasts and projection-only UI.
- Realtime production must remain authenticated and single-replica until it has a backplane.
- Public game sessions need optimistic concurrency around stale publishes.
