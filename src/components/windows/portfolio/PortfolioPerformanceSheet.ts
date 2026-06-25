import { defineComponent, type PropType } from "vue";
import type { PortfolioSortDirection, PortfolioSortOption } from "../../../app-core/computed/portfolio-performance.ts";
import AppEmptyState from "../../ui/AppEmptyState.vue";
import AppMetricValue from "../../ui/AppMetricValue.vue";
import AppSectionCard from "../../ui/AppSectionCard.vue";
import type { PortfolioPerformanceGridColumn } from "./PortfolioPerformanceGrid.ts";
import PortfolioPerformanceGrid from "./PortfolioPerformanceGrid.vue";
import "./PortfolioPerformanceSheet.css";

export type PortfolioPerformanceSheetView = "lots" | "customers";

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
    title: {
      type: String,
      required: true
    },
    viewModeLabel: {
      type: String,
      required: true
    },
    lotsViewLabel: {
      type: String,
      required: true
    },
    customersViewLabel: {
      type: String,
      required: true
    },
    hasPortfolioData: {
      type: Boolean,
      required: true
    },
    lotTitle: {
      type: String,
      required: true
    },
    customerTitle: {
      type: String,
      required: true
    },
    lossLabel: {
      type: String,
      required: true
    },
    lossAmount: {
      type: String,
      required: true
    },
    gainLabel: {
      type: String,
      required: true
    },
    gainAmount: {
      type: String,
      required: true
    },
    customerCountLabel: {
      type: String,
      required: true
    },
    customerCount: {
      type: Number,
      required: true
    },
    repeatCustomerLabel: {
      type: String,
      required: true
    },
    repeatCustomerCount: {
      type: Number,
      required: true
    },
    sortLabel: {
      type: String,
      required: true
    },
    lotColumns: {
      type: Array as PropType<Array<PortfolioPerformanceGridColumn>>,
      required: true
    },
    lotSortOptions: {
      type: Array as PropType<Array<PortfolioSortOption<string>>>,
      required: true
    },
    lotSortKey: {
      type: String,
      required: true
    },
    lotSortDirection: {
      type: String as PropType<PortfolioSortDirection>,
      required: true
    },
    customerColumns: {
      type: Array as PropType<Array<PortfolioPerformanceGridColumn>>,
      required: true
    },
    customerSortOptions: {
      type: Array as PropType<Array<PortfolioSortOption<string>>>,
      required: true
    },
    customerSortKey: {
      type: String,
      required: true
    },
    customerSortDirection: {
      type: String as PropType<PortfolioSortDirection>,
      required: true
    },
    customerRowCount: {
      type: Number,
      required: true
    },
    lotEmptyTitle: {
      type: String,
      required: true
    },
    lotEmptyBody: {
      type: String,
      required: true
    },
    customerEmptyTitle: {
      type: String,
      required: true
    },
    customerEmptyBody: {
      type: String,
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
      return this.view === "customers" ? this.customerTitle : this.lotTitle;
    }
  }
});
