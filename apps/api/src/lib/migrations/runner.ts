import { upsertMigrationRun } from "../cosmos";
import type { ApiConfig, MigrationRunDocument } from "../../types";
import type { MigrationDefinition } from "./types";

interface RunMigrationInput {
  migration: MigrationDefinition;
  config: ApiConfig;
  dryRun: boolean;
  triggeredByUserId: string;
  note: string;
}

function createMigrationRunId(migrationId: string): string {
  const randomSuffix = Math.random().toString(36).slice(2, 10);
  return `migration_run:${migrationId}:${Date.now()}:${randomSuffix}`;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Unknown migration error";
}

export async function runMigration(input: RunMigrationInput): Promise<MigrationRunDocument> {
  const startedAt = new Date().toISOString();
  const runId = createMigrationRunId(input.migration.id);

  const runningDocument: MigrationRunDocument = {
    id: runId,
    docType: "migration_run",
    migrationId: input.migration.id,
    status: "running",
    dryRun: input.dryRun,
    startedAt,
    completedAt: null,
    triggeredByUserId: input.triggeredByUserId,
    note: input.note,
    result: null
  };

  await upsertMigrationRun(input.config, runningDocument);

  try {
    const result = await input.migration.run({
      runId,
      dryRun: input.dryRun,
      startedAt,
      triggeredByUserId: input.triggeredByUserId,
      note: input.note,
      config: input.config
    });

    const succeededDocument: MigrationRunDocument = {
      ...runningDocument,
      status: "succeeded",
      completedAt: new Date().toISOString(),
      result: result ?? { message: "Migration completed." }
    };

    return upsertMigrationRun(input.config, succeededDocument);
  } catch (error) {
    const failedDocument: MigrationRunDocument = {
      ...runningDocument,
      status: "failed",
      completedAt: new Date().toISOString(),
      errorMessage: getErrorMessage(error),
      result: null
    };

    await upsertMigrationRun(input.config, failedDocument);
    throw error;
  }
}
