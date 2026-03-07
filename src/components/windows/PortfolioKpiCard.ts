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
  },
  template: `
    <v-card elevation="4" :class="resolvedCardClasses">
      <v-card-text class="portfolio-kpi-content">
        <div class="portfolio-kpi-head">
          <div class="portfolio-kpi-label">{{ label }}</div>
          <div class="portfolio-kpi-icon-wrap">
            <v-icon size="16">{{ icon }}</v-icon>
          </div>
        </div>
        <div class="text-h4 font-weight-bold portfolio-kpi-value" :class="resolvedValueClasses">
          {{ value }}
        </div>
        <div class="portfolio-kpi-meta">{{ meta }}</div>
      </v-card-text>
    </v-card>
  `
});
