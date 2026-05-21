import { defineComponent, type PropType } from "vue";

type ClassObject = Record<string, boolean>;
type ClassValue = string | string[] | ClassObject | Array<string | ClassObject>;

export const AppToolbarCard = defineComponent({
  name: "AppToolbarCard",
  props: {
    elevation: {
      type: [String, Number],
      default: 2
    },
    cardClass: {
      type: [String, Array, Object] as PropType<ClassValue>,
      default: ""
    },
    contentClass: {
      type: [String, Array, Object] as PropType<ClassValue>,
      default: ""
    }
  },
  computed: {
    resolvedCardClasses(): unknown[] {
      return ["app-toolbar-card", this.cardClass];
    },
    resolvedContentClasses(): unknown[] {
      return ["app-toolbar-card__content", this.contentClass];
    }
  }
});
