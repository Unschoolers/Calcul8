import { gameContextProp, setupGameContext } from "../../shared/contextBridge.ts";

export const WheelStageSummary = {
  name: "WheelStageSummary",
  props: {
    ctx: gameContextProp
  },
  setup: setupGameContext
};

