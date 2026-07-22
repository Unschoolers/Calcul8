import { defineComponent, type PropType } from "vue";
import { normalizeBuyerKey } from "../../app-core/computed/buyer-quick-view.ts";
import { buildBuyerProfileTagSuggestions } from "../../app-core/buyer-profile.ts";
import type { BuyerQuickViewSummary } from "../../app-core/computed/buyer-quick-view.ts";
import type { BuyerProfile, BuyerProfileSaveState } from "../../types/app.ts";
import BuyerQuickViewModal from "./BuyerQuickViewModal.vue";
import { useBuyerProfilePorts } from "./buyerProfilePorts.ts";

export const BuyerQuickViewHost = defineComponent({
  name: "BuyerQuickViewHost",
  components: { BuyerQuickViewModal },
  props: {
    modelValue: { type: Boolean, default: false },
    summary: { type: Object as PropType<BuyerQuickViewSummary | null>, default: null },
    t: { type: Function as PropType<(key: string) => string>, required: true },
    formatDate: { type: Function as PropType<(date: string) => string>, required: true },
    fmtCurrency: {
      type: Function as PropType<(value: number | null | undefined, decimals?: number) => string>,
      required: true
    }
  },
  emits: ["update:modelValue"],
  setup() {
    return {
      buyerProfilePorts: useBuyerProfilePorts()
    };
  },
  computed: {
    username(): string {
      return String(this.summary?.username || "").trim();
    },
    profile(): BuyerProfile | null {
      return this.buyerProfilePorts.getBuyerProfile(this.username);
    },
    saveState(): BuyerProfileSaveState {
      const states = this.buyerProfilePorts.buyerProfileSaveStates;
      if (!states || typeof states !== "object") return "idle";
      const value = (states as Record<string, BuyerProfileSaveState>)[normalizeBuyerKey(this.username)];
      return value || "idle";
    },
    tagSuggestions(): string[] {
      const profiles = this.buyerProfilePorts.buyerProfilesByKey;
      return profiles && typeof profiles === "object"
        ? buildBuyerProfileTagSuggestions(Object.values(profiles as Record<string, BuyerProfile>))
        : [];
    }
  },
  methods: {
    saveProfile(draft: { username: string; preferredName?: string; tags: string[] }): void {
      void this.buyerProfilePorts.saveBuyerProfile(draft);
    },
    resolveConflict(strategy: "retry" | "reload"): void {
      if (this.username) {
        void this.buyerProfilePorts.resolveBuyerProfileConflict(this.username, strategy);
      }
    }
  }
});
