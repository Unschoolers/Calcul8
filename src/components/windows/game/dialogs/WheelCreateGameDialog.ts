import AppDialogShell from "../../../ui/AppDialogShell.vue";
import { gameContextProp, setupGameContext } from "../../shared/contextBridge.ts";

export const WheelCreateGameDialog = {
  name: "WheelCreateGameDialog",
  components: { AppDialogShell },
  props: {
    ctx: gameContextProp
  },
  setup: setupGameContext
};

