import { type PropType } from "vue";
import AppActionButton from "../../../ui/AppActionButton.vue";
import { useGameNestedWindowContextBridge } from "../../shared/contextBridge.ts";

export const GameSpectatorDialog = {
  name: "GameSpectatorDialog",
  components: {
    AppActionButton
  },
  props: {
    ctx: {
      type: Object as PropType<Record<string, unknown>>,
      required: true
    }
  },
  setup(props: { ctx: Record<string, unknown> }) {
    return useGameNestedWindowContextBridge(props);
  }
};

