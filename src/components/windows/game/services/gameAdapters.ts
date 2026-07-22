import { translateAppMessage } from "../../../../app-core/i18n/index.ts";
import type { LuckGameType, WheelConfig } from "../../../../types/app.ts";
import { getMysteryGridCellCount } from "../commands/mysteryGridMethods.ts";

export type GameAdapterContext = {
  preferredLanguage?: unknown;
  wheelMode?: "config" | "live";
  wheelDisplaySlots?: readonly unknown[];
};

export interface TierPrizeGameAdapter {
  gameType: LuckGameType;
  isBoardGame: boolean;
  stageSlotsLabel(context: GameAdapterContext, config: WheelConfig | null): string;
  primaryActionIcon(context: GameAdapterContext, config: WheelConfig | null): string;
  primaryActionLabel(context: GameAdapterContext, config: WheelConfig | null): string;
  stageCaption(context: GameAdapterContext, config: WheelConfig | null): string;
}

function getLanguage(context: GameAdapterContext): string {
  return String(context.preferredLanguage ?? "");
}

function isConfigMode(context: GameAdapterContext): boolean {
  return context.wheelMode === "config";
}

const wheelGameAdapter: TierPrizeGameAdapter = {
  gameType: "wheel",
  isBoardGame: false,
  stageSlotsLabel(context) {
    const slots = (context.wheelDisplaySlots || []).length;
    return translateAppMessage(getLanguage(context), "wheelStageSlotsValue", { count: slots });
  },
  primaryActionIcon(context) {
    return isConfigMode(context) ? "mdi-flask-outline" : "mdi-lightning-bolt";
  },
  primaryActionLabel(context) {
    return isConfigMode(context)
      ? translateAppMessage(getLanguage(context), "wheelSpinTestButtonLabel")
      : translateAppMessage(getLanguage(context), "wheelSpinButtonLabel");
  },
  stageCaption(context) {
    return isConfigMode(context)
      ? translateAppMessage(getLanguage(context), "wheelStageCaptionConfig")
      : translateAppMessage(getLanguage(context), "wheelStageCaptionLive");
  }
};

const gridGameAdapter: TierPrizeGameAdapter = {
  gameType: "grid",
  isBoardGame: true,
  stageSlotsLabel(context, config) {
    return translateAppMessage(getLanguage(context), "wheelStageCellsValue", {
      count: getMysteryGridCellCount(config)
    });
  },
  primaryActionIcon() {
    return "mdi-grid";
  },
  primaryActionLabel(context) {
    return isConfigMode(context)
      ? translateAppMessage(getLanguage(context), "wheelRevealTestButtonLabel")
      : translateAppMessage(getLanguage(context), "wheelRevealButtonLabel");
  },
  stageCaption(context) {
    return isConfigMode(context)
      ? translateAppMessage(getLanguage(context), "wheelStageCaptionGridConfig")
      : translateAppMessage(getLanguage(context), "wheelStageCaptionGridLive");
  }
};

const bracketGameAdapter: TierPrizeGameAdapter = {
  gameType: "bracket",
  isBoardGame: true,
  stageSlotsLabel(context, config) {
    return translateAppMessage(getLanguage(context), "bracketBattlePrizesMeta", {
      count: config?.bracketBattle?.prizes.length ?? 0
    });
  },
  primaryActionIcon() {
    return "mdi-tournament";
  },
  primaryActionLabel(context) {
    return translateAppMessage(getLanguage(context), "bracketBattleRollAction");
  },
  stageCaption(context) {
    return translateAppMessage(getLanguage(context), "bracketBattleKicker");
  }
};

export const tierPrizeGameAdapters: Record<LuckGameType, TierPrizeGameAdapter> = {
  wheel: wheelGameAdapter,
  grid: gridGameAdapter,
  bracket: bracketGameAdapter
};

export function getTierPrizeGameAdapter(config: WheelConfig | null | undefined): TierPrizeGameAdapter {
  if (config?.gameType === "bracket") return bracketGameAdapter;
  return config?.gameType === "grid" ? gridGameAdapter : wheelGameAdapter;
}
