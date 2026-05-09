export type GameStageOverlayEffectType = "dice";

export type GameStageOverlayAnchor = {
  x: number;
  y: number;
  size: number;
};

export type GameStageOverlayIdleCommand = {
  type: "enterIdle";
  effect: GameStageOverlayEffectType;
};

export type GameStageOverlayClearCommand = {
  type: "clear";
  effect: GameStageOverlayEffectType;
};

export type GameStageOverlayStageEnterCommand = {
  type: "stageEnter";
  effect: GameStageOverlayEffectType;
  leftAnchor?: GameStageOverlayAnchor;
  rightAnchor?: GameStageOverlayAnchor;
};

export type GameStageOverlayStageExitCommand = {
  type: "stageExit";
  effect: GameStageOverlayEffectType;
  leftAnchor?: GameStageOverlayAnchor;
  rightAnchor?: GameStageOverlayAnchor;
  winnerSide?: "left" | "right" | null;
  style?: "default" | "champion";
};

export type GameStageOverlayRollStartCommand = {
  type: "rollMatchStart";
  effect: GameStageOverlayEffectType;
  leftLabel: string;
  rightLabel: string;
  leftAnchor?: GameStageOverlayAnchor;
  rightAnchor?: GameStageOverlayAnchor;
};

export type GameStageOverlayRollResolveCommand = {
  type: "rollMatchResolve";
  effect: GameStageOverlayEffectType;
  leftValue: number;
  rightValue: number;
  winnerSide: "left" | "right";
  winnerLabel?: string;
  leftAnchor?: GameStageOverlayAnchor;
  rightAnchor?: GameStageOverlayAnchor;
  finalMatch?: boolean;
};

export type GameStageOverlayCommand =
  | GameStageOverlayIdleCommand
  | GameStageOverlayClearCommand
  | GameStageOverlayStageEnterCommand
  | GameStageOverlayStageExitCommand
  | GameStageOverlayRollStartCommand
  | GameStageOverlayRollResolveCommand;

export function createGameStageOverlayIdleCommand(): GameStageOverlayIdleCommand {
  return {
    type: "enterIdle",
    effect: "dice"
  };
}

export function createGameStageOverlayClearCommand(): GameStageOverlayClearCommand {
  return {
    type: "clear",
    effect: "dice"
  };
}
