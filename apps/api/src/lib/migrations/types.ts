import type { ApiConfig } from "../../types";

export interface MigrationContext {
  runId: string;
  dryRun: boolean;
  startedAt: string;
  triggeredByUserId: string;
  note: string;
  config: ApiConfig;
}

export interface MigrationDefinition {
  id: string;
  description: string;
  run: (context: MigrationContext) => Promise<Record<string, unknown> | void>;
}
