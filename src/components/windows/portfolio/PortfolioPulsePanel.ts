import { defineComponent, type PropType } from "vue";
import "./PortfolioPulsePanel.css";

export type PortfolioPulseTone = "positive" | "negative" | "warning" | "neutral";

export type PortfolioPulseStat = {
  key: string;
  label: string;
  value: string;
  meta: string;
  icon: string;
  tone: PortfolioPulseTone;
};

export type PortfolioPulseDisplayInsight = {
  key: string;
  label: string;
  title: string;
  meta: string;
  icon: string;
  tone: PortfolioPulseTone;
};

/** The pulse panel receives one display model instead of window-state fragments. */
export type PortfolioPulsePanelModel = {
  title: string;
  profitLabel: string;
  profitValue: string;
  profitTone: PortfolioPulseTone;
  scopeLabel: string;
  profitableSummary: string;
  summaryLabel: string;
  stats: PortfolioPulseStat[];
  insightsTitle: string;
  insights: PortfolioPulseDisplayInsight[];
};

export const PortfolioPulsePanel = defineComponent({
  name: "PortfolioPulsePanel",
  props: {
    model: {
      type: Object as PropType<PortfolioPulsePanelModel>,
      required: true
    }
  },
  computed: {
    primaryInsight(): PortfolioPulseDisplayInsight | null {
      return this.model.insights[0] ?? null;
    },

    secondaryInsights(): PortfolioPulseDisplayInsight[] {
      return this.model.insights.slice(1);
    }
  }
});
