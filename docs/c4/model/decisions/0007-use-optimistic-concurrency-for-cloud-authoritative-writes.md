# 7. Use optimistic concurrency for cloud-authoritative writes

Date: 2026-05-19

## Status

Proposed

## Context

Cloud-authoritative entities can be written by more than one actor or browser session. Current refactor risks include sync snapshots, sales, Whatnot import confirmation, and public game-session publishing.

Read-before-write checks are not enough when two writers can pass the same check before either write is committed.

## Decision

Use optimistic concurrency for cloud-authoritative writes. Prefer Cosmos ETags, create-only claims, transactional batches, status-claim transitions, or monotonic version checks depending on the entity boundary.

Frontend stale-version recovery must not apply cloud state over dirty local edits without preserving or resolving the local changes.

## Consequences

Concurrent writers should produce one accepted write and one explicit conflict, not silent overwrite.

Conflict recovery becomes part of product behavior and needs user-visible resolution paths.

Repositories should translate Cosmos conflicts into domain errors instead of leaking storage details into handlers.

