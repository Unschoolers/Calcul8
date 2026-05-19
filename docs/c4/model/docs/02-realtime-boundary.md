# Realtime Boundary

The realtime gateway accepts two kinds of traffic:

- Internal HTTP publishes from API Functions.
- WebSocket subscribe/unsubscribe/ping messages from browser clients.

Internal publish requests are authorized with `REALTIME_INTERNAL_API_KEY`. Browser subscribe requests are authorized with signed room tokens when `REALTIME_TOKEN_SECRET` is configured. Development can allow unauthenticated subscribes, but production must not.

Room membership and presence are in memory. This makes the gateway simple and fast, but it also means production cannot safely scale across multiple replicas unless a Redis, Azure SignalR, or equivalent backplane owns cross-instance room state and publish fan-out.

