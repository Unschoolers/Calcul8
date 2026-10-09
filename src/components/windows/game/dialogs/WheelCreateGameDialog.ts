import AppDialogShell from "../../../ui/AppDialogShell.vue";
import { setupTypedGameContext } from "../coordinator/gameContext.ts";

export const WheelCreateGameDialog = {
  name: "WheelCreateGameDialog",
  components: { AppDialogShell },
  setup: setupTypedGameContext
};

