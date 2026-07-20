import AppActionButton from "../../../ui/AppActionButton.vue";
import { gameContextProp, setupGameContext } from "../../shared/contextBridge.ts";

export const GameSpectatorDialog = {
  name: "GameSpectatorDialog",
  components: {
    AppActionButton
  },
  props: {
    ctx: gameContextProp
  },
  setup: setupGameContext
};

