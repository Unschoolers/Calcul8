import { defineComponent, type PropType } from "vue";
import type { PortfolioSortDirection, PortfolioSortOption } from "../../../app-core/computed/portfolio-performance.ts";
import "./PortfolioPerformanceGrid.css";

export type PortfolioPerformanceGridColumn<Key extends string = string> = PortfolioSortOption<Key> & {
  numeric?: boolean;
};

export const PortfolioPerformanceGrid = defineComponent({
  name: "PortfolioPerformanceGrid",
  props: {
    gridClass: {
      type: [String, Array, Object] as PropType<string | string[] | Record<string, boolean>>,
      default: ""
    },
    columns: {
      type: Array as PropType<Array<PortfolioPerformanceGridColumn>>,
      required: true
    },
    sortOptions: {
      type: Array as PropType<Array<PortfolioSortOption<string>>>,
      required: true
    },
    activeSortKey: {
      type: String,
      required: true
    },
    sortDirection: {
      type: String as PropType<PortfolioSortDirection>,
      required: true
    },
    sortLabel: {
      type: String,
      required: true
    }
  },
  emits: {
    sort: (_key: string) => true
  },
  methods: {
    sortIcon(key: string): string {
      if (this.activeSortKey !== key) return "mdi-swap-vertical";
      return this.sortDirection === "asc" ? "mdi-arrow-up" : "mdi-arrow-down";
    },

    sortClass(key: string): Record<string, boolean> {
      return {
        "is-active": this.activeSortKey === key
      };
    },

    emitSort(key: string): void {
      this.$emit("sort", key);
    }
  }
});
