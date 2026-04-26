export type GameHeatLevel = "very_low" | "low" | "medium" | "high" | "very_high";

const HEAT_LEVELS: GameHeatLevel[] = ["very_low", "low", "medium", "high", "very_high"];

export interface GameHeatTierInput {
  id: string;
  label: string;
  chance: number;
  totalChance: number;
  totalPlays: number;
  hitCount: number;
  spinsSinceHit: number;
  profitPerPlay: number;
  remainingHits: number | null;
}

export interface GameHeatTierResult extends GameHeatTierInput {
  heat: GameHeatLevel;
  expectedHits: number;
  underHitGap: number;
  dueProbability: number;
  recentlyHit: boolean;
  clientFavorable: boolean;
}

export interface FeaturedGameHeatResult {
  label: string | null;
  heat: GameHeatLevel | null;
  tiers: GameHeatTierResult[];
}

export function shiftHeatLevel(
  heat: GameHeatLevel,
  steps: number
): GameHeatLevel {
  const currentIndex = Math.max(0, HEAT_LEVELS.indexOf(heat));
  const nextIndex = Math.min(HEAT_LEVELS.length - 1, Math.max(0, currentIndex + steps));
  return HEAT_LEVELS[nextIndex]!;
}

export function getHeatLevelRank(heat: GameHeatLevel | null): number {
  if (heat === "very_high") return 4;
  if (heat === "high") return 3;
  if (heat === "medium") return 2;
  if (heat === "low") return 1;
  return 0;
}

export function resolveProfitHeatLevel(profitPerPlay: number): GameHeatLevel {
  return profitPerPlay < 0 ? "medium" : "very_low";
}

export function resolveGameTierHeat(input: GameHeatTierInput): GameHeatTierResult {
  const totalChance = Math.max(1, Number(input.totalChance) || 0);
  const chance = Math.max(0, Number(input.chance) || 0);
  const totalPlays = Math.max(0, Math.floor(Number(input.totalPlays) || 0));
  const hitCount = Math.max(0, Math.floor(Number(input.hitCount) || 0));
  const spinsSinceHit = Math.max(0, Math.floor(Number(input.spinsSinceHit) || 0));
  const profitPerPlay = Number(input.profitPerPlay) || 0;
  const expectedHits = totalPlays * (chance / totalChance);
  const underHitGap = expectedHits - hitCount;
  const chanceRatio = Math.max(0, Math.min(1, chance / totalChance));
  const dueProbability = chanceRatio > 0
    ? 1 - ((1 - chanceRatio) ** spinsSinceHit)
    : 0;
  const dueSteps = dueProbability >= 0.94 ? 3 : dueProbability >= 0.8 ? 2 : dueProbability >= 0.55 ? 1 : 0;
  const gapSteps = underHitGap >= 5 ? 2 : underHitGap >= 2 ? 1 : 0;
  const recentlyHit = spinsSinceHit === 0;
  const clientFavorable = profitPerPlay < 0;
  const pressureSteps = clientFavorable && underHitGap > -1
    ? Math.max(dueSteps, gapSteps)
    : 0;
  const cooldownSteps = recentlyHit ? 2 : 0;

  return {
    ...input,
    chance,
    totalChance,
    totalPlays,
    hitCount,
    spinsSinceHit,
    profitPerPlay,
    heat: shiftHeatLevel(resolveProfitHeatLevel(profitPerPlay), pressureSteps - cooldownSteps),
    expectedHits,
    underHitGap,
    dueProbability,
    recentlyHit,
    clientFavorable
  };
}

export function resolveFeaturedGameHeatCandidate(tiers: GameHeatTierInput[]): FeaturedGameHeatResult {
  const heatTiers = tiers
    .map((tier) => resolveGameTierHeat(tier))
    .filter((tier) => tier.chance > 0 && tier.remainingHits !== 0);

  if (!heatTiers.length) {
    return {
      label: null,
      heat: null,
      tiers: []
    };
  }

  const clientFavorableTiers = heatTiers.filter((tier) => tier.clientFavorable);
  const rankedTiers = [...(clientFavorableTiers.length ? clientFavorableTiers : heatTiers)]
    .sort((left, right) => (
      getHeatLevelRank(right.heat) - getHeatLevelRank(left.heat)
      || left.profitPerPlay - right.profitPerPlay
      || right.chance - left.chance
      || left.label.localeCompare(right.label)
    ));
  const hottest = rankedTiers[0]!;
  const activeClientFavorableCount = clientFavorableTiers
    .filter((tier) => getHeatLevelRank(tier.heat) >= 2)
    .length;

  return {
    label: clientFavorableTiers.length > 1
      ? `${clientFavorableTiers.length} client-favorable tiers`
      : hottest.label,
    heat: clientFavorableTiers.length > 1 && activeClientFavorableCount > 1
      ? shiftHeatLevel(hottest.heat, 1)
      : hottest.heat,
    tiers: heatTiers
  };
}
