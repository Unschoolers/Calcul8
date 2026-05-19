import { defineComponent, type PropType } from "vue";

type ClassObject = Record<string, boolean>;
type ClassValue = string | string[] | ClassObject | Array<string | ClassObject>;

export const AppSectionCard = defineComponent({
  name: "AppSectionCard",
  props: {
    title: {
      type: String,
      default: ""
    },
    icon: {
      type: String,
      default: ""
    },
    iconSize: {
      type: [String, Number],
      default: 16
    },
    elevation: {
      type: [String, Number],
      default: 4
    },
    cardClass: {
      type: [String, Array, Object] as PropType<ClassValue>,
      default: ""
    },
    titleClass: {
      type: [String, Array, Object] as PropType<ClassValue>,
      default: ""
    },
    contentClass: {
      type: [String, Array, Object] as PropType<ClassValue>,
      default: ""
    },
    divider: {
      type: Boolean,
      default: false
    },
    wrapContent: {
      type: Boolean,
      default: true
    }
  },
  computed: {
    hasHeader(): boolean {
      return Boolean(this.title || this.icon || this.$slots.header);
    },
    showDivider(): boolean {
      return Boolean(this.divider && this.hasHeader);
    },
    resolvedCardClasses(): unknown[] {
      return ["app-section-card", this.cardClass];
    },
    resolvedTitleClasses(): unknown[] {
      return ["app-section-title-bar", "d-flex", "align-center", "justify-space-between", this.titleClass];
    },
    resolvedContentClasses(): unknown[] {
      return [this.contentClass];
    }
  }
});
