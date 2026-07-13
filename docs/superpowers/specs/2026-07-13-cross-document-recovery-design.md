# Cross-Document Workflow Recovery Design

**Date:** 2026-07-13  
**Status:** Approved

## Summary

Calcul8 must recover deterministically when a Whatnot confirmation or workspace creation fails after only some Cosmos documents have been written. Recovery will use persisted state machines, stable idempotency identities, optimistic concurrency, and user-triggered retries. Completed writes are preserved; the system never silently rolls back seller data.

This design covers two workflows:

1. Whatnot confirmation across sales, sale-import mappings, remembered target mappings, import-batch state, and connection sync metadata.
2. Workspace creation across the workspace document and owner membership document.

## Goals

- Retrying the same operation resumes safely without duplicate sales, mappings, memberships, or workspaces.
- A lost success response can be retried and returns the original successful result.
- Partial failures are visible, observable, and recoverable without direct Cosmos edits.
- Concurrent attempts use leases and `_etag` conditions instead of last-write-wins updates.
- Seller-authored sale changes are never overwritten by a recovery attempt.
- Existing `pending_review` and stuck `processing` Whatnot batches can adopt the recovery model.
- Existing orphan workspace records can be audited and repaired explicitly.
- User-facing recovery states remain bilingual in English and French.

## Non-Goals

- Repartitioning all workflow documents for Cosmos transactional batches.
- Automatically retrying failed workflows in the background.
- Deleting successfully written sales or workspaces as compensation.
- Changing Whatnot matching, grouping, pricing, fee, or memo semantics.
- Migrating every existing workspace ID to the new deterministic format.

## Selected Approach

Use persisted workflow state machines with idempotent resume.

Compensating rollback was rejected because rollback can fail, erase concurrent user edits, and create a second partial-failure path. Repartitioning for transactional batches was rejected because the workflows cross current partition and collection boundaries and would require a large migration.

## Shared Idempotency Rules

- External idempotency keys are normalized and length-bounded at the route boundary.
- A canonical request fingerprint is calculated from normalized, semantically relevant input using stable key ordering.
- Reusing an idempotency identity with the same fingerprint resumes or returns the completed result.
- Reusing it with a different fingerprint returns HTTP `409` with code `IDEMPOTENCY_MISMATCH`.
- An unexpired active lease returns HTTP `409` with code `OPERATION_IN_PROGRESS`.
- An expired lease can be reclaimed with a new attempt ID.
- Raw decisions, buyer names, workspace names, tokens, and external transaction identifiers are not written to telemetry.

## Whatnot Confirmation Architecture

### Batch State

Extend `WhatnotImportBatchDocument` with optional recovery fields so legacy documents remain readable:

- `status`: add `recoverable_error` while retaining `pending_review`, `processing`, and `completed`.
- `confirmationFingerprint`: canonical fingerprint of normalized decisions.
- `confirmationPlan`: immutable logical operations with stable operation keys, row IDs, target lot, target sale type, update mode, planned sale ID, mutation ID, mapping identity, and remembered mapping identities.
- `confirmationProgress`: completed operation records with outcome (`imported`, `updated`, or `skipped`), sale identity, and completion time.
- `confirmationAttempt`: attempt ID, attempt number, lease expiry, claimed time, and actor user ID.
- `failedOperationKey`, `failedPhase`, and sanitized `errorMessage`.
- Existing aggregate counts remain the public completed result and are derived from persisted operation outcomes.

The stored plan contains only the normalized fields required to repeat the approved confirmation. It does not copy unrelated request or UI state.

### Focused Modules

- `apps/api/src/features/whatnot/confirmationPlan.ts` owns normalization, canonical fingerprinting, logical grouping, operation keys, and immutable plan creation.
- `apps/api/src/features/whatnot/confirmationRunner.ts` owns step execution, idempotent sale recovery, mapping writes, checkpoints, and aggregate outcomes.
- `apps/api/src/features/whatnot/importConfirm.ts` remains the thin orchestration entrypoint for scope resolution, claim, plan validation, runner invocation, completion, and response shaping.
- `apps/api/src/lib/cosmos/whatnotRepository.ts` owns conditional batch claims, lease reclamation, plan initialization, checkpoints, recoverable-failure transitions, and completion.
- `apps/api/src/lib/cosmos/salesRepository.ts` owns mutation-ID lookup and conditional sale creation/update behavior.

### Operation Identity

The resumable unit is one logical sale operation, not necessarily one CSV row. Rows merged into a manual candidate share one operation key. A stable operation key is derived from the batch ID and the sorted row IDs participating in the logical operation.

Each operation freezes:

- row IDs;
- sale mutation ID;
- target lot and sale ID;
- update mode;
- normalized decision fields required by the sale builder;
- external sale mapping identities;
- deduplicated remembered target-mapping identities;
- expected aggregate outcome.

