# Calcul8 C4 Architecture

This folder is the local Structurizr source of truth for Calcul8 architecture diagrams.

Run the local viewer:

```powershell
npm run docs:c4
```

Then open:

```text
http://localhost:8080
```

Use a different local port when 8080 is busy:

```powershell
npm run docs:c4 -- --port 8081
```

The runner checks the requested port before starting Docker and will suggest the next port when the current one is already in use.

If Docker Desktop is running but `docker` is not on your PATH, the script will try Docker Desktop's default Windows CLI location and add that folder to the child process PATH so Docker can find `docker-credential-desktop.exe`. You can also set it explicitly:

```powershell
$env:DOCKER_CLI = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
npm run docs:c4
```

This setup is intentionally local-only. The npm script runs the Structurizr `local` command, which is only accessible through `localhost`. Do not replace it with the Structurizr `server` command unless publishing/collaboration becomes an explicit decision.

## Folder Layout

- `workspace.dsl` is the only Structurizr entry point.
- `model/` defines people, external systems, Calcul8 containers, and deployment nodes.
- `model/docs/` and `model/decisions/` attach documentation and ADRs to the Calcul8 software system.
- `views/` defines the C1 system context, C2 container, selected C3 component, deployment, and dynamic flow views.
- `styles/` keeps Calcul8-specific tags and visual styling consistent.

The workspace uses Structurizr's official Microsoft Azure 2024.07.15 icons-only theme. Local styles still override the theme for Calcul8-specific colors, shapes, and relationship styling.

The active C4 drilldown is:

- C1: `SystemContext`
- C2: `ContainerView`
- C3: `WebPwaComponents`, `ApiComponents`, and `RealtimeComponents`
- Dynamic: `WorkspaceSyncFlow`, `PublicGameSessionFlow`, `WhatnotImportFlow`, `BillingEntitlementsFlow`, `RealtimePublishSubscribeFlow`, and `TechnicalDebtFlow`

The software system and drilldown-ready containers also have explicit named links using Structurizr's `{workspace}/diagrams#ViewKey` URL syntax. This keeps navigation available even when the viewer does not automatically infer the next diagram.

The model follows the Structurizr tutorial's implied-relationship pattern: lower-level component relationships are the source of truth, and C1/C2 parent relationships are inferred by Structurizr instead of being duplicated by hand.

The `Technical Debt` perspective is attached to the model as an overlay in `model/technical-debt.dsl`. Use the perspectives control in Structurizr, or press `p`, to highlight the current debt ratings on the C2/C3 diagrams. `TechnicalDebtFlow` shows the debt feedback loop as a dynamic view.

There is intentionally no active system landscape view while Calcul8 is modeled as one first-party software system; it would duplicate `SystemContext`.

## Source Of Truth

Commit the DSL and Markdown files in this folder.

Do not commit generated Structurizr local files:

- `.structurizr/`
- `workspace.json`

Those files are local cache/export artifacts and are ignored by `.gitignore`.

Validate the DSL without starting the viewer:

```powershell
npm run docs:c4:validate
```

Run Structurizr's model inspections as a stricter quality gate:

```powershell
npm run docs:c4:inspect
```
