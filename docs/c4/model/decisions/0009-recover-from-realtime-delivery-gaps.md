# 9. Recover from realtime delivery gaps

Date: 2026-05-19

## Status

Accepted

## Context

The API publishes realtime events best-effort after writes. WebSocket clients can disconnect, reconnect, miss events, or connect to a different runtime once the gateway is scaled.

Realtime is a delivery optimization, not the only source of truth. The API and Cosmos remain authoritative for sales, sync snapshots, public game sessions, and workspace state.

## Decision

Realtime clients must recover from delivery gaps by refreshing authoritative state on reconnect, version mismatch, stale snapshot, or publish uncertainty.

If the product later requires guaranteed delivery, add an outbox or shared event log instead of relying on in-memory WebSocket fan-out.

## Implementation Notes

Workspace clients perform a catch-up refresh after realtime subscription and when an event cannot prove the local state is current. Clean local state can pull the authoritative cloud snapshot automatically; dirty local state is marked stale so recovery does not silently overwrite local edits.

Spectator clients keep the last ready view visible during background recovery. A failed background refresh marks the session stale, and a successful catch-up marks it recovered before live updates continue.

The realtime gateway caps WebSocket message payloads so oversized frames close with the WebSocket policy code instead of being parsed by application code.

Production deployment validates aligned API, Pages, and realtime environment settings. The realtime deploy smoke test now opens a signed WebSocket subscription, publishes through the internal endpoint, and requires the published event to arrive on that socket.

## Consequences

Dropped realtime messages should lead to stale UI at worst, not permanent data loss.

Client code needs version-aware refresh paths.

Deployment smoke tests should prove token minting, subscribe, publish, and refresh recovery boundaries.
