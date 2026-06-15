import { defineComponent, type PropType } from "vue";

type ClassObject = Record<string, boolean>;
type ClassValue = string | string[] | ClassObject | Array<string | ClassObject>;

export const AppLoadingState = defineComponent({
  name: "AppLoadingState",
  props: {
    title: {
      type: String,
      default: ""
    },
    body: {
      type: String,
      default: ""
    },
    size: {
      type: [String, Number],
      default: 32
    },
    color: {
      type: String,
      default: "primary"
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
  computed: {
    resolvedClasses(): unknown[] {
      return [
        "app-state-view",
        "app-loading-state",
        {
          "app-state-surface": this.surface,
          "app-state-view--compact": this.compact
        },
        this.stateClass
      ];
    }
  }
});
