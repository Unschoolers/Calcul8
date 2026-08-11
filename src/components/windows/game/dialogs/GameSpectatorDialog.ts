import AppActionButton from "../../../ui/AppActionButton.vue";
import AppDialogShell from "../../../ui/AppDialogShell.vue";
import { gameContextProp, setupGameContext } from "../../shared/contextBridge.ts";

export const GameSpectatorDialog = {
  name: "GameSpectatorDialog",
  components: {
    AppActionButton,
    AppDialogShell
  },
  props: {
    ctx: gameContextProp
  },
  setup: setupGameContext
};

