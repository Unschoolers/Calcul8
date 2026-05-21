import { defineComponent, type PropType } from "vue";

type ButtonColor = "primary" | "secondary" | "error" | "warning" | "success";

export const AppConfirmDialog = defineComponent({
  name: "AppConfirmDialog",
  props: {
    modelValue: {
      type: Boolean,
      default: false
    },
    title: {
      type: String,
      required: true
    },
    body: {
      type: String,
      default: ""
    },
    cancelText: {
      type: String,
      default: "Cancel"
    },
    confirmText: {
      type: String,
      default: "Confirm"
    },
    confirmColor: {
      type: String as PropType<ButtonColor>,
      default: "primary"
    },
    confirmLoading: {
      type: Boolean,
      default: false
    },
    confirmDisabled: {
      type: Boolean,
      default: false
    },
    maxWidth: {
      type: [String, Number],
      default: 480
    },
    persistent: {
      type: Boolean,
      default: false
    }
  },
  emits: ["update:modelValue", "cancel", "confirm"],
  methods: {
    updateModelValue(value: boolean): void {
      this.$emit("update:modelValue", value);
    },
    cancel(): void {
      this.$emit("cancel");
      this.updateModelValue(false);
    },
    confirm(): void {
      this.$emit("confirm");
    }
  }
});
