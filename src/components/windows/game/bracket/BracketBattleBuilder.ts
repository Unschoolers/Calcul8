import { inject, type PropType } from "vue";
import {
  createDefaultBracketBattleConfig,
  resizeBracketBattleConfig
} from "../../../../app-core/shared/bracket-battle-config.ts";
import type { BracketBattleConfig, BracketBattleConfigPrize, Lot, WheelConfig } from "../../../../types/app.ts";
import { createNestedWindowContextBridge } from "../../shared/contextBridge.ts";
import {
  applyBracketBattlePrizeCatalogSelection,
  buildBracketBattlePrizeCatalog,
  type BracketBattlePrizeCatalogItem
} from "./bracketBattlePanelModel.ts";

type BracketBattleBuilderThis = Record<string, unknown> & {
  editingWheelConfig: WheelConfig | null;
  lots: Lot[];
};

function getBracketConfig(context: BracketBattleBuilderThis): BracketBattleConfig {
  const config = context.editingWheelConfig;
  if (!config?.bracketBattle) {
    if (config) {
      config.bracketBattle = createDefaultBracketBattleConfig(4);
    }
    return createDefaultBracketBattleConfig(4);
  }
  return config.bracketBattle;
}

export const BracketBattleBuilder = {
  name: "BracketBattleBuilder",
  props: {
    ctx: {
      type: Object as PropType<Record<string, unknown>>,
      required: true
    }
  },
  computed: {
    bracketConfig(this: BracketBattleBuilderThis): BracketBattleConfig {
      return getBracketConfig(this);
    },
    bracketPrizeCatalog(this: BracketBattleBuilderThis): BracketBattlePrizeCatalogItem[] {
      return buildBracketBattlePrizeCatalog((this.lots || []) as Lot[]);
    }
  },
  methods: {
    onBracketParticipantCountChange(this: BracketBattleBuilderThis, value: unknown): void {
      const config = this.editingWheelConfig;
      if (!config) return;
      config.bracketBattle = resizeBracketBattleConfig(getBracketConfig(this), Number(value) === 8 ? 8 : 4);
    },
    bracketSourceMode(prize: BracketBattleConfigPrize): "manual" | "inventory" {
      return prize.sourceType === "manual" ? "manual" : "inventory";
    },
    setBracketPrizeSourceMode(prize: BracketBattleConfigPrize, value: unknown): void {
      if (value === "inventory") {
        prize.sourceType = "lot";
        return;
      }
      prize.sourceType = "manual";
      prize.sourceKey = "";
      prize.lotId = null;
      prize.singlesPurchaseEntryId = null;
      prize.quantity = 1;
      prize.cost = null;
      prize.value = null;
    },
    onBracketPrizeCatalogSelection(
      this: BracketBattleBuilderThis,
      prize: BracketBattleConfigPrize,
      value: unknown
    ): void {
      applyBracketBattlePrizeCatalogSelection(prize, String(value || ""), this.bracketPrizeCatalog as BracketBattlePrizeCatalogItem[]);
    }
  },
  setup(props: { ctx: Record<string, unknown> }) {
    const injectedGameCtx = inject<Record<string, unknown> | null>("gameCtx", null);
    const injectedCtx = inject<Record<string, unknown> | null>("appCtx", null);
    const source = (injectedGameCtx ?? props.ctx ?? injectedCtx) as Record<string, unknown>;
    return createNestedWindowContextBridge(source);
  }
};
