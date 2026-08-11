import { defineComponent, nextTick, type PropType } from "vue";
import AppStickyActionFooter from "./AppStickyActionFooter.vue";
import "./AppDialogShell.css";

export type AppDialogVariant = "standard" | "report" | "checkout" | "media";

let dialogSequence = 0;

export const AppDialogShell = defineComponent({
  name: "AppDialogShell",
  components: { AppStickyActionFooter },
  props: {
    modelValue: { type: Boolean, default: false },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    maxWidth: { type: [String, Number], default: 560 },
    persistent: { type: Boolean, default: false },
    scrollable: { type: Boolean, default: true },
    variant: { type: String as PropType<AppDialogVariant>, default: "standard" },
    initialFocusSelector: { type: String, default: "" }
  },
  emits: ["update:modelValue"],
  data() {
    dialogSequence += 1;
    return {
      titleId: `app-dialog-title-${dialogSequence}`,
      descriptionId: `app-dialog-description-${dialogSequence}`,
      returnFocusTarget: null as HTMLElement | null,
      clickListener: null as ((event: MouseEvent) => void) | null,
      keyDownListener: null as ((event: KeyboardEvent) => void) | null
    };
  },
  mounted(): void {
    this.clickListener = (event: MouseEvent) => this.captureReturnFocusTarget(event);
    this.keyDownListener = (event: KeyboardEvent) => this.handleDocumentKeydown(event);
    document.addEventListener("click", this.clickListener, true);
    document.addEventListener("keydown", this.keyDownListener, true);

    if (this.modelValue) void nextTick(() => this.focusInitialTarget());
  },
  beforeUnmount(): void {
    if (this.clickListener) {
      document.removeEventListener("click", this.clickListener, true);
    }
    if (this.keyDownListener) {
      document.removeEventListener("keydown", this.keyDownListener, true);
    }
  },
  watch: {
    modelValue(open: boolean, wasOpen: boolean): void {
      if (open) {
        const activeElement = document.activeElement;
        if (activeElement instanceof HTMLElement && activeElement !== document.body) {
          this.returnFocusTarget = activeElement;
        }
        void nextTick(() => this.focusInitialTarget());
      } else if (wasOpen) {
        this.restoreFocus();
      }
    }
  },
  methods: {
    captureReturnFocusTarget(event: MouseEvent): void {
      if (this.modelValue || !(event.target instanceof HTMLElement)) return;

      const target = event.target.closest<HTMLElement>("button, [href], input, select, textarea, [tabindex]");
      if (target) this.returnFocusTarget = target;
    },
    getSurfaceElement(): HTMLElement | undefined {
      const surface = this.$refs.surface as HTMLElement | { $el?: HTMLElement } | undefined;
      return surface instanceof HTMLElement ? surface : surface?.$el;
    },
    handleDocumentKeydown(event: KeyboardEvent): void {
      if (event.key !== "Escape" || this.persistent || !this.modelValue) return;

      const dialog = this.getSurfaceElement()?.closest<HTMLElement>("[role='dialog']");
      if (!(event.target instanceof Node) || !dialog?.contains(event.target)) return;

      event.preventDefault();
      event.stopPropagation();
      this.updateModelValue(false);
    },
    updateModelValue(value: boolean): void {
      if (!value && this.modelValue) {
        this.restoreFocus();
      }
      this.$emit("update:modelValue", value);
    },
    focusInitialTarget(): void {
      const root = this.getSurfaceElement();
      const selector = this.initialFocusSelector || "[autofocus], input:not([disabled]), button:not([disabled]), [tabindex='0']";
      root?.querySelector<HTMLElement>(selector)?.focus();
    },
    restoreFocus(): void {
      if (this.returnFocusTarget?.isConnected) {
        this.returnFocusTarget.focus();
        return;
      }
      document.querySelector<HTMLElement>(".app-shell-content-zone")?.focus({ preventScroll: true });
    }
  }
});
