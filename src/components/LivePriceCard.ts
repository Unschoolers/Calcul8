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
  },
  template: `
    <v-card elevation="0" rounded="xl" class="live-pricing-card">
      <v-card-text class="pa-4">
        <v-row align="center" dense>
          <v-col cols="3" class="text-center">
            <v-avatar :color="avatarColor" size="48">
              <v-icon color="white" size="28">{{ icon }}</v-icon>
            </v-avatar>
            <div class="text-caption mt-1 font-weight-medium">{{ label }}</div>
          </v-col>

          <v-col cols="6" class="text-center">
            <div class="text-h4 font-weight-bold mb-1">\${{ modelValue }}</div>
            <v-chip
              :color="displayProfit() >= 0 ? 'success' : 'error'"
              size="small"
              class="font-weight-bold"
            >
              {{ displayProfit() >= 0 ? '+' : '' }}\${{ formatAt(displayProfit()) }}
              ({{ formatAt(displayProfitPercent(), 1) }}%)
            </v-chip>
          </v-col>

          <v-col cols="3" class="text-center">
            <div class="d-flex flex-column align-center justify-center ga-1">
              <v-btn
                icon="mdi-minus"
                size="small"
                color="error"
                variant="tonal"
                :title="'Decrease ' + label + ' price'"
                :aria-label="'Decrease ' + label + ' price'"
                @click="changePrice(-1)"
              ></v-btn>
              <v-btn
                icon="mdi-plus"
                size="small"
                color="success"
                variant="tonal"
                :title="'Increase ' + label + ' price'"
                :aria-label="'Increase ' + label + ' price'"
                @click="changePrice(1)"
              ></v-btn>
            </div>
          </v-col>
        </v-row>

        <v-divider class="my-3"></v-divider>
        <div class="text-caption text-medium-emphasis text-center mb-2 live-price-target-summary">
          <template v-if="avgPriceNeeded == null || neededDisplayProfit() == null || deltaVsNeeded() == null">
            Need N/A
          </template>
          <template v-else>
            <div class="live-price-target-line">
              Min to target \${{ formatAt(avgPriceNeeded, 0) }} →
              <span
                class="font-weight-bold"
                :class="(neededDisplayProfit() || 0) >= 0 ? 'text-success' : 'text-error'"
              >
                {{ (neededDisplayProfit() || 0) >= 0 ? '+' : '' }}\${{ formatAt(neededDisplayProfit() || 0) }}
                ({{ formatAt(neededDisplayPercent() || 0, 1) }}%)
              </span>
            </div>
            <div class="live-price-target-line live-price-target-line--delta">
              Δ
              <span
                class="font-weight-bold"
                :class="(deltaVsNeeded() || 0) >= 0 ? 'text-success' : 'text-error'"
              >
                {{ (deltaVsNeeded() || 0) >= 0 ? '+' : '' }}\${{ formatAt(deltaVsNeeded() || 0) }}
              </span>
            </div>
          </template>
        </div>
        <v-row dense class="text-center">
          <v-col cols="6">
            <div class="text-caption text-medium-emphasis">At \${{ modelValue - 1 }}</div>
            <div class="text-body-2 font-weight-bold" :class="profitAt(modelValue - 1) >= 0 ? 'text-success' : 'text-error'">
              {{ profitAt(modelValue - 1) >= 0 ? '+' : '' }}\${{ formatAt(profitAt(modelValue - 1)) }}
            </div>
          </v-col>
          <v-col cols="6">
            <div class="text-caption text-medium-emphasis">At \${{ modelValue + 1 }}</div>
            <div class="text-body-2 font-weight-bold" :class="profitAt(modelValue + 1) >= 0 ? 'text-success' : 'text-error'">
              {{ profitAt(modelValue + 1) >= 0 ? '+' : '' }}\${{ formatAt(profitAt(modelValue + 1)) }}
            </div>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>
  `
});
