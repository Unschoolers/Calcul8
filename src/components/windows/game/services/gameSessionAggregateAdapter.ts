import {
  reduceGameSession,
  type GameSessionAggregate,
  type GameSessionCommand,
  type GameSessionEffect
} from "../../../../app-core/shared/game-session-aggregate.ts";
import type { WheelFairnessEntry } from "../../../../types/app.ts";

export interface GameSessionHostState {
  wheelSpinCounts: number[];
  wheelTotalSpins: number;
}

export interface GameSessionControllerState {
  previewSpinCounts: number[];
  previewTotalSpins: number;
  previewFairnessHistory: WheelFairnessEntry[];
  fairnessHistory: WheelFairnessEntry[];
}

export interface GameSessionEffectPorts {
  persist?: () => void | Promise<void>;
  publish?: () => void | Promise<void>;
}

export function readGameSessionAggregate(
  host: GameSessionHostState,
  controller: GameSessionControllerState
): GameSessionAggregate {
  return {
    preview: {
      spinCounts: controller.previewSpinCounts,
      totalSpins: controller.previewTotalSpins,
      fairnessHistory: controller.previewFairnessHistory
    },
    live: {
      spinCounts: host.wheelSpinCounts,
      totalSpins: host.wheelTotalSpins,
      fairnessHistory: controller.fairnessHistory
    }
  };
}

function writeGameSessionAggregate(
  host: GameSessionHostState,
  controller: GameSessionControllerState,
  state: GameSessionAggregate
): void {
  host.wheelSpinCounts = state.live.spinCounts;
  host.wheelTotalSpins = state.live.totalSpins;
  controller.previewSpinCounts = state.preview.spinCounts;
  controller.previewTotalSpins = state.preview.totalSpins;
  controller.previewFairnessHistory = state.preview.fairnessHistory;
  controller.fairnessHistory = state.live.fairnessHistory;
}

export function dispatchGameSessionCommand(
  host: GameSessionHostState,
  controller: GameSessionControllerState,
  command: GameSessionCommand
): GameSessionEffect[] {
  const transition = reduceGameSession(readGameSessionAggregate(host, controller), command);
  writeGameSessionAggregate(host, controller, transition.state);
  return transition.effects;
}

export async function executeGameSessionEffects(
  effects: GameSessionEffect[],
  ports: GameSessionEffectPorts
): Promise<void> {
  const effectTypes = new Set(effects.map((effect) => effect.type));
  const pending: Array<void | Promise<void>> = [];
  if (effectTypes.has("persist")) pending.push(ports.persist?.());
  if (effectTypes.has("publish")) pending.push(ports.publish?.());
  await Promise.all(pending);
}
