import { defineComponent, type PropType } from "vue";

type ClassObject = Record<string, boolean>;
type ClassValue = string | string[] | ClassObject | Array<string | ClassObject>;

export const AppStickyActionFooter = defineComponent({
  name: "AppStickyActionFooter",
  props: {
    footerClass: {
      type: [String, Array, Object] as PropType<ClassValue>,
      default: ""
    }
  },
  computed: {
    resolvedClasses(): unknown[] {
      return ["app-dialog-actions", "app-sticky-action-footer", this.footerClass];
    }
  }
});
