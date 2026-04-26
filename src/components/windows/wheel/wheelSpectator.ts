import type {
    Lot,
    WheelConfig,
    WheelFairnessEntry,
    WheelSpectatorGridCell,
    WheelSpectatorChaseBoardEntry,
    WheelSpectatorChaseHistoryEntry,
    WheelSpectatorHeatLevel,
    WheelSpectatorSessionStatus,
    WheelSpectatorSlot,
    WheelSpectatorSnapshot
} from "../../../types/app.ts";
import { getTierChancePercent } from "../../../app-core/shared/wheel-odds.ts";
import {
    getWheelDisplayConfig,
    getWheelDisplayFairnessHistoryEntries,
    getWheelDisplaySlots,
    getWheelDisplaySpinCounts,
    getWheelDisplayTotalSpins,
    getWheelLatestFairnessEntry
} from "./wheelComputedShared.ts";
import { calculateWheelTierNetRevenuePerSpin } from "./wheelHelpers.ts";
import { buildMysteryGridCells, isMysteryGridConfig } from "./mysteryGridMethods.ts";
import { getAvailableSinglesQuantityForWheelTier, getRemainingPacksForWheelLot, hasAnyAvailableSinglesForWheelTier } from "./wheelSaleSupport.ts";

type WheelSpectatorVm = Record<string, unknown> & {
  lots?: Lot[];
};

