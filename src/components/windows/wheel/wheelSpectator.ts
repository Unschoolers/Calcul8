import type {
    Lot,
    WheelConfig,
    WheelFairnessEntry,
    WheelSpectatorChaseBoardEntry,
    WheelSpectatorChaseHistoryEntry,
    WheelSpectatorHeatLevel,
    WheelSpectatorSessionStatus,
    WheelSpectatorSlot,
    WheelSpectatorSnapshot
} from "../../../types/app.ts";
import {
    getWheelDisplayConfig,
    getWheelDisplayFairnessHistoryEntries,
    getWheelDisplaySlots,
    getWheelDisplaySpinCounts,
    getWheelDisplayTotalSpins,
    getWheelLatestFairnessEntry
} from "./wheelComputedShared.ts";
import { calculateWheelTierNetRevenuePerSpin } from "./wheelHelpers.ts";
import { getAvailableSinglesQuantityForWheelTier, getRemainingPacksForWheelLot, hasAnyAvailableSinglesForWheelTier } from "./wheelSaleSupport.ts";

type WheelSpectatorVm = Record<string, unknown> & {
  lots?: Lot[];
};

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
  url.searchParams.set("session", publicSessionId);
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

function resolveHeatLevel(chance: number): WheelSpectatorHeatLevel {
  if (chance >= 0.18) return "high";
  if (chance >= 0.08) return "medium";
  return "low";
}

function resolveDangerHeatLevel(
  marginPercent: number | null,
  targetMargin: number
): WheelSpectatorHeatLevel {
  if (marginPercent === null || !Number.isFinite(marginPercent)) return "low";
  if (marginPercent < 0) return "high";
  if (marginPercent < targetMargin) return "medium";
  return "low";
}

function increaseHeatLevel(
  heat: WheelSpectatorHeatLevel,
  steps: number
): WheelSpectatorHeatLevel {
  if (steps <= 0) return heat;
  if (heat === "low") {
    return steps >= 2 ? "high" : "medium";
  }
  if (heat === "medium") {
    return "high";
  }
  return "high";
}

