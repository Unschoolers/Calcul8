import { inject, type InjectionKey } from "vue";
import type { AppState } from "../../types/app.ts";
import type { GameSessionFeatureState } from "./game-session-state.ts";
import type { IntegrationFeatureState } from "./integration-state.ts";
import type { SalesFeatureState } from "./sales-state.ts";

export type FeatureStatePorts = {
  sales: SalesFeatureState;
  integrations: IntegrationFeatureState;
  gameSession: GameSessionFeatureState;
};

export const featureStatePortsKey: InjectionKey<FeatureStatePorts> = Symbol("featureStatePorts");

export function createFeatureStatePorts(source: Pick<AppState, "salesFeatureState" | "integrationFeatureState" | "gameSessionFeatureState">): FeatureStatePorts {
  const requireOwner = <T extends object>(owner: Record<string, unknown> | undefined, label: string): T => {
    if (!owner) throw new Error(`Missing ${label} feature state owner.`);
    return owner as T;
  };
  return {
    sales: requireOwner<SalesFeatureState>(source.salesFeatureState, "sales"),
    integrations: requireOwner<IntegrationFeatureState>(source.integrationFeatureState, "integration"),
    gameSession: requireOwner<GameSessionFeatureState>(source.gameSessionFeatureState, "game session")
  };
}

export function useFeatureStatePorts(): FeatureStatePorts {
  const ports = inject(featureStatePortsKey, null);
  if (!ports) throw new Error("Feature state owners were not provided.");
  return ports;
}
