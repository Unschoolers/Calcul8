import type {
  ApiConfig,
  MigrationMarkerDocument,
  MigrationRunDocument
} from "../../types";
import { getContainers, withCosmosRetry } from "./core";
import { migrationMarkerId } from "./ids";

export async function upsertMigrationRun(
  config: ApiConfig,
  document: MigrationRunDocument
): Promise<MigrationRunDocument> {
  const { migrationRuns } = getContainers(config);
  const { resource } = await withCosmosRetry(() =>
    migrationRuns.items.upsert<MigrationRunDocument>(document)
  );

  if (!resource) {
    throw new Error("Failed to upsert migration run.");
  }

  return resource;
}

export interface UpsertMigrationMarkerInput {
  migrationId: string;
  runId: string;
  triggeredByUserId: string;
  note: string;
  result: Record<string, unknown> | null;
}

export async function upsertMigrationMarker(
  config: ApiConfig,
  input: UpsertMigrationMarkerInput
): Promise<MigrationMarkerDocument> {
  const { migrationRuns } = getContainers(config);
  const document: MigrationMarkerDocument = {
    id: migrationMarkerId(input.migrationId),
    docType: "migration_marker",
    migrationId: input.migrationId,
    updatedAt: new Date().toISOString(),
    lastRunId: input.runId,
    triggeredByUserId: input.triggeredByUserId,
    note: input.note,
    result: input.result
  };

  const { resource } = await withCosmosRetry(() =>
    migrationRuns.items.upsert<MigrationMarkerDocument>(document)
  );

  if (!resource) {
    throw new Error("Failed to upsert migration marker.");
  }

  return resource;
}

export async function getMigrationMarker(
  config: ApiConfig,
  migrationId: string
): Promise<MigrationMarkerDocument | null> {
  const { migrationRuns } = getContainers(config);
  const markerId = migrationMarkerId(migrationId);
  const querySpec = {
    query: "SELECT TOP 1 * FROM c WHERE c.id = @id AND c.docType = @docType",
    parameters: [
      { name: "@id", value: markerId },
      { name: "@docType", value: "migration_marker" }
    ]
  };

  const iterator = migrationRuns.items.query<MigrationMarkerDocument>(querySpec, {
    maxItemCount: 1
  });
  const { resources } = await withCosmosRetry(() => iterator.fetchAll());
  return resources?.[0] ?? null;
}

interface ListMigrationRunsOptions {
  migrationId?: string;
  limit?: number;
}

export async function listMigrationRuns(
  config: ApiConfig,
  { migrationId, limit = 20 }: ListMigrationRunsOptions = {}
): Promise<MigrationRunDocument[]> {
  const { migrationRuns } = getContainers(config);
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.floor(limit))) : 20;

  const querySpec = migrationId
    ? {
      query: `SELECT TOP ${safeLimit} * FROM c WHERE c.docType = @docType AND c.migrationId = @migrationId ORDER BY c.startedAt DESC`,
      parameters: [
        { name: "@docType", value: "migration_run" },
        { name: "@migrationId", value: migrationId }
      ]
    }
    : {
      query: `SELECT TOP ${safeLimit} * FROM c WHERE c.docType = @docType ORDER BY c.startedAt DESC`,
      parameters: [{ name: "@docType", value: "migration_run" }]
    };

  const iterator = migrationRuns.items.query<MigrationRunDocument>(querySpec, {
    maxItemCount: safeLimit
  });
  const { resources } = await withCosmosRetry(() => iterator.fetchAll());
  return resources ?? [];
}
