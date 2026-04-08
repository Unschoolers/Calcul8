import { inject, type PropType } from "vue";
import type { WheelTier } from "../../types/app.ts";
import { createNestedWindowContextBridge } from "./contextBridge.ts";

const TIER_CELEBRATION_EMOJI_OPTIONS = [
  "✨", "🎉", "🔥", "💎", "⭐", "🏆",
  "🎁", "💥", "⚡", "👑", "🍀", "🎯"
];

export const WheelTierCard = {
  name: "WheelTierCard",
  props: {
    ctx: {
      type: Object as PropType<Record<string, unknown>>,
      required: true
    },
    tier: {
      type: Object as PropType<WheelTier>,
      required: true
    },
    tierIndex: {
      type: Number,
      required: true
    }
  },
  data() {
    return {
      editorOpen: false
    };
  },
  computed: {
    tierSourceSummary(this: Record<string, unknown> & { tier: WheelTier }): string {
      const tier = this.tier;
      if (tier.boundLotId == null) return "Source lot not selected";
      const lots = (((this as Record<string, unknown>).lots || []) as Array<{
        id: number;
        name: string;
        lotType?: string;
        singlesPurchases?: Array<{ id: number; item: string }>;
      }>);
      const lot = lots.find((entry) => entry.id === tier.boundLotId);
      if (!lot) return "Source lot unavailable";
      if (lot.lotType === "singles" && tier.boundSinglesId != null) {
        const item = lot.singlesPurchases?.find((entry) => entry.id === tier.boundSinglesId);
        return item ? `${lot.name} · ${item.item}` : `${lot.name} · Prize item not selected`;
      }
      return lot.name;
    },
    tierTypeLabel(this: Record<string, unknown> & { tier: WheelTier }): string {
      return ((this as Record<string, unknown>) as Record<string, unknown> & {
        isBoundLotSingles: (tier: WheelTier) => boolean;
      }).isBoundLotSingles(this.tier) ? "Singles" : "Bulk";
    },
    tierSummaryItems(this: Record<string, unknown> & { tier: WheelTier }): string[] {
      const tier = this.tier;
      const hitCount = Number(tier.packsCount || 0);
      const cost = Number(tier.costPerTier || 0);
      return [
        `${tier.slots} slots`,
        `${hitCount} hit${hitCount === 1 ? "" : "s"}`,
        `$${cost.toFixed(2)}`
      ];
    },
    tierStatusChips(this: Record<string, unknown> & { tier: WheelTier }): Array<{ label: string; tone: string }> {
      const chips: Array<{ label: string; tone: string }> = [
        { label: ((this as Record<string, unknown>) as Record<string, unknown> & { tierTypeLabel: string }).tierTypeLabel, tone: "neutral" }
      ];
      if (this.tier.isChase === true) {
        chips.push({ label: "Chase", tone: "amber" });
      }
      if (this.tier.boundLotId == null) {
        chips.push({ label: "Source needed", tone: "warning" });
      }
      const inventoryMeta = ((this as Record<string, unknown>) as Record<string, unknown> & {
        tierInventoryMeta: { text: string; warning: boolean } | null;
      }).tierInventoryMeta;
      if (inventoryMeta?.warning) {
        chips.push({ label: "Low stock", tone: "warning" });
      }
      return chips;
    },
    tierInventoryMeta(this: Record<string, unknown> & { tier: WheelTier }): { text: string; warning: boolean } | null {
      return ((this as Record<string, unknown>) as Record<string, unknown> & {
        getTierInventoryMeta: (tier: WheelTier) => { text: string; warning: boolean } | null;
      }).getTierInventoryMeta(this.tier);
    },
    tierInventoryWarning(this: Record<string, unknown> & { tierInventoryMeta: { text: string; warning: boolean } | null }): string | null {
      return this.tierInventoryMeta?.warning ? this.tierInventoryMeta.text : null;
    },
    tierCelebrationEmojiOptions(): string[] {
      return TIER_CELEBRATION_EMOJI_OPTIONS;
    }
  },
  methods: {
    setTierCelebrationEmoji(this: { tier: WheelTier }, emoji: string): void {
      this.tier.celebrationEmoji = this.tier.celebrationEmoji === emoji ? undefined : emoji;
    },
    clearTierCelebrationEmoji(this: { tier: WheelTier }): void {
      this.tier.celebrationEmoji = undefined;
    }
  },
  setup(props: { ctx: Record<string, unknown> }) {
    const injectedWheelCtx = inject<Record<string, unknown> | null>("wheelCtx", null);
    const injectedCtx = inject<Record<string, unknown> | null>("appCtx", null);
    const source = (injectedWheelCtx ?? props.ctx ?? injectedCtx) as Record<string, unknown>;
    return createNestedWindowContextBridge(source);
  }
};
