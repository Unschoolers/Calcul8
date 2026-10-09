import { defineComponent, type PropType } from "vue";
import { countGameOutcomeSlotsByTier } from "../../../../app-core/shared/game-domain.ts";
import { isSinglesLot } from "../../../../app-core/shared/lot-types.ts";
import {
  resolveVuetifySlotString,
  resolveVuetifySlotValue
} from "../../../../app-core/shared/vuetify-slot-items.ts";
import { setWheelTierChancePercent } from "../../../../app-core/shared/wheel-odds.ts";
import { getWheelTierSourceLotIds, isWheelTierMultiLot } from "../../../../app-core/shared/wheel-tier-sources.ts";
import type { WheelConfig, WheelTier } from "../../../../types/app.ts";
import AppDialogShell from "../../../ui/AppDialogShell.vue";
import AppFormLayout from "../../../ui/AppFormLayout.vue";
import type { GameController } from "../coordinator/gameControllerState.ts";
import { setupTypedGameContext } from "../coordinator/gameContext.ts";
import { cloneGameConfig } from "../services/gameConfigTemplates.ts";

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

export const WheelTierCard = defineComponent({
  name: "WheelTierCard",
  components: { AppDialogShell, AppFormLayout },
  props: {
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
    tierSourceSummary(this: { game: GameController; tier: WheelTier }): string {
      const tier = this.tier;
      const lots = this.game.view.lots;
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
      if (isSinglesLot(lot) && tier.boundSinglesId != null) {
        const item = lot.singlesPurchases?.find((entry) => entry.id === tier.boundSinglesId);
        return item ? `${lot.name} · ${item.item}` : `${lot.name} · Prize item not selected`;
      }
      return lot.name;
    },
    tierTypeLabel(this: { game: GameController; tier: WheelTier }): string {
      return this.game.commands.isBoundLotSingles(this.tier) ? "Singles" : "Bulk";
    },
    tierSummaryItems(this: { game: GameController; tier: WheelTier }): string[] {
      const tier = this.tier;
      const hitCount = Number(tier.packsCount || 0);
      const cost = Number(tier.costPerTier || 0);
      const config = this.game.view.editingWheelConfig as WheelConfig | null;
      return [
        getTierOutcomeLabel(config, tier),
        `${hitCount} hit${hitCount === 1 ? "" : "s"}`,
        `$${cost.toFixed(2)}`
      ];
    },
    tierStatusChips(this: { tier: WheelTier; tierTypeLabel: string; tierInventoryMeta: { text: string; warning: boolean } | null }): Array<{ label: string; tone: string }> {
      const chips: Array<{ label: string; tone: string }> = [
        { label: this.tierTypeLabel, tone: "neutral" }
      ];
      if (this.tier.isChase === true) {
        chips.push({ label: "Chase", tone: "amber" });
      }
      if (!getWheelTierSourceLotIds(this.tier).length) {
        chips.push({ label: "Source needed", tone: "warning" });
      }
      const inventoryMeta = this.tierInventoryMeta;
      if (inventoryMeta?.warning) {
        chips.push({ label: "Low stock", tone: "warning" });
      }
      return chips;
    },
    tierInventoryMeta(this: { game: GameController; tier: WheelTier }): { text: string; warning: boolean } | null {
      return this.game.commands.getTierInventoryMeta(this.tier);
    },
    editorTierInventoryMeta(this: { game: GameController; editorTier: WheelTier }): { text: string; warning: boolean } | null {
      return this.game.commands.getTierInventoryMeta(this.editorTier);
    },
    tierInventoryWarning(this: Record<string, unknown> & { tierInventoryMeta: { text: string; warning: boolean } | null }): string | null {
      return this.tierInventoryMeta?.warning ? this.tierInventoryMeta.text : null;
    },
    tierCelebrationEmojiOptions(): string[] {
      return TIER_CELEBRATION_EMOJI_OPTIONS;
    }
  },
  methods: {
    resolveVuetifySlotString,
    resolveVuetifySlotValue,
    formatTierChance(this: unknown, tier: WheelTier): string {
      const chance = Number(tier.chancePercent) || 0;
      return String(Math.round(chance));
    },
    setTierChance(this: { game: GameController }, tier: WheelTier, value: unknown): void {
      const config = this.game.view.editingWheelConfig;
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
      this.editorDraft = cloneGameConfig(this.tier);
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
    finishTierEditor(this: { game: GameController } & {
      editorOpen: boolean;
      editorDraft: WheelTier | null;
      tier: WheelTier;
    }): void {
      if (this.editorDraft) {
        Object.assign(this.tier, this.editorDraft);
      }
      this.editorOpen = false;
      this.editorDraft = null;
      if (this.game.view.canApplyWheelConfig) this.game.commands.applyWheelConfig();
    },
    deleteTierAndClose(this: { game: GameController } & {
      editorOpen: boolean;
      editorDraft: WheelTier | null;
      tierIndex: number;
    }): void {
      this.game.commands.removeTier(this.tierIndex);
      this.editorOpen = false;
      this.editorDraft = null;
      if (this.game.view.canApplyWheelConfig) this.game.commands.applyWheelConfig();
    }
  },
  setup: setupTypedGameContext
});

