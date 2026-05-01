import { defineComponent } from "vue";

export const WheelActionRail = defineComponent({
  name: "WheelActionRail",
  props: {
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
    resetDisabled: {
      type: Boolean,
      default: false
    },
    resetLabel: {
      type: String,
      default: ""
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
    }
  },
  emits: ["primary-spin", "secondary-action", "reset-session"]
});
