# 9. Recover from realtime delivery gaps

Date: 2026-05-19

## Status

Proposed

## Context

The API publishes realtime events best-effort after writes. WebSocket clients can disconnect, reconnect, miss events, or connect to a different runtime once the gateway is scaled.

Realtime is a delivery optimization, not the only source of truth. The API and Cosmos remain authoritative for sales, sync snapshots, public game sessions, and workspace state.

## Decision

Realtime clients must recover from delivery gaps by refreshing authoritative state on reconnect, version mismatch, stale snapshot, or publish uncertainty.

If the product later requires guaranteed delivery, add an outbox or shared event log instead of relying on in-memory WebSocket fan-out.

## Consequences

Dropped realtime messages should lead to stale UI at worst, not permanent data loss.

Client code needs version-aware refresh paths.

Deployment smoke tests should prove token minting, subscribe, publish, and refresh recovery boundaries.

