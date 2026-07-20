import { defineComponent, type PropType } from "vue";
import type { BuyerQuickViewSummary } from "../../app-core/computed/buyer-quick-view.ts";
import { normalizeBuyerProfileTags } from "../../app-core/buyer-profile.ts";
import type { BuyerProfile, BuyerProfileSaveState } from "../../types/app.ts";
import BuyerIdentityLabel from "./BuyerIdentityLabel.vue";
import "./BuyerQuickViewModal.css";

export const BuyerQuickViewModal = defineComponent({
  name: "BuyerQuickViewModal",
  components: { BuyerIdentityLabel },
  props: {
    modelValue: {
      type: Boolean,
      default: false
    },
    summary: {
      type: Object as PropType<BuyerQuickViewSummary | null>,
      default: null
    },
    profile: {
      type: Object as PropType<BuyerProfile | null>,
      default: null
    },
    saveState: {
      type: String as PropType<BuyerProfileSaveState>,
      default: "idle"
    },
    tagSuggestions: {
      type: Array as PropType<string[]>,
      default: () => []
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
  emits: ["update:modelValue", "save-profile", "retry-profile", "reload-profile"],
  data(): { isEditingProfile: boolean; preferredNameDraft: string; tagsDraft: string[] } {
    return {
      isEditingProfile: false,
      preferredNameDraft: "",
      tagsDraft: []
    };
  },
  watch: {
    profile: {
      immediate: true,
      deep: true,
      handler(profile: BuyerProfile | null): void {
        this.preferredNameDraft = String(profile?.preferredName || "");
        this.tagsDraft = [...(profile?.tags || [])];
      }
    }
  },
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
    },
    isProfileSaving(): boolean {
      return this.saveState === "saving";
    }
  },
  methods: {
    startProfileEdit(): void {
      this.preferredNameDraft = String(this.profile?.preferredName || "");
      this.tagsDraft = [...(this.profile?.tags || [])];
      this.isEditingProfile = true;
    },
    cancelProfileEdit(): void {
      this.isEditingProfile = false;
      this.preferredNameDraft = String(this.profile?.preferredName || "");
      this.tagsDraft = [...(this.profile?.tags || [])];
    },
    saveProfile(): void {
      const username = String(this.summary?.username || "").trim();
      if (!username) return;
      const preferredName = String(this.preferredNameDraft || "").trim().replace(/\s+/g, " ");
      this.$emit("save-profile", {
        username,
        preferredName,
        tags: normalizeBuyerProfileTags(this.tagsDraft)
      });
      this.isEditingProfile = false;
    },
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
