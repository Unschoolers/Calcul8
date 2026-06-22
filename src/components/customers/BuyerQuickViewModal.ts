import { defineComponent, type PropType } from "vue";
import type { BuyerQuickViewSummary } from "../../app-core/computed/buyer-quick-view.ts";
import "./BuyerQuickViewModal.css";

export const BuyerQuickViewModal = defineComponent({
  name: "BuyerQuickViewModal",
  props: {
    modelValue: {
      type: Boolean,
      default: false
    },
    summary: {
      type: Object as PropType<BuyerQuickViewSummary | null>,
      default: null
    },
    t: {
      type: Function as PropType<(key: string) => string>,
      required: true
    },
    formatDate: {
      type: Function as PropType<(date: string) => string>,
      required: true
    },
    fmtCurrency: {
      type: Function as PropType<(value: number | null | undefined, decimals?: number) => string>,
      required: true
    }
  },
  emits: ["update:modelValue"],
  computed: {
    isOpen: {
      get(): boolean {
        return Boolean(this.modelValue);
      },
      set(value: boolean): void {
        this.$emit("update:modelValue", value);
      }
    },
    closeLabel(): string {
      return this.t("buyerQuickViewCloseLabel");
    }
  },
  methods: {
    money(value: number | null | undefined): string {
      return `$${this.fmtCurrency(value ?? 0)}`;
    },
    purchasesLabel(value: number | null | undefined): string {
      const count = Math.max(0, Number(value) || 0);
      const suffix = count === 1
        ? this.t("buyerQuickViewPurchaseSingularLabel")
        : this.t("buyerQuickViewPurchasePluralLabel");
      return `${count} ${suffix}`;
    },
    dateLabel(value: string | null | undefined): string {
      return value ? this.formatDate(value) : this.t("buyerQuickViewNoPurchasesLabel");
    }
  }
});
