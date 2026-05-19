# C4 Conventions

These conventions keep the Structurizr workspace useful as architecture documentation instead of a diagram dumping ground.

## Source Files

- `workspace.dsl` is the only entry point.
- `model/*.dsl` files define reusable elements and relationships.
- `model/components/*.dsl` files define C3 component models for one container at a time.
- `views/*.dsl` files define C1/C2/deployment views.
- `views/components/*.dsl` files define C3 views.
- `views/dynamics/*.dsl` files define flows that explain risky behavior.
- `styles/theme.dsl` owns visual styling and tags.
- `model/docs/*.md` stores software-system documentation.
- `model/decisions/*.md` stores software-system ADRs.

## Generated Files

Do not commit Structurizr local cache or exports:

- `docs/c4/.structurizr/`
- `docs/c4/workspace.json`

If a layout needs to be preserved, commit the DSL/layout source that produced it rather than the local cache.

## Naming

- Use PascalCase for view keys: `ContainerView`, `RealtimeComponents`, `WorkspaceSyncFlow`.
- Use product names for systems and containers: `Web PWA`, `API Functions`, `Realtime Gateway`.
- Use responsibility names for components: `Payload Parser`, `Room Store`, `Presence Store`.
- Keep descriptions operational: what it does, what boundary it owns, and what risk it helps explain.

## Relationships

Every relationship used by a dynamic view must exist in the static model first. Add the static relationship where the elements are defined before sequencing it in `views/dynamics`.

Prefer concrete protocols in technology labels:

- `HTTPS JSON`
- `WebSocket`
- `Cosmos SDK`
- `HMAC`
- `Browser APIs`

## View Scope

- C1/system context: audience, external systems, and major trust boundaries.
- C2/container: deployable/runtime containers and their protocols.
- C3/component: internals of one container only.
- Dynamic: one risky or important runtime flow.

Do not make a view only because a folder exists in the repo. Make a view when it explains a boundary, operational risk, or recurring refactor decision.

## Refactor Plan Alignment

When `docs/refactorplan.md` identifies critical or high-risk architecture, add or update a C4 view if a diagram would clarify ownership or failure modes. Current high-value areas are account deletion credentials, payment entitlements, workspace sync conflict recovery, realtime delivery, public game sessions, and release/deployment paths.

## Verification

Run these before calling C4 changes complete:

```powershell
npm run docs:c4:validate
npm run docs:c4:inspect
```

`validate` catches DSL syntax and relationship errors. `inspect` catches architecture documentation quality issues such as missing scope, missing software-system docs/decisions, disconnected elements, and incomplete deployment-node metadata.
