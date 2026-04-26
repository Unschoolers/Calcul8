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
    showSecondary: {
      type: Boolean,
      default: false
    },
    secondaryActive: {
      type: Boolean,
      default: false
    },
    secondaryDisabled: {
      type: Boolean,
      default: false
    },
    secondaryIcon: {
      type: String,
      default: "mdi-autorenew"
    },
    secondaryLabel: {
      type: String,
      default: ""
    },
    secondaryCompactLabel: {
      type: String,
      default: ""
    },
    endingSession: {
      type: Boolean,
      default: false
    }
  },
  emits: ["open-inspector", "primary-spin", "secondary-action", "end-wheel"]
});
