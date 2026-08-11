import { defineComponent, nextTick } from "vue";
import "./AppFormLayout.css";

export const AppFormLayout = defineComponent({
  name: "AppFormLayout",
  props: {
    compact: { type: Boolean, default: false },
    responsive: { type: Boolean, default: true },
    stickyActions: { type: Boolean, default: false }
  },
  computed: {
    layoutClasses(): Record<string, boolean> {
      return {
        "app-form-layout--compact": this.compact,
        "app-form-layout--responsive": this.responsive
      };
    }
  },
  mounted(): void {
    this.applyTextWrapToLabels();
  },
  updated(): void {
    void nextTick(() => this.applyTextWrapToLabels());
  },
  methods: {
    applyTextWrapToLabels(): void {
      const root = this.$el;
      if (!(root instanceof HTMLElement)) return;

      root.querySelectorAll(".app-form-fields label").forEach((label) => label.classList.add("app-text-wrap"));
    }
  }
});
