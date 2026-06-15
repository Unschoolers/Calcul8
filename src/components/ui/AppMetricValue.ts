import { defineComponent, type PropType } from "vue";

type ClassObject = Record<string, boolean>;
type ClassValue = string | string[] | ClassObject | Array<string | ClassObject>;
type MetricKind = "money" | "percent" | "count" | "delta" | "status";
type MetricTone = "positive" | "negative" | "neutral" | "target";

export const AppMetricValue = defineComponent({
  name: "AppMetricValue",
  props: {
    value: {
      type: [String, Number],
      default: ""
    },
    label: {
      type: String,
      default: ""
    },
    secondary: {
      type: String,
      default: ""
    },
    kind: {
      type: String as PropType<MetricKind>,
      default: "money"
    },
    tone: {
      type: String as PropType<MetricTone>,
      default: "neutral"
    },
    inline: {
      type: Boolean,
      default: true
    },
    pill: {
      type: Boolean,
      default: false
    },
    cell: {
      type: Boolean,
      default: false
    },
    title: {
      type: String,
      default: ""
    },
    valueClass: {
      type: [String, Array, Object] as PropType<ClassValue>,
      default: ""
    }
  },
  computed: {
    resolvedClasses(): unknown[] {
      return [
        "app-financial-value",
        `app-financial-value--${this.kind}`,
        `app-financial-value--${this.tone}`,
        {
          "app-financial-value--block": !this.inline,
          "app-financial-pill": this.pill,
          "app-financial-cell": this.cell
        },
        this.valueClass
      ];
    },
    resolvedTitle(): string | undefined {
      return this.title || undefined;
    },
    renderedValue(): string {
      return String(this.value ?? "");
    }
  }
});
