import { defineComponent, type PropType } from "vue";
import AppStatCard from "./AppStatCard.vue";

export type AppKpiTone = "primary" | "secondary" | "success" | "warning" | "error" | "neutral";

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
    }
  },
  computed: {
    resolvedGridClass(): unknown[] {
      return ["app-kpi-grid", this.gridClass];
    }
  }
});
