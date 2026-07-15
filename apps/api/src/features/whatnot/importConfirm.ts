import { randomUUID } from "node:crypto";
import { HttpError } from "../../lib/auth";
import { getEffectiveSyncSnapshot } from "../../lib/cosmos/syncSnapshotRepository";
import {
  claimPendingWhatnotImportBatch,
  completeWhatnotImportBatch,
  getWhatnotConnection,
  initializeWhatnotConfirmationPlan,
  markWhatnotImportBatchRecoverable,
  releaseClaimedWhatnotImportBatch,
  renewWhatnotImportConfirmationLease,
  upsertWhatnotConnection
} from "../../lib/cosmos/whatnotRepository";
import type { ApiConfig } from "../../types";
import {
  buildWhatnotConfirmationFingerprint,
  normalizeWhatnotConfirmationDecisions,
  validateWhatnotConfirmationPlan
} from "./confirmationRecovery";
import { buildWhatnotConfirmationPlan } from "./confirmationPlan";
import { runWhatnotConfirmationPlan } from "./confirmationRunner";
import {
  buildLotSnapshots,
  normalizeId,
  resolveWhatnotScope,
  type ReviewDecisionInput
} from "./serviceCore";

const WHATNOT_CONFIRMATION_LEASE_MS = 5 * 60 * 1000;

function restoreConfirmationDecisions(
  decisions: ReturnType<typeof normalizeWhatnotConfirmationDecisions>
): ReviewDecisionInput[] {
  return decisions.map((decision) => ({
    rowId: decision.rowId,
    ...(decision.skip ? { skip: true } : {}),
    ...(decision.lotId ? { lotId: String(decision.lotId) } : {}),
    ...(decision.saleType ? { saleType: decision.saleType } : {}),
    ...(decision.packsCount ? { packsCount: decision.packsCount } : {}),
    ...(decision.targetKind ? { targetKind: decision.targetKind } : {}),
    ...(decision.targetSaleId ? { targetSaleId: decision.targetSaleId } : {}),
    ...(decision.selectedImportAction ? { selectedImportAction: decision.selectedImportAction } : {})
  }));
}

