# Component Models

Use this folder for C3-level component model fragments once a container is ready for deeper documentation.

Component descriptions should stay diagram-friendly. Put behavioral detail in element properties:

- `Owns`
- `Must not own`
- `Boundary data`
- `Failure recovery`

Recommended first candidates:

- `web.dsl` for app shell, app-core, windows, spectator entry, and shared UI primitives.
- `api.dsl` for feature handlers, lib/repositories, shared contracts, and boundary validators.
- `realtime.dsl` for gateway, auth, payload parsing, room store, and presence store.
- `shared.dsl` for cross-package contracts.
