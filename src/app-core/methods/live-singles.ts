import type { LiveSinglesSelectionMode, LiveSinglesSelectionSource } from "../../types/app.ts";
import { type ConfigMethodSubset } from "./config-shared.ts";
import { normalizeUniquePositiveIntIds } from "../shared/singles-normalizers.ts";

function mergeLiveSinglesIds(baseIds: number[], incomingIds: number[]): number[] {
  if (incomingIds.length === 0) return [...baseIds];
  const merged = [...baseIds];
  const known = new Set(baseIds);
  for (const id of incomingIds) {
    if (known.has(id)) continue;
    known.add(id);
    merged.push(id);
  }
  return merged;
}

type LiveWindowVm = {
  applySinglesAutoPricing?: () => void;
  resetSinglesPricing?: () => void;
};

function resolveLiveWindowVm(context: unknown): LiveWindowVm | null {
  if (context == null || typeof context !== "object") return null;
  const refs = (context as { $refs?: Record<string, unknown> }).$refs;
  if (!refs || typeof refs !== "object") return null;
  const liveWindow = refs.liveWindow;
  if (!liveWindow || typeof liveWindow !== "object") return null;
  return liveWindow as LiveWindowVm;
}

export const liveSinglesMethods: ConfigMethodSubset<
  | "setLiveSinglesSelection"
  | "addLiveSinglesSelection"
  | "removeLiveSinglesSelection"
  | "clearLiveSinglesSelection"
  | "applyLiveSinglesSuggestedPricing"
  | "resetLiveSinglesPricing"
> = {
  setLiveSinglesSelection(
    ids: number[],
    opts?: { source?: LiveSinglesSelectionSource; mode?: LiveSinglesSelectionMode }
  ): void {
    const source = opts?.source === "external" ? "external" : "manual";
    const mode = opts?.mode === "merge" ? "merge" : "replace";
    const nextIds = normalizeUniquePositiveIntIds(ids);
    const currentIds = normalizeUniquePositiveIntIds(
      source === "external" ? this.liveSinglesExternalIds : this.liveSinglesManualIds
    );

    const appliedIds = mode === "merge"
      ? mergeLiveSinglesIds(currentIds, nextIds)
      : nextIds;

    if (source === "external") {
      this.liveSinglesExternalIds = appliedIds;
      return;
    }
    this.liveSinglesManualIds = appliedIds;
  },

  addLiveSinglesSelection(id: number, source: LiveSinglesSelectionSource = "manual"): void {
    this.setLiveSinglesSelection([id], { source, mode: "merge" });
  },

  removeLiveSinglesSelection(id: number, source: LiveSinglesSelectionSource = "manual"): void {
    const parsedId = Number(id);
    if (!Number.isFinite(parsedId) || parsedId <= 0) return;
    const normalizedId = Math.floor(parsedId);
    const currentIds = normalizeUniquePositiveIntIds(
      source === "external" ? this.liveSinglesExternalIds : this.liveSinglesManualIds
    );
    const nextIds = currentIds.filter((entryId) => entryId !== normalizedId);

    if (source === "external") {
      this.liveSinglesExternalIds = nextIds;
      return;
    }
    this.liveSinglesManualIds = nextIds;
  },

  clearLiveSinglesSelection(source?: LiveSinglesSelectionSource): void {
    if (!source || source === "manual") {
      this.liveSinglesManualIds = [];
    }
    if (!source || source === "external") {
      this.liveSinglesExternalIds = [];
    }
  },

  applyLiveSinglesSuggestedPricing(): void {
    if (this.currentLotType !== "singles") return;
    if (!Array.isArray(this.effectiveLiveSinglesIds) || this.effectiveLiveSinglesIds.length === 0) {
      return;
    }
    const liveWindow = resolveLiveWindowVm(this);
    const action = liveWindow?.applySinglesAutoPricing;
    if (typeof action === "function") {
      action.call(liveWindow);
      this.notify("Live singles prices auto-calculated from target profit", "success");
      return;
    }
    this.notify("Open the Live tab to auto-calculate singles prices", "info");
  },

  resetLiveSinglesPricing(): void {
    if (this.currentLotType !== "singles") return;
    const liveWindow = resolveLiveWindowVm(this);
    const action = liveWindow?.resetSinglesPricing;
    if (typeof action === "function") {
      action.call(liveWindow);
      this.notify("Live singles prices reset to suggested values", "info");
      return;
    }
    this.notify("Open the Live tab to reset singles prices", "info");
  }
};
