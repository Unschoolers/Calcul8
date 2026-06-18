# C4 Conventions

These conventions keep the Structurizr workspace useful as architecture documentation instead of a diagram dumping ground.

## Source Files

- `workspace.dsl` is the only entry point.
- `model/*.dsl` files define reusable elements, overlays, and relationships.
- `model/components/*.dsl` files define C3 component models for one container at a time.
- `views/*.dsl` files define C1/C2/deployment views.
- `views/components/*.dsl` files define C3 views.
- `views/dynamics/*.dsl` files define flows that explain risky behavior.
- `styles/theme.dsl` owns Calcul8-specific visual styling and tags. The workspace-level Microsoft Azure theme supplies Azure service icons.
- `model/docs/*.md` stores software-system documentation.
- `model/decisions/*.md` stores software-system ADRs.

## Generated Files

Do not commit Structurizr local cache or exports:

- `docs/c4/.structurizr/`
- `docs/c4/workspace.json`

If a layout needs to be preserved, commit the DSL/layout source that produced it rather than the local cache.

## Naming

- Use PascalCase for view keys: `SystemContext`, `ContainerView`, `WebPwaComponents`, `ApiComponents`, `RealtimeComponents`, `WorkspaceSyncFlow`, `TechnicalDebtFlow`.
- Use product names for systems and containers: `Web PWA`, `API Functions`, `Realtime Gateway`.
- Use responsibility names for components: `Payload Parser`, `Room Store`, `Presence Store`.
- Keep descriptions operational: what it does, what boundary it owns, and what risk it helps explain.

## Relationships

Every relationship used by a dynamic view must exist in the static model first. Add the static relationship where the elements are defined before sequencing it in `views/dynamics`.

Prefer the most specific meaningful relationship and let Structurizr imply the parent relationship. For example, model `seller -> calcul8.web.appShell` instead of also adding `seller -> calcul8.web`; the C1/C2 views will get the parent edge through implied relationships.

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

Do not add a system landscape view until Calcul8 has more than one first-party software system to map. With a single product boundary it duplicates the C1 system context view and weakens drilldown.

When a container has a component view, add an explicit named element property that links to `{workspace}/diagrams#ViewKey`. Structurizr can infer zoom-in for some elements, but the explicit link makes local navigation predictable across viewer modes.

Do not make a view only because a folder exists in the repo. Make a view when it explains a boundary, operational risk, or recurring refactor decision.

## Theme Tags

Use Structurizr's `Microsoft Azure - ...` tags only for Azure-backed containers, systems, and deployment nodes. Keep product/runtime tags such as `Web App`, `API`, and `Realtime` on the same element so local styles remain readable when the icon theme changes.

## Perspectives

Keep cross-cutting perspectives in dedicated model overlay files, not scattered through every element definition. The `Technical Debt` perspective uses `Critical`, `High`, `Medium`, and `Low` values; ratings should describe current architectural risk, not wishlist priority.

## Refactor Plan Alignment

When `docs/refactorplan.md` identifies critical or high-risk architecture, add or update a C4 view if a diagram would clarify ownership or failure modes. Current high-value areas are session-first auth, recoverable cross-document writes, generated artifact hygiene, fixture-builder driven verification, workspace sync conflict recovery, realtime delivery, public game sessions, and release/deployment paths.

UI-only work belongs in C4 when it becomes a cross-screen contract: app shell zones, shared action rails, shared KPI/card/table/dialog primitives, responsive chart behavior, or a rule that prevents mobile/tablet/desktop layout forks. Cosmetic backlog stays in `docs/UIrefinement.md`.

## Verification

Run these before calling C4 changes complete:

```powershell
npm run docs:c4:validate
npm run docs:c4:inspect
```

`validate` catches DSL syntax and relationship errors. `inspect` catches architecture documentation quality issues such as missing scope, missing software-system docs/decisions, disconnected elements, and incomplete deployment-node metadata.
