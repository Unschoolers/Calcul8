import type { MigrationDefinition } from "./types";
import { firstMigration } from "./definitions/firstMigration";

export const MIGRATION_REGISTRY: MigrationDefinition[] = [firstMigration];

export function getMigrationById(migrationId: string): MigrationDefinition | null {
  return MIGRATION_REGISTRY.find((migration) => migration.id === migrationId) ?? null;
}
