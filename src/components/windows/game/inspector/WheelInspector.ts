import { inject, type PropType } from "vue";
import { createNestedWindowContextBridge } from "../../shared/contextBridge.ts";
import { translateAppMessage } from "../../../../app-core/i18n/index.ts";
import { getWheelChanceTotal } from "../../../../app-core/shared/wheel-odds.ts";
import { getWheelTierSourceLotIds, isWheelTierMultiLot } from "../../../../app-core/shared/wheel-tier-sources.ts";
import WheelHistoryPanel from "./WheelHistoryPanel.vue";
import WheelTierCard from "./WheelTierCard.vue";
import WheelSessionPanel from "./WheelSessionPanel.vue";
import BracketBattleBuilder from "../bracket/BracketBattleBuilder.vue";
import type { Lot, WheelConfig, WheelTier } from "../../../../types/app.ts";
import {
  getAvailableSinglesQuantityForWheelTier,
  getRemainingPacksForWheelLot
} from "../services/wheelSaleSupport.ts";

type WheelBuilderTierGroup = {
  key: string;
  title: string;
  detail: string;
  countLabel: string;
  warning: boolean;
  sourceLotNames?: string[];
  tiers: Array<{ tier: WheelTier; index: number }>;
};

export const WheelInspector = {
  name: "WheelInspector",
  components: {
    BracketBattleBuilder,
    WheelHistoryPanel,
    WheelTierCard,
    WheelSessionPanel
  },
  methods: {
    getWindowComponentContext(this: Record<string, unknown>): Record<string, unknown> {
      return this as Record<string, unknown>;
    }
  },
  computed: {
    wheelOddsTotal(this: Record<string, unknown>): number {
      const config = (this.editingWheelConfig || null) as WheelConfig | null;
      return config ? getWheelChanceTotal(config.tiers) : 0;
    },
    wheelOddsTotalDisplay(this: { wheelOddsTotal: number }): string {
      return `${Math.round(this.wheelOddsTotal)}%`;
    },
    wheelOddsTotalValid(this: { wheelOddsTotal: number }): boolean {
      return Math.abs(this.wheelOddsTotal - 100) < 0.01;
    },
    wheelBuilderTierGroups(this: Record<string, unknown>): WheelBuilderTierGroup[] {
      const config = (this.editingWheelConfig || null) as WheelConfig | null;
      if (!config) return [];
      const lots = (this.lots || []) as Lot[];
      const preferredLanguage = String((this as Record<string, unknown>).preferredLanguage ?? "");
      const groups = new Map<string, WheelBuilderTierGroup>();

      const ensureGroup = (tier: WheelTier): WheelBuilderTierGroup => {
        if (isWheelTierMultiLot(tier)) {
          const ids = getWheelTierSourceLotIds(tier);
          const key = `customer-choice:${ids.join(":")}`;
          let group = groups.get(key);
          if (!group) {
            const remainingPacks = ids.reduce((sum, id) => sum + getRemainingPacksForWheelLot(this, id), 0);
            const sourceLotNames = ids
              .map((id) => lots.find((entry) => entry.id === id)?.name)
              .filter((entry): entry is string => Boolean(entry));
            group = {
              key,
              title: translateAppMessage(preferredLanguage, "wheelInspectorMultiLotTitle"),
              detail: translateAppMessage(preferredLanguage, "wheelInspectorItemAvailabilityDetail", {
                count: remainingPacks,
                suffix: remainingPacks === 1 ? "" : "s"
              }),
              countLabel: "",
              warning: remainingPacks <= 0,
              sourceLotNames,
              tiers: []
            };
            groups.set(key, group);
          }
          return group;
        }

        if (tier.boundLotId == null) {
          const key = "unassigned";
          let group = groups.get(key);
          if (!group) {
            group = {
              key,
              title: translateAppMessage(preferredLanguage, "wheelInspectorNoSourceTitle"),
              detail: translateAppMessage(preferredLanguage, "wheelInspectorAssignSourceDetail"),
              countLabel: "",
              warning: true,
              tiers: []
            };
            groups.set(key, group);
          }
          return group;
        }

        const lot = lots.find((entry) => entry.id === tier.boundLotId);
        const key = `lot:${tier.boundLotId}`;
        let group = groups.get(key);
        if (!group) {
          let detail = translateAppMessage(preferredLanguage, "wheelInspectorSourceMissingDetail");
          let warning = lot == null;
          if (lot) {
            if (lot.lotType === "singles") {
              const remainingSingles = (lot.singlesPurchases || []).reduce((sum, entry) => (
                sum + getAvailableSinglesQuantityForWheelTier(this, lot.id, entry.id)
              ), 0);
              detail = translateAppMessage(preferredLanguage, "wheelInspectorItemAvailabilityDetail", {
                count: remainingSingles,
                suffix: remainingSingles === 1 ? "" : "s"
              });
              warning = remainingSingles <= 0;
            } else {
              const remainingPacks = getRemainingPacksForWheelLot(this, lot.id);
              detail = translateAppMessage(preferredLanguage, "wheelInspectorItemAvailabilityDetail", {
                count: remainingPacks,
                suffix: remainingPacks === 1 ? "" : "s"
              });
              warning = remainingPacks <= 0;
            }
          }
          group = {
            key,
            title: lot?.name || translateAppMessage(preferredLanguage, "wheelInspectorUnknownSourceTitle"),
            detail,
            countLabel: "",
            warning,
            tiers: []
          };
          groups.set(key, group);
        }
        return group;
      };

      config.tiers.forEach((tier, index) => {
        const group = ensureGroup(tier);
        group.tiers.push({ tier, index });
      });

      const orderedGroups = Array.from(groups.values());
      orderedGroups.forEach((group) => {
        group.countLabel = translateAppMessage(preferredLanguage, "wheelInspectorTierCountLabel", {
          count: group.tiers.length,
          suffix: group.tiers.length === 1 ? "" : "s"
        });
      });
      orderedGroups.sort((left, right) => {
        if (left.key === "unassigned") return -1;
        if (right.key === "unassigned") return 1;
        return left.title.localeCompare(right.title);
      });
      return orderedGroups;
    }
  },
  props: {
    ctx: {
      type: Object as PropType<Record<string, unknown>>,
      required: true
    }
  },
  setup(props: { ctx: Record<string, unknown> }) {
    const injectedGameCtx = inject<Record<string, unknown> | null>("gameCtx", null);
    const injectedCtx = inject<Record<string, unknown> | null>("appCtx", null);
    const source = (injectedGameCtx ?? props.ctx ?? injectedCtx) as Record<string, unknown>;
    return createNestedWindowContextBridge(source);
  }
};

