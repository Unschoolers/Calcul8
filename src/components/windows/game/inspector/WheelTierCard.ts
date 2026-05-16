import { inject, type PropType } from "vue";
import { countGameOutcomeSlotsByTier } from "../../../../app-core/shared/game-domain.ts";
import { setWheelTierChancePercent } from "../../../../app-core/shared/wheel-odds.ts";
import { getWheelTierSourceLotIds, isWheelTierMultiLot } from "../../../../app-core/shared/wheel-tier-sources.ts";
import type { WheelConfig, WheelTier } from "../../../../types/app.ts";
import { createNestedWindowContextBridge } from "../../shared/contextBridge.ts";

const TIER_CELEBRATION_EMOJI_OPTIONS = [
  "✨", "🎉", "🔥", "💎", "⭐", "🏆",
  "🎁", "💥", "⚡", "👑", "🍀", "🎯"
];

function getTierOutcomeLabel(config: WheelConfig | null, tier: WheelTier): string {
  const count = config
    ? countGameOutcomeSlotsByTier(config).get(tier.id) ?? 0
    : Math.max(0, Math.floor(Number(tier.slots) || 0));
  const unit = config?.gameType === "grid" ? "tile" : "section";
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

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
      editorOpen: false,
      editorDraft: null as WheelTier | null
    };
  },
  computed: {
    editorTier(this: { editorDraft: WheelTier | null; tier: WheelTier }): WheelTier {
      return this.editorDraft ?? this.tier;
    },
    tierSourceSummary(this: Record<string, unknown> & { tier: WheelTier }): string {
      const tier = this.tier;
      const lots = (((this as Record<string, unknown>).lots || []) as Array<{
        id: number;
        name: string;
        lotType?: string;
        singlesPurchases?: Array<{ id: number; item: string }>;
      }>);
      if (isWheelTierMultiLot(tier)) {
        const names = getWheelTierSourceLotIds(tier)
          .map((id) => lots.find((entry) => entry.id === id)?.name)
          .filter((entry): entry is string => Boolean(entry));
        if (!names.length) return "Source lots not selected";
        return `${names.length} lot${names.length === 1 ? "" : "s"}: ${names.slice(0, 2).join(", ")}${names.length > 2 ? "..." : ""}`;
      }
      if (tier.boundLotId == null) return "Source lot not selected";
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
      const config = ((this as Record<string, unknown>).editingWheelConfig || null) as WheelConfig | null;
      return [
        getTierOutcomeLabel(config, tier),
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
      if (!getWheelTierSourceLotIds(this.tier).length) {
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
    editorTierInventoryMeta(this: Record<string, unknown> & { editorTier: WheelTier }): { text: string; warning: boolean } | null {
      return ((this as Record<string, unknown>) as Record<string, unknown> & {
        getTierInventoryMeta: (tier: WheelTier) => { text: string; warning: boolean } | null;
      }).getTierInventoryMeta(this.editorTier);
    },
    tierInventoryWarning(this: Record<string, unknown> & { tierInventoryMeta: { text: string; warning: boolean } | null }): string | null {
      return this.tierInventoryMeta?.warning ? this.tierInventoryMeta.text : null;
    },
    tierCelebrationEmojiOptions(): string[] {
      return TIER_CELEBRATION_EMOJI_OPTIONS;
    }
  },
  methods: {
    formatTierChance(this: unknown, tier: WheelTier): string {
      const chance = Number(tier.chancePercent) || 0;
      return String(Math.round(chance));
    },
    setTierChance(this: Record<string, unknown>, tier: WheelTier, value: unknown): void {
      const config = (this.editingWheelConfig || null) as { tiers?: WheelTier[] } | null;
      if (!config?.tiers) return;
      setWheelTierChancePercent(config.tiers, tier.id, value);
    },
    setTierChanceFromPointerEvent(this: Record<string, unknown> & {
      setTierChance: (tier: WheelTier, value: unknown) => void;
    }, tier: WheelTier, event: PointerEvent): void {
      const target = event.currentTarget as HTMLElement | null;
      if (!target) return;
      target.setPointerCapture?.(event.pointerId);
      const rect = target.getBoundingClientRect();
      const ratio = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
      this.setTierChance(tier, Math.round(Math.max(0, Math.min(1, ratio)) * 100));
    },
    setTierChanceFromEvent(this: Record<string, unknown> & {
      setTierChance: (tier: WheelTier, value: unknown) => void;
    }, tier: WheelTier, event: Event): void {
      const target = event.target as HTMLInputElement | null;
      this.setTierChance(tier, target?.value);
    },
    openTierEditor(this: { editorOpen: boolean; editorDraft: WheelTier | null; tier: WheelTier }): void {
      this.editorDraft = JSON.parse(JSON.stringify(this.tier)) as WheelTier;
      this.editorOpen = true;
    },
    cancelTierEditor(this: { editorOpen: boolean; editorDraft: WheelTier | null }): void {
      this.editorOpen = false;
      this.editorDraft = null;
    },
    onTierEditorModelValue(this: {
      openTierEditor: () => void;
      cancelTierEditor: () => void;
    }, nextOpen: boolean): void {
      if (nextOpen) {
        this.openTierEditor();
      } else {
        this.cancelTierEditor();
      }
    },
    setTierCelebrationEmoji(this: { editorTier: WheelTier }, emoji: string): void {
      this.editorTier.celebrationEmoji = this.editorTier.celebrationEmoji === emoji ? undefined : emoji;
    },
    clearTierCelebrationEmoji(this: { editorTier: WheelTier }): void {
      this.editorTier.celebrationEmoji = undefined;
    },
    finishTierEditor(this: Record<string, unknown> & {
      editorOpen: boolean;
      editorDraft: WheelTier | null;
      tier: WheelTier;
    }): void {
      if (this.editorDraft) {
        Object.assign(this.tier, this.editorDraft);
      }
      this.editorOpen = false;
      this.editorDraft = null;
      if ((this.canApplyWheelConfig as boolean) !== true) return;
      const applyWheelConfig = this.applyWheelConfig as (() => void) | undefined;
      if (typeof applyWheelConfig === "function") {
        applyWheelConfig();
      }
    },
    deleteTierAndClose(this: Record<string, unknown> & {
      editorOpen: boolean;
      editorDraft: WheelTier | null;
      tierIndex: number;
    }): void {
      const removeTier = this.removeTier as ((index: number) => void) | undefined;
      if (typeof removeTier === "function") {
        removeTier(this.tierIndex);
      }
      this.editorOpen = false;
      this.editorDraft = null;
      if ((this.canApplyWheelConfig as boolean) !== true) return;
      const applyWheelConfig = this.applyWheelConfig as (() => void) | undefined;
      if (typeof applyWheelConfig === "function") {
        applyWheelConfig();
      }
    }
  },
  setup(props: { ctx: Record<string, unknown> }) {
    const injectedGameCtx = inject<Record<string, unknown> | null>("gameCtx", null);
    const injectedCtx = inject<Record<string, unknown> | null>("appCtx", null);
    const source = (injectedGameCtx ?? props.ctx ?? injectedCtx) as Record<string, unknown>;
    return createNestedWindowContextBridge(source);
  }
};

