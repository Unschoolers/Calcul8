import { inject, type PropType } from "vue";
import { getWheelChanceTotal, setWheelTierChancePercent } from "../../../../app-core/shared/wheel-odds.ts";
import type { WheelConfig, WheelTier } from "../../../../types/app.ts";
import { createNestedWindowContextBridge } from "../../contextBridge.ts";

export const WheelOddsEditor = {
  name: "WheelOddsEditor",
  props: {
    ctx: {
      type: Object as PropType<Record<string, unknown>>,
      required: true
    },
    config: {
      type: Object as PropType<WheelConfig>,
      required: true
    }
  },
  computed: {
    wheelOddsTotal(this: { config: WheelConfig }): number {
      return getWheelChanceTotal(this.config.tiers);
    },
    wheelOddsTotalDisplay(this: { wheelOddsTotal: number }): string {
      return `${Math.round(this.wheelOddsTotal)}%`;
    },
    wheelOddsTotalValid(this: { wheelOddsTotal: number }): boolean {
      return Math.abs(this.wheelOddsTotal - 100) < 0.01;
    }
  },
  methods: {
    formatTierChance(this: unknown, tier: WheelTier): string {
      const chance = Number(tier.chancePercent) || 0;
      return String(Math.round(chance));
    },
    setTierChance(this: { config: WheelConfig }, tier: WheelTier, value: unknown): void {
      setWheelTierChancePercent(this.config.tiers, tier.id, value);
    },
    setTierChanceFromPointerEvent(this: { config: WheelConfig }, tier: WheelTier, event: PointerEvent): void {
      const target = event.currentTarget as HTMLElement | null;
      if (!target) return;
      target.setPointerCapture?.(event.pointerId);
      const rect = target.getBoundingClientRect();
      const ratio = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
      setWheelTierChancePercent(this.config.tiers, tier.id, Math.round(Math.max(0, Math.min(1, ratio)) * 100));
    },
    setTierChanceFromEvent(this: { config: WheelConfig }, tier: WheelTier, event: Event): void {
      const target = event.target as HTMLInputElement | null;
      setWheelTierChancePercent(this.config.tiers, tier.id, target?.value);
    }
  },
  setup(props: { ctx: Record<string, unknown> }) {
    const injectedWheelCtx = inject<Record<string, unknown> | null>("wheelCtx", null);
    const injectedCtx = inject<Record<string, unknown> | null>("appCtx", null);
    const source = (injectedWheelCtx ?? props.ctx ?? injectedCtx) as Record<string, unknown>;
    return createNestedWindowContextBridge(source);
  }
};
