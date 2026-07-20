import { defineComponent, type PropType } from "vue";
import { normalizeBuyerKey } from "../../app-core/computed/buyer-quick-view.ts";
import { buildBuyerProfileTagSuggestions } from "../../app-core/buyer-profile.ts";
import type { BuyerQuickViewSummary } from "../../app-core/computed/buyer-quick-view.ts";
import type { BuyerProfile, BuyerProfileSaveState } from "../../types/app.ts";
import BuyerQuickViewModal from "./BuyerQuickViewModal.vue";

type BuyerProfileHostContext = Record<string, unknown>;

export const BuyerQuickViewHost = defineComponent({
  name: "BuyerQuickViewHost",
  components: { BuyerQuickViewModal },
  props: {
    modelValue: { type: Boolean, default: false },
    summary: { type: Object as PropType<BuyerQuickViewSummary | null>, default: null },
    ctx: { type: Object as PropType<BuyerProfileHostContext>, required: true },
    t: { type: Function as PropType<(key: string) => string>, required: true },
    formatDate: { type: Function as PropType<(date: string) => string>, required: true },
    fmtCurrency: {
      type: Function as PropType<(value: number | null | undefined, decimals?: number) => string>,
      required: true
    }
  },
  emits: ["update:modelValue"],
  computed: {
    username(): string {
      return String(this.summary?.username || "").trim();
    },
    profile(): BuyerProfile | null {
      const getter = this.ctx.getBuyerProfile;
      return typeof getter === "function"
        ? (getter as (username: string) => BuyerProfile | null).call(this.ctx, this.username)
        : null;
    },
    saveState(): BuyerProfileSaveState {
      const states = this.ctx.buyerProfileSaveStates;
      if (!states || typeof states !== "object") return "idle";
      const value = (states as Record<string, BuyerProfileSaveState>)[normalizeBuyerKey(this.username)];
      return value || "idle";
    },
    tagSuggestions(): string[] {
      const profiles = this.ctx.buyerProfilesByKey;
      return profiles && typeof profiles === "object"
        ? buildBuyerProfileTagSuggestions(Object.values(profiles as Record<string, BuyerProfile>))
        : [];
    }
  },
  methods: {
    saveProfile(draft: { username: string; preferredName?: string; tags: string[] }): void {
      const save = this.ctx.saveBuyerProfile;
      if (typeof save === "function") {
        void (save as (value: typeof draft) => Promise<unknown>).call(this.ctx, draft);
      }
    },
    resolveConflict(strategy: "retry" | "reload"): void {
      const resolve = this.ctx.resolveBuyerProfileConflict;
      if (typeof resolve === "function" && this.username) {
        void (resolve as (username: string, action: typeof strategy) => Promise<unknown>)
          .call(this.ctx, this.username, strategy);
      }
    }
  }
});
