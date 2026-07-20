import { gameContextProp, setupGameContext } from "../../shared/contextBridge.ts";

export const WheelStageTopbar = {
  name: "WheelStageTopbar",
  props: {
    ctx: gameContextProp
  },
  setup: setupGameContext
};

