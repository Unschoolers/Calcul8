import { getWheelController } from "../coordinator/gameControllerState.ts";
import {
  buildWheelFairnessViewModel,
  type WheelFairnessViewModel
} from "../services/wheelFairnessViewModel.ts";

type FairnessComputedContext = Record<string, unknown> & {
  wheelFairnessModel?: WheelFairnessViewModel;
};

function model(context: FairnessComputedContext): WheelFairnessViewModel {
  return context.wheelFairnessModel ?? buildWheelFairnessViewModel(context);
}

export const wheelFairnessComputeds = {
  wheelFairnessModel(this: FairnessComputedContext): WheelFairnessViewModel {
    return buildWheelFairnessViewModel(this);
  },

  wheelFairnessIcon(this: FairnessComputedContext): string {
    return model(this).icon;
  },

  wheelFairnessIconColor(this: FairnessComputedContext): string {
    return model(this).iconColor;
  },

  wheelFairnessTitle(this: FairnessComputedContext): string {
    return model(this).title;
  },

  wheelFairnessChevron(this: FairnessComputedContext): string {
    const controller = getWheelController(this);
    return controller.showSeed ? "mdi-chevron-up" : "mdi-chevron-down";
  },

  wheelDisplayFairnessHistory(this: FairnessComputedContext) {
    return model(this).entries;
  },

  wheelFairnessHistorySummary(this: FairnessComputedContext): string {
    return model(this).summary;
  },

  wheelLatestFairnessEntry(this: FairnessComputedContext) {
    return model(this).latestEntry;
  }
};

