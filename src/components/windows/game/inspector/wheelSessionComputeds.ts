import {
  buildWheelSessionViewModel,
  buildWheelSessionSourceGroups,
  type WheelSessionSourceGroup,
  type WheelSessionViewModel,
  type WheelTierTally
} from "../services/wheelSessionViewModel.ts";
import type { WheelConfig } from "../../../../types/app.ts";
import {
  calculateWheelSessionMarginPercent,
  getWheelSessionCost,
  getWheelSessionProfit,
  getWheelSessionRevenue
} from "../coordinator/gameComputedShared.ts";

type SessionComputedContext = Record<string, unknown> & {
  wheelSessionModel?: WheelSessionViewModel;
};

function model(context: SessionComputedContext): WheelSessionViewModel {
  return context.wheelSessionModel ?? buildWheelSessionViewModel(context);
}

function field<K extends keyof WheelSessionViewModel>(key: K) {
  return function (this: SessionComputedContext): WheelSessionViewModel[K] {
    return model(this)[key];
  };
}

/** Compatibility aliases for consumers that still read individual session fields. */
export const wheelSessionComputeds = {
  wheelSessionModel(this: SessionComputedContext): WheelSessionViewModel {
    return buildWheelSessionViewModel(this);
  },
  wheelSessionRevenue(this: SessionComputedContext): number {
    return getWheelSessionRevenue(this);
  },
  wheelSessionCost(this: SessionComputedContext): number {
    return getWheelSessionCost(this);
  },
  wheelSessionProfit(this: SessionComputedContext): number {
    return getWheelSessionProfit(this);
  },
  wheelSessionProfitClass: field("profitClass"),
  wheelSessionProfitDisplay: field("profitDisplay"),
  wheelSessionMarginDisplay(this: SessionComputedContext): string {
    const margin = calculateWheelSessionMarginPercent(this);
    return margin == null ? "—" : `${margin.toFixed(1)}%`;
  },
  wheelSessionMarginColor: field("marginColor"),
  wheelSessionMarginBarWidth: field("marginBarWidth"),
  wheelTargetMarginBarLeft: field("targetMarginBarLeft"),
  wheelSessionMarginHint: field("marginHint"),
  wheelTallyByTier: field("tallyByTier"),
  wheelSessionSourceGroups(this: SessionComputedContext): WheelSessionSourceGroup[] {
    const config = (this.wheelDisplayConfig || null) as WheelConfig | null;
    const tally = (this.wheelTallyByTier || []) as WheelTierTally[];
    return buildWheelSessionSourceGroups(this, config, tally);
  },
  wheelTrackerInventory: field("sourceGroups")
};
