import type { Lot, WheelTier } from "../../types/app.ts";
import { isSinglesLot } from "./lot-types.ts";

function normalizePositiveId(value: unknown): number | null {
  const id = Math.floor(Number(value));
  return Number.isFinite(id) && id > 0 ? id : null;
}

function uniquePositiveIds(values: unknown[]): number[] {
  const seen = new Set<number>();
  const ids: number[] = [];
  for (const value of values) {
    const id = normalizePositiveId(value);
    if (id == null || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function isWheelTierMultiLot(tier: Pick<WheelTier, "boundLotIds" | "boundLotId">): boolean {
  return getWheelTierSourceLotIds(tier).length > 1;
}

export function getWheelTierSourceLotIds(
  tier: Pick<WheelTier, "boundLotIds" | "boundLotId">
): number[] {
  const arrayIds = Array.isArray(tier.boundLotIds) ? uniquePositiveIds(tier.boundLotIds) : [];
  return arrayIds.length > 0 ? arrayIds : uniquePositiveIds([tier.boundLotId]);
}

export function getWheelTierPrimaryLotId(
  tier: Pick<WheelTier, "boundLotIds" | "boundLotId">
): number | null {
  return normalizePositiveId(tier.boundLotId) ?? getWheelTierSourceLotIds(tier)[0] ?? null;
}

export function normalizeWheelTierSources(tier: WheelTier, lots: Lot[] = []): WheelTier {
  const hasLotCatalog = lots.length > 0;
  const lotById = new Map(lots.map((lot) => [lot.id, lot] as const));
  const rawIds = Array.isArray(tier.boundLotIds) ? tier.boundLotIds : [];
  const fallbackIds = rawIds.length > 0 ? rawIds : [tier.boundLotId];
  let ids = uniquePositiveIds(fallbackIds);

  if (ids.length > 1) {
    if (hasLotCatalog) {
      ids = ids.filter((id) => !isSinglesLot(lotById.get(id)));
    }
    tier.boundLotIds = ids;
    tier.boundLotId = ids[0] ?? null;
    tier.boundSinglesId = null;
    tier.deductionType = tier.deductionType === "none" ? "none" : "packs";
    tier.isChase = false;
    return tier;
  }

  const primaryId = normalizePositiveId(tier.boundLotId) ?? ids[0] ?? null;
  tier.boundLotId = primaryId;
  tier.boundLotIds = primaryId == null ? [] : [primaryId];
  return tier;
}

export function getWheelTierBulkSourceLotIds(tier: WheelTier, lots: Lot[] = []): number[] {
  const ids = getWheelTierSourceLotIds(tier);
  if (!ids.length || !lots.length) return ids;
  const lotById = new Map(lots.map((lot) => [lot.id, lot] as const));
  return ids.filter((id) => !isSinglesLot(lotById.get(id)));
}
