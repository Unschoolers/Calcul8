import type { ApiConfig } from "../../types";

export interface MigrationContext {
  runId: string;
  dryRun: boolean;
  startedAt: string;
  triggeredByUserId: string;
  note: string;
  config: ApiConfig;
}

export type MigrationPlan = Record<string, unknown>;
export type MigrationApplyResult = Record<string, unknown> | void;
export type MigrationRerunPolicy = "once" | "repeatable";

export interface MigrationDefinition {
  id: string;
  description: string;
  rerunPolicy?: MigrationRerunPolicy;
  analyze: (context: MigrationContext) => Promise<MigrationPlan>;
  apply: (context: MigrationContext, plan: MigrationPlan) => Promise<MigrationApplyResult>;
}
