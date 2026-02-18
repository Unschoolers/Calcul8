import type { MigrationDefinition } from "./types";

const firstMigration: MigrationDefinition = {
  id: "first_migration",
  description: "Smoke migration: writes a marker in migration_runs.",
  async run(context) {
    return {
      message: "first migration",
      dryRun: context.dryRun,
      checkedAt: new Date().toISOString()
    };
  }
};

export const MIGRATION_REGISTRY: MigrationDefinition[] = [firstMigration];

export function getMigrationById(migrationId: string): MigrationDefinition | null {
  return MIGRATION_REGISTRY.find((migration) => migration.id === migrationId) ?? null;
}
