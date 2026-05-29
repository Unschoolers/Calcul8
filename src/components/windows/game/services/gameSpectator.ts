import type {
    Lot,
    WheelConfig,
    WheelFairnessEntry,
    GameSpectatorBoardCell,
    GameSpectatorChaseBoardEntry,
    GameSpectatorChaseHistoryEntry,
    GameSpectatorSessionStatus,
    GameSpectatorOutcomeSlot,
    GameSpectatorSnapshot
} from "../../../../types/app.ts";
import { isSinglesLot } from "../../../../app-core/shared/lot-types.ts";
import {
    resolveFeaturedGameHeatCandidate,
    type GameHeatTierInput
} from "../../../../app-core/shared/game-heat.ts";
import type { BracketBattleRoll, BracketBattleSession } from "../bracket/bracketBattleDomain.ts";
import { isBracketBattleSession } from "../bracket/bracketBattleHostFlow.ts";
import {
    buildBracketBattleSpectatorSnapshot,
    findBracketParticipantLabel
} from "../bracket/bracketBattleSpectatorSnapshot.ts";
import { getTierChancePercent } from "../../../../app-core/shared/wheel-odds.ts";
import {
    getWheelDisplayConfig,
    getWheelDisplayFairnessHistoryEntries,
    getWheelDisplaySlots,
    getWheelDisplaySpinCounts,
    getWheelDisplayTotalSpins,
    getWheelLatestFairnessEntry
} from "../coordinator/gameComputedShared.ts";
import { calculateWheelTierNetRevenuePerSpin } from "./wheelPricing.ts";
import { buildMysteryGridCells, isMysteryGridConfig } from "../commands/mysteryGridMethods.ts";
import { getAvailableSinglesQuantityForWheelTier, getRemainingPacksForWheelLot, hasAnyAvailableSinglesForWheelTier } from "./wheelSaleSupport.ts";

type GameSpectatorVm = Record<string, unknown> & {
  lots?: Lot[];
};

