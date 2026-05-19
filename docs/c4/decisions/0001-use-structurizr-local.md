# 1. Use Structurizr local for C4 architecture docs

Date: 2026-05-19

## Status

Accepted

## Context

Calcul8 needs architecture diagrams that stay versioned with the repo and can be opened locally without publishing project details to a hosted workspace.

Structurizr `local` loads a local `workspace.dsl` file from a mounted data directory and serves it on `localhost`. The Structurizr docs distinguish `local` from `server`: `local` is for viewing diagrams and editing layout on your own computer, while `server` is for publishing workspaces to a wider audience.

## Decision

Store the C4 model under `docs/c4`, use `workspace.dsl` as the only entry point, and view it through a local Structurizr Docker container started by `npm run docs:c4`.

The script must run `structurizr/structurizr local`, not `structurizr/structurizr server`.

## Consequences

Architecture docs are editable as code and visible locally at `http://localhost:8080`.

Developers need Docker to use the local viewer.

Publishing or syncing to a hosted/shared Structurizr workspace remains an explicit future decision, not a default behavior.

