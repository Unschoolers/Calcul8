import type { WheelFairnessEntry } from "../../types/app.ts";

export type GameExecution = "preview" | "live";

export interface GameSessionTrack {
  spinCounts: number[];
  totalSpins: number;
  fairnessHistory: WheelFairnessEntry[];
}

export interface GameSessionAggregate {
  preview: GameSessionTrack;
  live: GameSessionTrack;
}

export type GameSessionCommand =
  | {
      type: "spin-recorded";
      execution: GameExecution;
      slotIndex: number;
      slotCount: number;
    }
  | {
      type: "fairness-recorded";
      execution: GameExecution;
      entry: WheelFairnessEntry;
      historyLimit?: number;
    }
  | {
      type: "session-reset";
      execution: GameExecution;
      slotCount: number;
    };

export type GameSessionEffect =
  | { type: "persist" }
  | { type: "publish" };

export interface GameSessionTransition {
  state: GameSessionAggregate;
  effects: GameSessionEffect[];
}

function createTrack(slotCount: number): GameSessionTrack {
  const count = Math.max(0, Math.floor(Number(slotCount) || 0));
  return {
    spinCounts: new Array(count).fill(0),
    totalSpins: 0,
    fairnessHistory: []
  };
}

export function createGameSessionAggregate(slotCount = 0): GameSessionAggregate {
  return {
    preview: createTrack(slotCount),
    live: createTrack(slotCount)
  };
}

export function selectGameSessionTrack(
  state: GameSessionAggregate,
  execution: GameExecution
): GameSessionTrack {
  return state[execution];
}

function replaceTrack(
  state: GameSessionAggregate,
  execution: GameExecution,
  track: GameSessionTrack
): GameSessionAggregate {
  return {
    ...state,
    [execution]: track
  };
}

export function reduceGameSession(
  state: GameSessionAggregate,
  command: GameSessionCommand
): GameSessionTransition {
  if (command.type === "session-reset") {
    return {
      state: replaceTrack(state, command.execution, createTrack(command.slotCount)),
      effects: [{ type: "persist" }, { type: "publish" }]
    };
  }

  const current = state[command.execution];
  if (command.type === "fairness-recorded") {
    const historyLimit = Math.max(1, Math.floor(Number(command.historyLimit) || 20));
    return {
      state: replaceTrack(state, command.execution, {
        ...current,
        fairnessHistory: [...current.fairnessHistory, command.entry].slice(-historyLimit)
      }),
      effects: [{ type: "persist" }]
    };
  }

  const slotCount = Math.max(0, Math.floor(Number(command.slotCount) || 0));
  const slotIndex = Math.floor(Number(command.slotIndex));
  if (!Number.isFinite(slotIndex) || slotIndex < 0 || slotIndex >= slotCount) {
    return { state, effects: [] };
  }

  const spinCounts = current.spinCounts.length === slotCount
    ? [...current.spinCounts]
    : new Array(slotCount).fill(0);
  spinCounts[slotIndex] = (spinCounts[slotIndex] || 0) + 1;
  return {
    state: replaceTrack(state, command.execution, {
      ...current,
      spinCounts,
      totalSpins: current.totalSpins + 1
    }),
    effects: [{ type: "persist" }]
  };
}
