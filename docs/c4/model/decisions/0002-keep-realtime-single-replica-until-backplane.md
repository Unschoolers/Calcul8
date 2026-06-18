# 2. Single-replica realtime

Date: 2026-05-19

## Status

Accepted

## Context

The realtime gateway tracks WebSocket clients, room membership, and workspace presence in process memory.

Multiple production replicas would each have a different room map. A publish sent to one replica would not reach clients connected to another replica, and presence could report incomplete membership.

## Decision

Production realtime should remain single-replica until room membership and publish fan-out move to a shared backplane such as Redis or Azure SignalR.

Production bootstrap and deployment paths must require `REALTIME_TOKEN_SECRET` so arbitrary clients cannot subscribe to protected rooms.

## Consequences

The current deployment is operationally simpler and consistent with the implementation.

Horizontal scale for realtime is intentionally deferred until the backplane is implemented.
