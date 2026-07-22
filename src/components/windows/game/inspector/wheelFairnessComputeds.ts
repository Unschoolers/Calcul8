import { getWheelController } from "../services/gameSessionState.ts";
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

function field<K extends keyof WheelFairnessViewModel>(key: K) {
  return function (this: FairnessComputedContext): WheelFairnessViewModel[K] {
    return model(this)[key];
  };
}

export const wheelFairnessComputeds = {
  wheelFairnessModel(this: FairnessComputedContext): WheelFairnessViewModel {
    return buildWheelFairnessViewModel(this);
  },

  wheelFairnessIcon: field("icon"),
  wheelFairnessIconColor: field("iconColor"),
  wheelFairnessTitle: field("title"),

  wheelFairnessChevron(this: FairnessComputedContext): string {
    const controller = getWheelController(this);
    return controller.wheelShowSeed ? "mdi-chevron-up" : "mdi-chevron-down";
  },

  wheelDisplayFairnessHistory: field("entries"),
  wheelFairnessHistorySummary: field("summary"),
  wheelLatestFairnessEntry: field("latestEntry")
};