New numeric sale IDs are allocated before workflow writes begin and persisted in the plan. If a sale with the stable mutation ID already exists, its actual lot and sale ID become the plan identity. If a planned sale ID is occupied by a different mutation, the operation enters a recoverable conflict rather than overwriting that sale.

### Sale Idempotency

`upsertSaleDocument` currently increments a version whenever it rewrites a sale, even if the mutation ID matches. Recovery therefore does not blindly repeat sale upserts.

Before a sale write, the runner queries for the stable mutation ID within the scoped sales partition:

- If found, the sale step is already complete. The existing document is not rewritten or version-incremented.
- If the seller edited the sale after import and its current mutation ID changed, the runner does not overwrite it. Persisted plan and mapping identities are used to finish only missing metadata, and a conflict is surfaced if correctness cannot be proven.
- If no mutation exists and the planned sale ID is free, create the planned sale.
- If the planned sale ID belongs to another mutation, record a recoverable conflict.

This lookup also adopts legacy batches that wrote a sale before their mapping or batch update failed.

### Confirmation Flow

1. Resolve the personal or workspace scope and load the Whatnot connection.
2. Normalize the submitted decisions and calculate their fingerprint.
3. Claim `pending_review` or `recoverable_error`, or reclaim an expired `processing` lease, using `_etag`.
4. Reject an active lease or mismatched stored fingerprint with a stable `409` code.
5. On the first attempt, build the full immutable plan and persist it before executing workflow writes.
6. On retry, load the stored plan and persisted progress.
7. Execute incomplete operations in stable order.
8. For each operation, recover or create the sale, upsert the external-sale mapping, upsert every remembered target mapping, then persist the operation checkpoint using `_etag`.
9. A crash after a write but before its checkpoint is safe because the next attempt detects the stable sale mutation and deterministic mapping IDs.
10. Derive imported, updated, and skipped counts from completed operation records.
11. Conditionally mark the batch `completed` with the aggregate result.
12. Update connection `lastSyncedAt` idempotently as a finalization step. A failure here is recoverable without repeating completed sale operations.

### Failure Semantics

- Validation failure before workflow writes returns `400` and returns the batch to `pending_review`.
- A caught failure after the plan is persisted records `recoverable_error`, failed operation/phase, sanitized message, and attempt metadata before returning the safe API error.
- A process crash leaves `processing`; the expired lease makes it reclaimable.
- A conflict while updating progress reloads the batch. If another attempt completed the same operation, continue from the refreshed state; otherwise return `OPERATION_IN_PROGRESS` or a recoverable conflict.
- A completed batch always returns its stored aggregate result and never repeats writes.

### Legacy Batch Adoption

- Legacy `pending_review` batches create a plan on their first new confirmation attempt.
- Legacy `processing` batches without lease metadata are treated as expired and reclaimable.
- When adopting a legacy batch, mutation-ID lookup runs before sale-ID allocation. Existing matching sales are bound into the new plan so a prior partial write is not duplicated.
- Existing deterministic Whatnot mapping IDs are upserted safely.
- If the legacy state is ambiguous, the batch enters `recoverable_error` with a user-visible explanation instead of guessing or deleting data.

## Workspace Creation Architecture

### Request Contract

The frontend sends a client-generated `idempotencyKey` with the normalized workspace name. It generates the key once per create-dialog submission and retains it across user-triggered retries. Duplicate clicks remain disabled while a request is in flight.

The API validates and normalizes the key, derives a request fingerprint from owner user ID plus normalized workspace name, and derives the workspace ID deterministically from owner user ID plus idempotency key. The raw key is not stored; a one-way hash is stored as the idempotency identity.

### Workspace State

Extend workspace status with:

- `creating`;
- `active`;
- `creation_failed`;
- existing `deleted`.

Add optional creation metadata:

- `creationKeyHash`;
- `creationFingerprint`;
- `creationAttemptCount`;
- `creationLastAttemptAt`;
- `creationErrorCode` and sanitized `creationErrorMessage`.

Existing active and deleted workspace documents remain valid without these optional fields.

### Creation Flow

1. Validate the workspace name and idempotency key at the HTTP boundary.
2. Derive the deterministic workspace ID, key hash, and request fingerprint.
3. Create a `creating` document, or load the existing document for that ID.
4. Reject a fingerprint mismatch with `IDEMPOTENCY_MISMATCH`.
5. If already `active`, verify owner membership and return the original result; repair the missing matching owner membership before returning if necessary.
6. If `creating` or `creation_failed`, conditionally record a new attempt.
7. Idempotently upsert the owner membership as active owner.
8. Transition the workspace to `active` using its current `_etag`.
9. Return the same workspace result for first success, response-loss retry, or repair retry.
10. On failure, conditionally mark `creation_failed`; do not delete the workspace or owner membership.

### Visibility And Access

Only `active` workspaces participate in:

- workspace lists;
- membership/access checks;
- join-link preview or acceptance;
- sync scope resolution;
- sales/realtime token issuance;
- workspace presence and realtime rooms.

