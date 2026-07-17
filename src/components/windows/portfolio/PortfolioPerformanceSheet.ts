import { defineComponent, type PropType } from "vue";
import type { PortfolioSortDirection, PortfolioSortOption } from "../../../app-core/computed/portfolio-performance.ts";
import AppEmptyState from "../../ui/AppEmptyState.vue";
import AppMetricValue from "../../ui/AppMetricValue.vue";
import AppSectionCard from "../../ui/AppSectionCard.vue";
import type { PortfolioPerformanceGridColumn } from "./PortfolioPerformanceGrid.ts";
import PortfolioPerformanceGrid from "./PortfolioPerformanceGrid.vue";
import "./PortfolioPerformanceSheet.css";

export type PortfolioPerformanceSheetView = "lots" | "customers";

/** A coherent display contract keeps the sheet independent of window state. */
export type PortfolioPerformanceSheetModel = {
  title: string;
  viewModeLabel: string;
  lotsViewLabel: string;
  customersViewLabel: string;
  hasPortfolioData: boolean;
  lotTitle: string;
  customerTitle: string;
  lossLabel: string;
  lossAmount: string;
  gainLabel: string;
  gainAmount: string;
  customerCountLabel: string;
  customerCount: number;
  repeatCustomerLabel: string;
  repeatCustomerCount: number;
  sortLabel: string;
  lotColumns: Array<PortfolioPerformanceGridColumn>;
  lotSortOptions: Array<PortfolioSortOption<string>>;
  lotSortKey: string;
  lotSortDirection: PortfolioSortDirection;
  customerColumns: Array<PortfolioPerformanceGridColumn>;
  customerSortOptions: Array<PortfolioSortOption<string>>;
  customerSortKey: string;
  customerSortDirection: PortfolioSortDirection;
  customerRowCount: number;
  lotEmptyTitle: string;
  lotEmptyBody: string;
  customerEmptyTitle: string;
  customerEmptyBody: string;
};

export const PortfolioPerformanceSheet = defineComponent({
  name: "PortfolioPerformanceSheet",
  components: {
    AppEmptyState,
    AppMetricValue,
    AppSectionCard,
    PortfolioPerformanceGrid
  },
  props: {
    view: {
      type: String as PropType<PortfolioPerformanceSheetView>,
      required: true
    },
    model: {
      type: Object as PropType<PortfolioPerformanceSheetModel>,
      required: true
    }
  },
  emits: {
    "update:view": (_view: PortfolioPerformanceSheetView) => true,
    "sort-lot": (_key: string) => true,
    "sort-customer": (_key: string) => true
  },
  computed: {
    selectedView: {
      get(): PortfolioPerformanceSheetView {
        return this.view;
      },
      set(value: PortfolioPerformanceSheetView): void {
        this.$emit("update:view", value);
      }
    },

    currentTitle(): string {
      return this.view === "customers" ? this.model.customerTitle : this.model.lotTitle;
    }
  }
});
