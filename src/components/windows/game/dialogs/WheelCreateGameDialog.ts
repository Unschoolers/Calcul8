import { gameContextProp, setupGameContext } from "../../shared/contextBridge.ts";

export const WheelCreateGameDialog = {
  name: "WheelCreateGameDialog",
  props: {
    ctx: gameContextProp
  },
  setup: setupGameContext
};

