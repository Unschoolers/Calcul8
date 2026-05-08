import type { Lot, WheelConfig, WheelTier } from "../../types/app.ts";
import { normalizeBracketBattleConfig } from "./bracket-battle-config.ts";
import { getWheelOutcomeCount, normalizeWheelTierChances } from "./wheel-odds.ts";
import { isWheelTierMultiLot, normalizeWheelTierSources } from "./wheel-tier-sources.ts";

function sanitizeWheelTier(tier: WheelTier, lots: Lot[]): WheelTier {
  normalizeWheelTierSources(tier, lots);

  const boundLot = tier.boundLotId == null
    ? null
    : (lots.find((lot) => lot.id === tier.boundLotId) ?? null);

  if (isWheelTierMultiLot(tier)) {
    tier.deductionType = tier.deductionType === "none" ? "none" : "packs";
    tier.boundSinglesId = null;
    tier.isChase = false;
    return tier;
  }

  if (boundLot?.lotType === "singles") {
    tier.deductionType = "singles";
    tier.packsCount = 1;
  } else if (tier.deductionType !== "singles") {
    tier.boundSinglesId = null;
  }

  if (tier.boundSinglesId == null || tier.deductionType !== "singles") {
    tier.isChase = false;
  }

  return tier;
}

export function sanitizeWheelConfig(config: WheelConfig, lots: Lot[]): WheelConfig {
  config.gameType = config.gameType === "grid" || config.gameType === "bracket" ? config.gameType : "wheel";
  if (config.gameType === "bracket") {
    config.bracketBattle = normalizeBracketBattleConfig(config.bracketBattle);
    config.outcomeCount = 0;
    config.gridCellCount = 0;
    config.tiers = [];
    return config;
  }

  delete config.bracketBattle;
  config.outcomeCount = getWheelOutcomeCount(config);
  config.gridCellCount = config.outcomeCount;
  const tiers = Array.isArray(config.tiers) ? config.tiers : [];
  config.tiers = normalizeWheelTierChances(tiers.map((tier) => sanitizeWheelTier(tier, lots)));
  return config;
}

export function normalizeWheelConfig(value: unknown, lots: Lot[]): WheelConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return sanitizeWheelConfig(JSON.parse(JSON.stringify(value)) as WheelConfig, lots);
}

export function normalizeWheelConfigs(value: unknown, lots: Lot[]): WheelConfig[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeWheelConfig(entry, lots))
    .filter((entry): entry is WheelConfig => entry != null);
}
