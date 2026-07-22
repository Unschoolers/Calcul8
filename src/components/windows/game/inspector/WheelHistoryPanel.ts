import { translateAppMessage } from "../../../../app-core/i18n/index.ts";
import { gameContextProp, getGameContextSource, setupGameContext } from "../../shared/contextBridge.ts";
import { getWheelController } from "../coordinator/gameControllerState.ts";
import {
  buildWheelFairnessViewModel,
  type WheelFairnessViewModel
} from "../services/wheelFairnessViewModel.ts";

type PanelContext = Record<string, unknown>;

export const WheelHistoryPanel = {
  name: "WheelHistoryPanel",
  props: {
    ctx: gameContextProp,
    latestOnly: { type: Boolean, default: false },
    presentation: { type: Boolean, default: false },
    showEmptyState: { type: Boolean, default: true }
  },
  methods: {
    t(this: PanelContext, key: string, params?: Record<string, string | number | null | undefined>): string {
      const source = getGameContextSource(this);
      return typeof source.t === "function"
        ? (source.t as (translationKey: string, values?: typeof params) => string)(key, params)
        : translateAppMessage(String(source.preferredLanguage ?? ""), key, params);
    }
  },
  computed: {
    wheelHistoryPanelModel(this: PanelContext): WheelFairnessViewModel {
      return buildWheelFairnessViewModel(this);
    },
    wheelHistoryPanelHistoryOpen: {
      get(this: PanelContext): boolean {
        return getWheelController(this).wheelFairnessHistoryOpen;
      },
      set(this: PanelContext, value: boolean): void {
        getWheelController(this).wheelFairnessHistoryOpen = value;
      }
    }
  },
  setup: setupGameContext
};
