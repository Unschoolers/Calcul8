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
  wheelSessionProfitClass(this: SessionComputedContext): string {
    return model(this).profitClass;
  },
  wheelSessionProfitDisplay(this: SessionComputedContext): string {
    return model(this).profitDisplay;
  },
  wheelSessionMarginDisplay(this: SessionComputedContext): string {
    const margin = calculateWheelSessionMarginPercent(this);
    return margin == null ? "—" : `${margin.toFixed(1)}%`;
  },
  wheelSessionMarginColor(this: SessionComputedContext): string {
    return model(this).marginColor;
  },
  wheelSessionMarginBarWidth(this: SessionComputedContext): string {
    return model(this).marginBarWidth;
  },
  wheelTargetMarginBarLeft(this: SessionComputedContext): string {
    return model(this).targetMarginBarLeft;
  },
  wheelSessionMarginHint(this: SessionComputedContext): string {
    return model(this).marginHint;
  },
  wheelTallyByTier(this: SessionComputedContext): WheelTierTally[] {
    return model(this).tallyByTier;
  },
  wheelSessionSourceGroups(this: SessionComputedContext): WheelSessionSourceGroup[] {
    const config = (this.wheelDisplayConfig || null) as WheelConfig | null;
    const tally = (this.wheelTallyByTier || []) as WheelTierTally[];
    return buildWheelSessionSourceGroups(this, config, tally);
  },
  wheelTrackerInventory(this: SessionComputedContext): WheelSessionSourceGroup[] {
    return model(this).sourceGroups;
  }
};
