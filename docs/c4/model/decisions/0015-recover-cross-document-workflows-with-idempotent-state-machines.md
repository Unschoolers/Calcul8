# 15. Recover cross-document workflows with idempotent state machines

Date: 2026-07-13

## Status

Accepted

## Context

Whatnot confirmation writes sales, mappings, batch progress, and connection metadata across document boundaries. Workspace creation writes a workspace and its owner membership in different partitions. A process failure between those writes cannot be made safe by best-effort rollback alone.

## Decision

Use durable, optimistic-concurrency state machines for cross-document workflows. Persist a normalized request fingerprint, stable operation identity, attempt metadata, and completed checkpoints so a user-triggered retry can continue without repeating committed business writes.

Whatnot confirmation freezes its reviewed decisions and planned sale identities, uses renewable attempt leases, checkpoints each logical sale operation, and records partial failures as recoverable. Workspace creation derives a deterministic workspace id from the owner and client idempotency key, remains non-active until owner membership is durable, and records a repairable failure state instead of deleting partial state.

Reject reuse of an idempotency identity with changed input. Preserve completed writes and concurrent user edits; do not silently compensate by deleting or overwriting them.

## Consequences

Retries are deterministic and scope-safe, but workflow documents retain additional audit and recovery metadata. Incomplete workspaces remain invisible to membership and listing paths. Operators can diagnose failure phase and operation identity without inspecting sensitive payloads, while users can retry through the normal product flow instead of requiring direct Cosmos edits. A migration-admin-only, bounded workspace owner-membership endpoint provides explicit audit and verified repair for older orphan records.
