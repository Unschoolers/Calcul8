import type { Lot, WheelConfig, WheelTier } from "../../types/app.ts";

function sanitizeWheelTier(tier: WheelTier, lots: Lot[]): WheelTier {
  const boundLot = tier.boundLotId == null
    ? null
    : (lots.find((lot) => lot.id === tier.boundLotId) ?? null);

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
  const tiers = Array.isArray(config.tiers) ? config.tiers : [];
  config.tiers = tiers.map((tier) => sanitizeWheelTier(tier, lots));
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
