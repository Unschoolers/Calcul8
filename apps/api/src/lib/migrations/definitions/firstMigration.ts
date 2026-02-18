import { upsertMigrationMarker, type UpsertMigrationMarkerInput } from "../../cosmos";
import type { ApiConfig, MigrationMarkerDocument } from "../../../types";
import type { MigrationDefinition } from "../types";

type MigrationMarkerWriter = (
  config: ApiConfig,
  input: UpsertMigrationMarkerInput
) => Promise<MigrationMarkerDocument>;

export function createFirstMigration(writeMarker: MigrationMarkerWriter = upsertMigrationMarker): MigrationDefinition {
  return {
    id: "first_migration",
    description: "Smoke migration: writes a marker in migration_runs.",
    async run(context) {
      if (context.dryRun) {
        return {
          message: "Dry run: first migration would write a marker document.",
          dryRun: true,
          markerId: "migration_marker:first_migration",
          checkedAt: new Date().toISOString()
        };
      }

      const result = {
        message: "first migration",
        dryRun: false,
        checkedAt: new Date().toISOString()
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
