import { inject, type PropType } from "vue";
import { createNestedWindowContextBridge } from "./contextBridge.ts";
import { translateAppMessage } from "../../app-core/i18n/index.ts";
import WheelHistoryPanel from "./WheelHistoryPanel.vue";
import WheelTierCard from "./WheelTierCard.vue";
import WheelSessionPanel from "./WheelSessionPanel.vue";
import type { Lot, WheelConfig, WheelTier } from "../../types/app.ts";
import {
  getAvailableSinglesQuantityForWheelTier,
  getRemainingPacksForWheelLot
} from "./wheelSaleSupport.ts";

type WheelBuilderTierGroup = {
  key: string;
  title: string;
  detail: string;
  countLabel: string;
  warning: boolean;
  tiers: Array<{ tier: WheelTier; index: number }>;
};

export const WheelInspector = {
  name: "WheelInspector",
  components: {
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
    wheelBuilderTierGroups(this: Record<string, unknown>): WheelBuilderTierGroup[] {
      const config = (this.editingWheelConfig || null) as WheelConfig | null;
      if (!config) return [];
      const lots = (this.lots || []) as Lot[];
      const preferredLanguage = String((this as Record<string, unknown>).preferredLanguage ?? "");
      const groups = new Map<string, WheelBuilderTierGroup>();

      const ensureGroup = (tier: WheelTier): WheelBuilderTierGroup => {
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
    const injectedWheelCtx = inject<Record<string, unknown> | null>("wheelCtx", null);
    const injectedCtx = inject<Record<string, unknown> | null>("appCtx", null);
    const source = (injectedWheelCtx ?? props.ctx ?? injectedCtx) as Record<string, unknown>;
    return createNestedWindowContextBridge(source);
  }
};
