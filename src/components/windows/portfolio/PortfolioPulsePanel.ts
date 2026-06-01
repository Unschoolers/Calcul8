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

export const PortfolioPulsePanel = defineComponent({
  name: "PortfolioPulsePanel",
  props: {
    title: {
      type: String,
      required: true
    },
    profitLabel: {
      type: String,
      required: true
    },
    profitValue: {
      type: String,
      required: true
    },
    profitTone: {
      type: String as PropType<PortfolioPulseTone>,
      required: true
    },
    scopeLabel: {
      type: String,
      required: true
    },
    profitableSummary: {
      type: String,
      required: true
    },
    summaryLabel: {
      type: String,
      required: true
    },
    stats: {
      type: Array as PropType<PortfolioPulseStat[]>,
      default: () => []
    },
    insightsTitle: {
      type: String,
      required: true
    },
    insights: {
      type: Array as PropType<PortfolioPulseDisplayInsight[]>,
      default: () => []
    }
  }
});
