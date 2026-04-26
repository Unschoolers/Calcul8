import { defineComponent, type PropType } from "vue";

type ClassValue = string | string[];

export const PortfolioKpiCard = defineComponent({
  name: "PortfolioKpiCard",
  props: {
    label: {
      type: String,
      required: true
    },
    icon: {
      type: String,
      required: true
    },
    value: {
      type: String,
      required: true
    },
    meta: {
      type: String,
      required: true
    },
    cardClasses: {
      type: [String, Array] as PropType<ClassValue>,
      default: ""
    },
    valueClasses: {
      type: [String, Array] as PropType<ClassValue>,
      default: ""
    }
  },
  computed: {
    resolvedCardClasses(): string[] {
      const value = this.cardClasses;
      return Array.isArray(value) ? value : [value];
    },
    resolvedValueClasses(): string[] {
      const value = this.valueClasses;
      return Array.isArray(value) ? value : [value];
    }
  }
});
