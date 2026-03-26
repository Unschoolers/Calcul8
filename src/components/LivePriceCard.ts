import { defineComponent, type PropType } from "vue";

type ProfitCalculator = (units: number, pricePerUnit: number) => number;
type CurrencyFormatter = (value: number, decimals?: number) => string;

export const LivePriceCard = defineComponent({
  name: "LivePriceCard",
  props: {
    modelValue: {
      type: Number,
      required: true
    },
    label: {
      type: String,
      required: true
    },
    icon: {
      type: String,
      required: true
    },
    avatarColor: {
      type: String,
      default: "primary"
    },
    units: {
      type: Number,
      required: true
    },
    calculateProfit: {
      type: Function as PropType<ProfitCalculator>,
      required: true
    },
    safeFixed: {
      type: Function as PropType<CurrencyFormatter>,
      required: true
    },
    avgPriceNeeded: {
      type: Number as PropType<number | null>,
      default: null
    },
    forecastProfit: {
      type: Number as PropType<number | null>,
      default: null
    },
    forecastPercent: {
      type: Number as PropType<number | null>,
      default: null
    },
    neededProfit: {
      type: Number as PropType<number | null>,
      default: null
    },
    neededPercent: {
      type: Number as PropType<number | null>,
      default: null
    },
    profitBasis: {
      type: Number as PropType<number | null>,
      default: null
    }
  },
  emits: ["update:modelValue"],
  methods: {
    changePrice(delta: number) {
      const current = Number(this.modelValue || 0);
      this.$emit("update:modelValue", current + delta);
    },
    profitAt(price: number) {
      const fn = this.calculateProfit;
      if (typeof fn !== "function") return 0;
      return fn(this.units, price);
    },
    formatAt(value: number, decimals = 2): string {
      const fn = this.safeFixed;
      if (typeof fn !== "function") {
        if (value == null || Number.isNaN(Number(value))) return "0.00";
        return Number(value).toFixed(decimals);
      }
      return fn(value, decimals);
    },
    profitPercentAt(price: number): number {
      const basis = Number(this.profitBasis);
      const profit = this.profitAt(price);
      if (!Number.isFinite(basis) || basis <= 0) return profit >= 0 ? 100 : 0;
      return (profit / basis) * 100;
    },
    displayProfit(): number {
      const explicit = Number(this.forecastProfit);
      if (Number.isFinite(explicit)) return explicit;
      return this.profitAt(this.modelValue);
    },
    displayProfitPercent(): number {
      const explicit = Number(this.forecastPercent);
      if (Number.isFinite(explicit)) return explicit;
      return this.profitPercentAt(this.modelValue);
    },
    neededDisplayProfit(): number | null {
      const explicit = Number(this.neededProfit);
      if (Number.isFinite(explicit)) return explicit;
      if (this.avgPriceNeeded == null) return null;
      return this.profitAt(this.avgPriceNeeded);
    },
    neededDisplayPercent(): number | null {
      const explicit = Number(this.neededPercent);
      if (Number.isFinite(explicit)) return explicit;
      if (this.avgPriceNeeded == null) return null;
      return this.profitPercentAt(this.avgPriceNeeded);
    },
    deltaVsNeeded(): number | null {
      const needed = this.neededDisplayProfit();
      if (needed == null) return null;
      return this.displayProfit() - needed;
    }
  }
});
