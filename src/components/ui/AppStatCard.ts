import { defineComponent, type PropType } from "vue";

type ClassObject = Record<string, boolean>;
type ClassValue = string | string[] | ClassObject | Array<string | ClassObject>;

type StatTone = "primary" | "secondary" | "success" | "warning" | "error" | "neutral";

export const AppStatCard = defineComponent({
  name: "AppStatCard",
  props: {
    label: {
      type: String,
      required: true
    },
    icon: {
      type: String,
      default: ""
    },
    iconSize: {
      type: [String, Number],
      default: 16
    },
    value: {
      type: String,
      required: true
    },
    meta: {
      type: String,
      default: ""
    },
    tone: {
      type: String as PropType<StatTone>,
      default: "secondary"
    },
    elevation: {
      type: [String, Number],
      default: 4
    },
    cardClasses: {
      type: [String, Array, Object] as PropType<ClassValue>,
      default: ""
    },
    contentClass: {
      type: [String, Array, Object] as PropType<ClassValue>,
      default: ""
    },
    headClass: {
      type: [String, Array, Object] as PropType<ClassValue>,
      default: ""
    },
    labelClass: {
      type: [String, Array, Object] as PropType<ClassValue>,
      default: ""
    },
    iconWrapClass: {
      type: [String, Array, Object] as PropType<ClassValue>,
      default: ""
    },
    valueClasses: {
      type: [String, Array, Object] as PropType<ClassValue>,
      default: ""
    },
    metaClass: {
      type: [String, Array, Object] as PropType<ClassValue>,
      default: ""
    }
  },
  computed: {
    resolvedCardClasses(): unknown[] {
      return ["app-stat-card", `app-stat-card--${this.tone}`, this.cardClasses];
    },
    resolvedContentClasses(): unknown[] {
      return ["app-stat-card__content", this.contentClass];
    },
    resolvedHeadClasses(): unknown[] {
      return ["app-stat-card__head", this.headClass];
    },
    resolvedLabelClasses(): unknown[] {
      return ["app-stat-card__label", this.labelClass];
    },
    resolvedIconWrapClasses(): unknown[] {
      return ["app-stat-card__icon-wrap", this.iconWrapClass];
    },
    resolvedValueClasses(): unknown[] {
      return ["app-stat-card__value", this.valueClasses];
    },
    resolvedMetaClasses(): unknown[] {
      return ["app-stat-card__meta", this.metaClass];
    }
  }
});
