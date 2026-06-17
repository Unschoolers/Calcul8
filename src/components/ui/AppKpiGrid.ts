import { defineComponent, type PropType } from "vue";
import AppStatCard from "./AppStatCard.vue";

export type AppKpiTone = "primary" | "secondary" | "success" | "warning" | "error" | "neutral";
export type AppKpiGridLayout = "auto" | "six-three";

export interface AppKpiItem {
  id: string;
  label: string;
  value: string;
  meta?: string;
  icon?: string;
  tone?: AppKpiTone;
}

export const AppKpiGrid = defineComponent({
  name: "AppKpiGrid",
  components: {
    AppStatCard
  },
  props: {
    items: {
      type: Array as PropType<AppKpiItem[]>,
      required: true
    },
    gridClass: {
      type: [String, Array, Object],
      default: ""
    },
    cardClass: {
      type: [String, Array, Object],
      default: ""
    },
    layout: {
      type: String as PropType<AppKpiGridLayout>,
      default: "auto"
    }
  },
  computed: {
    resolvedGridClass(): unknown[] {
      return [
        "app-kpi-grid",
        this.layout === "auto" ? "" : `app-kpi-grid--${this.layout}`,
        this.gridClass
      ];
    }
  }
});