Repository helpers centralize this status check so route handlers do not invent different interpretations.

### Existing Orphan Audit And Repair

Add a repository-level audit function that identifies active workspaces whose owner membership is missing or inactive. Add a repair function that, after verifying the workspace owner identity, recreates the active owner membership and records telemetry. These functions are testable and callable from existing controlled migration/admin tooling; they do not run as an unbounded request-path query and never delete a workspace automatically.

## API Error Contract

Use existing shared HTTP/error helpers and add stable error codes to safe JSON responses:

- `IDEMPOTENCY_MISMATCH` — same identity, different normalized request.
- `OPERATION_IN_PROGRESS` — another unexpired attempt owns the lease.
- `RECOVERY_CONFLICT` — persisted state cannot be resumed without a user-visible retry or review.

Raw Cosmos errors and stack traces never reach the client.

## Frontend Recovery UX

- Do not retry in the background.
- Keep the Whatnot review or workspace dialog open after a recoverable failure.
- Present a shared retryable error state with a clear title, explanation, and Retry action.
- Reuse the original normalized decisions or workspace idempotency key on Retry.
- Disable the action while the request is in flight.
- Explain `OPERATION_IN_PROGRESS` and allow refresh/retry.
- Explain `IDEMPOTENCY_MISMATCH` and require restarting the review or workspace submission.
- Add English and French copy with correct French diacritics.

## Telemetry

Emit high-signal events through the shared telemetry helper:

- workflow and outcome;
- scope type;
- safe batch/workspace identifier;
- attempt number;
- resumed and remaining operation counts;
- failed phase;
- lease conflict or reclaim outcome;
- recovery latency;
- workspace lifecycle transition;
- orphan audit and repair result.

Do not log sale payloads, buyer names, workspace names, tokens, raw decisions, or external transaction IDs.

## Test Strategy

All behavior changes use test-first development. Tests must first fail for the missing recovery behavior.

### Whatnot Domain And Repository Tests

- canonical fingerprint is stable across harmless input ordering;
- changed normalized decisions produce a different fingerprint;
- grouped manual rows produce one stable operation;
- plan persists assigned sale IDs before writes;
- active lease blocks a second claim;
- expired and legacy leases are reclaimable;
- checkpoint and failure transitions require matching `_etag`;
- aggregate counts derive from persisted operation outcomes;
- mutation lookup finds a previously written sale;
- matching mutation skips rewrite/version increment;
- occupied sale ID with another mutation creates a recoverable conflict.

### Whatnot Failure-Injection Tests

Inject failure after each boundary and confirm the next user-triggered retry completes without duplication:

- sale creation;
- external sale mapping;
- each remembered target mapping;
- operation checkpoint;
- batch completion;
- connection `lastSyncedAt` update;
- lost success response.

Also cover decision mismatch, concurrent attempts, seller edits after import, legacy `pending_review`, legacy `processing`, and ambiguous legacy state.

### Workspace Repository And Route Tests

- deterministic workspace ID for owner plus idempotency key;
- same request returns/resumes the same workspace;
- changed name with reused key returns `409`;
- membership failure records `creation_failed` without deletion;
- retry repairs membership and activates the workspace;
- activation failure is retryable;
- response-loss retry returns the original active workspace;
- non-active workspaces are excluded from list/access/join/sync/realtime paths;
- orphan audit identifies missing owner membership;
- repair restores only the verified owner membership;
- concurrent lifecycle updates use `_etag`.

### Frontend Tests

- idempotency key is generated once and reused across Retry;
- duplicate submission is disabled in flight;
- dialogs remain open after recoverable failure;
- retryable, in-progress, and mismatch states render in English and French;
- retry submits frozen decisions or the retained workspace key;
- successful retry clears recovery UI and refreshes authoritative state.

### Verification Gates

- focused web tests for Whatnot and workspace UI;
- focused API tests for Whatnot services/repositories and workspace services/repositories/routes;
- `npm --prefix apps/api run typecheck`;
- `npm --prefix apps/api run test`;
- `npm run verify:all`;
- `git diff --check`.

## Documentation Updates

After verified implementation:

- remove the completed cross-document recovery item from `docs/refactorplan.md`;
- update C4 component responsibilities and the optimistic-concurrency decision if factual architecture changed;
- update API/realtime or migration documentation only where a new operational repair command is exposed.

## Acceptance Criteria

- Retrying a partially failed Whatnot confirmation completes without duplicate or overwritten sales and mappings.
- A stuck legacy Whatnot batch either resumes safely or enters an explicit recoverable state.
- Workspace creation cannot expose an active workspace before owner membership exists.
- Repeating a workspace create request returns or repairs the same workspace.
- Failed workflows remain visible and user-retryable in English and French.
- Partial-state telemetry contains enough safe metadata to diagnose and measure recovery.
- Focused tests and the complete repository verification gate pass.
