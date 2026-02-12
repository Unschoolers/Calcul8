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
    }
  },
  emits: ["update:modelValue"],
  methods: {
    changePrice(delta: number) {
      const current = Number(this.modelValue || 0);
      this.$emit("update:modelValue", current + delta);
    },
    profitAt(price: number) {
      return this.calculateProfit(this.units, price);
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
              :color="profitAt(modelValue) >= 0 ? 'success' : 'error'"
              size="small"
              class="font-weight-bold"
            >
              {{ profitAt(modelValue) >= 0 ? '+' : '' }}\${{ safeFixed(profitAt(modelValue)) }}
            </v-chip>
          </v-col>

          <v-col cols="3" class="text-center">
            <v-btn
              icon="mdi-minus"
              size="small"
              color="error"
              variant="tonal"
              class="mb-1"
              @click="changePrice(-1)"
            ></v-btn>
            <v-btn
              icon="mdi-plus"
              size="small"
              color="success"
              variant="tonal"
              @click="changePrice(1)"
            ></v-btn>
          </v-col>
        </v-row>

        <v-divider class="my-3"></v-divider>
        <v-row dense class="text-center">
          <v-col cols="6">
            <div class="text-caption text-medium-emphasis">At \${{ modelValue - 1 }}</div>
            <div class="text-body-2 font-weight-bold" :class="profitAt(modelValue - 1) >= 0 ? 'text-success' : 'text-error'">
              {{ profitAt(modelValue - 1) >= 0 ? '+' : '' }}\${{ safeFixed(profitAt(modelValue - 1)) }}
            </div>
          </v-col>
          <v-col cols="6">
            <div class="text-caption text-medium-emphasis">At \${{ modelValue + 1 }}</div>
            <div class="text-body-2 font-weight-bold" :class="profitAt(modelValue + 1) >= 0 ? 'text-success' : 'text-error'">
              {{ profitAt(modelValue + 1) >= 0 ? '+' : '' }}\${{ safeFixed(profitAt(modelValue + 1)) }}
            </div>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>
  `
});
