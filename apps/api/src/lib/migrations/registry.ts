import type { MigrationDefinition } from "./types";
import { firstMigration } from "./definitions/firstMigration";
import { salesLiveEntityMigration } from "./definitions/salesLiveEntityMigration";

export const MIGRATION_REGISTRY: MigrationDefinition[] = [
  firstMigration,
  salesLiveEntityMigration
];

export function getMigrationById(migrationId: string): MigrationDefinition | null {
  return MIGRATION_REGISTRY.find((migration) => migration.id === migrationId) ?? null;
}