export function normalizeGamePublicSessionId(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function cleanResultLabel(value: unknown): string {
  return String(value ?? "").replace(/^🎉\s*/, "").trim();
}

function resolveGamePublicBaseUrl(): URL {
  const currentUrl = new URL(window.location.href);
  currentUrl.hash = "";
  currentUrl.search = "";
  currentUrl.pathname = currentUrl.pathname.replace(/\/[^/]*$/, "/spectator.html");
  if (!/spectator\.html$/i.test(currentUrl.pathname)) {
    currentUrl.pathname = `${currentUrl.pathname.replace(/\/+$/, "")}/spectator.html`;
  }
  return currentUrl;
}

export function buildGameSpectatorSessionUrl(publicSessionId: string): string {
  const url = resolveGamePublicBaseUrl();
  url.searchParams.set("session", normalizeGamePublicSessionId(publicSessionId));
  return url.toString();
}

export function buildGameSpectatorQrImageUrl(publicUrl: string): string {
  const qrUrl = new URL("https://api.qrserver.com/v1/create-qr-code/");
  qrUrl.searchParams.set("size", "240x240");
  qrUrl.searchParams.set("margin", "0");
  qrUrl.searchParams.set("data", publicUrl);
  return qrUrl.toString();
}

function getTierHitCount(config: WheelConfig, vm: GameSpectatorVm, tierId: string): number {
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

function getTierRemainingHits(vm: GameSpectatorVm, tier: WheelConfig["tiers"][number]): number | null {
  if (tier.boundLotId == null) return null;
  const lots = Array.isArray(vm.lots) ? vm.lots : [];
  const lot = lots.find((entry) => entry.id === tier.boundLotId);
  if (!lot) return null;
  const quantityPerHit = Math.max(1, Number(tier.packsCount) || 1);

  if (isSinglesLot(lot)) {
    if (tier.boundSinglesId != null) {
      const availableQuantity = getAvailableSinglesQuantityForWheelTier(vm, tier.boundLotId, tier.boundSinglesId);
      return Math.max(0, Math.floor(availableQuantity / quantityPerHit));
    }
    return hasAnyAvailableSinglesForWheelTier(vm, tier) ? 1 : 0;
  }

  const remainingPacks = getRemainingPacksForWheelLot(vm, tier.boundLotId);
  return Math.max(0, Math.floor(remainingPacks / quantityPerHit));
}

function getTierHitHistory(vm: GameSpectatorVm): GameSpectatorChaseHistoryEntry[] {
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

function buildTierHeatInput(
  vm: GameSpectatorVm,
  config: WheelConfig,
  tier: WheelConfig["tiers"][number],
  totalChance: number
): GameHeatTierInput {
  const lots = Array.isArray(vm.lots) ? vm.lots : [];
  const chance = getTierChancePercent(tier);
  const netRevenuePerSpin = calculateWheelTierNetRevenuePerSpin(config, tier, lots);
  const costPerTier = Number(tier.costPerTier) || 0;
  const profitPerSpin = netRevenuePerSpin - costPerTier;
  const hitCount = getTierHitCount(config, vm, tier.id);
  const totalSpins = getWheelDisplayTotalSpins(vm);
  const displaySlots = getWheelDisplaySlots(vm);
  const latestTierHit = getWheelDisplayFairnessHistoryEntries(vm)
    .find((entry) => isFairnessEntryForTier(entry, tier, displaySlots));
  const spinsSinceHit = latestTierHit
    ? Math.max(0, totalSpins - Math.max(0, Math.floor(Number(latestTierHit.spinNumber) || 0)))
    : totalSpins;

  return {
    id: tier.id,
    label: tier.label,
    chance,
    totalChance,
    totalPlays: totalSpins,
    hitCount,
    spinsSinceHit,
    profitPerPlay: profitPerSpin,
    remainingHits: getTierRemainingHits(vm, tier)
  };
}

function getFallbackHeatCandidate(
  vm: GameSpectatorVm,
  config: WheelConfig
): {
  label: string | null;
  heat: GameSpectatorSnapshot["featuredChaseHeat"];
} {
  const totalChance = Math.max(1, config.tiers.reduce((sum, entry) => sum + getTierChancePercent(entry), 0));
  const result = resolveFeaturedGameHeatCandidate(
    config.tiers.map((tier) => buildTierHeatInput(vm, config, tier, totalChance))
  );
  return {
    label: result.label,
    heat: result.heat
  };
}

function buildChaseBoard(vm: GameSpectatorVm, config: WheelConfig | null): {
  chaseHistory: GameSpectatorChaseHistoryEntry[];
  chaseBoard: GameSpectatorChaseBoardEntry[];
  featuredChaseLabel: string | null;
  featuredChaseHeat: GameSpectatorSnapshot["featuredChaseHeat"];
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

  const board: GameSpectatorChaseBoardEntry[] = [];
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

function normalizeFairnessEntry(entry: WheelFairnessEntry): GameSpectatorSnapshot["recentFairnessHistory"][number] {
  return {
    spinNumber: Math.max(0, Math.floor(Number(entry.spinNumber) || 0)),
    label: cleanResultLabel(entry.label),
    color: String(entry.color || "#d4af37"),
    verificationUrl: entry.verificationUrl,
    timestamp: Math.max(0, Math.floor(Number(entry.timestamp) || 0))
  };
}

function buildSpectatorSlots(vm: GameSpectatorVm): GameSpectatorOutcomeSlot[] {
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

function resolveGameSpectatorConfig(vm: GameSpectatorVm): WheelConfig | null {
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

function buildSpectatorGridCells(vm: GameSpectatorVm, config: WheelConfig | null): GameSpectatorBoardCell[] {
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

export function buildGameSpectatorSnapshot(
  vm: GameSpectatorVm,
  status: Exclude<GameSpectatorSessionStatus, "inactive">
): GameSpectatorSnapshot {
  const config = resolveGameSpectatorConfig(vm);
  const bracketSession = isBracketBattleSession(vm.bracketBattleSession) ? vm.bracketBattleSession : null;
  const gameType = config?.gameType === "bracket" ? "bracket" : (config?.gameType === "grid" ? "grid" : "wheel");
  const bracket = gameType === "bracket" && bracketSession
    ? buildBracketBattleSpectatorSnapshot(bracketSession, {
        rolling: vm.bracketBattleRolling === true,
        showcaseMatchId: String(vm.bracketBattleShowcaseMatchId ?? ""),
        lastRolls: Array.isArray(vm.bracketBattleLastRolls) ? vm.bracketBattleLastRolls as BracketBattleRoll[] : []
      })
    : null;
  const fairnessHistory = getWheelDisplayFairnessHistoryEntries(vm)
    .slice(0, 10)
    .map((entry) => normalizeFairnessEntry(entry));
  const latestFairnessEntry = getWheelLatestFairnessEntry(vm);
  const chaseData = buildChaseBoard(vm, config);

  return {
    snapshotVersion: 2,
    gameName: String(config?.name || "Game Session").trim() || "Game Session",
    gameType,
    sessionStatus: status,
    isSpinning: gameType === "bracket"
      ? vm.bracketBattleRolling === true
      : vm.wheelSpinning === true || vm.wheelGridRevealAnimating === true,
    sessionResultCount: gameType === "bracket"
      ? Math.max(0, bracketSession?.awards.length ?? 0)
      : getWheelDisplayTotalSpins(vm),
    lastResultLabel: gameType === "bracket"
      ? (bracket?.activeMatch
          ? `${bracket.activeMatch.participantALabel} vs ${bracket.activeMatch.participantBLabel}`
          : (bracketSession?.championParticipantId
              ? `${findBracketParticipantLabel(bracketSession, bracketSession.championParticipantId)} wins`
              : "Waiting for the next match"))
      : cleanResultLabel(vm.wheelLastResult) || cleanResultLabel(latestFairnessEntry?.label) || "Waiting for the next spin",
    lastResultColor: String(vm.wheelLastResultColor || latestFairnessEntry?.color || "#d4af37"),
    gameCurrentAngle: Number.isFinite(Number(vm.wheelCurrentAngle)) ? Number(vm.wheelCurrentAngle) : 0,
    outcomeSlots: buildSpectatorSlots(vm),
    boardCells: buildSpectatorGridCells(vm, config),
    boardHighlightCellIndex: Number.isFinite(Number(vm.wheelGridHighlightCellIndex)) ? Number(vm.wheelGridHighlightCellIndex) : -1,
    boardResetAnimating: vm.wheelGridResetAnimating === true,
    resultAnimation: (vm._gameSpectatorSpinAnimation as GameSpectatorSnapshot["resultAnimation"]) ?? null,
    recentFairnessHistory: fairnessHistory,
    chaseHistory: chaseData.chaseHistory,
    chaseBoard: chaseData.chaseBoard,
    featuredChaseLabel: chaseData.featuredChaseLabel,
    featuredChaseHeat: chaseData.featuredChaseHeat,
    fairnessVerificationUrl: latestFairnessEntry?.verificationUrl || fairnessHistory[0]?.verificationUrl || null,
    bracket,
    updatedAt: Date.now()
  };
}

