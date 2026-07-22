import { defineComponent, type PropType } from "vue";

type ProfitCalculator = (units: number, pricePerUnit: number) => number;
type CurrencyFormatter = (value: number, decimals?: number) => string;
type PriceProfitEstimator = (price: number) => number | null;

export const LivePriceCard = defineComponent({
  name: "LivePriceCard",
  props: {
    translateText: {
      type: Function as PropType<(key: string) => string>,
      default: null
    },
    formatCurrencyValue: {
      type: Function as PropType<(value: number | null | undefined, decimals?: number) => string>,
      default: null
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
    targetProfitPercent: {
      type: Number as PropType<number | null>,
      default: 15
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
      const t = this.translateText;
      if (typeof t === "function") {
        const translated = t(key);
        if (
          typeof translated === "string"
          && translated.trim()
          && translated.trim() !== key
        ) {
          return translated;
        }
      }
      return fallback;
    },
    formatCurrency(value: number, decimals = 2): string {
      const formatter = this.formatCurrencyValue;
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
    selectScenarioPrice(offset: number) {
      const candidatePrice = Number(this.modelValue || 0) + offset;
      if (!Number.isFinite(candidatePrice) || candidatePrice < 0) return;
      this.$emit("update:modelValue", candidatePrice);
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
    scenarioOffsets(): number[] {
      const current = Number(this.modelValue);
      if (!Number.isFinite(current)) return [-1, 1];

      const pairedOffsets: number[] = [];
      const positiveOffsets = [1, 2, 3, 4, 5];
      let positiveIndex = 0;
      for (let step = 5; step >= 1; step -= 1) {
        const negativeOffset = -step;
        if (current + negativeOffset >= 0) {
          pairedOffsets.push(negativeOffset, positiveOffsets[positiveIndex]);
          positiveIndex += 1;
        }
      }
      return [...pairedOffsets, ...positiveOffsets.slice(positiveIndex)];
    },
    scenarioDeltaLabel(offset: number): string {
      const sign = offset >= 0 ? "+" : "-";
      return `${sign}$${this.formatAt(Math.abs(offset), 0)}`;
    },
    scenarioTileClass(offset: number): Record<string, boolean> {
      return {
        "live-pricing-card__scenario-tile--desktop-extra": Math.abs(offset) > 1,
        "live-pricing-card__scenario-tile--mobile-negative": offset === -1,
        "live-pricing-card__scenario-tile--mobile-positive": offset === 1
      };
    },
    scenarioTileStyle(offset: number): Record<string, string> {
      const current = Number(this.modelValue);
      const percent = this.displayProfitPercentAtPrice(current + offset);
      const targetPercent = Math.max(0, Number(this.targetProfitPercent) || 0);
      const targetScale = Math.max(1, targetPercent);
      let negativeIntensity = 0;
      let positiveIntensity = 0;
      let progressPercent = 50;

      if (Number.isFinite(percent)) {
        if (percent < 0) {
          negativeIntensity = Math.min(1, Math.abs(percent) / targetScale);
          progressPercent = 50 - negativeIntensity * 50;
        } else if (percent > 0) {
          positiveIntensity = Math.min(1, percent / targetScale);
          progressPercent = 50 + positiveIntensity * 50;
        }
      }

      const intensity = Math.max(negativeIntensity, positiveIntensity);
      const borderTone = negativeIntensity > positiveIntensity ? "var(--v-theme-error)" : positiveIntensity > 0 ? "var(--v-theme-success)" : "var(--v-theme-on-surface)";
      return {
        "--live-scenario-border-rgb": borderTone,
        "--live-scenario-border-alpha": (0.12 + intensity * 0.34).toFixed(3),
        "--live-scenario-progress-percent": `${Math.min(100, Math.max(0, progressPercent)).toFixed(1)}%`
      };
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
    onTargetLabel(): string {
      return this.translate(
        "livePriceCardOnTargetLabel",
        "On target"
      );
    },
    onTargetSummaryLabel(): string {
      return this.translate(
        "livePriceCardOnTargetSummaryLabel",
        "You are on target. Nothing to adjust here."
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
