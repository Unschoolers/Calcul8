import { defineComponent, type PropType } from "vue";

type ProfitCalculator = (units: number, pricePerUnit: number) => number;
type CurrencyFormatter = (value: number, decimals?: number) => string;
type PriceProfitEstimator = (price: number) => number | null;

export const LivePriceCard = defineComponent({
  name: "LivePriceCard",
  props: {
    ctx: {
      type: Object as PropType<Record<string, unknown>>,
      default: (): undefined => undefined
    },
    helperText: {
      type: String,
      default: ""
    },
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
    remainingUnits: {
      type: Number as PropType<number | null>,
      default: null
    },
    calculateProfit: {
      type: Function as PropType<ProfitCalculator>,
      required: true
    },
    estimateProfitAtPrice: {
      type: Function as PropType<PriceProfitEstimator>,
      default: null
    },
    estimatePercentAtPrice: {
      type: Function as PropType<PriceProfitEstimator>,
      default: null
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
    t(key: string, fallback = ""): string {
      return this.translate(key, fallback);
    },
    translate(key: string, fallback: string): string {
      const ctx = (this.ctx || this.$root) as Record<string, unknown> | undefined;
      const t = ctx?.t as ((messageKey: string) => string) | undefined;
      if (typeof t === "function") {
        const translated = t(key);
        if (typeof translated === "string" && translated.trim()) {
          return translated;
        }
      }
      return fallback;
    },
    formatCurrency(value: number, decimals = 2): string {
      const ctx = (this.ctx || this.$root) as Record<string, unknown> | undefined;
      const formatter = ctx?.formatCurrency as ((nextValue: number | null | undefined, nextDecimals?: number) => string) | undefined;
      if (typeof formatter === "function") {
        return formatter(value, decimals);
      }
      const fn = this.safeFixed;
      if (typeof fn !== "function") {
        if (value == null || Number.isNaN(Number(value))) return "0.00";
        return Number(value).toFixed(decimals);
      }
      return fn(value, decimals);
    },
    changePrice(delta: number) {
      const current = Number(this.modelValue || 0);
      this.$emit("update:modelValue", current + delta);
    },
    profitAt(price: number) {
      const fn = this.calculateProfit;
      if (typeof fn !== "function") return 0;
      return fn(this.units, price);
    },
    displayProfitAtPrice(price: number): number {
      const estimator = this.estimateProfitAtPrice;
      if (typeof estimator === "function") {
        const estimated = Number(estimator(price));
        if (Number.isFinite(estimated)) return estimated;
      }
      return this.profitAt(price);
    },
    formatAt(value: number, decimals = 2): string {
      return this.formatCurrency(value, decimals);
    },
    profitPercentAt(price: number): number {
      const basis = Number(this.profitBasis);
      const profit = this.profitAt(price);
      if (!Number.isFinite(basis) || basis <= 0) return profit >= 0 ? 100 : 0;
      return (profit / basis) * 100;
    },
    displayProfitPercentAtPrice(price: number): number {
      const estimator = this.estimatePercentAtPrice;
      if (typeof estimator === "function") {
        const estimated = Number(estimator(price));
        if (Number.isFinite(estimated)) return estimated;
      }
      return this.profitPercentAt(price);
    },
    displayProfit(): number {
      const explicit = Number(this.forecastProfit);
      if (Number.isFinite(explicit)) return explicit;
      return this.displayProfitAtPrice(this.modelValue);
    },
    displayProfitPercent(): number {
      const explicit = Number(this.forecastPercent);
      if (Number.isFinite(explicit)) return explicit;
      return this.displayProfitPercentAtPrice(this.modelValue);
    },
    neededDisplayProfit(): number | null {
      const explicit = Number(this.neededProfit);
      if (Number.isFinite(explicit)) return explicit;
      if (this.avgPriceNeeded == null) return null;
      return this.displayProfitAtPrice(this.avgPriceNeeded);
    },
    neededDisplayPercent(): number | null {
      const explicit = Number(this.neededPercent);
      if (Number.isFinite(explicit)) return explicit;
      if (this.avgPriceNeeded == null) return null;
      return this.displayProfitPercentAtPrice(this.avgPriceNeeded);
    },
    deltaVsNeeded(): number | null {
      const needed = this.neededDisplayProfit();
      if (needed == null) return null;
      return this.displayProfit() - needed;
    },
    currentPriceGap(): number | null {
      if (this.avgPriceNeeded == null) return null;
      const current = Number(this.modelValue);
      const needed = Number(this.avgPriceNeeded);
      if (!Number.isFinite(current) || !Number.isFinite(needed)) return null;
      return current - needed;
    },
    adjustmentNeeded(): number | null {
      const gap = this.currentPriceGap();
      if (gap == null || !Number.isFinite(gap)) return null;
      return -gap;
    },
    shouldShowTargetDecision(): boolean {
      const remainingUnits = Number(this.remainingUnits);
      if (Number.isFinite(remainingUnits) && remainingUnits <= 0) return false;
      const adjustment = this.adjustmentNeeded();
      if (adjustment == null || !Number.isFinite(adjustment)) return false;
      return Math.abs(adjustment) >= 0.005;
    },
    priceAdjustLabel(direction: -1 | 1): string {
      const action = direction < 0
        ? this.translate("livePriceCardDecreasePriceLabel", "Decrease price")
        : this.translate("livePriceCardIncreasePriceLabel", "Increase price");
      return `${action} ${this.label}`;
    },
    noTargetLabel(): string {
      return this.translate(
        "livePriceCardNoTargetLabel",
        "Set a profit target to see the average price you still need from here."
      );
    },
    lowerPriceLabel(): string {
      return this.translate(
        "livePriceCardLowerPriceLabel",
        "If the price drops by $1"
      );
    },
    higherPriceLabel(): string {
      return this.translate(
        "livePriceCardHigherPriceLabel",
        "If the price rises by $1"
      );
    },
    neededPriceSummaryPrefix(): string {
      return this.translate(
        "livePriceCardNeededPriceSummaryPrefix",
        "To hit your profit target, the remaining units need to average about"
      );
    },
    neededPriceSummarySuffix(): string {
      return this.translate(
        "livePriceCardNeededPriceSummarySuffix",
        "each."
      );
    },
    neededAverageLabel(): string {
      return this.translate(
        "livePriceCardNeededAverageLabel",
        "Needed avg"
      );
    },
    targetDecisionLabel(): string {
      return this.translate(
        "livePriceCardTargetDecisionLabel",
        "Back to target"
      );
    },
    targetDecisionPriceLabel(): string {
      return this.translate(
        "livePriceCardTargetDecisionPriceLabel",
        "Set price to"
      );
    },
    targetDecisionAdjustmentLabel(): string {
      return this.translate(
        "livePriceCardTargetDecisionAdjustmentLabel",
        "Adjust from current"
      );
    },
    targetDecisionProfitLabel(): string {
      return this.translate(
        "livePriceCardTargetDecisionProfitLabel",
        "Lot outcome"
      );
    },
    neededProfitSummaryLabel(): string {
      return this.translate(
        "livePriceCardNeededProfitSummaryLabel",
        "At that price, your total lot profit would be"
      );
    },
    targetProfitShortLabel(): string {
      return this.translate(
        "livePriceCardTargetProfitShortLabel",
        "Lot profit"
      );
    },
    currentPriceGapLabel(): string {
      return this.translate(
        "livePriceCardCurrentPriceGapLabel",
        "Compared with your current price"
      );
    },
    currentPriceGapShortLabel(): string {
      return this.translate(
        "livePriceCardCurrentPriceGapShortLabel",
        "Vs current"
      );
    },
    scenarioDownLabel(): string {
      return this.translate(
        "livePriceCardScenarioDownLabel",
        "-$1"
      );
    },
    scenarioUpLabel(): string {
      return this.translate(
        "livePriceCardScenarioUpLabel",
        "+$1"
      );
    }
  }
});
