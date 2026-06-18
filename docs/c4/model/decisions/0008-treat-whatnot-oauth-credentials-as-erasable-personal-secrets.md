# 8. Erasable Whatnot secrets

Date: 2026-05-19

## Status

Proposed

## Context

Whatnot connections can store encrypted OAuth access and refresh tokens.

The current refactor plan identifies that account deletion removes several personal records but still needs proof that personal Whatnot credential rows are deleted.

Workspace-owned Whatnot connections may be useful later, but ownership and deletion semantics must be explicit before such credentials are shared.

## Decision

Treat personal Whatnot OAuth credentials as personal secrets that must be removed during account deletion.

Do not infer workspace ownership for Whatnot credentials. If workspace-owned Whatnot connections are introduced, they need separate ownership, membership, audit, transfer, and deletion rules.

## Consequences

Account deletion tests must prove personal Whatnot credentials are erased.

The system avoids leaving third-party credentials recoverable after a user deletes their account.

Future workspace Whatnot support will require an explicit architecture decision rather than a silent data-model expansion.
