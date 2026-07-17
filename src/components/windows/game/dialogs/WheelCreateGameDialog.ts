import { type PropType } from "vue";
import { useGameNestedWindowContextBridge } from "../../shared/contextBridge.ts";

export const WheelCreateGameDialog = {
  name: "WheelCreateGameDialog",
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

