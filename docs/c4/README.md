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
- `styles/` keeps tags and visual styling consistent.

The active C4 drilldown is:

- C1: `SystemContext`
- C2: `ContainerView`
- C3: `WebPwaComponents`, `ApiComponents`, and `RealtimeComponents`

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
