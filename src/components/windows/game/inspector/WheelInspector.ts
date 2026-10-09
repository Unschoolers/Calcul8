import { translateAppMessage } from "../../../../app-core/i18n/index.ts";
import { isSinglesLot } from "../../../../app-core/shared/lot-types.ts";
import { getWheelChanceTotal } from "../../../../app-core/shared/wheel-odds.ts";
import { getWheelTierSourceLotIds, isWheelTierMultiLot } from "../../../../app-core/shared/wheel-tier-sources.ts";
import type { Lot, WheelConfig, WheelTier } from "../../../../types/app.ts";
import AppFormLayout from "../../../ui/AppFormLayout.vue";
import AppSectionCard from "../../../ui/AppSectionCard.vue";
import type { GameController } from "../coordinator/gameControllerState.ts";
import { setupTypedGameContext } from "../coordinator/gameContext.ts";
import BracketBattleBuilder from "../bracket/BracketBattleBuilder.vue";
import {
    getAvailableSinglesQuantityForWheelTier,
    getRemainingPacksForWheelLot
} from "../services/wheelSaleSupport.ts";
import WheelHistoryPanel from "./WheelHistoryPanel.vue";
import WheelSessionPanel from "./WheelSessionPanel.vue";
import WheelTierCard from "./WheelTierCard.vue";

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
    AppSectionCard,
    AppFormLayout,
    BracketBattleBuilder,
    WheelHistoryPanel,
    WheelTierCard,
    WheelSessionPanel
  },
  methods: {
    setWheelInspectorTab(this: { game: GameController }, tab: unknown): void {
      if (typeof tab !== "string") return;
      if (tab === "config" || tab === "session" || tab === "history") {
        this.game.commands.focusWheelInspector(tab);
      }
    }
  },
  computed: {
    wheelOddsTotal(this: { game: GameController }): number {
      const config = this.game.view.editingWheelConfig;
      return config ? getWheelChanceTotal(config.tiers) : 0;
    },
    wheelOddsTotalDisplay(this: { wheelOddsTotal: number }): string {
      return `${Math.round(this.wheelOddsTotal)}%`;
    },
    wheelOddsTotalValid(this: { wheelOddsTotal: number }): boolean {
      return Math.abs(this.wheelOddsTotal - 100) < 0.01;
    },
    wheelBuilderTierGroups(this: { game: GameController }): WheelBuilderTierGroup[] {
      const context = this.game.view;
      const config = context.editingWheelConfig;
      if (!config) return [];
      const lots = context.lots || [];
      const preferredLanguage = String(context.preferredLanguage ?? "");
      const groups = new Map<string, WheelBuilderTierGroup>();

      const ensureGroup = (tier: WheelTier): WheelBuilderTierGroup => {
        if (isWheelTierMultiLot(tier)) {
          const ids = getWheelTierSourceLotIds(tier);
          const key = `customer-choice:${ids.join(":")}`;
          let group = groups.get(key);
          if (!group) {
            const remainingPacks = ids.reduce((sum, id) => sum + getRemainingPacksForWheelLot(context, id), 0);
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
            if (isSinglesLot(lot)) {
              const remainingSingles = (lot.singlesPurchases || []).reduce((sum, entry) => (
                sum + getAvailableSinglesQuantityForWheelTier(context, lot.id, entry.id)
              ), 0);
              detail = translateAppMessage(preferredLanguage, "wheelInspectorItemAvailabilityDetail", {
                count: remainingSingles,
                suffix: remainingSingles === 1 ? "" : "s"
              });
              warning = remainingSingles <= 0;
            } else {
              const remainingPacks = getRemainingPacksForWheelLot(context, lot.id);
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
  setup: setupTypedGameContext
};
