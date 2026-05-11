import { createDefaultBracketBattleConfig } from "../../../../app-core/shared/bracket-battle-config.ts";
import type { LuckGameType, WheelConfig } from "../../../../types/app.ts";
import { createDefaultWheelConfig, generateTierId } from "./wheelDefaults.ts";

export type GameConfigTemplateContext = {
  currentLotId?: number | null;
};

function cloneWheelConfig(config: WheelConfig): WheelConfig {
  return JSON.parse(JSON.stringify(config)) as WheelConfig;
}

function cloneBracketBattleConfig(config: NonNullable<WheelConfig["bracketBattle"]>): NonNullable<WheelConfig["bracketBattle"]> {
  return JSON.parse(JSON.stringify(config)) as NonNullable<WheelConfig["bracketBattle"]>;
}

function bindDefaultTierSources(context: GameConfigTemplateContext, config: WheelConfig): void {
  const currentLotId = context.currentLotId ?? null;
  for (const tier of config.tiers) {
    tier.boundLotId = currentLotId;
    tier.boundLotIds = currentLotId == null ? [] : [currentLotId];
  }
}

export function createTierPrizeGameConfigFromTemplate(
  context: GameConfigTemplateContext,
  gameType: LuckGameType,
  template?: WheelConfig | null
): WheelConfig {
  const existing = template ?? null;
  const newConfig = existing ? cloneWheelConfig(existing) : createDefaultWheelConfig();
  newConfig.id = Date.now();
  newConfig.gameType = gameType;
  newConfig.name = existing
    ? `${existing.name} (copy)`
    : (gameType === "bracket" ? "New Bracket Battle" : (gameType === "grid" ? "New Mystery Grid" : "New Wheel"));
  newConfig.createdAt = new Date().toISOString();

  if (gameType === "grid") {
    newConfig.outcomeCount = newConfig.outcomeCount || 100;
    newConfig.gridCellCount = newConfig.outcomeCount;
    delete newConfig.bracketBattle;
  } else if (gameType === "bracket") {
    newConfig.spinPrice = 0;
    newConfig.targetMargin = 0;
    newConfig.outcomeCount = 0;
    newConfig.gridCellCount = 0;
    newConfig.tiers = [];
    newConfig.bracketBattle = existing?.bracketBattle
      ? cloneBracketBattleConfig(existing.bracketBattle)
      : createDefaultBracketBattleConfig(4);
  } else {
    delete newConfig.bracketBattle;
  }

  for (const tier of newConfig.tiers) {
    tier.id = generateTierId();
  }
  if (!existing) {
    bindDefaultTierSources(context, newConfig);
  }
  return newConfig;
}
