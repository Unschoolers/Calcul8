import { defineComponent, type PropType } from "vue";

type ClassObject = Record<string, boolean>;
type ClassValue = string | string[] | ClassObject | Array<string | ClassObject>;
type AppErrorTone = "error" | "warning" | "info";

export const AppErrorState = defineComponent({
  name: "AppErrorState",
  props: {
    title: {
      type: String,
      default: ""
    },
    body: {
      type: String,
      default: ""
    },
    icon: {
      type: String,
      default: ""
    },
    tone: {
      type: String as PropType<AppErrorTone>,
      default: "error"
    },
    actionLabel: {
      type: String,
      default: ""
    },
    surface: {
      type: Boolean,
      default: false
    },
    compact: {
      type: Boolean,
      default: false
    },
    stateClass: {
      type: [String, Array, Object] as PropType<ClassValue>,
      default: ""
    }
  },
  emits: ["action"],
  computed: {
    resolvedClasses(): unknown[] {
      return [
        "app-state-view",
        "app-error-state",
        `app-error-state--${this.tone}`,
        {
          "app-state-surface": this.surface,
          "app-state-view--compact": this.compact
        },
        this.stateClass
      ];
    },
    resolvedIcon(): string {
      if (this.icon) return this.icon;
      if (this.tone === "warning") return "mdi-alert-outline";
      if (this.tone === "info") return "mdi-information-outline";
      return "mdi-alert-circle-outline";
    },
    resolvedColor(): string {
      if (this.tone === "warning") return "warning";
      if (this.tone === "info") return "info";
      return "error";
    }
  },
  methods: {
    emitAction(): void {
      this.$emit("action");
    }
  }
});