function getFallbackHeatCandidate(
  vm: WheelSpectatorVm,
  config: WheelConfig
): {
  label: string | null;
  heat: WheelSpectatorHeatLevel | null;
} {
  const lots = Array.isArray(vm.lots) ? vm.lots : [];
  let fallback: {
    label: string;
    profitPerSpin: number;
    marginPercent: number | null;
    slots: number;
    hitCount: number;
    recentlyHit: boolean;
  } | null = null;
  const totalSlots = Math.max(1, config.tiers.reduce((sum, tier) => sum + Math.max(0, Number(tier.slots) || 0), 0));
  const totalSpins = getWheelDisplayTotalSpins(vm);
  const latestFairnessEntry = getWheelLatestFairnessEntry(vm);
  const latestHitLabel = cleanResultLabel(latestFairnessEntry?.label);

  for (const tier of config.tiers) {
    const slots = Math.max(0, Number(tier.slots) || 0);
    if (slots <= 0) continue;

    const remainingHits = getTierRemainingHits(vm, tier);
    if (remainingHits === 0) continue;

    const netRevenuePerSpin = calculateWheelTierNetRevenuePerSpin(config, tier, lots);
    const costPerTier = Number(tier.costPerTier) || 0;
    const profitPerSpin = netRevenuePerSpin - costPerTier;
    const marginPercent = costPerTier > 0
      ? (profitPerSpin / costPerTier) * 100
      : null;
    const hitCount = getTierHitCount(config, vm, tier.id);
    const recentlyHit = latestHitLabel.length > 0 && latestHitLabel === cleanResultLabel(tier.label);

    if (
      !fallback
      || profitPerSpin < fallback.profitPerSpin
      || (profitPerSpin === fallback.profitPerSpin && (marginPercent ?? Number.POSITIVE_INFINITY) < (fallback.marginPercent ?? Number.POSITIVE_INFINITY))
      || (profitPerSpin === fallback.profitPerSpin && marginPercent === fallback.marginPercent && slots > fallback.slots)
      || (
        profitPerSpin === fallback.profitPerSpin
        && marginPercent === fallback.marginPercent
        && slots === fallback.slots
        && tier.label.localeCompare(fallback.label) < 0
      )
    ) {
      fallback = {
        label: tier.label,
        profitPerSpin,
        marginPercent,
        slots,
        hitCount,
        recentlyHit
      };
    }
  }

  if (!fallback) {
    return {
      label: null,
      heat: null
    };
  }

  const expectedHits = totalSpins * (fallback.slots / totalSlots);
  const underHitGap = expectedHits - fallback.hitCount;
  const pressureSteps = underHitGap >= 4 ? 2 : underHitGap >= 2 ? 1 : 0;
  const cooldownSteps = fallback.recentlyHit ? 1 : 0;

  return {
    label: fallback.label,
    heat: increaseHeatLevel(
      resolveDangerHeatLevel(fallback.marginPercent, Number(config.targetMargin) || 0),
      Math.max(0, pressureSteps - cooldownSteps)
    )
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

  const totalSlots = Math.max(1, config.tiers.reduce((sum, tier) => sum + Math.max(0, Number(tier.slots) || 0), 0));
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
      slots: Math.max(0, Number(tier.slots) || 0),
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
  const featured = liveChases[0] ?? null;
  if (featured) {
    featured.isFeatured = true;
  }

  board.sort((left, right) => {
    if (left.status !== right.status) return left.status === "live" ? -1 : 1;
    if (left.isFeatured !== right.isFeatured) return left.isFeatured ? -1 : 1;
    if (left.hitCount !== right.hitCount) return right.hitCount - left.hitCount;
    return left.label.localeCompare(right.label);
  });

  const fallbackHeat = getFallbackHeatCandidate(vm, config);

  return {
    chaseHistory: chaseHistory.slice(0, 20),
    chaseBoard: board.slice(0, 24),
    featuredChaseLabel: featured?.label ?? fallbackHeat.label,
    featuredChaseHeat: featured
      ? resolveHeatLevel(featured.slots / totalSlots)
      : fallbackHeat.heat
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

export function buildWheelSpectatorSnapshot(
  vm: WheelSpectatorVm,
  status: Exclude<WheelSpectatorSessionStatus, "inactive">
): WheelSpectatorSnapshot {
  const config = getWheelDisplayConfig(vm);
  const fairnessHistory = getWheelDisplayFairnessHistoryEntries(vm)
    .slice(0, 10)
    .map((entry) => normalizeFairnessEntry(entry));
  const latestFairnessEntry = getWheelLatestFairnessEntry(vm);
  const chaseData = buildChaseBoard(vm, config);

  return {
    wheelName: String(config?.name || "Wheel Session").trim() || "Wheel Session",
    sessionStatus: status,
    totalSpins: getWheelDisplayTotalSpins(vm),
    lastResultLabel: cleanResultLabel(vm.wheelLastResult) || cleanResultLabel(latestFairnessEntry?.label) || "Waiting for the next spin",
    lastResultColor: String(vm.wheelLastResultColor || latestFairnessEntry?.color || "#d4af37"),
    wheelCurrentAngle: Number.isFinite(Number(vm.wheelCurrentAngle)) ? Number(vm.wheelCurrentAngle) : 0,
    wheelSlots: buildSpectatorSlots(vm),
    recentFairnessHistory: fairnessHistory,
    chaseHistory: chaseData.chaseHistory,
    chaseBoard: chaseData.chaseBoard,
    featuredChaseLabel: chaseData.featuredChaseLabel,
    featuredChaseHeat: chaseData.featuredChaseHeat,
    fairnessVerificationUrl: latestFairnessEntry?.verificationUrl || fairnessHistory[0]?.verificationUrl || null,
    updatedAt: Date.now()
  };
}
