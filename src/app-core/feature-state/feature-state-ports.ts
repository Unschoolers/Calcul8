import { inject, type InjectionKey } from "vue";
import type { AppState } from "../../types/app.ts";

export type FeatureStatePorts = {
  sales: NonNullable<AppState["salesFeatureState"]>;
  integrations: NonNullable<AppState["integrationFeatureState"]>;
  gameSession: NonNullable<AppState["gameSessionFeatureState"]>;
};

export const featureStatePortsKey: InjectionKey<FeatureStatePorts> = Symbol("featureStatePorts");

export function createFeatureStatePorts(source: Pick<AppState, "salesFeatureState" | "integrationFeatureState" | "gameSessionFeatureState">): FeatureStatePorts {
  const sales = source.salesFeatureState;
  const integrations = source.integrationFeatureState;
  const gameSession = source.gameSessionFeatureState;
  if (!sales) throw new Error("Missing sales feature state owner.");
  if (!integrations) throw new Error("Missing integration feature state owner.");
  if (!gameSession) throw new Error("Missing game session feature state owner.");
  return {
    sales,
    integrations,
    gameSession
  };
}

export function useFeatureStatePorts(): FeatureStatePorts {
  const ports = inject(featureStatePortsKey, null);
  if (!ports) throw new Error("Feature state owners were not provided.");
  return ports;
}
