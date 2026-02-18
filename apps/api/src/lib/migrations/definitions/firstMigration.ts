import {
  getMigrationMarker,
  upsertMigrationMarker,
  type UpsertMigrationMarkerInput
} from "../../cosmos";
import type { ApiConfig, MigrationMarkerDocument } from "../../../types";
import type { MigrationDefinition } from "../types";

type MigrationMarkerReader = (
  config: ApiConfig,
  migrationId: string
) => Promise<MigrationMarkerDocument | null>;

type MigrationMarkerWriter = (
  config: ApiConfig,
  input: UpsertMigrationMarkerInput
) => Promise<MigrationMarkerDocument>;

export function createFirstMigration(
  readMarker: MigrationMarkerReader = getMigrationMarker,
  writeMarker: MigrationMarkerWriter = upsertMigrationMarker
): MigrationDefinition {
  return {
    id: "first_migration",
    description: "Smoke migration: writes a marker in migration_runs.",
    async analyze(context) {
      const marker = await readMarker(context.config, "first_migration");
      return {
        message: "Analyze first_migration marker state.",
        markerId: "migration_marker:first_migration",
        markerExists: marker != null,
        previousRunId: marker?.lastRunId ?? null,
        checkedAt: new Date().toISOString()
      };
    },
    async apply(context, plan) {
      const result = {
        message: "first migration",
        dryRun: false,
        checkedAt: new Date().toISOString(),
        previousMarkerExists: Boolean(plan.markerExists)
      };

      const marker = await writeMarker(context.config, {
        migrationId: "first_migration",
        runId: context.runId,
        triggeredByUserId: context.triggeredByUserId,
        note: context.note,
        result
      });

      return {
        ...result,
        markerId: marker.id,
        markerUpdatedAt: marker.updatedAt
      };
    }
  };
}

export const firstMigration = createFirstMigration();
