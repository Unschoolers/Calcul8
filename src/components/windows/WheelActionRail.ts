import { defineComponent, type PropType } from "vue";

export const WheelActionRail = defineComponent({
  name: "WheelActionRail",
  props: {
    mode: {
      type: String as PropType<"config" | "live">,
      required: true
    },
    primaryDisabled: {
      type: Boolean,
      default: false
    },
    primaryIcon: {
      type: String,
      required: true
    },
    primaryLabel: {
      type: String,
      required: true
    },
    endingSession: {
      type: Boolean,
      default: false
    }
  },
  emits: ["open-inspector", "primary-spin", "end-wheel"]
});
