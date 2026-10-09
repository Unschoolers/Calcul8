import AppActionButton from "../../../ui/AppActionButton.vue";
import AppDialogShell from "../../../ui/AppDialogShell.vue";
import { setupTypedGameContext } from "../coordinator/gameContext.ts";

export const GameSpectatorDialog = {
  name: "GameSpectatorDialog",
  components: {
    AppActionButton,
    AppDialogShell
  },
  setup: setupTypedGameContext
};

