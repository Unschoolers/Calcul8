import { defineComponent, type PropType } from "vue";

type ClassObject = Record<string, boolean>;
type ClassValue = string | string[] | ClassObject | Array<string | ClassObject>;

export const AppEmptyState = defineComponent({
  name: "AppEmptyState",
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
    iconSize: {
      type: [String, Number],
      default: 48
    },
    iconColor: {
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
  computed: {
    resolvedClasses(): unknown[] {
      return [
        "app-empty-state-view",
        {
          "app-empty-state": this.surface,
          "app-empty-state-view--compact": this.compact
        },
        this.stateClass
      ];
    },
    resolvedIconColor(): string | undefined {
      return this.iconColor || undefined;
    }
  }
});