export function normalizeWheelPublicSessionId(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function cleanResultLabel(value: unknown): string {
  return String(value ?? "").replace(/^🎉\s*/, "").trim();
}

function resolveWheelPublicBaseUrl(): URL {
  const currentUrl = new URL(window.location.href);
  currentUrl.hash = "";
  currentUrl.search = "";
  currentUrl.pathname = currentUrl.pathname.replace(/\/[^/]*$/, "/spectator.html");
  if (!/spectator\.html$/i.test(currentUrl.pathname)) {
    currentUrl.pathname = `${currentUrl.pathname.replace(/\/+$/, "")}/spectator.html`;
  }
  return currentUrl;
}

export function buildWheelSpectatorSessionUrl(publicSessionId: string): string {
  const url = resolveWheelPublicBaseUrl();
  url.searchParams.set("session", normalizeWheelPublicSessionId(publicSessionId));
  return url.toString();
}

export function buildWheelSpectatorQrImageUrl(publicUrl: string): string {
  const qrUrl = new URL("https://api.qrserver.com/v1/create-qr-code/");
  qrUrl.searchParams.set("size", "240x240");
  qrUrl.searchParams.set("margin", "0");
  qrUrl.searchParams.set("data", publicUrl);
  return qrUrl.toString();
}

function getTierHitCount(config: WheelConfig, vm: WheelSpectatorVm, tierId: string): number {
  const slots = getWheelDisplaySlots(vm);
  const spinCounts = getWheelDisplaySpinCounts(vm);
  let total = 0;
  for (let index = 0; index < slots.length; index += 1) {
    if (slots[index]?.tier === tierId) {
      total += Math.max(0, Math.floor(Number(spinCounts[index]) || 0));
    }
  }
  return total;
}

function getTierRemainingHits(vm: WheelSpectatorVm, tier: WheelConfig["tiers"][number]): number | null {
  if (tier.boundLotId == null) return null;
  const lots = Array.isArray(vm.lots) ? vm.lots : [];
  const lot = lots.find((entry) => entry.id === tier.boundLotId);
  if (!lot) return null;
  const quantityPerHit = Math.max(1, Number(tier.packsCount) || 1);

  if (lot.lotType === "singles") {
    if (tier.boundSinglesId != null) {
      const availableQuantity = getAvailableSinglesQuantityForWheelTier(vm, tier.boundLotId, tier.boundSinglesId);
      return Math.max(0, Math.floor(availableQuantity / quantityPerHit));
    }
    return hasAnyAvailableSinglesForWheelTier(vm, tier) ? 1 : 0;
  }

  const remainingPacks = getRemainingPacksForWheelLot(vm, tier.boundLotId);
  return Math.max(0, Math.floor(remainingPacks / quantityPerHit));
}

function getTierHitHistory(vm: WheelSpectatorVm): WheelSpectatorChaseHistoryEntry[] {
  const raw = Array.isArray(vm.wheelChaseTallyHistory)
    ? vm.wheelChaseTallyHistory as Array<{ tierId?: string; label?: string; color?: string; count?: number }>
    : [];
  return raw
    .map((entry) => ({
      tierId: String(entry.tierId ?? "").trim(),
      label: String(entry.label ?? "").trim(),
      color: String(entry.color ?? "").trim() || "#d4af37",
      count: Math.max(0, Math.floor(Number(entry.count) || 0))
    }))
    .filter((entry) => entry.label.length > 0 && entry.count > 0);
}

function resolveProfitHeatLevel(profitPerSpin: number): WheelSpectatorHeatLevel {
  return profitPerSpin < 0 ? "medium" : "very_low";
}

function shiftHeatLevel(
  heat: WheelSpectatorHeatLevel,
  steps: number
): WheelSpectatorHeatLevel {
  const levels: WheelSpectatorHeatLevel[] = ["very_low", "low", "medium", "high", "very_high"];
  const currentIndex = Math.max(0, levels.indexOf(heat));
  const nextIndex = Math.min(levels.length - 1, Math.max(0, currentIndex + steps));
  return levels[nextIndex]!;
}

function getHeatLevelRank(heat: WheelSpectatorHeatLevel | null): number {
  if (heat === "very_high") return 4;
  if (heat === "high") return 3;
  if (heat === "medium") return 2;
  if (heat === "low") return 1;
  return 0;
}

function isFairnessEntryForTier(
  entry: WheelFairnessEntry,
  tier: WheelConfig["tiers"][number],
  slots: ReturnType<typeof getWheelDisplaySlots>
): boolean {
  const entryLabel = cleanResultLabel(entry.label);
  if (!entryLabel) return false;
  if (entryLabel === cleanResultLabel(tier.label)) return true;
  return slots.some((slot) => (
    slot.tier === tier.id
    && cleanResultLabel(slot.name) === entryLabel
  ));
}

function resolveTierHeatLevel(
  vm: WheelSpectatorVm,
  config: WheelConfig,
  tier: WheelConfig["tiers"][number]
): {
  heat: WheelSpectatorHeatLevel;
  chance: number;
  hitCount: number;
  marginPercent: number | null;
  profitPerSpin: number;
  recentlyHit: boolean;
} {
  const lots = Array.isArray(vm.lots) ? vm.lots : [];
  const totalChance = Math.max(1, config.tiers.reduce((sum, entry) => sum + getTierChancePercent(entry), 0));
  const chance = getTierChancePercent(tier);
  const netRevenuePerSpin = calculateWheelTierNetRevenuePerSpin(config, tier, lots);
  const costPerTier = Number(tier.costPerTier) || 0;
  const profitPerSpin = netRevenuePerSpin - costPerTier;
  const marginPercent = costPerTier > 0
    ? (profitPerSpin / costPerTier) * 100
    : null;
  const hitCount = getTierHitCount(config, vm, tier.id);
  const totalSpins = getWheelDisplayTotalSpins(vm);
  const expectedHits = totalSpins * (chance / totalChance);
  const underHitGap = expectedHits - hitCount;
  const displaySlots = getWheelDisplaySlots(vm);
  const latestTierHit = getWheelDisplayFairnessHistoryEntries(vm)
    .find((entry) => isFairnessEntryForTier(entry, tier, displaySlots));
  const spinsSinceHit = latestTierHit
    ? Math.max(0, totalSpins - Math.max(0, Math.floor(Number(latestTierHit.spinNumber) || 0)))
    : totalSpins;
  const chanceRatio = Math.max(0, Math.min(1, chance / totalChance));
  const dueProbability = chanceRatio > 0
    ? 1 - ((1 - chanceRatio) ** spinsSinceHit)
    : 0;
  const dueSteps = dueProbability >= 0.94 ? 3 : dueProbability >= 0.8 ? 2 : dueProbability >= 0.55 ? 1 : 0;
  const gapSteps = underHitGap >= 5 ? 2 : underHitGap >= 2 ? 1 : 0;
  const recentlyHit = spinsSinceHit === 0;
  const isClientPositiveTier = profitPerSpin < 0;
  const pressureSteps = isClientPositiveTier && underHitGap > -1
    ? Math.max(dueSteps, gapSteps)
    : 0;
  const cooldownSteps = recentlyHit ? 2 : 0;

  return {
    heat: shiftHeatLevel(
      resolveProfitHeatLevel(profitPerSpin),
      pressureSteps - cooldownSteps
    ),
    chance,
    hitCount,
    marginPercent,
    profitPerSpin,
    recentlyHit
  };
}

function getFallbackHeatCandidate(
  vm: WheelSpectatorVm,
  config: WheelConfig
): {
  label: string | null;
  heat: WheelSpectatorHeatLevel | null;
} {
  const candidates: Array<{
    tier: WheelConfig["tiers"][number];
    label: string;
    profitPerSpin: number;
    marginPercent: number | null;
    chance: number;
    hitCount: number;
    recentlyHit: boolean;
    heat: WheelSpectatorHeatLevel;
  }> = [];
  for (const tier of config.tiers) {
    const tierHeat = resolveTierHeatLevel(vm, config, tier);
    if (tierHeat.chance <= 0) continue;

    const remainingHits = getTierRemainingHits(vm, tier);
    if (remainingHits === 0) continue;

    candidates.push({
      tier,
      label: tier.label,
      profitPerSpin: tierHeat.profitPerSpin,
      marginPercent: tierHeat.marginPercent,
      chance: tierHeat.chance,
      hitCount: tierHeat.hitCount,
      recentlyHit: tierHeat.recentlyHit,
      heat: tierHeat.heat
    });
  }

  if (!candidates.length) {
    return {
      label: null,
      heat: null
    };
  }

  const clientPositiveCandidates = candidates.filter((entry) => entry.profitPerSpin < 0);
  const rankedCandidates = [...(clientPositiveCandidates.length ? clientPositiveCandidates : candidates)]
    .sort((left, right) => (
      getHeatLevelRank(right.heat) - getHeatLevelRank(left.heat)
      || left.profitPerSpin - right.profitPerSpin
      || right.chance - left.chance
      || left.label.localeCompare(right.label)
    ));
  const hottest = rankedCandidates[0]!;
  const activeClientPositiveCount = clientPositiveCandidates.filter((entry) => getHeatLevelRank(entry.heat) >= 2).length;

  return {
    label: clientPositiveCandidates.length > 1
      ? `${clientPositiveCandidates.length} client-favorable tiers`
      : hottest.label,
    heat: clientPositiveCandidates.length > 1 && activeClientPositiveCount > 1
      ? shiftHeatLevel(hottest.heat, 1)
      : hottest.heat
  };
}

function buildChaseBoard(vm: WheelSpectatorVm, config: WheelConfig | null): {
  chaseHistory: WheelSpectatorChaseHistoryEntry[];
  chaseBoard: WheelSpectatorChaseBoardEntry[];
  featuredChaseLabel: string | null;
  featuredChaseHeat: WheelSpectatorHeatLevel | null;
} {
  const chaseHistory = getTierHitHistory(vm);
  if (!config) {
    return {
      chaseHistory,
      chaseBoard: [],
      featuredChaseLabel: null,
      featuredChaseHeat: null
    };
  }

  const board: WheelSpectatorChaseBoardEntry[] = [];
  const historicalByLabel = new Map(chaseHistory.map((entry) => [entry.label, entry]));

  for (const tier of config.tiers) {
    if (tier.isChase !== true) continue;
    const remainingHits = getTierRemainingHits(vm, tier);
    const hitCount = getTierHitCount(config, vm, tier.id);
    board.push({
      tierId: tier.id,
      label: tier.label,
      color: tier.color,
      status: remainingHits === 0 ? "claimed" : "live",
      hitCount,
      slots: getTierChancePercent(tier),
      remainingHits
    });

    const existingHistorical = historicalByLabel.get(tier.label);
    if (!existingHistorical && hitCount > 0) {
      chaseHistory.push({
        tierId: tier.id,
        label: tier.label,
        color: tier.color,
        count: hitCount
      });
    }
  }

  for (const historical of chaseHistory) {
    if (board.some((entry) => entry.label === historical.label)) continue;
    board.push({
      tierId: historical.tierId,
      label: historical.label,
      color: historical.color,
      status: "claimed",
      hitCount: historical.count,
      slots: 0,
      remainingHits: 0
    });
  }

  const liveChases = board
    .filter((entry) => entry.status === "live")
    .sort((left, right) => right.slots - left.slots || left.label.localeCompare(right.label));
  const fallbackHeat = getFallbackHeatCandidate(vm, config);
  const featured = liveChases.find((entry) => entry.label === fallbackHeat.label) ?? null;
  if (featured) {
    featured.isFeatured = true;
  }

  board.sort((left, right) => {
    if (left.status !== right.status) return left.status === "live" ? -1 : 1;
    if (left.isFeatured !== right.isFeatured) return left.isFeatured ? -1 : 1;
    if (left.hitCount !== right.hitCount) return right.hitCount - left.hitCount;
    return left.label.localeCompare(right.label);
  });

  return {
    chaseHistory: chaseHistory.slice(0, 20),
    chaseBoard: board.slice(0, 24),
    featuredChaseLabel: fallbackHeat.label,
    featuredChaseHeat: fallbackHeat.heat
  };
}

function normalizeFairnessEntry(entry: WheelFairnessEntry): WheelSpectatorSnapshot["recentFairnessHistory"][number] {
  return {
    spinNumber: Math.max(0, Math.floor(Number(entry.spinNumber) || 0)),
    label: cleanResultLabel(entry.label),
    color: String(entry.color || "#d4af37"),
    verificationUrl: entry.verificationUrl,
    timestamp: Math.max(0, Math.floor(Number(entry.timestamp) || 0))
  };
}

function buildSpectatorSlots(vm: WheelSpectatorVm): WheelSpectatorSlot[] {
  return getWheelDisplaySlots(vm)
    .map((slot) => ({
      name: String(slot.name || "").trim(),
      color: String(slot.color || "#d4af37"),
      tier: String(slot.tier || "").trim(),
      isChase: slot.isChase === true
    }))
    .filter((slot) => slot.name.length > 0 && slot.tier.length > 0)
    .slice(0, 256);
}

function resolveWheelSpectatorConfig(vm: WheelSpectatorVm): WheelConfig | null {
  const displayedConfig = vm.wheelDisplayConfig as WheelConfig | null | undefined;
  if (displayedConfig?.gameType === "grid") return displayedConfig;

  const computedConfig = getWheelDisplayConfig(vm);
  if (computedConfig?.gameType === "grid") return computedConfig;

  const editingConfig = vm.editingWheelConfig as WheelConfig | null | undefined;
  if (
    editingConfig?.gameType === "grid"
    && (computedConfig == null || editingConfig.id === computedConfig.id)
  ) {
    return editingConfig;
  }

  return computedConfig || displayedConfig || editingConfig || null;
}

function buildSpectatorGridCells(vm: WheelSpectatorVm, config: WheelConfig | null): WheelSpectatorGridCell[] {
  if (!isMysteryGridConfig(config)) return [];
  return buildMysteryGridCells({
    ...vm,
    wheelDisplayConfig: config
  }).map((cell) => ({
    index: cell.index,
    revealed: cell.revealed,
    label: cell.revealed ? cell.label : "",
    color: cell.revealed ? cell.color : "",
    tier: cell.reveal?.tier || "",
    slotIndex: cell.reveal?.slotIndex ?? -1
  })).slice(0, 256);
}

export function buildWheelSpectatorSnapshot(
  vm: WheelSpectatorVm,
  status: Exclude<WheelSpectatorSessionStatus, "inactive">
): WheelSpectatorSnapshot {
  const config = resolveWheelSpectatorConfig(vm);
  const gameType = config?.gameType === "grid" ? "grid" : "wheel";
  const fairnessHistory = getWheelDisplayFairnessHistoryEntries(vm)
    .slice(0, 10)
    .map((entry) => normalizeFairnessEntry(entry));
  const latestFairnessEntry = getWheelLatestFairnessEntry(vm);
  const chaseData = buildChaseBoard(vm, config);

  return {
    wheelName: String(config?.name || "Wheel Session").trim() || "Wheel Session",
    gameType,
    sessionStatus: status,
    isSpinning: vm.wheelSpinning === true || vm.wheelGridRevealAnimating === true,
    totalSpins: getWheelDisplayTotalSpins(vm),
    lastResultLabel: cleanResultLabel(vm.wheelLastResult) || cleanResultLabel(latestFairnessEntry?.label) || "Waiting for the next spin",
    lastResultColor: String(vm.wheelLastResultColor || latestFairnessEntry?.color || "#d4af37"),
    wheelCurrentAngle: Number.isFinite(Number(vm.wheelCurrentAngle)) ? Number(vm.wheelCurrentAngle) : 0,
    wheelSlots: buildSpectatorSlots(vm),
    gridCells: buildSpectatorGridCells(vm, config),
    gridHighlightCellIndex: Number.isFinite(Number(vm.wheelGridHighlightCellIndex)) ? Number(vm.wheelGridHighlightCellIndex) : -1,
    gridResetAnimating: vm.wheelGridResetAnimating === true,
    spinAnimation: (vm._wheelSpectatorSpinAnimation as WheelSpectatorSnapshot["spinAnimation"]) ?? null,
    recentFairnessHistory: fairnessHistory,
    chaseHistory: chaseData.chaseHistory,
    chaseBoard: chaseData.chaseBoard,
    featuredChaseLabel: chaseData.featuredChaseLabel,
    featuredChaseHeat: chaseData.featuredChaseHeat,
    fairnessVerificationUrl: latestFairnessEntry?.verificationUrl || fairnessHistory[0]?.verificationUrl || null,
    updatedAt: Date.now()
  };
}