export async function confirmWhatnotImportBatchForActor(
  config: ApiConfig,
  actorUserId: string,
  input: {
    batchId: string;
    workspaceId?: string;
    decisions: ReviewDecisionInput[];
  }
): Promise<{ importedCount: number; updatedCount: number; skippedCount: number }> {
  const scope = await resolveWhatnotScope(config, actorUserId, input.workspaceId, false);
  const connection = await getWhatnotConnection(config, scope.connectionScopeKey);
  const normalizedDecisions = normalizeWhatnotConfirmationDecisions(input.decisions);
  const confirmationFingerprint = buildWhatnotConfirmationFingerprint(normalizedDecisions);
  const attemptId = randomUUID();
  const claimedAt = new Date().toISOString();

  const claim = await claimPendingWhatnotImportBatch(
    config,
    scope.partitionKey,
    input.batchId,
    claimedAt,
    {
      fingerprint: confirmationFingerprint,
      decisions: normalizedDecisions,
      attemptId,
      actorUserId,
      leaseExpiresAt: new Date(Date.parse(claimedAt) + WHATNOT_CONFIRMATION_LEASE_MS).toISOString()
    }
  );
  if (claim.status === "not_found") {
    throw new HttpError(404, "Whatnot review batch was not found.");
  }
  if (claim.status === "already_completed" && claim.batch) {
    return {
      importedCount: claim.batch.importedCount,
      updatedCount: claim.batch.updatedCount,
      skippedCount: claim.batch.skippedCount
    };
  }
  if (claim.status === "idempotency_mismatch") {
    throw new HttpError(
      409,
      "Whatnot confirmation decisions changed after processing began. Restart review.",
      "IDEMPOTENCY_MISMATCH"
    );
  }
  if (claim.status !== "claimed" || !claim.batch) {
    throw new HttpError(
      409,
      "Whatnot review batch is already being confirmed. Refresh and try again.",
      "OPERATION_IN_PROGRESS"
    );
  }

  let batch = claim.batch;
  const claimedAttemptId = batch.confirmationAttempt?.attemptId ?? attemptId;
  let writeStarted = false;
  let activeOperationKey: string | undefined;
  let activePhase: string | undefined;

  try {
    const snapshot = await getEffectiveSyncSnapshot(config, scope.partitionKey);
    const lots = buildLotSnapshots(snapshot?.lots ?? []);
    const frozenDecisions = restoreConfirmationDecisions(batch.confirmationDecisions ?? normalizedDecisions);
    const decisionsByRowId = new Map(
      frozenDecisions.map((decision) => [normalizeId(decision.rowId), decision] as const)
    );
    validateWhatnotConfirmationPlan(batch.rows, decisionsByRowId, lots);
    const runtimeOperations = await buildWhatnotConfirmationPlan(config, {
      scopeKey: scope.partitionKey,
      batchId: batch.batchId,
      rows: batch.rows,
      decisionsByRowId,
      lots,
      existingPlan: batch.confirmationPlan,
      recoveryAttempt: (batch.confirmationAttempt?.attemptNumber ?? 1) > 1,
      legacyAdoption: batch.confirmationAttempt?.adoptedLegacyProcessing === true
    });

    writeStarted = true;
    activePhase = "plan";
    batch = await initializeWhatnotConfirmationPlan(config, {
      scopeKey: scope.partitionKey,
      batchId: batch.batchId,
      attemptId: claimedAttemptId,
      plan: runtimeOperations.map((operation) => operation.plan),
      initializedAt: new Date().toISOString()
    });

    const runResult = await runWhatnotConfirmationPlan(config, {
      actorUserId,
      scopeKey: scope.partitionKey,
      batch,
      attemptId: claimedAttemptId,
      operations: runtimeOperations,
      leaseMs: WHATNOT_CONFIRMATION_LEASE_MS,
      onPhase(operationKey, phase) {
        activeOperationKey = operationKey;
        activePhase = phase;
      }
    });
    batch = runResult.batch;

    const renewFinalizationLease = async (phase: string): Promise<void> => {
      activePhase = phase;
      const renewedAt = new Date().toISOString();
      const renewed = await renewWhatnotImportConfirmationLease(config, {
        scopeKey: scope.partitionKey,
        batchId: batch.batchId,
        attemptId: claimedAttemptId,
        renewedAt,
        leaseExpiresAt: new Date(Date.parse(renewedAt) + WHATNOT_CONFIRMATION_LEASE_MS).toISOString()
      });
      if (!renewed) {
        throw new HttpError(409, "Another confirmation attempt owns this Whatnot review.", "OPERATION_IN_PROGRESS");
      }
      batch = renewed;
    };

    if (batch.origin === "oauth_sync" && connection && connection.status === "active") {
      await renewFinalizationLease("connection");
      await upsertWhatnotConnection(config, {
        ...connection,
        updatedAt: new Date().toISOString(),
        lastSyncedAt: new Date().toISOString()
      });
    }

    const completedAt = new Date().toISOString();
    await renewFinalizationLease("complete");
    const completedBatch = await completeWhatnotImportBatch(config, batch, {
      importedCount: runResult.importedCount,
      updatedCount: runResult.updatedCount,
      skippedCount: runResult.skippedCount,
      completedAt
    });

    return {
      importedCount: completedBatch.importedCount,
      updatedCount: completedBatch.updatedCount,
      skippedCount: completedBatch.skippedCount
    };
  } catch (error) {
    if (!writeStarted) {
      await releaseClaimedWhatnotImportBatch(
        config,
        batch,
        new Date().toISOString(),
        error instanceof Error ? error.message : "Whatnot confirmation failed."
      ).catch(() => null);
    } else {
      await markWhatnotImportBatchRecoverable(config, {
        scopeKey: scope.partitionKey,
        batchId: batch.batchId,
        attemptId: claimedAttemptId,
        failedOperationKey: activeOperationKey,
        failedPhase: activePhase,
        // Persist the diagnostic phase without storing raw Cosmos messages or
        // seller/external identifiers in workflow state.
        errorMessage: `Whatnot confirmation failed during ${activePhase ?? "unknown"}.`,
        failedAt: new Date().toISOString()
      }).catch(() => null);
      if (!(error instanceof HttpError)) {
        throw new HttpError(
          503,
          "Whatnot confirmation was partially saved. Retry the same review to continue safely.",
          "RECOVERY_CONFLICT"
        );
      }
    }
    throw error;
  }
}
