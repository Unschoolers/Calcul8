import { defineComponent, type PropType } from "vue";

type ClassObject = Record<string, boolean>;
type ClassValue = string | string[] | ClassObject | Array<string | ClassObject>;

export const AppDestructiveWarning = defineComponent({
  name: "AppDestructiveWarning",
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
      default: "mdi-alert-outline"
    },
    warningClass: {
      type: [String, Array, Object] as PropType<ClassValue>,
      default: ""
    }
  },
  computed: {
    resolvedClasses(): unknown[] {
      return ["app-destructive-warning", this.warningClass];
    }
  }
});
